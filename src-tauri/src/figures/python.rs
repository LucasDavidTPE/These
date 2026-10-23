//! Scripts Python des projets de figures (SPEC §6.1) : lancés avec le Python **du poste**, sur un
//! geste de l'utilisateur, jamais en tâche de fond. Seul un `.py` rangé dans
//! `…/_projets/<projet>/scripts/` est accepté. Les sorties vont dans `…/sorties/<script>/`
//! (variable `THESE_SORTIES`, lue par `these_figures.py`) ; la console est diffusée en direct.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

/// Au-delà, le script est arrêté (boucle infinie, fenêtre `plt.show()` restée ouverte…).
const DELAI: Duration = Duration::from_secs(600);

/// Une ligne de la console du script.
#[derive(Clone, Serialize)]
#[serde(tag = "flux", content = "texte", rename_all = "lowercase")]
pub enum Ligne {
    Stdout(String),
    Stderr(String),
}

#[derive(Serialize, Debug)]
pub struct Fin {
    /// Code de sortie (None : arrêté par l'application ou par le système).
    pub code: Option<i32>,
    pub arrete: bool,
    pub depasse: bool,
    pub duree_ms: u64,
    /// Commande Python utilisée (« py -3 », « python »…).
    pub python: String,
}

/// Exécutions en cours, par identifiant choisi par l'interface (pour « Arrêter »).
#[derive(Default)]
pub struct Executions(Mutex<HashMap<String, Arc<Mutex<Child>>>>);

/// Chemin d'un script de projet : `<…>/_projets/<projet>/scripts/<nom>.py` (absolu) →
/// (dossier `scripts`, dossier des sorties `<projet>/sorties/<nom>`).
pub fn verifier_script(chemin: &str) -> Result<(PathBuf, PathBuf), String> {
    let p = Path::new(chemin);
    let py = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("py"));
    let scripts = p.parent();
    let projet = scripts.and_then(Path::parent);
    let projets = projet.and_then(Path::parent);
    let nom = |d: Option<&Path>| d.and_then(Path::file_name).and_then(|n| n.to_str()).map(str::to_owned);
    let bien_place = nom(scripts).as_deref() == Some("scripts") && nom(projets).as_deref() == Some("_projets");
    if !p.is_absolute() || !py || !bien_place || chemin.split(['/', '\\']).any(|c| c == "..") {
        return Err(format!("Seuls les scripts .py du dossier scripts/ d'un projet de figures s'exécutent ici : {chemin}"));
    }
    if !p.is_file() {
        return Err(format!("Script introuvable : {chemin}"));
    }
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("script");
    Ok((scripts.unwrap().to_path_buf(), projet.unwrap().join("sorties").join(stem)))
}

/// Commandes essayées, dans l'ordre : celle des réglages du poste, puis le lanceur `py -3`
/// (installations python.org sous Windows), puis `python` et `python3` du PATH.
pub fn candidates(reglage: Option<&str>) -> Vec<(String, Vec<String>)> {
    let mut out = Vec::new();
    if let Some(r) = reglage.map(str::trim).filter(|r| !r.is_empty()) {
        out.push((r.to_string(), Vec::new()));
        return out;
    }
    if cfg!(windows) {
        out.push(("py".to_string(), vec!["-3".to_string()]));
    }
    out.push(("python".to_string(), Vec::new()));
    out.push(("python3".to_string(), Vec::new()));
    out
}

fn commande(programme: &str, prefixe: &[String]) -> Command {
    let mut c = Command::new(programme);
    c.args(prefixe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW : pas de console qui clignote.
        c.creation_flags(0x0800_0000);
    }
    c
}

fn libelle(programme: &str, prefixe: &[String]) -> String {
    std::iter::once(programme.to_string()).chain(prefixe.iter().cloned()).collect::<Vec<_>>().join(" ")
}

/// Première commande Python qui répond à `--version` : (programme, préfixe, « Python 3.12.1 »).
pub fn trouver(reglage: Option<&str>) -> Result<(String, Vec<String>, String), String> {
    for (prog, prefixe) in candidates(reglage) {
        if let Ok(o) = commande(&prog, &prefixe).arg("--version").stdin(Stdio::null()).output() {
            let v = String::from_utf8_lossy(if o.stdout.is_empty() { &o.stderr } else { &o.stdout }).trim().to_string();
            if o.status.success() && v.starts_with("Python 3") {
                return Ok((prog, prefixe, v));
            }
        }
    }
    Err(match reglage.map(str::trim).filter(|r| !r.is_empty()) {
        Some(r) => format!("Python introuvable à « {r} » (Réglages du poste → Python)."),
        None => "Python 3 introuvable sur ce poste (ni « py -3 », ni « python » dans le PATH). \
                 Indiquez son chemin dans Réglages du poste → Python."
            .into(),
    })
}

/// Version de Python trouvée (« Python 3.12.1 — py -3 »), pour les réglages.
#[tauri::command]
pub async fn python_detecter(python: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || trouver(python.as_deref()).map(|(p, a, v)| format!("{v} — {}", libelle(&p, &a))))
        .await
        .map_err(|e| e.to_string())?
}

