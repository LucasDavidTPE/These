//! Aspect Excel des graphiques d'un classeur (SPEC §6.1) : Excel lui-même exporte chaque
//! graphique (objets graphiques des feuilles et feuilles graphiques) en PNG, et en PDF quand il
//! le peut, sans fenêtre. Sur un geste de l'utilisateur seulement ; le classeur est ouvert en
//! lecture seule et n'est jamais enregistré. Windows et Excel installé.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Durée maximale d'une capture (Excel lent au premier lancement, gros classeur).
#[cfg(windows)]
const DELAI: std::time::Duration = std::time::Duration::from_secs(180);

#[derive(Serialize, Debug, Clone)]
pub struct Capture {
    /// Feuille du graphique (pour une feuille graphique : son nom).
    pub feuille: String,
    /// Nom de l'objet graphique dans Excel (« Graphique 1 ») ; feuille graphique : son nom.
    pub nom: String,
    /// Vrai pour une feuille graphique (un seul graphique, qui occupe la feuille).
    pub feuille_graphique: bool,
    pub png: Vec<u8>,
    pub pdf: Option<Vec<u8>>,
}

/// Le classeur doit être un `.xlsx` / `.xlsm` absolu existant.
pub fn verifier_classeur(chemin: &str) -> Result<PathBuf, String> {
    let p = Path::new(chemin);
    let ok = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("xlsx") || e.eq_ignore_ascii_case("xlsm"));
    if !p.is_absolute() || !ok {
        return Err(format!("Classeur attendu (.xlsx, .xlsm) : {chemin}"));
    }
    if !p.is_file() {
        return Err(format!("Classeur introuvable : {chemin}"));
    }
    Ok(p.to_path_buf())
}

/// Dossier temporaire propre à une capture (vidé et supprimé ensuite).
fn dossier_temporaire() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("these-excel-{}-{nanos}", std::process::id()))
}

#[cfg(windows)]
mod pilote {
    use super::Capture;
    use crate::com::{
        appeler, application, avec_com, ecrire, element, entier, lire, methode, objet, texte, Arg,
        ABSENT,
    };
    use std::path::Path;
    use windows::Win32::System::Com::{IDispatch, DISPATCH_METHOD, DISPATCH_PROPERTYGET};


    pub const EXCEL_ABSENT: &str = ABSENT;

    /// Chart.Export (PNG) et Chart.ExportAsFixedFormat (PDF, facultatif).
    fn exporter(graphique: &IDispatch, dossier: &Path, n: usize) -> Result<(Vec<u8>, Option<Vec<u8>>), String> {
        let png = dossier.join(format!("{n}.png"));
        let png_s = png.display().to_string();
        methode(graphique, "Export", &[Arg::Texte(&png_s), Arg::Texte("PNG"), Arg::Bool(false)])?;
        let octets = std::fs::read(&png).map_err(|e| format!("Excel n'a pas produit l'image ({e})."))?;
        let pdf = dossier.join(format!("{n}.pdf"));
        let pdf_s = pdf.display().to_string();
        // 0 = xlTypePDF ; ignoré si cette version d'Excel ne sait pas le faire pour un graphique
        let pdf_octets = methode(graphique, "ExportAsFixedFormat", &[Arg::Entier(0), Arg::Texte(&pdf_s)])
            .ok()
            .and_then(|_| std::fs::read(&pdf).ok());
        Ok((octets, pdf_octets))
    }

    fn parcourir(classeur: &IDispatch, dossier: &Path) -> Result<Vec<Capture>, String> {
        let mut out = Vec::new();
        let feuilles = lire(classeur, "Worksheets")?;
        for i in 1..=entier(&feuilles, "Count").unwrap_or(0) {
            let f = element(&feuilles, i)?;
            let nom_feuille = texte(&f, "Name").unwrap_or_default();
            let objets = objet(
                appeler(&f, "ChartObjects", DISPATCH_METHOD | DISPATCH_PROPERTYGET, &[]),
                "ChartObjects",
            )?;
            for j in 1..=entier(&objets, "Count").unwrap_or(0) {
                let o = element(&objets, j)?;
                let nom = texte(&o, "Name").unwrap_or_default();
                let g = lire(&o, "Chart")?;
                let (png, pdf) = exporter(&g, dossier, out.len() + 1)?;
                out.push(Capture { feuille: nom_feuille.clone(), nom, feuille_graphique: false, png, pdf });
            }
        }
        let graphiques = lire(classeur, "Charts")?;
        for i in 1..=entier(&graphiques, "Count").unwrap_or(0) {
            let g = element(&graphiques, i)?;
            let nom = texte(&g, "Name").unwrap_or_default();
            let (png, pdf) = exporter(&g, dossier, out.len() + 1)?;
            out.push(Capture { feuille: nom.clone(), nom, feuille_graphique: true, png, pdf });
        }
        Ok(out)
    }

