//! Commandes Tauri exposées à l'interface (`invoke("fichiers_…")`).
//!
//! Chaque commande reçoit la racine (chemin absolu, réglage du poste) et des chemins
//! relatifs. Elles sont `async` pour ne pas bloquer la fenêtre pendant les accès disque
//! (OneDrive peut devoir télécharger un fichier « à la demande »).

use super::fsops::{self, DirEntry};
use super::host;
use super::lock::{self, Acquired, LockInfo};
use super::{LibError, LibResult};

#[tauri::command]
pub async fn fichiers_lister(racine: String, chemin: String) -> LibResult<Vec<DirEntry>> {
    fsops::list_dir(&racine, &chemin)
}

#[tauri::command]
pub async fn fichiers_existe(racine: String, chemin: String) -> LibResult<bool> {
    fsops::exists(&racine, &chemin)
}

#[tauri::command]
pub async fn fichiers_lire_texte(racine: String, chemin: String) -> LibResult<String> {
    fsops::read_text(&racine, &chemin)
}

/// Fichier binaire (image), renvoyé tel quel (ArrayBuffer côté JS).
#[tauri::command]
pub async fn fichiers_lire_octets(
    racine: String,
    chemin: String,
) -> LibResult<tauri::ipc::Response> {
    let p = super::paths::resolve(&racine, &chemin)?;
    std::fs::read(p)
        .map(tauri::ipc::Response::new)
        .map_err(|e| LibError::io(chemin, e))
}

#[tauri::command]
pub async fn fichiers_ecrire_texte(
    racine: String,
    chemin: String,
    contenu: String,
) -> LibResult<()> {
    fsops::write_atomic(&racine, &chemin, contenu.as_bytes())
}

/// Écriture binaire : le contenu est le corps brut de la requête, la racine et le chemin
/// passent en en-têtes (encodés en URL, pour les accents).
#[tauri::command]
pub async fn fichiers_ecrire_octets(request: tauri::ipc::Request<'_>) -> LibResult<()> {
    let entete = |nom: &str| -> LibResult<String> {
        let brut = request
            .headers()
            .get(nom)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| LibError::InvalidPath(format!("en-tête {nom} manquant")))?;
        decoder_url(brut).ok_or_else(|| LibError::InvalidPath(brut.to_string()))
    };
    let racine = entete("x-racine")?;
    let chemin = entete("x-chemin")?;
    let tauri::ipc::InvokeBody::Raw(octets) = request.body() else {
        return Err(LibError::InvalidPath("corps binaire attendu".into()));
    };
    fsops::write_atomic(&racine, &chemin, octets)
}

#[tauri::command]
pub async fn fichiers_ecrire_nouveau(
    racine: String,
    chemin: String,
    contenu: String,
) -> LibResult<()> {
    fsops::write_new(&racine, &chemin, contenu.as_bytes())
}

#[tauri::command]
pub async fn fichiers_creer_dossier(racine: String, chemin: String) -> LibResult<()> {
    fsops::create_dir(&racine, &chemin)
}

#[tauri::command]
pub async fn fichiers_assurer_dossier(racine: String, chemin: String) -> LibResult<()> {
    fsops::ensure_dir(&racine, &chemin)
}

#[tauri::command]
pub async fn fichiers_renommer(racine: String, de: String, vers: String) -> LibResult<()> {
    fsops::rename(&racine, &de, &vers)
}

#[tauri::command]
pub async fn fichiers_supprimer_temporaire(racine: String, chemin: String) -> LibResult<()> {
    fsops::remove_temp(&racine, &chemin)
}

#[tauri::command]
pub async fn verrou_lire(racine: String, dossier: String) -> LibResult<Option<LockInfo>> {
    lock::read_lock(&racine, &dossier)
}

#[tauri::command]
pub async fn verrou_poser(racine: String, dossier: String, forcer: bool) -> LibResult<Acquired> {
    lock::acquire_lock(&racine, &dossier, &host::host_name(), lock::now(), forcer)
}

#[tauri::command]
pub async fn verrou_lever(racine: String, dossier: String, forcer: bool) -> LibResult<bool> {
    lock::release_lock(&racine, &dossier, &host::host_name(), forcer)
}

/// Décodage « pourcent » (encodeURIComponent côté JS), en UTF-8. None si mal formé.
pub fn decoder_url(s: &str) -> Option<String> {
    let octets = s.as_bytes();
    let mut out = Vec::with_capacity(octets.len());
    let mut i = 0;
    while i < octets.len() {
        if octets[i] == b'%' {
            let hex = std::str::from_utf8(octets.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(octets[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::urlencoding_decode;

    #[test]
    fn decodes_encode_uri_component() {
        assert_eq!(
            decoder_url("C%3A%5CUsers%5CDAVID%5COneDrive%20-%20entpe.fr%5CTh%C3%A8se")
                .as_deref(),
            Some("C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse")
        );
        assert_eq!(decoder_url("a%2"), None);
        assert_eq!(decoder_url("a%ZZ"), None);
        assert_eq!(decoder_url("%C3"), None);
    }
}
