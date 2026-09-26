//! Côté natif de Thèse : fichiers de l'espace et verrous, réglages du poste, surveillance
//! des dossiers. Les modules ajouteront leurs commandes (détourage, lecture rapide des
//! essais) derrière des *features* Cargo, pour les installeurs d'un seul module.

pub mod fichiers;
#[cfg(feature = "figures")]
pub mod figures;
pub mod poste;
pub mod surveillance;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use fichiers::commands::*;
    use poste::*;
    use surveillance::*;
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Surveillances::default());

    // Commandes communes à tous les installeurs, plus celles des modules compilés : le
    // produit Traitement n'a pas le détourage (feature Cargo « figures », voir SPEC §3.1).
    macro_rules! commandes {
        ($($module:ident),*) => {
            tauri::generate_handler![
            fichiers_lister, fichiers_existe, fichiers_lire_texte, fichiers_lire_octets,
            fichiers_ecrire_texte, fichiers_ecrire_octets, fichiers_ecrire_nouveau,
            fichiers_creer_dossier, fichiers_assurer_dossier, fichiers_renommer,
            fichiers_supprimer_temporaire, verrou_lire, verrou_poser, verrou_lever, poste_nom,
            poste_lire_reglages, poste_ecrire_reglages, poste_dossiers_onedrive,
            poste_dossier_existe, poste_creer_dossier, poste_ecrire_fichier, poste_lire_fichier,
            surveillance_demarrer, surveillance_arreter
            $(, $module)*
            ]
        };
    }

    #[cfg(feature = "figures")]
    let builder = {
        use figures::commands::*;
        builder.invoke_handler(commandes![
            cutout_segment,
            clipboard_read_image,
            clipboard_read_html,
            clipboard_write_png,
            clipboard_write_svg,
            file_read_image,
            file_read_data,
            file_write_png,
            file_write_text,
            figures_autoriser_images
        ])
    };
    #[cfg(not(feature = "figures"))]
    let builder = builder.invoke_handler(commandes![]);

    builder
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}

#[cfg(test)]
mod tests {
    use serde_json::Value;

    fn config() -> Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json doit être un JSON valide")
    }

    #[test]
    fn identite() {
        let c = config();
        assert_eq!(c["productName"], "Thèse");
        assert_eq!(c["identifier"], "fr.lucasdavid.these");
    }

    #[test]
    fn version_identique_a_cargo() {
        assert_eq!(config()["version"], env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn installeurs_msi_et_nsis_sans_droits_administrateur() {
        let c = config();
        let cibles: Vec<&str> = c["bundle"]["targets"]
            .as_array()
            .expect("bundle.targets doit être une liste")
            .iter()
            .filter_map(Value::as_str)
            .collect();
        assert_eq!(cibles, ["msi", "nsis"]);
        assert_eq!(c["bundle"]["windows"]["nsis"]["installMode"], "currentUser");
    }
}
