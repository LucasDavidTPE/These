//! Anciens documents Word (`.doc`, format binaire 97-2003) : convertis en `.docx` par Word
//! lui-même (automatisation COM, fenêtre invisible), seul moyen fidèle de
//! garder titres, commentaires et modifications suivies. Toujours sur un geste de
//! l'utilisateur ; le `.doc` d'origine n'est jamais modifié.

use crate::fichiers::error::{LibError, LibResult};
use std::fs;
use std::path::{Path, PathBuf};

/// Durée maximale d'une conversion (Word lent au premier lancement, gros document).
#[cfg(windows)]
const DELAI: std::time::Duration = std::time::Duration::from_secs(180);

/// « C:\x\ch1.doc » → « C:\x\ch1.docx » ; erreur si ce n'est pas un `.doc` absolu.
pub fn chemin_docx(source: &str) -> LibResult<PathBuf> {
    let p = Path::new(source);
    let est_doc = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("doc"));
    if !p.is_absolute() || !est_doc {
        return Err(LibError::InvalidPath(source.to_string()));
    }
    Ok(p.with_extension("docx"))
}

/// Pilotage de Word par COM (voir `crate::com`).
#[cfg(windows)]
mod com {
    use crate::com::{appeler, application, avec_com, objet, Arg, ABSENT};
    use windows::Win32::System::Com::{
        IDispatch, DISPATCH_METHOD, DISPATCH_PROPERTYGET, DISPATCH_PROPERTYPUT,
    };

    pub const WORD_ABSENT: &str = ABSENT;

    fn piloter(source: &str, cible: &str) -> Result<(), String> {
        let word: IDispatch = application("Word.Application")?;
        let alertes = appeler(&word, "DisplayAlerts", DISPATCH_PROPERTYGET, &[])
            .ok()
            .and_then(|r| r.entier);
        let _ = appeler(
            &word,
            "DisplayAlerts",
            DISPATCH_PROPERTYPUT,
            &[Arg::Entier(0)],
        );
        let docs = objet(
            appeler(&word, "Documents", DISPATCH_PROPERTYGET, &[]),
            "Documents",
        );
        let compter = |d: &IDispatch| {
            appeler(d, "Count", DISPATCH_PROPERTYGET, &[])
                .ok()
                .and_then(|r| r.entier)
        };
        let resultat = docs.as_ref().map_err(Clone::clone).and_then(|docs| {
            let avant = compter(docs);
            // Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles, PasswordDocument) : un mot de passe
            // factice fait échouer un document protégé au lieu d'ouvrir une boîte invisible.
            let doc = objet(
                appeler(
                    docs,
                    "Open",
                    DISPATCH_METHOD,
                    &[
                        Arg::Texte(source),
                        Arg::Bool(false),
                        Arg::Bool(true),
                        Arg::Bool(false),
                        Arg::Texte("x"),
                    ],
                ),
                "Open",
            )?;
            // 16 = wdFormatXMLDocument (.docx)
            let r = appeler(
                &doc,
                "SaveAs2",
                DISPATCH_METHOD,
                &[Arg::Texte(cible), Arg::Entier(16)],
            );
            // un document que l'utilisateur avait déjà ouvert (le compte n'a pas bougé) reste ouvert
            if compter(docs)
                .zip(avant)
                .is_none_or(|(apres, avant)| apres > avant)
            {
                let _ = appeler(&doc, "Close", DISPATCH_METHOD, &[Arg::Entier(0)]);
            }
            r.map(|_| ())
        });
        if let Some(a) = alertes {
            let _ = appeler(
                &word,
                "DisplayAlerts",
                DISPATCH_PROPERTYPUT,
                &[Arg::Entier(a)],
            );
        }
        // ne ferme jamais un Word où l'utilisateur a des documents ouverts
        let ouverts = docs.ok().and_then(|d| compter(&d));
        if ouverts == Some(0) {
            let _ = appeler(&word, "Quit", DISPATCH_METHOD, &[Arg::Entier(0)]);
        }
        resultat
    }

    /// Conversion `.doc` → `.docx` par Word, dans le fil appelant (initialise COM pour lui).
    pub fn convertir(source: &str, cible: &str) -> Result<(), String> {
        avec_com(|| piloter(source, cible))
    }
}

