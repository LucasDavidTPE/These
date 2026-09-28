//! Vérification des liens de la bibliothèque (SPEC §9.3, macro VerifierLiens) : une requête
//! par lien, seulement quand l'utilisateur clique sur « Vérifier les liens ». On demande
//! l'en-tête (`HEAD`) ; beaucoup de sites d'éditeurs le refusent, on retente alors un `GET`
//! sans lire le corps. Les redirections sont suivies (doi.org → éditeur).

use serde::Serialize;
use std::time::Duration;
use ureq::{Agent, ResponseExt};

/// Résultat brut ; le libellé (« OK », « Introuvable »…) est choisi côté TypeScript.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReponseLien {
    /// Code HTTP final, ou `None` si le serveur n'a pas répondu.
    pub code: Option<u16>,
    /// Adresse après redirections.
    pub url_finale: String,
    /// Raison de l'échec quand il n'y a pas de code (délai, nom inconnu, certificat…).
    pub erreur: String,
}

fn agent(delai: Duration) -> Agent {
    Agent::config_builder()
        .timeout_global(Some(delai))
        .max_redirects(10)
        .http_status_as_error(false)
        .user_agent(concat!(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) These/",
            env!("CARGO_PKG_VERSION"),
            " (verification de liens)"
        ))
        .build()
        .into()
}

/// Codes pour lesquels un `HEAD` refusé mérite un `GET` : méthode non permise, requête
/// jugée invalide, accès refusé aux robots, erreur du serveur sur `HEAD` seulement.
fn retenter_en_get(code: u16) -> bool {
    matches!(code, 400 | 403 | 405 | 406 | 429 | 500 | 501 | 503)
}

pub fn verifier_lien(url: &str, delai: Duration) -> ReponseLien {
    let url = url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return ReponseLien {
            code: None,
            url_finale: url.to_string(),
            erreur: "adresse invalide (http:// ou https:// attendu)".into(),
        };
    }
    let a = agent(delai);
    let lire = |r: Result<ureq::http::Response<ureq::Body>, ureq::Error>| match r {
        Ok(rep) => ReponseLien {
            code: Some(rep.status().as_u16()),
            url_finale: rep.get_uri().to_string(),
            erreur: String::new(),
        },
        Err(e) => ReponseLien {
            code: None,
            url_finale: url.to_string(),
            erreur: e.to_string(),
        },
    };
    let tete = lire(a.head(url).call());
    match tete.code {
        Some(c) if retenter_en_get(c) => {
            let get = lire(a.get(url).call());
            if get.code.is_some() {
                get
            } else {
                tete
            }
        }
        None => {
            // Certains serveurs ferment la connexion sur un HEAD : un GET tranche.
            let get = lire(a.get(url).call());
            if get.code.is_some() {
                get
            } else {
                tete
            }
        }
        _ => tete,
    }
}

#[tauri::command]
pub async fn lien_verifier(url: String) -> ReponseLien {
    tauri::async_runtime::spawn_blocking(move || verifier_lien(&url, Duration::from_secs(20)))
        .await
        .unwrap_or_else(|e| ReponseLien {
            code: None,
            url_finale: String::new(),
            erreur: e.to_string(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::thread;

    /// Petit serveur local : `reponse(methode, chemin)` donne le statut et les en-têtes.
    fn serveur(reponse: fn(&str, &str) -> String) -> String {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let adresse = format!("http://{}", l.local_addr().unwrap());
        thread::spawn(move || {
            for flux in l.incoming().flatten() {
                let mut lecteur = BufReader::new(flux.try_clone().unwrap());
                let mut ligne = String::new();
                if lecteur.read_line(&mut ligne).is_err() {
                    continue;
                }
                let mut en_tete = String::new();
                while lecteur.read_line(&mut en_tete).is_ok_and(|n| n > 2) {
                    en_tete.clear();
                }
                let mut morceaux = ligne.split_whitespace();
                let (m, c) = (morceaux.next().unwrap_or(""), morceaux.next().unwrap_or(""));
                let mut f = flux;
                let _ = f.write_all(reponse(m, c).as_bytes());
            }
        });
        adresse
    }

    const D: Duration = Duration::from_secs(5);

    #[test]
    fn page_existante_et_page_absente() {
        let s = serveur(|_, c| {
            if c == "/ok" {
                "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".into()
            } else {
                "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".into()
            }
        });
        assert_eq!(verifier_lien(&format!("{s}/ok"), D).code, Some(200));
        assert_eq!(verifier_lien(&format!("{s}/absent"), D).code, Some(404));
    }

    #[test]
    fn head_refuse_puis_get() {
        let s = serveur(|m, _| {
            if m == "HEAD" {
                "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n".into()
            } else {
                "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".into()
            }
        });
        assert_eq!(verifier_lien(&format!("{s}/article"), D).code, Some(200));
    }

    #[test]
    fn suit_les_redirections() {
        let s = serveur(|_, c| {
            if c == "/doi" {
                "HTTP/1.1 301 Moved Permanently\r\nLocation: /editeur\r\nContent-Length: 0\r\n\r\n"
                    .into()
            } else {
                "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n".into()
            }
        });
        let r = verifier_lien(&format!("{s}/doi"), D);
        assert_eq!(r.code, Some(200));
        assert!(r.url_finale.ends_with("/editeur"), "{}", r.url_finale);
    }

    #[test]
    fn serveur_injoignable_ou_adresse_invalide() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let adresse = format!("http://{}/x", l.local_addr().unwrap());
        drop(l);
        let r = verifier_lien(&adresse, D);
        assert_eq!(r.code, None);
        assert!(!r.erreur.is_empty());
        assert_eq!(verifier_lien("ftp://exemple.fr", D).code, None);
    }
}
