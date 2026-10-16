//! Anciens documents Word (`.doc`, format binaire 97-2003) : convertis en `.docx` par Word
//! lui-même (automatisation COM via PowerShell, fenêtre invisible), seul moyen fidèle de
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

/// Script PowerShell : chemins passés par variables d'environnement (aucun échappement).
/// S'il se rattache à un Word déjà ouvert, il ne le ferme pas et rend ses réglages.
#[cfg(any(windows, test))]
const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
try { $w = New-Object -ComObject Word.Application } catch { [Console]::Error.WriteLine('WORD_ABSENT'); exit 2 }
$alertes = $w.DisplayAlerts
try {
  $w.DisplayAlerts = 0
  $d = $w.Documents.Open($env:THESE_DOC_SOURCE, $false, $true, $false, 'x')
  try { $d.SaveAs2($env:THESE_DOC_CIBLE, 16) } finally { $d.Close(0) }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message); exit 1
} finally {
  try { $w.DisplayAlerts = $alertes } catch {}
  if ($w.Documents.Count -eq 0) { $w.Quit(0) }
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($w)
}
"#;

#[cfg(windows)]
fn convertir(source: &Path, cible: &Path) -> LibResult<()> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    let mut enfant = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .env("THESE_DOC_SOURCE", source)
        .env("THESE_DOC_CIBLE", cible)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        // CREATE_NO_WINDOW : pas de console qui clignote.
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(|e| LibError::NotAllowed(format!("PowerShell introuvable ({e}).")))?;
    let debut = std::time::Instant::now();
    let statut = loop {
        if let Some(s) = enfant
            .try_wait()
            .map_err(|e| LibError::io(source.display().to_string(), e))?
        {
            break s;
        }
        if debut.elapsed() > DELAI {
            let _ = enfant.kill();
            return Err(LibError::NotAllowed(
                "Word n'a pas répondu (document protégé par mot de passe ? boîte de dialogue ouverte dans Word ?). \
                 Ouvrez le .doc dans Word puis « Enregistrer sous » .docx."
                    .into(),
            ));
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    };
    let mut erreur = String::new();
    if let Some(mut e) = enfant.stderr.take() {
        let mut octets = Vec::new();
        let _ = e.read_to_end(&mut octets);
        erreur = String::from_utf8_lossy(&octets).trim().to_string();
    }
    if statut.success() && cible.exists() {
        return Ok(());
    }
    Err(LibError::NotAllowed(if erreur.contains("WORD_ABSENT") {
        "Microsoft Word est introuvable sur ce PC : la conversion d'un .doc passe par Word. \
         Ouvrez-le dans Word (ou LibreOffice) puis « Enregistrer sous » .docx."
            .into()
    } else {
        format!(
            "Word n'a pas pu convertir le fichier{}.",
            if erreur.is_empty() {
                String::new()
            } else {
                format!(" : {erreur}")
            }
        )
    }))
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

    #[test]
    fn script_sans_chemin_en_dur() {
        assert!(
            SCRIPT.contains("$env:THESE_DOC_SOURCE") && SCRIPT.contains("$env:THESE_DOC_CIBLE")
        );
        // ne ferme jamais un Word où l'utilisateur a des documents ouverts
        assert!(SCRIPT.contains("if ($w.Documents.Count -eq 0) { $w.Quit(0) }"));
    }
}
