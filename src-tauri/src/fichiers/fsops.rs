//! Opérations de fichiers sous une racine (l'espace, la bibliothèque de figures) : lister,
//! lire, écrire atomiquement, créer sans écraser, renommer sans écraser.

use super::paths::resolve;
use super::{LibError, LibResult};
use serde::Serialize;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

/// Suffixe des fichiers temporaires d'écriture atomique (reconnu par le scan, SPEC §4).
pub const TMP_SUFFIX: &str = ".tmp";

/// Tentatives de renommage quand Windows répond « accès refusé » : OneDrive ou
/// l'antivirus gardent parfois le fichier ouvert quelques millisecondes.
const RENAME_RETRIES: [u64; 5] = [20, 50, 100, 200, 400];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub kind: EntryKind,
}

/// Contenu d'un dossier, trié par nom. Les noms non Unicode et les entrées
/// inaccessibles (lien cassé…) sont ignorés.
pub fn list_dir(root: &str, rel: &str) -> LibResult<Vec<DirEntry>> {
    let dir = resolve(root, rel)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| LibError::io(rel, e))? {
        let entry = entry.map_err(|e| LibError::io(rel, e))?;
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        // fs::metadata suit les liens (dossier OneDrive redirigé, jonction).
        let Ok(meta) = fs::metadata(entry.path()) else {
            continue;
        };
        let kind = if meta.is_dir() {
            EntryKind::Dir
        } else {
            EntryKind::File
        };
        out.push(DirEntry { name, kind });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Lit un fichier texte UTF-8 (un éventuel BOM, ajouté par le Bloc-notes, est retiré).
pub fn read_text(root: &str, rel: &str) -> LibResult<String> {
    let path = resolve(root, rel)?;
    let text = fs::read_to_string(&path).map_err(|e| LibError::io(rel, e))?;
    Ok(match text.strip_prefix('\u{feff}') {
        Some(rest) => rest.to_string(),
        None => text,
    })
}

/// Écriture atomique : `<nom>.tmp` écrit et synchronisé sur disque, puis renommé par-dessus
/// la cible. Une coupure en cours de route laisse l'ancienne version intacte (et un `.tmp`
/// que le scan signale). Le dossier parent doit exister.
pub fn write_atomic(root: &str, rel: &str, data: &[u8]) -> LibResult<()> {
    let target = resolve(root, rel)?;
    if rel.is_empty() {
        return Err(LibError::InvalidPath(rel.to_string()));
    }
    let parent = target.parent().expect("chemin sous la racine");
    if !parent.is_dir() {
        return Err(LibError::NotFound(parent_rel(rel)));
    }
    if target.is_dir() {
        return Err(LibError::AlreadyExists(rel.to_string()));
    }
    let tmp = tmp_path(&target);
    let result = write_and_sync(&tmp, data).and_then(|()| rename_with_retry(&tmp, &target));
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(LibError::io(rel, e));
    }
    sync_dir(parent);
    Ok(())
}

/// Crée un dossier ; échoue s'il existe déjà.
pub fn create_dir(root: &str, rel: &str) -> LibResult<()> {
    if rel.is_empty() {
        return Err(LibError::InvalidPath(rel.to_string()));
    }
    let path = resolve(root, rel)?;
    fs::create_dir(&path).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => LibError::NotFound(parent_rel(rel)),
        _ => LibError::io(rel, e),
    })
}

/// Crée un dossier et ses parents ; ne fait rien s'il existe déjà.
pub fn ensure_dir(root: &str, rel: &str) -> LibResult<()> {
    let path = resolve(root, rel)?;
    if path.is_file() {
        return Err(LibError::AlreadyExists(rel.to_string()));
    }
    fs::create_dir_all(&path).map_err(|e| LibError::io(rel, e))
}

/// Vrai si le fichier ou le dossier existe.
pub fn exists(root: &str, rel: &str) -> LibResult<bool> {
    Ok(resolve(root, rel)?.exists())
}

