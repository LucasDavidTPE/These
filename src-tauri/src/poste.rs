//! Ce qui est propre au poste (SPEC §4.2) : `poste.json` dans le dossier de configuration
//! local de l'application (`%APPDATA%\<identifiant>`), jamais dans OneDrive ; les dossiers
//! OneDrive du poste ; l'existence des dossiers désignés par les racines. Le contenu des
//! réglages est interprété côté TypeScript (`packages/noyau/src/poste/reglages.ts`).

use crate::fichiers::fsops::write_atomic;
use crate::fichiers::{LibError, LibResult};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const FICHIER_REGLAGES: &str = "poste.json";

fn dossier_config(app: &tauri::AppHandle) -> LibResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map_err(|e| LibError::NotAllowed(format!("Dossier de configuration introuvable : {e}")))
}

pub fn lire_reglages_dans(dir: &Path) -> LibResult<Option<String>> {
    match fs::read_to_string(dir.join(FICHIER_REGLAGES)) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(LibError::io(FICHIER_REGLAGES, e)),
    }
}

pub fn ecrire_reglages_dans(dir: &Path, contenu: &str) -> LibResult<()> {
    fs::create_dir_all(dir).map_err(|e| LibError::io(dir.display().to_string(), e))?;
    let racine = dir
        .to_str()
        .ok_or_else(|| LibError::InvalidRoot(dir.display().to_string()))?;
    write_atomic(racine, FICHIER_REGLAGES, contenu.as_bytes())
}

/// Dossiers OneDrive du poste, d'après les variables posées par OneDrive
/// (`OneDriveCommercial` = professionnel ou école, d'abord ; `OneDriveConsumer` = personnel).
pub fn dossiers_onedrive_depuis(
    lookup: impl Fn(&str) -> Option<String>,
    existe: impl Fn(&Path) -> bool,
) -> Vec<String> {
    let mut vus = BTreeSet::new();
    let mut out = Vec::new();
    for cle in ["OneDriveCommercial", "OneDriveConsumer", "OneDrive"] {
        if let Some(v) = lookup(cle).map(|v| v.trim().to_string()) {
            if !v.is_empty() && existe(Path::new(&v)) && vus.insert(v.to_lowercase()) {
                out.push(v);
            }
        }
    }
    out
}

/// Crée (si besoin) un dossier désigné par un chemin absolu : l'espace au premier lancement.
pub fn creer_dossier(chemin: &str) -> LibResult<()> {
    let p = Path::new(chemin);
    if chemin.trim().is_empty() || !p.is_absolute() {
        return Err(LibError::InvalidRoot(chemin.to_string()));
    }
    fs::create_dir_all(p).map_err(|e| LibError::io(chemin, e))
}

#[tauri::command]
pub fn poste_nom() -> String {
    crate::fichiers::host::host_name()
}

#[tauri::command]
pub async fn poste_lire_reglages(app: tauri::AppHandle) -> LibResult<Option<String>> {
    lire_reglages_dans(&dossier_config(&app)?)
}

#[tauri::command]
pub async fn poste_ecrire_reglages(app: tauri::AppHandle, contenu: String) -> LibResult<()> {
    ecrire_reglages_dans(&dossier_config(&app)?, &contenu)
}

#[tauri::command]
pub fn poste_dossiers_onedrive() -> Vec<String> {
    dossiers_onedrive_depuis(|k| std::env::var(k).ok(), |p| p.is_dir())
}

/// Vrai si le chemin absolu désigne un dossier existant. Un disque absent (E:\ sur le PC
/// perso) répond simplement faux.
#[tauri::command]
pub async fn poste_dossier_existe(chemin: String) -> bool {
    let p = Path::new(&chemin);
    p.is_absolute() && p.is_dir()
}

#[tauri::command]
pub async fn poste_creer_dossier(chemin: String) -> LibResult<()> {
    creer_dossier(&chemin)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn reglages_aller_retour_dans_un_dossier_neuf() {
        let t = TempDir::new().unwrap();
        let dir = t.path().join("fr.lucasdavid.these");
        assert_eq!(lire_reglages_dans(&dir).unwrap(), None);
        ecrire_reglages_dans(&dir, "{\"espace\":\"C:\\\\Users\\\\é\"}").unwrap();
        assert_eq!(
            lire_reglages_dans(&dir).unwrap().unwrap(),
            "{\"espace\":\"C:\\\\Users\\\\é\"}"
        );
    }

    #[test]
    fn onedrive_existants_et_sans_doublon_professionnel_d_abord() {
        let env = |k: &str| match k {
            "OneDrive" => Some("C:\\Users\\DAVID\\OneDrive".to_string()),
            "OneDriveConsumer" => Some("C:\\Users\\DAVID\\OneDrive".to_string()),
            "OneDriveCommercial" => Some("C:\\Users\\DAVID\\OneDrive - entpe.fr".to_string()),
            _ => None,
        };
        assert_eq!(
            dossiers_onedrive_depuis(env, |_| true),
            vec![
                "C:\\Users\\DAVID\\OneDrive - entpe.fr".to_string(),
                "C:\\Users\\DAVID\\OneDrive".to_string()
            ]
        );
        assert!(dossiers_onedrive_depuis(env, |_| false).is_empty());
    }

    #[test]
    fn creer_dossier_imbrique_et_refuse_un_chemin_relatif() {
        let t = TempDir::new().unwrap();
        let p = t
            .path()
            .join("OneDrive - École")
            .join("Thèse")
            .join("Espace");
        creer_dossier(p.to_str().unwrap()).unwrap();
        assert!(p.is_dir());
        creer_dossier(p.to_str().unwrap()).unwrap();
        assert_eq!(creer_dossier("relatif").unwrap_err().code(), "invalid-root");
    }
}
