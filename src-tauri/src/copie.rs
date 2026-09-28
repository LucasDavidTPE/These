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

/// Forme canonique d'un chemin qui n'existe peut-être pas encore : on canonise son plus
/// proche parent existant, puis on rajoute le reste. Sous Windows, `canonicalize` ajoute
/// le préfixe `\\?\` : comparer un chemin canonisé à un chemin brut ne marcherait pas.
fn canonique(p: &Path) -> std::path::PathBuf {
    let mut reste = Vec::new();
    let mut courant = p;
    loop {
        if let Ok(c) = courant.canonicalize() {
            return reste.iter().rev().fold(c, |acc, n| acc.join(n));
        }
        match (courant.parent(), courant.file_name()) {
            (Some(parent), Some(nom)) => {
                reste.push(nom.to_os_string());
                courant = parent;
            }
            _ => return p.to_path_buf(),
        }
    }
}

/// Copie récursivement `source` dans `destination` (créée au besoin). Avec `sans_ecraser`,
/// un fichier déjà présent à la destination n'est jamais remplacé, quelle que soit sa date :
/// c'est le rapatriement dans l'espace, où la version de l'espace peut être la plus récente.
pub fn copier_dossier(source: &str, destination: &str) -> LibResult<RapportCopie> {
    copier_dossier_avec(source, destination, false)
}

pub fn copier_dossier_avec(
    source: &str,
    destination: &str,
    sans_ecraser: bool,
) -> LibResult<RapportCopie> {
    let src = absolu(source)?;
    let dst = absolu(destination)?;
    if !src.is_dir() {
        return Err(LibError::NotFound(source.to_string()));
    }
    let (cs, cd) = (canonique(src), canonique(dst));
    if cd.starts_with(&cs) || cs.starts_with(&cd) {
        return Err(LibError::NotAllowed(
            "la destination ne peut pas être dans les données (ni l'inverse)".into(),
        ));
    }
    let mut r = RapportCopie::default();
    copier(src, dst, &cd, 0, sans_ecraser, &mut r)?;
    Ok(r)
}

/// Au-delà, c'est une boucle (lien, jonction NTFS…), pas des données d'essai.
const PROFONDEUR_MAX: usize = 32;

fn copier(
    src: &Path,
    dst: &Path,
    garde: &Path,
    profondeur: usize,
    sans_ecraser: bool,
    r: &mut RapportCopie,
) -> LibResult<()> {
    if profondeur > PROFONDEUR_MAX {
        return Err(LibError::NotAllowed(format!(
            "dossiers imbriqués trop profondément : {}",
            src.display()
        )));
    }
    fs::create_dir_all(dst).map_err(|e| LibError::io(dst.display().to_string(), e))?;
    let entrees = fs::read_dir(src).map_err(|e| LibError::io(src.display().to_string(), e))?;
    for entree in entrees {
        let entree = entree.map_err(|e| LibError::io(src.display().to_string(), e))?;
        let genre = entree
            .file_type()
            .map_err(|e| LibError::io(entree.path().display().to_string(), e))?;
        let (de, vers) = (entree.path(), dst.join(entree.file_name()));
        if genre.is_dir() {
            // Jamais la destination elle-même, où qu'elle soit (seconde sécurité).
            if canonique(&de) != garde {
                copier(&de, &vers, garde, profondeur + 1, sans_ecraser, r)?;
            }
        } else if genre.is_file() {
            if sans_ecraser && vers.exists() {
                r.a_jour += 1;
            } else {
                copier_fichier(&de, &vers, r)?;
            }
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
pub async fn copie_dossier(
    source: String,
    destination: String,
    sans_ecraser: Option<bool>,
) -> LibResult<RapportCopie> {
    tauri::async_runtime::spawn_blocking(move || {
        copier_dossier_avec(&source, &destination, sans_ecraser.unwrap_or(false))
    })
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
    fn sans_ecraser_garde_ce_qui_est_deja_la() {
        let t = tempfile::tempdir().unwrap();
        let src = t.path().join("BIBLIO");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("BIB-001.pdf"), "ancien").unwrap();
        fs::write(src.join("BIB-002.pdf"), "b").unwrap();
        let dst = t.path().join("Espace/bibliotheque/pdf");
        fs::create_dir_all(&dst).unwrap();
        fs::write(dst.join("BIB-001.pdf"), "version de l'espace").unwrap();

        let r = copier_dossier_avec(src.to_str().unwrap(), dst.to_str().unwrap(), true).unwrap();
        assert_eq!(
            r,
            RapportCopie {
                copies: 1,
                a_jour: 1,
                octets: 1
            }
        );
        assert_eq!(
            fs::read_to_string(dst.join("BIB-001.pdf")).unwrap(),
            "version de l'espace"
        );
        assert_eq!(fs::read_to_string(dst.join("BIB-002.pdf")).unwrap(), "b");
    }

    #[test]
    fn refuse_une_destination_dans_la_source() {
        let t = tempfile::tempdir().unwrap();
        let s = t.path().to_str().unwrap().to_string();
        let d = t.path().join("copie").to_str().unwrap().to_string();
        assert!(copier_dossier(&s, &d).is_err());
        // Destination à plusieurs niveaux, inexistante, dans la source.
        let d2 = t.path().join("a").join("b").to_str().unwrap().to_string();
        assert!(copier_dossier(&s, &d2).is_err());
        assert!(copier_dossier("relatif", &d).is_err());
        assert!(copier_dossier(&t.path().join("absent").to_string_lossy(), &d).is_err());
    }
}
