//! Verrou d'édition `.lock` d'un dossier (SPEC §4.1), pour les éditions longues : `{"host": "...", "since": "..."}`.
//!
//! Règles (identiques à `packages/noyau/src/stockage/verrou.ts`, qui ne fait que les afficher) :
//! - pas de verrou, ou verrou de ce poste → on (re)prend le verrou ;
//! - verrou d'un autre poste depuis plus de 12 h, ou illisible → périmé, on le reprend ;
//! - verrou d'un autre poste plus récent → refus (lecture seule), sauf « forcer ».

use super::fsops::write_atomic;
use super::paths::resolve;
use super::{LibError, LibResult};
use chrono::{DateTime, SecondsFormat, TimeDelta, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;

pub const LOCK_FILE: &str = ".lock";
pub const STALE_LOCK_HOURS: i64 = 12;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LockInfo {
    pub host: String,
    pub since: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "kebab-case")]
pub enum Acquired {
    /// Aucun verrou auparavant.
    New,
    /// Verrou de ce poste, rafraîchi (reprise après plantage par exemple).
    Refreshed,
    /// Verrou périmé (> 12 h) ou illisible d'un autre poste, repris.
    TookOverStale { previous: Option<LockInfo> },
    /// Verrou récent d'un autre poste, repris à la demande de l'utilisateur.
    Forced { previous: LockInfo },
}

/// Noms de poste Windows : insensibles à la casse.
pub fn same_host(a: &str, b: &str) -> bool {
    a.trim().eq_ignore_ascii_case(b.trim())
}

enum Existing {
    None,
    Illegible,
    Valid(LockInfo, DateTime<Utc>),
}

fn lock_rel(folder: &str) -> LibResult<String> {
    if folder.is_empty() {
        return Err(LibError::InvalidPath(folder.to_string()));
    }
    Ok(format!("{folder}/{LOCK_FILE}"))
}

fn read_existing(root: &str, folder: &str) -> LibResult<Existing> {
    let path = resolve(root, &lock_rel(folder)?)?;
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Existing::None),
        // Contenu non UTF-8 : verrou illisible.
        Err(e) if e.kind() == io::ErrorKind::InvalidData => return Ok(Existing::Illegible),
        Err(e) => return Err(LibError::io(folder, e)),
    };
    let Ok(info) = serde_json::from_str::<LockInfo>(text.trim_start_matches('\u{feff}')) else {
        return Ok(Existing::Illegible);
    };
    match DateTime::parse_from_rfc3339(&info.since) {
        Ok(t) if !info.host.trim().is_empty() => Ok(Existing::Valid(info, t.with_timezone(&Utc))),
        _ => Ok(Existing::Illegible),
    }
}

/// Lit le verrou d'un dossier. Un verrou illisible est rendu avec `host = "?"`.
pub fn read_lock(root: &str, folder: &str) -> LibResult<Option<LockInfo>> {
    Ok(match read_existing(root, folder)? {
        Existing::None => None,
        Existing::Illegible => Some(LockInfo {
            host: "?".into(),
            since: "1970-01-01T00:00:00Z".into(),
        }),
        Existing::Valid(info, _) => Some(info),
    })
}

/// Pose (ou reprend) le verrou du dossier `folder` pour le poste `host`.
pub fn acquire_lock(
    root: &str,
    folder: &str,
    host: &str,
    now: DateTime<Utc>,
    force: bool,
) -> LibResult<Acquired> {
    let dir = resolve(root, folder)?;
    if folder.is_empty() || !dir.is_dir() {
        return Err(LibError::NotFound(folder.to_string()));
    }
    let outcome = match read_existing(root, folder)? {
        Existing::None => Acquired::New,
        Existing::Illegible => Acquired::TookOverStale { previous: None },
        Existing::Valid(info, _) if same_host(&info.host, host) => Acquired::Refreshed,
        Existing::Valid(info, since) => {
            // Horloge de l'autre PC en avance : âge négatif, donc verrou considéré récent.
            if now.signed_duration_since(since) > TimeDelta::hours(STALE_LOCK_HOURS) {
                Acquired::TookOverStale {
                    previous: Some(info),
                }
            } else if force {
                Acquired::Forced { previous: info }
            } else {
                return Err(LibError::LockedByOther {
                    host: info.host,
                    since: info.since,
                });
            }
        }
    };
    let info = LockInfo {
        host: host.trim().to_string(),
        since: now.to_rfc3339_opts(SecondsFormat::Secs, true),
    };
    let json = serde_json::to_string(&info).expect("sérialisation du verrou");
    write_atomic(root, &lock_rel(folder)?, format!("{json}\n").as_bytes())?;
    Ok(outcome)
}

