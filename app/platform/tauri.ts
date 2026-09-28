/**
 * Implémentation Tauri : appels aux commandes Rust (src-tauri/src). Aucune logique ici,
 * uniquement des `invoke` et la conversion des erreurs.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { erreurDepuisIpc, type Entree } from "@noyau/stockage";
import type { Plateforme, RapportArchive, RapportCopie, ReponseLien } from "@interface/plateforme";

async function appel<T>(cmd: string, args: Record<string, unknown> = {}, chemin = ""): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw erreurDepuisIpc(e, chemin);
  }
}

/** Commande à corps binaire ; les paramètres texte passent en en-têtes encodés. */
async function appelBrut<T>(cmd: string, octets: Uint8Array, entetes: Record<string, string>, chemin: string): Promise<T> {
  const encodes = Object.fromEntries(Object.entries(entetes).map(([k, v]) => [k, encodeURIComponent(v)]));
  try {
    return await invoke<T>(cmd, octets, { headers: encodes });
  } catch (e) {
    throw erreurDepuisIpc(e, chemin);
  }
}

interface EvenementModifies {
  id: number;
  chemins: string[];
}

export function plateformeTauri(): Plateforme {
  return {
    genre: "tauri",
    nomDuPoste: () => appel<string>("poste_nom"),
    lireReglages: () => appel<string | null>("poste_lire_reglages"),
    ecrireReglages: (contenu) => appel<void>("poste_ecrire_reglages", { contenu }),
    dossiersOneDrive: () => appel<string[]>("poste_dossiers_onedrive"),
    choisirDossier: async (titre, depart) => {
      const r = await open({ directory: true, multiple: false, defaultPath: depart, title: titre });
      return typeof r === "string" ? r : null;
    },
    dossierExiste: (chemin) => appel<boolean>("poste_dossier_existe", { chemin }),
    creerDossier: (chemin) => appel<void>("poste_creer_dossier", { chemin }, chemin),
    copierDossier: (source, destination, options) => appel<RapportCopie>("copie_dossier", { source, destination, sansEcraser: options?.sansEcraser ?? false }, destination),
    archiverDossier: async (source, nom) => {
      const destination = await save({ title: "Exporter l'espace", defaultPath: nom, filters: [{ name: "Archive zip", extensions: ["zip"] }] });
      if (!destination) return null;
      return appel<RapportArchive>("archive_dossier", { source, destination }, destination);
    },
    fichiers: (racine) => ({
      listDir: (chemin) => appel<Entree[]>("fichiers_lister", { racine, chemin }, chemin),
      exists: (chemin) => appel<boolean>("fichiers_existe", { racine, chemin }, chemin),
      readText: (chemin) => appel<string>("fichiers_lire_texte", { racine, chemin }, chemin),
      readBytes: async (chemin) => new Uint8Array(await appel<ArrayBuffer>("fichiers_lire_octets", { racine, chemin }, chemin)),
      writeTextAtomic: (chemin, contenu) => appel<void>("fichiers_ecrire_texte", { racine, chemin, contenu }, chemin),
      writeBytesAtomic: (chemin, contenu) => appelBrut<void>("fichiers_ecrire_octets", contenu, { "x-racine": racine, "x-chemin": chemin }, chemin),
      writeTextNew: (chemin, contenu) => appel<void>("fichiers_ecrire_nouveau", { racine, chemin, contenu }, chemin),
      createDir: (chemin) => appel<void>("fichiers_creer_dossier", { racine, chemin }, chemin),
      ensureDir: (chemin) => appel<void>("fichiers_assurer_dossier", { racine, chemin }, chemin),
      rename: (de, vers) => appel<void>("fichiers_renommer", { racine, de, vers }, vers),
    }),
    supprimerTemporaire: (racine, chemin) => appel<void>("fichiers_supprimer_temporaire", { racine, chemin }, chemin),
    enregistrerSous: async (nom, octets) => {
      const ext = nom.includes(".") ? nom.slice(nom.lastIndexOf(".") + 1) : "";
      const chemin = await save({ title: "Enregistrer sous", defaultPath: nom, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
      if (!chemin) return false;
      await appelBrut<void>("poste_ecrire_fichier", octets, { "x-chemin": chemin }, chemin);
      return true;
    },
    ouvrirFichier: async (titre, extensions) => {
      const chemin = await open({ title: titre, multiple: false, filters: [{ name: extensions.join(", "), extensions }] });
      if (typeof chemin !== "string") return null;
      const octets = new Uint8Array(await appel<ArrayBuffer>("poste_lire_fichier", { chemin }, chemin));
      return { nom: chemin.split(/[\\/]/).pop() ?? chemin, octets, chemin };
    },
    verifierMiseAJour: async () => {
      const maj = await check();
      if (!maj) return null;
      return {
        version: maj.version,
        notes: maj.body ?? "",
        installer: async (progression) => {
          let total = 0;
          let recu = 0;
          await maj.downloadAndInstall((e) => {
            if (e.event === "Started") total = e.data.contentLength ?? 0;
            else if (e.event === "Progress") {
              recu += e.data.chunkLength;
              progression?.(total ? recu / total : null);
            }
          });
          await relaunch();
        },
      };
    },
    ouvrirVSCode: (chemin) => appel<void>("poste_ouvrir_vscode", { chemin }, chemin),
    ouvrirDossier: (chemin) => openPath(chemin),
    ouvrirLien: (url) => openUrl(url),
    verifierLien: (url) => appel<ReponseLien>("lien_verifier", { url }),
    surveiller: async (racine, rappel) => {
      const id = await appel<number>("surveillance_demarrer", { racine });
      const arret = await listen<EvenementModifies>("fichiers-modifies", (e) => {
        if (e.payload.id === id) rappel(e.payload.chemins);
      });
      return () => {
        arret();
        void appel<void>("surveillance_arreter", { id }).catch(() => undefined);
      };
    },
  };
}
