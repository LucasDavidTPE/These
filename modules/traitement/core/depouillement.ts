/**
 * Dépouillement enregistré dans l'espace, pour y revenir plus tard (sur l'un ou l'autre PC).
 *
 * - Essai ouvert depuis une campagne : le projet va avec l'essai
 *   (`campagnes/<c>/essais/<e>/traitement.json`, format « projet » de la page d'origine).
 * - Fichier ouvert à la main : `traitement/<nom>-<id>.json`, qui garde en plus d'où vient le
 *   fichier de mesure — une référence de racine (« recherche:B2C4/Essai1.csv ») quand il est
 *   sous l'une d'elles, sinon le chemin de sa copie dans l'espace (« donnees/importes/… »).
 * Le fichier de mesure est copié dans l'espace à l'ouverture (SPEC §4.1) : le dépouillement
 * se rouvre sur n'importe quel poste, même sans les données brutes.
 */
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
  /** Référence de racine, chemin dans l'espace, ou (anciens enregistrements) chemin absolu. */
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

export function lireDepouillement(brut: unknown): Depouillement {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (typeof b.source !== "string" || !b.source || typeof b.projet !== "object" || b.projet === null) throw new Error("Ce n'est pas un dépouillement enregistré (source ou projet manquant).");
  const t = (v: unknown) => (typeof v === "string" ? v : "");
  return { version: 1, nom: t(b.nom) || "essai", source: b.source, fichier: t(b.fichier), modifie: t(b.modifie), poste: t(b.poste), projet: b.projet };
}