/// Lève le verrou s'il appartient à `host` (ou si `force`). Renvoie `false` s'il n'y en avait pas.
/// Le verrou récent d'un autre poste n'est jamais levé sans `force`.
pub fn release_lock(root: &str, folder: &str, host: &str, force: bool) -> LibResult<bool> {
    match read_existing(root, folder)? {
        Existing::None => return Ok(false),
        Existing::Valid(info, _) if !force && !same_host(&info.host, host) => {
            return Err(LibError::LockedByOther {
                host: info.host,
                since: info.since,
            });
        }
        _ => {}
    }
    let path = resolve(root, &lock_rel(folder)?)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(LibError::io(folder, e)),
    }
}

/// Heure courante, pour les commandes Tauri.
pub fn now() -> DateTime<Utc> {
    Utc::now()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const FIG: &str = "FIG-0001_structure";

    fn lib() -> (TempDir, String) {
        let t = TempDir::new().unwrap();
        fs::create_dir(t.path().join(FIG)).unwrap();
        let root = t.path().to_str().unwrap().to_string();
        (t, root)
    }

    fn at(s: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(s).unwrap().with_timezone(&Utc)
    }

    fn put_lock(t: &TempDir, content: &str) {
        fs::write(t.path().join(FIG).join(LOCK_FILE), content).unwrap();
    }

    #[test]
    fn acquire_on_free_figure_writes_host_and_date() {
        let (t, root) = lib();
        let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T17:00:00Z"), false);
        assert_eq!(out.unwrap(), Acquired::New);
        let raw = fs::read_to_string(t.path().join(FIG).join(LOCK_FILE)).unwrap();
        assert_eq!(
            raw,
            "{\"host\":\"PC-TRAVAIL\",\"since\":\"2026-09-25T17:00:00Z\"}\n"
        );
        // Pas de chemin absolu dans le verrou (le nom de session diffère d'un PC à l'autre).
        assert!(!raw.contains(&root));
    }

    #[test]
    fn own_lock_is_refreshed_whatever_its_age_or_case() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-20T08:00:00Z"), false).unwrap();
        let out = acquire_lock(&root, FIG, "pc-travail", at("2026-09-25T17:00:00Z"), false);
        assert_eq!(out.unwrap(), Acquired::Refreshed);
        assert_eq!(
            read_lock(&root, FIG).unwrap().unwrap().since,
            "2026-09-25T17:00:00Z"
        );
    }

    #[test]
    fn recent_lock_of_another_host_is_refused() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-MAISON", at("2026-09-25T08:00:00Z"), false).unwrap();
        let err =
            acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T19:59:59Z"), false).unwrap_err();
        assert_eq!(err.code(), "locked");
        assert!(err.to_string().contains("PC-MAISON"));
        // Le verrou d'origine est intact.
        assert_eq!(read_lock(&root, FIG).unwrap().unwrap().host, "PC-MAISON");
    }

    #[test]
    fn recent_lock_can_be_forced() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-MAISON", at("2026-09-25T08:00:00Z"), false).unwrap();
        let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T09:00:00Z"), true);
        assert_eq!(
            out.unwrap(),
            Acquired::Forced {
                previous: LockInfo {
                    host: "PC-MAISON".into(),
                    since: "2026-09-25T08:00:00Z".into()
                }
            }
        );
        assert_eq!(read_lock(&root, FIG).unwrap().unwrap().host, "PC-TRAVAIL");
    }

    #[test]
    fn stale_lock_is_taken_over() {
        let (t, root) = lib();
        // Heure locale +02:00 : 07:59 à Paris = 05:59 UTC, soit 12 h 01 avant 18:00 UTC.
        put_lock(
            &t,
            "{\"host\":\"PC-MAISON\",\"since\":\"2026-09-25T07:59:00+02:00\"}",
        );
        let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T18:00:00Z"), false);
        assert!(matches!(
            out.unwrap(),
            Acquired::TookOverStale { previous: Some(ref p) } if p.host == "PC-MAISON"
        ));
    }

    #[test]
    fn lock_exactly_12h_old_is_still_valid() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-MAISON", at("2026-09-25T06:00:00Z"), false).unwrap();
        let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T18:00:00Z"), false);
        assert_eq!(out.unwrap_err().code(), "locked");
    }

    #[test]
    fn future_lock_from_a_fast_clock_is_considered_recent() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-MAISON", at("2026-09-26T08:00:00Z"), false).unwrap();
        let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T18:00:00Z"), false);
        assert_eq!(out.unwrap_err().code(), "locked");
    }

    #[test]
    fn illegible_lock_is_taken_over() {
        for content in [
            "",
            "{",
            "{\"host\":\"PC\"}",
            "{\"host\":\"\",\"since\":\"2026-09-25T08:00:00Z\"}",
            "{\"host\":\"PC\",\"since\":\"hier\"}",
        ] {
            let (t, root) = lib();
            put_lock(&t, content);
            assert_eq!(
                read_lock(&root, FIG).unwrap().unwrap().host,
                "?",
                "{content}"
            );
            let out = acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T18:00:00Z"), false);
            assert_eq!(
                out.unwrap(),
                Acquired::TookOverStale { previous: None },
                "{content}"
            );
        }
    }

    #[test]
    fn release_own_lock() {
        let (t, root) = lib();
        acquire_lock(&root, FIG, "PC-TRAVAIL", at("2026-09-25T17:00:00Z"), false).unwrap();
        assert!(release_lock(&root, FIG, "PC-TRAVAIL", false).unwrap());
        assert!(!t.path().join(FIG).join(LOCK_FILE).exists());
        assert!(!release_lock(&root, FIG, "PC-TRAVAIL", false).unwrap());
        assert_eq!(read_lock(&root, FIG).unwrap(), None);
    }

    #[test]
    fn release_of_another_hosts_lock_needs_force() {
        let (_t, root) = lib();
        acquire_lock(&root, FIG, "PC-MAISON", at("2026-09-25T17:00:00Z"), false).unwrap();
        assert_eq!(
            release_lock(&root, FIG, "PC-TRAVAIL", false)
                .unwrap_err()
                .code(),
            "locked"
        );
        assert!(release_lock(&root, FIG, "PC-TRAVAIL", true).unwrap());
    }

    #[test]
    fn missing_figure_folder() {
        let (_t, root) = lib();
        let out = acquire_lock(
            &root,
            "FIG-0099_absent",
            "PC",
            at("2026-09-25T17:00:00Z"),
            false,
        );
        assert_eq!(out.unwrap_err().code(), "not-found");
        assert_eq!(
            acquire_lock(&root, "", "PC", at("2026-09-25T17:00:00Z"), false)
                .unwrap_err()
                .code(),
            "not-found"
        );
    }

    #[test]
    fn works_in_folder_with_spaces_and_accents() {
        let t = TempDir::new().unwrap();
        let root_path = t.path().join("OneDrive - École");
        fs::create_dir_all(root_path.join("FIG-0002_chaussée souple")).unwrap();
        let root = root_path.to_str().unwrap();
        acquire_lock(
            root,
            "FIG-0002_chaussée souple",
            "PC-É",
            at("2026-09-25T17:00:00Z"),
            false,
        )
        .unwrap();
        assert_eq!(
            read_lock(root, "FIG-0002_chaussée souple")
                .unwrap()
                .unwrap()
                .host,
            "PC-É"
        );
    }

    #[test]
    fn outcome_serializes_for_the_ui() {
        let v = serde_json::to_value(Acquired::TookOverStale { previous: None }).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"outcome": "took-over-stale", "previous": null})
        );
    }
}
