//! Commandes Tauri du détourage et du presse-papier.
//!
//! Les images transitent en binaire brut (pas de JSON) : corps de la requête
//! `invoke(cmd, Uint8Array, { headers })` et réponse `ArrayBuffer`. Les chemins passés en
//! en-têtes HTTP sont encodés avec `encodeURIComponent` (accents).

use super::{clipboard, model};
use crate::fichiers::{LibError, LibResult};
use image::RgbaImage;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::path::BaseDirectory;
use tauri::Manager;

fn body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err("Données binaires attendues".into()),
    }
}

/// Décode `%C3%A9` → « é ». Refuse un encodage invalide.
pub fn percent_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3).ok_or("Encodage invalide")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Encodage invalide")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Encodage invalide".into())
}

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("En-tête {name} manquant"))?;
    percent_decode(raw)
}

fn decode_image(bytes: &[u8]) -> Result<RgbaImage, String> {
    image::load_from_memory(bytes)
        .map(|i| i.to_rgba8())
        .map_err(|e| format!("Image illisible : {e}"))
}

fn resource(app: &tauri::AppHandle, rel: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(rel, BaseDirectory::Resource)
        .map_err(|e| format!("Ressource {rel} : {e}"))
}

/// Détoure l'image reçue. Réponse : largeur, hauteur, durée (ms) en u32 petit-boutiste,
/// puis le masque 8 bits (une valeur par pixel).
#[tauri::command]
pub async fn cutout_segment(
    app: tauri::AppHandle,
    request: Request<'_>,
) -> Result<Response, String> {
    let bytes = body(&request)?;
    let (lib, model_path) = (
        resource(&app, model::ORT_RESOURCE)?,
        resource(&app, model::MODEL_RESOURCE)?,
    );
    tauri::async_runtime::spawn_blocking(move || {
        let img = decode_image(&bytes)?;
        let (mask, ms) = model::segment_with_shared(lib, model_path, &img)?;
        let mut out = Vec::with_capacity(12 + mask.len());
        out.extend_from_slice(&img.width().to_le_bytes());
        out.extend_from_slice(&img.height().to_le_bytes());
        out.extend_from_slice(&(ms.min(u32::MAX as u128) as u32).to_le_bytes());
        out.extend_from_slice(mask.as_raw());
        Ok(Response::new(out))
    })
    .await
    .map_err(|e| format!("Détourage interrompu : {e}"))?
}

/// Image du presse-papier en PNG ; réponse vide s'il n'y a pas d'image.
#[tauri::command]
pub async fn clipboard_read_image() -> Result<Response, String> {
    Ok(Response::new(
        clipboard::read_image_png()?.unwrap_or_default(),
    ))
}

/// Contenu brut du format « HTML Format » (en-têtes `SourceURL:` compris), s'il existe.
#[tauri::command]
pub async fn clipboard_read_html() -> Result<Option<String>, String> {
    clipboard::read_html()
}

/// Copie une image (PNG reçu en binaire) avec les formats « PNG » et DIB.
#[tauri::command]
pub async fn clipboard_write_png(request: Request<'_>) -> Result<(), String> {
    let img = decode_image(&body(&request)?)?;
    clipboard::write_image(&img)
}

/// Copie un schéma : SVG (formats « image/svg+xml » et texte) + son rendu PNG.
#[tauri::command]
pub async fn clipboard_write_svg(svg: String, png: Vec<u8>) -> Result<(), String> {
    let img = decode_image(&png)?;
    clipboard::write_image_with(&img, Some(&svg))
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "bmp", "gif", "webp", "heic", "heif"];

fn has_image_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| IMAGE_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Lit une image choisie par l'utilisateur (Ouvrir… ou glisser-déposer).
#[tauri::command]
pub async fn file_read_image(path: String) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() || !has_image_extension(&p) {
        return Err(format!("Fichier non pris en charge : {path}"));
    }
    std::fs::read(&p)
        .map(Response::new)
        .map_err(|e| format!("Lecture de {path} : {e}"))
}

const DATA_EXTENSIONS: &[&str] = &["xlsx", "xlsm", "csv", "tsv", "txt", "dat"];

/// Lit un fichier de données choisi par l'utilisateur (graphes, S9).
#[tauri::command]
pub async fn file_read_data(path: String) -> Result<Response, String> {
    let p = PathBuf::from(&path);
    let ok = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| DATA_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()));
    if !p.is_absolute() || !ok {
        return Err(format!("Fichier non pris en charge : {path} (.xlsx, .csv, .txt attendus ; enregistrer les .xls en .xlsx)"));
    }
    std::fs::read(&p)
        .map(Response::new)
        .map_err(|e| format!("Lecture de {path} : {e}"))
}

/// « Enregistrer sous » : écrit un PNG à l'emplacement choisi dans la boîte de dialogue.
#[tauri::command]
pub async fn file_write_png(request: Request<'_>) -> Result<(), String> {
    let path = PathBuf::from(header(&request, "x-path")?);
    let ext_ok = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("png"));
    if !path.is_absolute() || !ext_ok {
        return Err("Chemin d'enregistrement invalide (PNG attendu)".into());
    }
    let dir = path.parent().ok_or("Dossier invalide")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nom invalide")?;
    crate::fichiers::fsops::write_atomic(
        dir.to_str().ok_or("Chemin invalide")?,
        name,
        &body(&request)?,
    )
    .map_err(|e| e.to_string())
}

/// « Exporter… » : écrit un SVG, un TeX ou figurine.sty à l'emplacement choisi.
#[tauri::command]
pub async fn file_write_text(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let ok = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| ["svg", "tex", "sty"].contains(&e.to_ascii_lowercase().as_str()));
    if !p.is_absolute() || !ok {
        return Err("Chemin d'export invalide (.svg, .tex ou .sty attendu)".into());
    }
    let dir = p.parent().ok_or("Dossier invalide")?;
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Nom invalide")?;
    crate::fichiers::fsops::write_atomic(
        dir.to_str().ok_or("Chemin invalide")?,
        name,
        content.as_bytes(),
    )
    .map_err(|e| e.to_string())
}

/// Autorise l'affichage des images de la bibliothèque (vignettes) par le protocole `asset:`.
#[tauri::command]
pub fn figures_autoriser_images(app: tauri::AppHandle, racine: String) -> LibResult<()> {
    crate::fichiers::paths::check_root(&racine)?;
    app.asset_protocol_scope()
        .allow_directory(&racine, true)
        .map_err(|e| LibError::NotAllowed(format!("Accès aux images refusé : {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(
            percent_decode("C%3A%5CUsers%5CL%C3%A9a%5COneDrive%20-%20%C3%89cole").unwrap(),
            "C:\\Users\\Léa\\OneDrive - École"
        );
        assert!(percent_decode("%zz").is_err());
        assert!(percent_decode("%C3").is_err());
    }

    #[test]
    fn only_image_files_can_be_opened() {
        assert!(has_image_extension(Path::new("C:/a/b.PNG")));
        assert!(has_image_extension(Path::new("/a/photo.jpeg")));
        assert!(has_image_extension(Path::new("C:/iPhone/IMG_0042.HEIC")));
        assert!(!has_image_extension(Path::new("/a/secret.txt")));
        assert!(!has_image_extension(Path::new("/a/noext")));
    }
}
