//! Surveillance d'une racine (SPEC §4.1) : quand OneDrive apporte une modification faite
//! sur l'autre PC — ou quand l'application elle-même écrit —, l'interface reçoit l'événement
//! `fichiers-modifies` avec les chemins relatifs touchés, et les vues se rechargent.
//!
//! Les notifications arrivent en rafales (OneDrive écrit un fichier en plusieurs fois) : on
//! les regroupe sur une courte fenêtre avant d'émettre un seul événement.

use crate::fichiers::paths::check_root;
use crate::fichiers::{LibError, LibResult};
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

/// Fenêtre de regroupement : une rafale de OneDrive donne un seul événement.
const REGROUPEMENT: Duration = Duration::from_millis(400);

#[derive(Default)]
pub struct Surveillances {
    suivant: AtomicU32,
    actives: Mutex<HashMap<u32, notify::RecommendedWatcher>>,
}

#[derive(Clone, Serialize)]
struct Modifies {
    id: u32,
    chemins: Vec<String>,
}

/// Chemins relatifs à `racine`, séparateur « / », triés et sans doublon. Ce qui est hors de
/// la racine (ne devrait pas arriver) est ignoré.
pub fn chemins_relatifs(racine: &Path, chemins: impl IntoIterator<Item = PathBuf>) -> Vec<String> {
    let mut out = BTreeSet::new();
    for p in chemins {
        if let Ok(rel) = p.strip_prefix(racine) {
            let parts: Vec<String> = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy().into_owned())
                .collect();
            out.insert(parts.join("/"));
        }
    }
    out.into_iter().collect()
}

/// Attend une première notification, puis absorbe celles qui suivent tant qu'elles
/// arrivent à moins de `fenetre` d'intervalle. None quand la surveillance est arrêtée.
pub fn regrouper<T>(rx: &Receiver<T>, fenetre: Duration) -> Option<Vec<T>> {
    let premier = rx.recv().ok()?;
    let mut lot = vec![premier];
    loop {
        match rx.recv_timeout(fenetre) {
            Ok(x) => lot.push(x),
            Err(RecvTimeoutError::Timeout) => return Some(lot),
            // Arrêt pendant une rafale : on livre quand même ce qui a été reçu.
            Err(RecvTimeoutError::Disconnected) => return Some(lot),
        }
    }
}

#[tauri::command]
pub fn surveillance_demarrer(
    app: tauri::AppHandle,
    etat: tauri::State<'_, Surveillances>,
    racine: String,
) -> LibResult<u32> {
    let base = check_root(&racine)?;
    let id = etat.suivant.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = channel::<Vec<PathBuf>>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            let _ = tx.send(ev.paths);
        }
    })
    .map_err(|e| LibError::NotAllowed(format!("Surveillance impossible : {e}")))?;
    watcher
        .watch(&base, RecursiveMode::Recursive)
        .map_err(|e| LibError::NotAllowed(format!("Surveillance impossible de {racine} : {e}")))?;
    std::thread::spawn(move || {
        // S'arrête quand le watcher est détruit (surveillance_arreter) : le canal se ferme.
        while let Some(lot) = regrouper(&rx, REGROUPEMENT) {
            let chemins = chemins_relatifs(&base, lot.into_iter().flatten());
            if !chemins.is_empty() {
                let _ = app.emit("fichiers-modifies", Modifies { id, chemins });
            }
        }
    });
    etat.actives
        .lock()
        .expect("verrou des surveillances")
        .insert(id, watcher);
    Ok(id)
}

#[tauri::command]
pub fn surveillance_arreter(etat: tauri::State<'_, Surveillances>, id: u32) {
    etat.actives
        .lock()
        .expect("verrou des surveillances")
        .remove(&id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chemins_relatifs_tries_sans_doublon() {
        let racine = PathBuf::from("/home/lucas/OneDrive/Thèse/Espace");
        let got = chemins_relatifs(
            &racine,
            vec![
                racine.join("planning").join("PH-0002.json"),
                racine.join("espace.json"),
                racine.join("planning").join("PH-0002.json"),
                PathBuf::from("/ailleurs/x"),
            ],
        );
        assert_eq!(got, vec!["espace.json", "planning/PH-0002.json"]);
    }

    #[test]
    fn regroupe_une_rafale_et_s_arrete_quand_le_canal_se_ferme() {
        let (tx, rx) = channel();
        for i in 0..5 {
            tx.send(i).unwrap();
        }
        assert_eq!(
            regrouper(&rx, Duration::from_millis(50)),
            Some(vec![0, 1, 2, 3, 4])
        );
        drop(tx);
        assert_eq!(regrouper(&rx, Duration::from_millis(50)), None);
    }

    #[test]
    fn signale_une_ecriture_reelle() {
        let t = tempfile::TempDir::new().unwrap();
        let base = t.path().canonicalize().unwrap();
        let (tx, rx) = channel::<Vec<PathBuf>>();
        let mut w = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            if let Ok(ev) = res {
                let _ = tx.send(ev.paths);
            }
        })
        .unwrap();
        w.watch(&base, RecursiveMode::Recursive).unwrap();
        std::fs::write(base.join("espace.json"), "{}").unwrap();
        let lot = regrouper(&rx, Duration::from_millis(200)).unwrap();
        assert!(
            chemins_relatifs(&base, lot.into_iter().flatten()).contains(&"espace.json".to_string())
        );
    }
}
