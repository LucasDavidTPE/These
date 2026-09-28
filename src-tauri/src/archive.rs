//! Export de l'espace en un seul fichier `.zip` (SPEC §4.1) : pour l'archiver, le garder
//! hors du OneDrive de l'école, le confier à quelqu'un. Tout le dossier y va, chemins
//! relatifs conservés, sauf les restes d'écriture interrompue (`*.tmp`) et les verrous.

use crate::fichiers::{LibError, LibResult};
use chrono::{Datelike, Local, Timelike};
use serde::Serialize;
use std::fs;
use std::io::{self, BufWriter};
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipWriter};

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RapportArchive {
    pub fichiers: u64,
    /// Taille totale des fichiers avant compression.
    pub octets: u64,
}

/// Déjà compressés : les recompresser coûte du temps pour rien.
const DEJA_COMPRESSES: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "zip", "xlsx", "xlsm", "docx", "pptx",
    "7z", "gz", "mp4", "mov",
];

const PROFONDEUR_MAX: usize = 32;

fn err(p: &Path) -> impl Fn(io::Error) -> LibError + '_ {
    move |e| LibError::io(p.display().to_string(), e)
}

fn zerr(p: &Path) -> impl Fn(zip::result::ZipError) -> LibError + '_ {
    move |e| LibError::io(p.display().to_string(), io::Error::other(e))
}

fn ignore(nom: &str) -> bool {
    let n = nom.to_lowercase();
    n.ends_with(".tmp") || n.ends_with(".lock")
}

fn date_zip(p: &Path) -> DateTime {
    let Ok(t) = fs::metadata(p).and_then(|m| m.modified()) else {
        return DateTime::default_for_write();
    };
    let d: chrono::DateTime<Local> = t.into();
    // Le format zip commence en 1980.
    DateTime::from_date_and_time(
        d.year().clamp(1980, 2107) as u16,
        d.month() as u8,
        d.day() as u8,
        d.hour() as u8,
        d.minute() as u8,
        d.second() as u8,
    )
    .unwrap_or_else(|_| DateTime::default_for_write())
}

/// Écrit `source` (dossier, chemin absolu) dans l'archive `destination` (fichier `.zip`,
/// chemin absolu, hors de `source`). L'archive est écrite à côté puis renommée : jamais de
/// zip à moitié écrit sous le nom final. Un zip existant du même nom est remplacé.
pub fn archiver_dossier(source: &str, destination: &str) -> LibResult<RapportArchive> {
    let src = Path::new(source);
    let dst = Path::new(destination);
    if !src.is_absolute() || !dst.is_absolute() {
        return Err(LibError::InvalidRoot(format!("{source} → {destination}")));
    }
    if !src.is_dir() {
        return Err(LibError::NotFound(source.to_string()));
    }
    let src_c = src.canonicalize().map_err(err(src))?;
    let parent = dst
        .parent()
        .ok_or_else(|| LibError::InvalidPath(destination.to_string()))?;
    let parent_c = parent.canonicalize().map_err(err(parent))?;
    if parent_c.starts_with(&src_c) {
        return Err(LibError::NotAllowed(
            "l'archive ne peut pas être enregistrée dans le dossier qu'elle contient".into(),
        ));
    }
    let mut tmp = dst.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = Path::new(&tmp);
    let fichier = fs::File::create(tmp).map_err(err(tmp))?;
    let mut zip = ZipWriter::new(BufWriter::new(fichier));
    let mut r = RapportArchive::default();
    let res = ajouter(&mut zip, src, "", 0, &mut r).and_then(|_| {
        zip.finish()
            .map_err(|e| LibError::io(destination, io::Error::other(e)))?;
        Ok(())
    });
    if let Err(e) = res {
        let _ = fs::remove_file(tmp);
        return Err(e);
    }
    if dst.exists() {
        fs::remove_file(dst).map_err(err(dst))?;
    }
    fs::rename(tmp, dst).map_err(err(dst))?;
    Ok(r)
}

