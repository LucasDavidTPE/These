//! Requêtes vers l'API web de Zotero (SPEC §9.3, « Mettre à jour Zotero ») : seulement sur
//! un clic de l'utilisateur, et seulement vers `https://api.zotero.org`. La logique (quoi
//! envoyer, dans quel ordre) est côté TypeScript ; ici, le transport. Passer par Rust évite
//! de dépendre des en-têtes CORS de Zotero et garde la clé hors de la page.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use ureq::Agent;

const HOTE: &str = "https://api.zotero.org";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequeteZotero {
    /// GET, POST, PATCH ou DELETE.
    pub methode: String,
    /// Chemin sous l'hôte, avec sa requête : « /users/123/items?limit=100 ».
    pub chemin: String,
    pub cle: String,
    #[serde(default)]
    pub corps: Option<String>,
    /// `If-Unmodified-Since-Version` (modifications et suppressions).
    #[serde(default)]
    pub version: Option<u64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReponseZotero {
    /// Code HTTP, ou `None` si le serveur n'a pas répondu.
    pub code: Option<u16>,
    pub corps: String,
    /// `Last-Modified-Version` : version de la bibliothèque après la requête.
    pub version: Option<u64>,
    /// `Total-Results` des listes paginées.
    pub total: Option<u64>,
    /// Secondes à attendre (`Retry-After` ou `Backoff`) quand Zotero demande de ralentir.
    pub attente: Option<u64>,
    pub erreur: String,
}

/// Le chemin doit rester sur l'API Zotero : pas d'hôte, pas de remontée.
pub fn chemin_valide(chemin: &str) -> bool {
    chemin.starts_with('/')
        && !chemin.starts_with("//")
        && !chemin.contains("..")
        && !chemin.contains('@')
        && !chemin.chars().any(char::is_whitespace)
}

fn echec(erreur: impl Into<String>) -> ReponseZotero {
    ReponseZotero {
        code: None,
        corps: String::new(),
        version: None,
        total: None,
        attente: None,
        erreur: erreur.into(),
    }
}

fn entier(rep: &ureq::http::Response<ureq::Body>, nom: &str) -> Option<u64> {
    rep.headers().get(nom)?.to_str().ok()?.trim().parse().ok()
}

pub fn envoyer(req: &RequeteZotero, delai: Duration) -> ReponseZotero {
    if !chemin_valide(&req.chemin) {
        return echec("chemin refusé");
    }
    if req.cle.trim().is_empty() || !req.cle.chars().all(|c| c.is_ascii_alphanumeric()) {
        return echec("clé d'API invalide");
    }
    let agent: Agent = Agent::config_builder()
        .timeout_global(Some(delai))
        .http_status_as_error(false)
        .user_agent(concat!("These/", env!("CARGO_PKG_VERSION")))
        .build()
        .into();
    let url = format!("{HOTE}{}", req.chemin);
    let cle = req.cle.trim();
    let version = req.version.map(|v| v.to_string());
    macro_rules! entetes {
        ($r:expr) => {{
            let r = $r
                .header("Zotero-API-Version", "3")
                .header("Zotero-API-Key", cle);
            match &version {
                Some(v) => r.header("If-Unmodified-Since-Version", v.as_str()),
                None => r,
            }
        }};
    }
    let corps = req.corps.clone().unwrap_or_default();
    let resultat = match req.methode.as_str() {
        "GET" => entetes!(agent.get(&url)).call(),
        "DELETE" => entetes!(agent.delete(&url)).call(),
        "POST" => entetes!(agent.post(&url))
            .header("Content-Type", "application/json")
            .send(corps.as_str()),
        "PATCH" => entetes!(agent.patch(&url))
            .header("Content-Type", "application/json")
            .send(corps.as_str()),
        autre => return echec(format!("méthode {autre} refusée")),
    };
    match resultat {
        Ok(mut rep) => {
            let attente = entier(&rep, "Retry-After").or_else(|| entier(&rep, "Backoff"));
            let version = entier(&rep, "Last-Modified-Version");
            let total = entier(&rep, "Total-Results");
            let code = rep.status().as_u16();
            match rep
                .body_mut()
                .with_config()
                .limit(50 * 1024 * 1024)
                .read_to_string()
            {
                Ok(corps) => ReponseZotero {
                    code: Some(code),
                    corps,
                    version,
                    total,
                    attente,
                    erreur: String::new(),
                },
                Err(e) => ReponseZotero {
                    code: Some(code),
                    corps: String::new(),
                    version,
                    total,
                    attente,
                    erreur: e.to_string(),
                },
            }
        }
        Err(e) => echec(e.to_string()),
    }
}

#[tauri::command]
pub async fn zotero_requete(requete: RequeteZotero) -> ReponseZotero {
    tauri::async_runtime::spawn_blocking(move || envoyer(&requete, Duration::from_secs(60)))
        .await
        .unwrap_or_else(|e| echec(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seuls_les_chemins_de_l_api_passent() {
        assert!(chemin_valide("/users/123/items?limit=100&start=0"));
        assert!(chemin_valide("/keys/current"));
        assert!(!chemin_valide("users/123"));
        assert!(!chemin_valide("//evil.example/x"));
        assert!(!chemin_valide("/users/../x"));
        assert!(!chemin_valide("/x@evil.example"));
        assert!(!chemin_valide("/users/1 2"));
    }

    #[test]
    fn requete_refusee_sans_reseau() {
        let r = RequeteZotero {
            methode: "GET".into(),
            chemin: "https://evil.example".into(),
            cle: "abc".into(),
            corps: None,
            version: None,
        };
        assert_eq!(envoyer(&r, Duration::from_secs(1)).erreur, "chemin refusé");
        let r = RequeteZotero {
            methode: "GET".into(),
            chemin: "/keys/current".into(),
            cle: "a b".into(),
            corps: None,
            version: None,
        };
        assert_eq!(
            envoyer(&r, Duration::from_secs(1)).erreur,
            "clé d'API invalide"
        );
        let r = RequeteZotero {
            methode: "PUT".into(),
            chemin: "/keys/current".into(),
            cle: "abc".into(),
            corps: None,
            version: None,
        };
        assert!(envoyer(&r, Duration::from_secs(1))
            .erreur
            .contains("refusée"));
    }
}
