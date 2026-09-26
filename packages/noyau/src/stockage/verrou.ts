/**
 * Verrou d'édition `.lock` d'un dossier (SPEC §4.1) : {"host": "PC-TRAVAIL", "since": "…"}.
 *
 * Réservé aux éditions longues (un schéma, un projet de traitement). La pose et la levée
 * sont faites côté Rust (src-tauri/src/fichiers/lock.rs), qui applique la même règle des
 * 12 h ; ici on ne fait que lire et interpréter, pour l'affichage.
 */
import { estDateIso } from "../dates";

export const FICHIER_VERROU = ".lock";
/** Au-delà, un verrou d'un autre poste est considéré comme oublié (plantage, PC éteint). */
export const VERROU_PERIME_HEURES = 12;

export interface InfoVerrou {
  host: string;
  since: string;
}

/**
 * - `libre`  : pas de verrou ;
 * - `moi`    : posé par ce poste (par exemple avant un plantage) → on le reprend ;
 * - `autre`  : posé par un autre poste il y a moins de 12 h → lecture seule + « forcer » ;
 * - `perime` : autre poste, plus de 12 h → on peut le reprendre, avec un avertissement.
 */
export type EtatVerrou = "libre" | "moi" | "autre" | "perime";

/** Lit le contenu d'un `.lock` ; null s'il est illisible (on le traite alors comme périmé). */
export function lireVerrou(texte: string): InfoVerrou | null {
  try {
    const brut: unknown = JSON.parse(texte);
    if (typeof brut !== "object" || brut === null) return null;
    const { host, since } = brut as Record<string, unknown>;
    if (typeof host !== "string" || host.trim() === "") return null;
    if (typeof since !== "string" || !estDateIso(since)) return null;
    return { host, since };
  } catch {
    return null;
  }
}

/** Les noms de poste Windows ne tiennent pas compte de la casse. */
export function memePoste(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function etatVerrou(verrou: InfoVerrou | null, posteCourant: string, maintenant: Date): EtatVerrou {
  if (verrou === null) return "libre";
  if (memePoste(verrou.host, posteCourant)) return "moi";
  const ageMs = maintenant.getTime() - Date.parse(verrou.since);
  // Horloge de l'autre PC en avance (âge négatif) : on considère le verrou comme récent.
  return ageMs > VERROU_PERIME_HEURES * 3_600_000 ? "perime" : "autre";
}