/// Écriture atomique **exclusive** : échoue avec `already-exists` si la cible existe.
/// Sert à réserver un identifiant (`BIB-180.json`) sans jamais écraser celui que l'autre
/// PC aurait créé entre-temps. Le fichier est écrit en entier sous un nom temporaire, puis
/// publié par un lien physique, qui échoue de façon atomique si la cible existe ; sur un
/// système de fichiers sans liens physiques, on se replie sur « vérifier puis renommer ».
pub fn write_new(root: &str, rel: &str, data: &[u8]) -> LibResult<()> {
    let target = resolve(root, rel)?;
    if rel.is_empty() {
        return Err(LibError::InvalidPath(rel.to_string()));
    }
    let parent = target.parent().expect("chemin sous la racine");
    if !parent.is_dir() {
        return Err(LibError::NotFound(parent_rel(rel)));
    }
    if target.exists() {
        return Err(LibError::AlreadyExists(rel.to_string()));
    }
    let tmp = tmp_path(&target);
    if let Err(e) = write_and_sync(&tmp, data) {
        let _ = fs::remove_file(&tmp);
        return Err(LibError::io(rel, e));
    }
    let published = match fs::hard_link(&tmp, &target) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
            Err(LibError::AlreadyExists(rel.to_string()))
        }
        Err(_) if target.exists() => Err(LibError::AlreadyExists(rel.to_string())),
        Err(_) => {
            let r = rename_with_retry(&tmp, &target).map_err(|e| LibError::io(rel, e));
            sync_dir(parent);
            return r;
        }
    };
    let _ = fs::remove_file(&tmp);
    sync_dir(parent);
    published
}

/// Renomme un fichier ou un dossier ; refuse d'écraser une destination existante.
pub fn rename(root: &str, from: &str, to: &str) -> LibResult<()> {
    if from.is_empty() || to.is_empty() {
        return Err(LibError::InvalidPath(String::new()));
    }
    let src = resolve(root, from)?;
    let dst = resolve(root, to)?;
    if !src.exists() {
        return Err(LibError::NotFound(from.to_string()));
    }
    if dst.exists() {
        return Err(LibError::AlreadyExists(to.to_string()));
    }
    rename_with_retry(&src, &dst).map_err(|e| LibError::io(to, e))
}

/// Supprime un fichier temporaire laissé par une écriture interrompue.
/// Seuls les `*.tmp` peuvent être supprimés par cette voie.
pub fn remove_temp(root: &str, rel: &str) -> LibResult<()> {
    if !rel.ends_with(TMP_SUFFIX) {
        return Err(LibError::NotAllowed(format!(
            "Seuls les fichiers {TMP_SUFFIX} peuvent être supprimés : {rel}"
        )));
    }
    let path = resolve(root, rel)?;
    fs::remove_file(path).map_err(|e| LibError::io(rel, e))
}

pub(crate) fn tmp_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().expect("nom de fichier").to_os_string();
    name.push(TMP_SUFFIX);
    target.with_file_name(name)
}

fn write_and_sync(path: &Path, data: &[u8]) -> io::Result<()> {
    let mut f = fs::File::create(path)?;
    f.write_all(data)?;
    f.sync_all()
}

fn rename_with_retry(from: &Path, to: &Path) -> io::Result<()> {
    let mut last = None;
    for delay in std::iter::once(0).chain(RENAME_RETRIES) {
        if delay > 0 {
            thread::sleep(Duration::from_millis(delay));
        }
        match fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied => last = Some(e),
            Err(e) => return Err(e),
        }
    }
    Err(last.expect("au moins une tentative"))
}

/// Sous Unix, synchronise le dossier pour que le renommage soit durable.
/// Sous Windows, NTFS journalise le renommage : rien à faire.
fn sync_dir(_dir: &Path) {
    #[cfg(unix)]
    if let Ok(d) = fs::File::open(_dir) {
        let _ = d.sync_all();
    }
}

