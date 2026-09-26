//! Accès aux fichiers sous une racine absolue : l'espace Thèse, la bibliothèque de figures
//! (SPEC §4.1).
//!
//! Tout chemin reçu de l'interface est **relatif à la racine** et validé par
//! [`paths::resolve`] ; la racine vient des réglages du poste. La logique (collections,
//! identifiants, conflits) vit en TypeScript dans `packages/noyau/src/stockage`.
//! Repris de Figurine (`src-tauri/src/library`).

pub mod commands;
pub mod error;
pub mod fsops;
pub mod host;
pub mod lock;
pub mod paths;

pub use error::{LibError, LibResult};
