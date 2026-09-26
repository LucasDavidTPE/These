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
/// Réglages de Figurine 1.0 (`{"version":1,"libraryRoot":"…"}`), dans le même dossier
/// de configuration pour l'installeur Figurine (même identifiant Windows).
const REGLAGES_FIGURINE_1: &str = "settings.json";

fn dossier_config(app: &tauri::AppHandle) -> LibResult<PathBuf> {
    app.path()
        .app_config_dir()
        .map_err(|e| LibError::NotAllowed(format!("Dossier de configuration introuvable : {e}")))
}

pub fn lire_reglages_dans(dir: &Path) -> LibResult<Option<String>> {
    match fs::read_to_string(dir.join(FICHIER_REGLAGES)) {
        Ok(t) => Ok(Some(t)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(reprendre_figurine_1(dir)),
        Err(e) => Err(LibError::io(FICHIER_REGLAGES, e)),
    }
}

/// Premier lancement après Figurine 1.0 : on reprend le dossier de sa bibliothèque, pour
/// que la mise à jour ne redemande rien. Le fichier de 1.0 n'est ni modifié ni supprimé.
fn reprendre_figurine_1(dir: &Path) -> Option<String> {
    let texte = fs::read_to_string(dir.join(REGLAGES_FIGURINE_1)).ok()?;
    let v: serde_json::Value = serde_json::from_str(texte.trim_start_matches('\u{feff}')).ok()?;
    let racine = v.get("libraryRoot")?.as_str()?.trim();
    if racine.is_empty() {
        return None;
    }
    Some(
        serde_json::json!({ "version": 1, "espace": null, "figures": racine, "racines": {} })
            .to_string(),
    )
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

/// Écrit un fichier choisi par l'utilisateur dans la boîte « Enregistrer sous » (export
/// d'un module). Corps brut ; chemin absolu en en-tête `x-chemin`, encodé en URL.
#[tauri::command]
pub async fn poste_ecrire_fichier(request: tauri::ipc::Request<'_>) -> LibResult<()> {
    let brut = request
        .headers()
        .get("x-chemin")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| LibError::InvalidPath("en-tête x-chemin manquant".into()))?;
    let chemin = crate::fichiers::commands::decoder_url(brut)
        .ok_or_else(|| LibError::InvalidPath(brut.to_string()))?;
    let tauri::ipc::InvokeBody::Raw(octets) = request.body() else {
        return Err(LibError::InvalidPath("corps binaire attendu".into()));
    };
    let p = Path::new(&chemin);
    if !p.is_absolute() {
        return Err(LibError::InvalidPath(chemin));
    }
    fs::write(p, octets).map_err(|e| LibError::io(chemin.clone(), e))
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
    fn reprend_le_dossier_de_figurine_1() {
        let t = TempDir::new().unwrap();
        fs::write(
            t.path().join("settings.json"),
            "{\"version\":1,\"libraryRoot\":\"C:\\\\Users\\\\DAVID\\\\OneDrive\\\\Figurine\"}",
        )
        .unwrap();
        let repris: serde_json::Value =
            serde_json::from_str(&lire_reglages_dans(t.path()).unwrap().unwrap()).unwrap();
        assert_eq!(repris["figures"], "C:\\Users\\DAVID\\OneDrive\\Figurine");
        assert_eq!(repris["espace"], serde_json::Value::Null);
        // poste.json, une fois écrit, prime ; settings.json n'est jamais touché.
        ecrire_reglages_dans(t.path(), "{\"figures\":\"D:\\\\F\"}").unwrap();
        assert_eq!(
            lire_reglages_dans(t.path()).unwrap().unwrap(),
            "{\"figures\":\"D:\\\\F\"}"
        );
        assert!(t.path().join("settings.json").exists());
        // Réglages 1.0 sans bibliothèque ou abîmés : rien à reprendre.
        let u = TempDir::new().unwrap();
        fs::write(u.path().join("settings.json"), "{\"libraryRoot\":null}").unwrap();
        assert_eq!(lire_reglages_dans(u.path()).unwrap(), None);
        fs::write(u.path().join("settings.json"), "{").unwrap();
        assert_eq!(lire_reglages_dans(u.path()).unwrap(), None);
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