fn parent_rel(rel: &str) -> String {
    match rel.rfind(['/', '\\']) {
        Some(i) => rel[..i].to_string(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn lib() -> (TempDir, String) {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_str().unwrap().to_string();
        (tmp, root)
    }

    #[test]
    fn write_then_read_and_list() {
        let (_t, root) = lib();
        create_dir(&root, "FIG-0001_a").unwrap();
        write_atomic(&root, "FIG-0001_a/meta.json", b"{\"id\":\"FIG-0001\"}").unwrap();
        write_atomic(&root, "figurine-library.json", b"{}").unwrap();
        assert_eq!(
            read_text(&root, "FIG-0001_a/meta.json").unwrap(),
            "{\"id\":\"FIG-0001\"}"
        );
        assert_eq!(
            list_dir(&root, "").unwrap(),
            vec![
                DirEntry {
                    name: "FIG-0001_a".into(),
                    kind: EntryKind::Dir
                },
                DirEntry {
                    name: "figurine-library.json".into(),
                    kind: EntryKind::File
                },
            ]
        );
        // Aucun .tmp ne reste après une écriture réussie.
        let names: Vec<String> = list_dir(&root, "FIG-0001_a")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["meta.json"]);
    }

    #[test]
    fn overwrite_replaces_content() {
        let (_t, root) = lib();
        write_atomic(&root, "a.json", b"version 1, plus longue").unwrap();
        write_atomic(&root, "a.json", b"v2").unwrap();
        assert_eq!(read_text(&root, "a.json").unwrap(), "v2");
    }

    #[test]
    fn interrupted_write_keeps_previous_version() {
        let (t, root) = lib();
        write_atomic(&root, "meta.json", b"ancienne").unwrap();
        // Coupure simulée : le .tmp a été écrit à moitié, le renommage n'a pas eu lieu.
        fs::write(t.path().join("meta.json.tmp"), b"{\"id\": \"FIG-00").unwrap();
        assert_eq!(read_text(&root, "meta.json").unwrap(), "ancienne");
        let names: Vec<String> = list_dir(&root, "")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["meta.json", "meta.json.tmp"]);
        // L'écriture suivante réussit et fait disparaître le .tmp orphelin.
        write_atomic(&root, "meta.json", b"nouvelle").unwrap();
        assert_eq!(read_text(&root, "meta.json").unwrap(), "nouvelle");
        assert!(!t.path().join("meta.json.tmp").exists());
    }

    #[test]
    fn failed_write_cleans_up_and_leaves_target_alone() {
        let (t, root) = lib();
        // Cible occupée par un dossier : le renommage échouerait.
        fs::create_dir(t.path().join("occupe")).unwrap();
        fs::write(t.path().join("occupe").join("x"), b"x").unwrap();
        let err = write_atomic(&root, "occupe", b"data").unwrap_err();
        assert_eq!(err.code(), "already-exists");
        assert!(t.path().join("occupe").join("x").exists());
        assert!(!t.path().join("occupe.tmp").exists());
    }

    #[test]
    fn write_requires_existing_parent() {
        let (t, root) = lib();
        let err = write_atomic(&root, "FIG-0009_x/meta.json", b"{}").unwrap_err();
        assert_eq!(err.code(), "not-found");
        assert!(!t.path().join("FIG-0009_x").exists());
    }

    #[test]
    fn create_dir_is_exclusive() {
        let (_t, root) = lib();
        create_dir(&root, "FIG-0001_a").unwrap();
        assert_eq!(
            create_dir(&root, "FIG-0001_a").unwrap_err().code(),
            "already-exists"
        );
        assert_eq!(create_dir(&root, "x/y").unwrap_err().code(), "not-found");
    }

    #[test]
    fn write_new_never_overwrites_and_leaves_no_temp() {
        let (t, root) = lib();
        create_dir(&root, "planning").unwrap();
        write_new(&root, "planning/PH-0001.json", b"premier").unwrap();
        assert_eq!(
            write_new(&root, "planning/PH-0001.json", b"second")
                .unwrap_err()
                .code(),
            "already-exists"
        );
        assert_eq!(
            read_text(&root, "planning/PH-0001.json").unwrap(),
            "premier"
        );
        assert!(!t.path().join("planning").join("PH-0001.json.tmp").exists());
        assert_eq!(
            write_new(&root, "absent/PH-0001.json", b"x")
                .unwrap_err()
                .code(),
            "not-found"
        );
    }

    #[test]
    fn ensure_dir_creates_parents_and_accepts_existing() {
        let (t, root) = lib();
        ensure_dir(&root, "bibliotheque/references").unwrap();
        ensure_dir(&root, "bibliotheque/references").unwrap();
        assert!(t.path().join("bibliotheque").join("references").is_dir());
        assert!(exists(&root, "bibliotheque").unwrap());
        assert!(!exists(&root, "planning").unwrap());
        write_atomic(&root, "f.json", b"{}").unwrap();
        assert_eq!(
            ensure_dir(&root, "f.json").unwrap_err().code(),
            "already-exists"
        );
    }

    #[test]
    fn rename_never_overwrites() {
        let (_t, root) = lib();
        write_atomic(&root, "meta.json", b"travail").unwrap();
        write_atomic(&root, "meta-PC-MAISON.json", b"maison").unwrap();
        assert_eq!(
            rename(&root, "meta-PC-MAISON.json", "meta.json")
                .unwrap_err()
                .code(),
            "already-exists"
        );
        create_dir(&root, ".conflits").unwrap();
        rename(&root, "meta.json", ".conflits/meta.json").unwrap();
        rename(&root, "meta-PC-MAISON.json", "meta.json").unwrap();
        assert_eq!(read_text(&root, "meta.json").unwrap(), "maison");
        assert_eq!(read_text(&root, ".conflits/meta.json").unwrap(), "travail");
        assert_eq!(
            rename(&root, "absent", "b").unwrap_err().code(),
            "not-found"
        );
    }

    #[test]
    fn remove_temp_only_removes_tmp_files() {
        let (t, root) = lib();
        fs::write(t.path().join("meta.json.tmp"), b"x").unwrap();
        fs::write(t.path().join("meta.json"), b"x").unwrap();
        assert_eq!(
            remove_temp(&root, "meta.json").unwrap_err().code(),
            "not-allowed"
        );
        remove_temp(&root, "meta.json.tmp").unwrap();
        assert!(!t.path().join("meta.json.tmp").exists());
        assert!(t.path().join("meta.json").exists());
    }

    #[test]
    fn read_strips_bom() {
        let (t, root) = lib();
        fs::write(t.path().join("a.json"), "\u{feff}{\"é\":1}").unwrap();
        assert_eq!(read_text(&root, "a.json").unwrap(), "{\"é\":1}");
    }

    #[test]
    fn rejects_paths_outside_root() {
        let (_t, root) = lib();
        assert_eq!(
            read_text(&root, "../secret").unwrap_err().code(),
            "invalid-path"
        );
        assert_eq!(
            write_atomic(&root, "/tmp/x", b"").unwrap_err().code(),
            "invalid-path"
        );
        assert_eq!(
            write_atomic(&root, "", b"").unwrap_err().code(),
            "invalid-path"
        );
        assert_eq!(list_dir("relatif", "").unwrap_err().code(), "invalid-root");
    }

    #[test]
    fn works_with_spaces_and_accents_everywhere() {
        let t = TempDir::new().unwrap();
        let root_path = t.path().join("Lucas Dävid").join("OneDrive - Université");
        fs::create_dir_all(&root_path).unwrap();
        let root = root_path.to_str().unwrap();
        create_dir(root, "FIG-0001_chaussée à l'étude").unwrap();
        write_atomic(
            root,
            "FIG-0001_chaussée à l'étude/meta.json",
            "« é »".as_bytes(),
        )
        .unwrap();
        assert_eq!(
            read_text(root, "FIG-0001_chaussée à l'étude/meta.json").unwrap(),
            "« é »"
        );
        assert_eq!(
            list_dir(root, "").unwrap()[0].name,
            "FIG-0001_chaussée à l'étude"
        );
    }

    #[test]
    fn library_survives_a_different_session_name() {
        // PC-TRAVAIL : C:\Users\lucas.david\OneDrive ; PC-MAISON : C:\Users\Lucas\OneDrive.
        let t = TempDir::new().unwrap();
        let travail = t
            .path()
            .join("lucas.david")
            .join("OneDrive")
            .join("Figures");
        let maison = t.path().join("Lucas").join("OneDrive").join("Figures");
        fs::create_dir_all(&travail).unwrap();
        fs::create_dir_all(maison.parent().unwrap()).unwrap();
        let root_a = travail.to_str().unwrap();
        create_dir(root_a, "FIG-0001_a").unwrap();
        write_atomic(root_a, "FIG-0001_a/meta.json", b"{\"id\":\"FIG-0001\"}").unwrap();
        // OneDrive « synchronise » : même arborescence sous une autre racine.
        fs::rename(&travail, &maison).unwrap();
        let root_b = maison.to_str().unwrap();
        assert_eq!(
            read_text(root_b, "FIG-0001_a/meta.json").unwrap(),
            "{\"id\":\"FIG-0001\"}"
        );
    }
}
