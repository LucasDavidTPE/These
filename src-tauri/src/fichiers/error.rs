use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use std::fmt;
use std::io;

/// Erreur renvoyée à l'interface : `{ "code": "...", "message": "..." }`, message en français.
#[derive(Debug)]
pub enum LibError {
    InvalidRoot(String),
    InvalidPath(String),
    NotFound(String),
    AlreadyExists(String),
    LockedByOther { host: String, since: String },
    NotAllowed(String),
    Io { path: String, source: io::Error },
}

pub type LibResult<T> = Result<T, LibError>;

impl LibError {
    pub fn code(&self) -> &'static str {
        match self {
            LibError::InvalidRoot(_) => "invalid-root",
            LibError::InvalidPath(_) => "invalid-path",
            LibError::NotFound(_) => "not-found",
            LibError::AlreadyExists(_) => "already-exists",
            LibError::LockedByOther { .. } => "locked",
            LibError::NotAllowed(_) => "not-allowed",
            LibError::Io { .. } => "io",
        }
    }

    /// Traduit une erreur d'E/S en tenant compte des cas qu'on sait nommer.
    pub fn io(path: impl Into<String>, source: io::Error) -> Self {
        let path = path.into();
        match source.kind() {
            io::ErrorKind::NotFound => LibError::NotFound(path),
            io::ErrorKind::AlreadyExists => LibError::AlreadyExists(path),
            _ => LibError::Io { path, source },
        }
    }
}

impl fmt::Display for LibError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LibError::InvalidRoot(r) => write!(f, "Dossier racine invalide : « {r} »"),
            LibError::InvalidPath(p) => write!(f, "Chemin relatif invalide : « {p} »"),
            LibError::NotFound(p) => write!(f, "Introuvable : {p}"),
            LibError::AlreadyExists(p) => write!(f, "Existe déjà : {p}"),
            LibError::LockedByOther { host, since } => {
                write!(f, "En cours de modification sur {host} depuis {since}")
            }
            LibError::NotAllowed(m) => write!(f, "{m}"),
            LibError::Io { path, source } => write!(f, "Erreur de fichier sur {path} : {source}"),
        }
    }
}

impl std::error::Error for LibError {}

impl Serialize for LibError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("LibError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_french_message() {
        let e = LibError::LockedByOther {
            host: "PC-MAISON".into(),
            since: "2026-09-25T08:00:00Z".into(),
        };
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json["code"], "locked");
        assert_eq!(
            json["message"],
            "En cours de modification sur PC-MAISON depuis 2026-09-25T08:00:00Z"
        );
    }

    #[test]
    fn maps_io_kinds() {
        let e = LibError::io("x", io::Error::from(io::ErrorKind::NotFound));
        assert_eq!(e.code(), "not-found");
        let e = LibError::io("x", io::Error::from(io::ErrorKind::PermissionDenied));
        assert_eq!(e.code(), "io");
    }
}
