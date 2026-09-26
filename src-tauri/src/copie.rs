//! Copie des données brutes d'un essai vers un dossier choisi (SPEC §8.3) : sauvegarde sur
//! un disque externe, envoi à un collègue. Incrémentale (un fichier de même taille et pas
//! plus ancien à la destination n'est pas recopié), elle ne supprime jamais rien.

use crate::fichiers::{LibError, LibResult};
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RapportCopie {
    /// Fichiers copiés (nouveaux ou modifiés).
    pub copies: u64,
    /// Fichiers déjà à jour à la destination.
    pub a_jour: u64,
    /// Octets copiés.
    pub octets: u64,
}

fn absolu(chemin: &str) -> LibResult<&Path> {
    let p = Path::new(chemin);
    if chemin.trim().is_empty() || !p.is_absolute() {
        return Err(LibError::InvalidRoot(chemin.to_string()));
    }
    Ok(p)
}

/// Copie récursivement `source` dans `destination` (créée au besoin).
pub fn copier_dossier(source: &str, destination: &str) -> LibResult<RapportCopie> {
    let src = absolu(source)?;
    let dst = absolu(destination)?;
    if !src.is_dir() {
        return Err(LibError::NotFound(source.to_string()));
    }
    let canon = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    let (cs, cd) = (canon(src), canon(dst));
    if cd.starts_with(&cs) || cs.starts_with(&cd) {
        return Err(LibError::NotAllowed(
            "la destination ne peut pas être dans les données (ni l'inverse)".into(),
        ));
    }
    let mut r = RapportCopie::default();
    copier(src, dst, &mut r)?;
    Ok(r)
}

fn copier(src: &Path, dst: &Path, r: &mut RapportCopie) -> LibResult<()> {
    fs::create_dir_all(dst).map_err(|e| LibError::io(dst.display().to_string(), e))?;
    let entrees = fs::read_dir(src).map_err(|e| LibError::io(src.display().to_string(), e))?;
    for entree in entrees {
        let entree = entree.map_err(|e| LibError::io(src.display().to_string(), e))?;
        let genre = entree
            .file_type()
            .map_err(|e| LibError::io(entree.path().display().to_string(), e))?;
        let (de, vers) = (entree.path(), dst.join(entree.file_name()));
        if genre.is_dir() {
            copier(&de, &vers, r)?;
        } else if genre.is_file() {
            copier_fichier(&de, &vers, r)?;
        }
        // Les liens symboliques ne sont pas suivis.
    }
    Ok(())
}

fn err(p: &Path) -> impl Fn(std::io::Error) -> LibError + '_ {
    move |e| LibError::io(p.display().to_string(), e)
}

fn copier_fichier(de: &Path, vers: &Path, r: &mut RapportCopie) -> LibResult<()> {
    let m = fs::metadata(de).map_err(err(de))?;
    if let Ok(d) = fs::metadata(vers) {
        let plus_recent = match (d.modified(), m.modified()) {
            (Ok(a), Ok(b)) => a >= b,
            _ => false,
        };
        if d.len() == m.len() && plus_recent {
            r.a_jour += 1;
            return Ok(());
        }
    }
    // Copie dans un temporaire puis renommage : jamais de fichier à moitié écrit.
    let mut tmp = vers.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = Path::new(&tmp);
    let n = fs::copy(de, tmp).map_err(err(de))?;
    if let Ok(date) = m.modified() {
        if let Ok(f) = fs::File::options().write(true).open(tmp) {
            let _ = f.set_modified(date);
        }
    }
    fs::rename(tmp, vers).map_err(err(vers))?;
    r.copies += 1;
    r.octets += n;
    Ok(())
}

#[tauri::command]
pub async fn copie_dossier(source: String, destination: String) -> LibResult<RapportCopie> {
    tauri::async_runtime::spawn_blocking(move || copier_dossier(&source, &destination))
        .await
        .map_err(|e| LibError::NotAllowed(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copie_incrementale_sans_rien_supprimer() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("Essai1");
        fs::create_dir_all(src.join("sous")).unwrap();
        fs::write(src.join("Essai1.steps.tracking.csv"), "a;b\n1;2\n").unwrap();
        fs::write(src.join("sous/journal.log"), "x").unwrap();
        let dst = t.path().join("sauvegarde").join("Essai1");
        let (s, d) = (src.to_str().unwrap(), dst.to_str().unwrap());

        let r = copier_dossier(s, d).unwrap();
        assert_eq!(
            r,
            RapportCopie {
                copies: 2,
                a_jour: 0,
                octets: 9
            }
        );
        assert_eq!(
            fs::read_to_string(dst.join("sous/journal.log")).unwrap(),
            "x"
        );

        // Rien de changé : rien à copier ; un fichier en plus à la destination reste.
        fs::write(dst.join("mes-notes.txt"), "garde").unwrap();
        let r = copier_dossier(s, d).unwrap();
        assert_eq!(
            r,
            RapportCopie {
                copies: 0,
                a_jour: 2,
                octets: 0
            }
        );
        assert!(dst.join("mes-notes.txt").exists());

        // Fichier modifié (taille différente) : recopié.
        fs::write(src.join("sous/journal.log"), "xyz").unwrap();
        let r = copier_dossier(s, d).unwrap();
        assert_eq!(
            r,
            RapportCopie {
                copies: 1,
                a_jour: 1,
                octets: 3
            }
        );
        assert!(!dst.join("sous/journal.log.tmp").exists());
    }

    #[test]
    fn refuse_une_destination_dans_la_source() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path().to_str().unwrap().to_string();
        let d = t.path().join("copie").to_str().unwrap().to_string();
        assert!(copier_dossier(&s, &d).is_err());
        assert!(copier_dossier("relatif", &d).is_err());
        assert!(copier_dossier(&t.path().join("absent").to_string_lossy(), &d).is_err());
    }
}