fn relayer(flux: impl Read + Send + 'static, canal: Channel<Ligne>, erreur: bool) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        for ligne in BufReader::new(flux).split(b'\n').map_while(Result::ok) {
            let t = String::from_utf8_lossy(&ligne).trim_end_matches('\r').to_string();
            let _ = canal.send(if erreur { Ligne::Stderr(t) } else { Ligne::Stdout(t) });
        }
    })
}

/// Lance le script ; la console arrive ligne à ligne sur `canal` ; rend la main à la fin.
#[tauri::command]
pub async fn python_executer(
    executions: tauri::State<'_, Executions>,
    id: String,
    script: String,
    python: Option<String>,
    canal: Channel<Ligne>,
) -> Result<Fin, String> {
    let (dossier, sorties) = verifier_script(&script)?;
    std::fs::create_dir_all(&sorties).map_err(|e| format!("Dossier des sorties {} : {e}", sorties.display()))?;
    let (prog, prefixe, _) = tauri::async_runtime::spawn_blocking({
        let p = python.clone();
        move || trouver(p.as_deref())
    })
    .await
    .map_err(|e| e.to_string())??;
    let mut c = commande(&prog, &prefixe);
    c.arg("-u")
        .arg(&script)
        .current_dir(&dossier)
        .env("THESE_SORTIES", &sorties)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONUNBUFFERED", "1")
        // plt.show() ne doit pas ouvrir de fenêtre qui bloquerait le script
        .env("MPLBACKEND", "Agg")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut enfant = c.spawn().map_err(|e| format!("Lancement de {} : {e}", libelle(&prog, &prefixe)))?;
    let lecteurs = [
        relayer(enfant.stdout.take().unwrap(), canal.clone(), false),
        relayer(enfant.stderr.take().unwrap(), canal.clone(), true),
    ];
    let enfant = Arc::new(Mutex::new(enfant));
    executions.0.lock().unwrap().insert(id.clone(), enfant.clone());
    let debut = Instant::now();
    let fin = tauri::async_runtime::spawn_blocking(move || {
        let mut depasse = false;
        let statut = loop {
            if let Ok(Some(s)) = enfant.lock().unwrap().try_wait() {
                break Some(s);
            }
            if debut.elapsed() > DELAI {
                depasse = true;
                let _ = enfant.lock().unwrap().kill();
                break enfant.lock().unwrap().wait().ok();
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        for l in lecteurs {
            let _ = l.join();
        }
        (statut, depasse)
    })
    .await
    .map_err(|e| e.to_string())?;
    let arrete = executions.0.lock().unwrap().remove(&id).is_none();
    let (statut, depasse) = fin;
    Ok(Fin {
        code: statut.and_then(|s| s.code()),
        arrete,
        depasse,
        duree_ms: debut.elapsed().as_millis() as u64,
        python: libelle(&prog, &prefixe),
    })
}

/// Arrête une exécution en cours (bouton « Arrêter »).
#[tauri::command]
pub async fn python_arreter(executions: tauri::State<'_, Executions>, id: String) -> Result<bool, String> {
    let enfant = executions.0.lock().unwrap().remove(&id);
    Ok(match enfant {
        Some(e) => e.lock().unwrap().kill().is_ok(),
        None => false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn projet() -> (tempfile::TempDir, PathBuf) {
        let d = tempfile::tempdir().unwrap();
        let scripts = d.path().join("figures").join("_projets").join("article").join("scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        (d, scripts)
    }

    #[test]
    fn seuls_les_scripts_d_un_projet() {
        let (_d, scripts) = projet();
        let s = scripts.join("trace.py");
        std::fs::write(&s, "print(1)").unwrap();
        let (dossier, sorties) = verifier_script(&s.display().to_string()).unwrap();
        assert_eq!(dossier, scripts);
        assert!(sorties.ends_with(Path::new("article").join("sorties").join("trace")));
        assert!(verifier_script("trace.py").is_err());
        let ailleurs = scripts.parent().unwrap().join("trace.py");
        std::fs::write(&ailleurs, "").unwrap();
        assert!(verifier_script(&ailleurs.display().to_string()).is_err());
        let txt = scripts.join("notes.txt");
        std::fs::write(&txt, "").unwrap();
        assert!(verifier_script(&txt.display().to_string()).is_err());
        assert!(verifier_script(&scripts.join("absent.py").display().to_string()).is_err());
    }

    #[test]
    fn reglage_du_poste_seul_s_il_est_donne() {
        assert_eq!(candidates(Some(" C:/Python312/python.exe ")), vec![("C:/Python312/python.exe".to_string(), vec![])]);
        let auto = candidates(None);
        assert!(auto.iter().any(|(p, _)| p == "python"));
        assert_eq!(candidates(Some("")).len(), auto.len());
    }

    #[test]
    fn python_absent_message_clair() {
        let e = trouver(Some("/nulle/part/python")).unwrap_err();
        assert!(e.contains("introuvable"));
    }
}
