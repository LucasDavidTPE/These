//! Résolution sûre des chemins relatifs à la racine.
//!
//! Les fichiers de l'espace ne contiennent que des chemins relatifs (SPEC §4.1),
//! avec « / » comme séparateur ; on accepte aussi « \ ». Tout ce qui pourrait sortir
//! de la racine est refusé.

use super::{LibError, LibResult};
use std::path::PathBuf;

/// Noms réservés par Windows, interdits comme nom de fichier quelle que soit l'extension.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Vérifie la racine : chemin absolu d'un dossier existant.
pub fn check_root(root: &str) -> LibResult<PathBuf> {
    let p = PathBuf::from(root);
    if root.is_empty() || !p.is_absolute() {
        return Err(LibError::InvalidRoot(root.to_string()));
    }
    if !p.is_dir() {
        return Err(LibError::InvalidRoot(root.to_string()));
    }
    Ok(p)
}

/// Découpe et valide un chemin relatif ; « » désigne la racine elle-même.
pub fn components(rel: &str) -> LibResult<Vec<&str>> {
    if rel.is_empty() {
        return Ok(Vec::new());
    }
    let bad = || LibError::InvalidPath(rel.to_string());
    let parts: Vec<&str> = rel.split(['/', '\\']).collect();
    for part in &parts {
        if part.is_empty() || *part == "." || *part == ".." {
            return Err(bad());
        }
        // « : » = lecteur (C:) ou flux alternatif NTFS ; caractères interdits sous Windows.
        if part
            .chars()
            .any(|c| c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        {
            return Err(bad());
        }
        let stem = part.split('.').next().unwrap_or("").trim_end();
        if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
            return Err(bad());
        }
    }
    Ok(parts)
}

/// Chemin absolu de `rel` sous `root` (racine vérifiée).
pub fn resolve(root: &str, rel: &str) -> LibResult<PathBuf> {
    let mut p = check_root(root)?;
    for part in components(rel)? {
        p.push(part);
    }
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn accepts_spaces_and_accents() {
        for ok in [
            "meta.json",
            "FIG-0001_chaussée/meta.json",
            "Dossier à espaces/Fichier é.png",
            "a\\b",
            ".lock",
            "console.txt",
        ] {
            assert!(components(ok).is_ok(), "{ok}");
        }
        assert_eq!(components("").unwrap(), Vec::<&str>::new());
        assert_eq!(components("a\\b/c").unwrap(), vec!["a", "b", "c"]);
    }

    #[test]
    fn rejects_escapes_and_windows_traps() {
        for bad in [
            "/etc/passwd",
            "\\\\serveur\\partage",
            "C:\\Users",
            "c:x",
            "../x",
            "a/../../b",
            "a//b",
            "a/./b",
            "a/",
            "meta.json:flux",
            "NUL",
            "con.txt",
            "a/Com1.json",
            "a?b",
            "tab\there",
        ] {
            assert!(components(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn root_must_be_an_existing_absolute_dir() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_str().unwrap();
        assert!(check_root(root).is_ok());
        assert!(check_root("").is_err());
        assert!(check_root("relatif/dossier").is_err());
        assert!(check_root(tmp.path().join("absent").to_str().unwrap()).is_err());
        assert_eq!(
            resolve(root, "a/b").unwrap(),
            tmp.path().join("a").join("b")
        );
    }
}