fn ajouter<W: io::Write + io::Seek>(
    zip: &mut ZipWriter<W>,
    dossier: &Path,
    prefixe: &str,
    profondeur: usize,
    r: &mut RapportArchive,
) -> LibResult<()> {
    if profondeur > PROFONDEUR_MAX {
        return Err(LibError::NotAllowed(format!(
            "dossiers imbriqués trop profondément : {}",
            dossier.display()
        )));
    }
    let mut entrees: Vec<_> = fs::read_dir(dossier)
        .map_err(err(dossier))?
        .collect::<Result<_, _>>()
        .map_err(err(dossier))?;
    entrees.sort_by_key(|e| e.file_name());
    for e in entrees {
        let nom = e.file_name().to_string_lossy().into_owned();
        let chemin = e.path();
        let genre = e.file_type().map_err(err(&chemin))?;
        let rel = format!("{prefixe}{nom}");
        if genre.is_dir() {
            zip.add_directory(
                format!("{rel}/"),
                SimpleFileOptions::default().last_modified_time(date_zip(&chemin)),
            )
            .map_err(zerr(&chemin))?;
            ajouter(zip, &chemin, &format!("{rel}/"), profondeur + 1, r)?;
        } else if genre.is_file() && !ignore(&nom) {
            let taille = e.metadata().map_err(err(&chemin))?.len();
            let ext = nom.rsplit('.').next().unwrap_or("").to_lowercase();
            let methode = if DEJA_COMPRESSES.contains(&ext.as_str()) {
                CompressionMethod::Stored
            } else {
                CompressionMethod::Deflated
            };
            let options = SimpleFileOptions::default()
                .compression_method(methode)
                .last_modified_time(date_zip(&chemin))
                .large_file(taille >= u32::MAX as u64);
            zip.start_file(rel, options).map_err(zerr(&chemin))?;
            let mut f = fs::File::open(&chemin).map_err(err(&chemin))?;
            io::copy(&mut f, zip).map_err(err(&chemin))?;
            r.fichiers += 1;
            r.octets += taille;
        }
        // Les liens symboliques ne sont pas suivis.
    }
    Ok(())
}

#[tauri::command]
pub async fn archive_dossier(source: String, destination: String) -> LibResult<RapportArchive> {
    tauri::async_runtime::spawn_blocking(move || archiver_dossier(&source, &destination))
        .await
        .map_err(|e| LibError::NotAllowed(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn archive_tout_sauf_temporaires_et_verrous() {
        let t = tempfile::tempdir().unwrap();
        let esp = t.path().join("Espace");
        fs::create_dir_all(esp.join("bibliotheque/pdf")).unwrap();
        fs::write(esp.join("espace.json"), "{\"format\":1}").unwrap();
        fs::write(esp.join("bibliotheque/pdf/BIB-001.pdf"), vec![7u8; 5000]).unwrap();
        fs::write(esp.join("bibliotheque/x.json.tmp"), "moitié").unwrap();
        fs::write(esp.join("figure.lock"), "poste").unwrap();
        let dst = t.path().join("Espace.zip");

        let r = archiver_dossier(esp.to_str().unwrap(), dst.to_str().unwrap()).unwrap();
        assert_eq!(
            r,
            RapportArchive {
                fichiers: 2,
                octets: 5012
            }
        );

        let mut z = zip::ZipArchive::new(fs::File::open(&dst).unwrap()).unwrap();
        let mut s = String::new();
        z.by_name("espace.json")
            .unwrap()
            .read_to_string(&mut s)
            .unwrap();
        assert_eq!(s, "{\"format\":1}");
        let mut pdf = Vec::new();
        z.by_name("bibliotheque/pdf/BIB-001.pdf")
            .unwrap()
            .read_to_end(&mut pdf)
            .unwrap();
        assert_eq!(pdf, vec![7u8; 5000]);
        assert!(z.by_name("bibliotheque/x.json.tmp").is_err());
        assert!(z.by_name("figure.lock").is_err());
        assert!(!t.path().join("Espace.zip.tmp").exists());
    }

    #[test]
    fn refuse_une_archive_dans_l_espace() {
        let t = tempfile::tempdir().unwrap();
        let esp = t.path().join("Espace");
        fs::create_dir_all(&esp).unwrap();
        let dst = esp.join("sauvegarde.zip");
        assert!(matches!(
            archiver_dossier(esp.to_str().unwrap(), dst.to_str().unwrap()),
            Err(LibError::NotAllowed(_))
        ));
    }
}
