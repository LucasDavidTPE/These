/**
 * Versions des parties de manuscrit : une copie datée du .docx dans l'espace, avec sa fiche.
 *
 *   manuscrits/<projet>/versions/<partie>/<AAAA-MM-JJ_HHMM>_<note>.docx   la copie
 *   manuscrits/<projet>/versions/<partie>/<AAAA-MM-JJ_HHMM>_<note>.json   poste, note, taille, empreinte
 *
 * (Avant 1.13 : manuscrits/<slug du fichier>/…, toujours lu pour garder l'historique.)
 *
 * Un fichier par version : deux PC qui enregistrent chacun une version ne se gênent pas.
 */
import { slugifier } from "@noyau/texte";

export const DOSSIER = "manuscrits";

export interface Version {
  /** Nom de la copie (.docx) dans le dossier du manuscrit. */
  fichier: string;
  /** ISO 8601 avec fuseau. */
  date: string;
  poste: string;
  note: string;
  taille: number;
  empreinte: string;
}

/** Empreinte FNV-1a 32 bits : suffit à savoir si le fichier a changé depuis une version. */
export function empreinte(octets: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < octets.length; i++) {
    h ^= octets[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Dossier des versions d'une partie : `manuscrits/<projet>/versions/<partie>` (au même endroit pour toutes les parties). */
export const dossierVersions = (projet: string, partie: string) => `${DOSSIER}/${projet}/versions/${partie}`;

/** Ancien emplacement (avant 1.13) : un dossier par fichier Word, d'après son nom, sans l'extension. */
export function dossierManuscrit(nom: string): string {
  return `${DOSSIER}/${slugifier(nom.replace(/\.docx?$/i, "")) || "manuscrit"}`;
}

/** « 2026-09-26T13:42:10+02:00 », « Relecture chap. 2 » → « 2026-09-26_1342_relecture-chap-2 ». */
export function nomVersion(date: string, note: string): string {
  const base = `${date.slice(0, 10)}_${date.slice(11, 13)}${date.slice(14, 16)}`;
  const s = slugifier(note);
  return s ? `${base}_${s}` : base;
}

export function lireVersion(brut: unknown, fichier: string): Version {
  const b = (brut ?? {}) as Record<string, unknown>;
  const t = (v: unknown) => (typeof v === "string" ? v : "");
  return { fichier, date: t(b.date), poste: t(b.poste), note: t(b.note), taille: typeof b.taille === "number" ? b.taille : 0, empreinte: t(b.empreinte) };
}

export type Etat = "aucune-version" | "a-jour" | "modifie";

/** État d'un manuscrit par rapport à sa version la plus récente (`versions` triées, récente d'abord). */
export function etat(octets: Uint8Array, versions: readonly Version[]): Etat {
  if (!versions.length) return "aucune-version";
  return versions[0]!.empreinte === empreinte(octets) ? "a-jour" : "modifie";
}