#[cfg(windows)]
fn convertir(source: &Path, cible: &Path) -> LibResult<()> {
    let (src, dst) = (source.display().to_string(), cible.display().to_string());
    let (tx, rx) = std::sync::mpsc::channel();
    // fil dédié : COM y est initialisé, et un Word bloqué ne bloque pas l'application
    std::thread::spawn(move || {
        let _ = tx.send(com::convertir(&src, &dst));
    });
    let r = rx.recv_timeout(DELAI).map_err(|_| {
        LibError::NotAllowed(
            "Word n'a pas répondu (document protégé ? boîte de dialogue ouverte dans Word ?). \
             Ouvrez le .doc dans Word puis « Enregistrer sous » .docx."
                .into(),
        )
    })?;
    match r {
        Ok(()) if cible.exists() => Ok(()),
        Ok(()) => Err(LibError::NotAllowed(
            "Word n'a pas produit le .docx.".into(),
        )),
        Err(e) if e == com::WORD_ABSENT => Err(LibError::NotAllowed(
            "Microsoft Word est introuvable sur ce PC : la conversion d'un .doc passe par Word. \
             Ouvrez-le dans Word (ou LibreOffice) puis « Enregistrer sous » .docx."
                .into(),
        )),
        Err(e) => Err(LibError::NotAllowed(format!(
            "Word n'a pas pu convertir le fichier : {e}"
        ))),
    }
}

#[cfg(not(windows))]
fn convertir(_source: &Path, _cible: &Path) -> LibResult<()> {
    Err(LibError::NotAllowed(
        "La conversion des .doc passe par Microsoft Word : sous Windows seulement.".into(),
    ))
}

/// Convertit `source` (.doc) en un `.docx` du même nom, à côté ; renvoie son chemin.
/// Refuse d'écraser un `.docx` existant.
#[tauri::command]
pub async fn word_convertir_doc(source: String) -> LibResult<String> {
    let cible = chemin_docx(&source)?;
    if !Path::new(&source).exists() {
        return Err(LibError::NotFound(source));
    }
    if cible.exists() {
        return Err(LibError::AlreadyExists(cible.display().to_string()));
    }
    let src = PathBuf::from(&source);
    let c = cible.clone();
    tauri::async_runtime::spawn_blocking(move || convertir(&src, &c))
        .await
        .map_err(|e| LibError::NotAllowed(format!("Conversion interrompue ({e}).")))??;
    Ok(cible.display().to_string())
}

/// Lit `source` (.doc) comme un `.docx` : conversion dans le dossier temporaire du poste,
/// lecture, suppression de la copie. Le fichier d'origine n'est pas touché.
#[tauri::command]
pub async fn word_lire_doc(source: String) -> LibResult<tauri::ipc::Response> {
    chemin_docx(&source)?;
    if !Path::new(&source).exists() {
        return Err(LibError::NotFound(source));
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let cible = std::env::temp_dir().join(format!("these-doc-{}-{nanos}.docx", std::process::id()));
    let src = PathBuf::from(&source);
    let c = cible.clone();
    tauri::async_runtime::spawn_blocking(move || convertir(&src, &c))
        .await
        .map_err(|e| LibError::NotAllowed(format!("Conversion interrompue ({e}).")))??;
    let octets = fs::read(&cible).map_err(|e| LibError::io(cible.display().to_string(), e));
    let _ = fs::remove_file(&cible);
    Ok(tauri::ipc::Response::new(octets?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docx_a_cote_du_doc() {
        let racine = if cfg!(windows) {
            "C:\\Thèse\\"
        } else {
            "/these/"
        };
        let p = chemin_docx(&format!("{racine}Chapitre 1.DOC")).unwrap();
        assert_eq!(p, PathBuf::from(format!("{racine}Chapitre 1.docx")));
    }

    #[test]
    fn refuse_autre_chose_qu_un_doc_absolu() {
        assert!(chemin_docx("ch1.doc").is_err());
        let racine = if cfg!(windows) { "C:\\x\\" } else { "/x/" };
        assert!(chemin_docx(&format!("{racine}ch1.docx")).is_err());
        assert!(chemin_docx(&format!("{racine}ch1")).is_err());
    }
}
