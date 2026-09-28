/**
 * Dépouillement enregistré dans l'espace, pour y revenir plus tard (sur l'un ou l'autre PC).
 *
 * - Essai ouvert depuis une campagne : le projet va avec l'essai
 *   (`campagnes/<c>/essais/<e>/traitement.json`, format « projet » de la page d'origine).
 * - Fichier ouvert à la main : `traitement/<nom>-<id>.json`, qui garde en plus d'où vient le
 *   fichier de mesure — une référence à une racine du poste (« recherche:B2C4/Essai1.csv »)
 *   quand il est sous l'une d'elles, sinon son chemin absolu.
 * Les données brutes ne sont jamais copiées : on les relit à la réouverture.
 */
import { lireReference, referenceDepuisChemin, resoudre } from "@noyau/poste/racines";
import { slugifier } from "@noyau/texte";

export const DOSSIER_DEPOUILLEMENTS = "traitement";

export interface Enregistrement {
  /** Relatif à l'espace. */
  chemin: string;
  format: "projet" | "depouillement";
}

export interface Depouillement {
  version: 1;
  nom: string;
  /** Référence de racine, ou chemin absolu du fichier de mesure. */
  source: string;
  /** Nom du fichier de mesure. */
  fichier: string;
  /** ISO 8601. */
  modifie: string;
  poste: string;
  /** Contenu du fichier projet (version 2). */
  projet: unknown;
}

export function cheminDepouillement(nom: string, id: string): string {
  return `${DOSSIER_DEPOUILLEMENTS}/${slugifier(nom) || "essai"}-${id}.json`;
}

/** Ce qu'on écrit de la source : une référence de racine si possible. */
export function sourceDepuisChemin(chemin: string, racines: Record<string, string>): string {
  return referenceDepuisChemin(chemin, racines) ?? chemin;
}

/** Dossier absolu et nom du fichier de mesure sur ce poste ; message si la racine manque. */
export function localiserSource(source: string, racines: Record<string, string>): { ok: true; dossier: string; fichier: string } | { ok: false; message: string } {
  let absolu = source;
  if (lireReference(source)) {
    const r = resoudre(source, racines);
    if (!r.ok) return { ok: false, message: r.message };
    absolu = r.chemin;
  }
  const i = Math.max(absolu.lastIndexOf("/"), absolu.lastIndexOf("\\"));
  if (i <= 0) return { ok: false, message: `Chemin du fichier de mesure illisible : « ${source} ».` };
  return { ok: true, dossier: absolu.slice(0, i), fichier: absolu.slice(i + 1) };
}

export function lireDepouillement(brut: unknown): Depouillement {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (typeof b.source !== "string" || !b.source || typeof b.projet !== "object" || b.projet === null) throw new Error("Ce n'est pas un dépouillement enregistré (source ou projet manquant).");
  const t = (v: unknown) => (typeof v === "string" ? v : "");
  return { version: 1, nom: t(b.nom) || "essai", source: b.source, fichier: t(b.fichier), modifie: t(b.modifie), poste: t(b.poste), projet: b.projet };
}