    fn piloter(chemin: &str, dossier: &Path) -> Result<Vec<Capture>, String> {
        let excel = application("Excel.Application")?;
        let alertes = entier(&excel, "DisplayAlerts");
        let _ = ecrire(&excel, "DisplayAlerts", Arg::Bool(false));
        let classeurs = lire(&excel, "Workbooks");
        let resultat = classeurs.as_ref().map_err(Clone::clone).and_then(|classeurs| {
            let avant = entier(classeurs, "Count");
            // Open(Filename, UpdateLinks = 0, ReadOnly = true)
            let c = objet(
                methode(classeurs, "Open", &[Arg::Texte(chemin), Arg::Entier(0), Arg::Bool(true)]),
                "Open",
            )?;
            let r = parcourir(&c, dossier);
            // un classeur que l'utilisateur avait déjà ouvert (le compte n'a pas bougé) reste ouvert
            if entier(classeurs, "Count").zip(avant).is_none_or(|(apres, avant)| apres > avant) {
                let _ = methode(&c, "Close", &[Arg::Bool(false)]);
            }
            r
        });
        if let Some(a) = alertes {
            let _ = ecrire(&excel, "DisplayAlerts", Arg::Bool(a != 0));
        }
        // ne ferme jamais un Excel où l'utilisateur a des classeurs ouverts
        if classeurs.ok().and_then(|c| entier(&c, "Count")) == Some(0) {
            let _ = appeler(&excel, "Quit", DISPATCH_METHOD, &[]);
        }
        resultat
    }

    pub fn capturer(chemin: &str, dossier: &Path) -> Result<Vec<Capture>, String> {
        avec_com(|| piloter(chemin, dossier))
    }
}

#[cfg(windows)]
fn capturer(classeur: &Path) -> Result<Vec<Capture>, String> {
    let dossier = dossier_temporaire();
    std::fs::create_dir_all(&dossier).map_err(|e| format!("Dossier temporaire : {e}"))?;
    let (chemin, d) = (classeur.display().to_string(), dossier.clone());
    let (tx, rx) = std::sync::mpsc::channel();
    // fil dédié : COM y est initialisé, et un Excel bloqué ne bloque pas l'application
    std::thread::spawn(move || {
        let _ = tx.send(pilote::capturer(&chemin, &d));
    });
    let r = rx.recv_timeout(DELAI).map_err(|_| {
        "Excel n'a pas répondu (boîte de dialogue ouverte dans Excel ? classeur protégé ?).".to_string()
    });
    let _ = std::fs::remove_dir_all(&dossier);
    match r? {
        Ok(c) => Ok(c),
        Err(e) if e == pilote::EXCEL_ABSENT => Err(
            "Microsoft Excel est introuvable sur ce PC : l'aspect Excel est capturé par Excel lui-même. \
             Le graphe refait par Figures reste disponible."
                .into(),
        ),
        Err(e) => Err(format!("Excel n'a pas pu exporter les graphiques : {e}")),
    }
}

#[cfg(not(windows))]
fn capturer(_classeur: &Path) -> Result<Vec<Capture>, String> {
    let _ = dossier_temporaire;
    Err("La capture de l'aspect Excel passe par Microsoft Excel : sous Windows seulement.".into())
}

/// Exporte, par Excel, tous les graphiques du classeur (chemin absolu).
#[tauri::command]
pub async fn excel_capturer_graphiques(classeur: String) -> Result<Vec<Capture>, String> {
    let p = verifier_classeur(&classeur)?;
    tauri::async_runtime::spawn_blocking(move || capturer(&p))
        .await
        .map_err(|e| format!("Capture interrompue ({e})."))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuse_autre_chose_qu_un_classeur_absolu_existant() {
        assert!(verifier_classeur("Fig 2.xlsx").is_err());
        let d = std::env::temp_dir().join("these-test-excel");
        std::fs::create_dir_all(&d).unwrap();
        let f = d.join("Fig 2.xlsx");
        std::fs::write(&f, b"x").unwrap();
        assert!(verifier_classeur(&f.display().to_string()).is_ok());
        assert!(verifier_classeur(&d.join("absent.xlsx").display().to_string()).is_err());
        let csv = d.join("a.csv");
        std::fs::write(&csv, b"x").unwrap();
        assert!(verifier_classeur(&csv.display().to_string()).is_err());
        let _ = std::fs::remove_dir_all(&d);
    }
}
