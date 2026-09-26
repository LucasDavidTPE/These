/**
 * Résumé d'un dépouillement 2S2P1D enregistré avec un essai (`traitement.json`, format
 * projet version 2 de la page de traitement), affiché sur la page de campagne (SPEC §7).
 * Lu sans importer le module Traitement : seul le format du fichier est partagé.
 */
export interface ResumeTraitement {
  modele: string;
  /** [libellé, valeur], dans l'ordre du fichier. */
  parametres: [string, number][];
  Tref: number | null;
  C1: number | null;
  C2: number | null;
}

const MODELES: Record<string, string> = { "2s2p1d": "2S2P1D", "huet-sayegh": "Huet-Sayegh", gkv: "KVG" };
const LIBELLES: Record<string, string> = { delta: "δ", tauE: "τE", beta: "β", nu00: "ν00", nu0: "ν0", tauNu: "τν" };
const nombre = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Premier essai du projet ; null si le fichier n'a pas la forme attendue. */
export function resumeTraitement(brut: unknown): ResumeTraitement | null {
  const e = (brut as { essais?: unknown[] } | null)?.essais?.[0] as Record<string, unknown> | undefined;
  if (!e || typeof e !== "object") return null;
  const p = e.p && typeof e.p === "object" ? (e.p as Record<string, unknown>) : {};
  const id = typeof e.modeleId === "string" ? e.modeleId : "";
  return {
    modele: MODELES[id] ?? id,
    parametres: Object.entries(p).flatMap(([k, v]) => (nombre(v) === null ? [] : [[LIBELLES[k] ?? k, v as number] as [string, number]])),
    Tref: nombre(e.Tref),
    C1: nombre(e.C1),
    C2: nombre(e.C2),
  };
}

/** « 4,1e4 » est illisible ici : 4 chiffres significatifs, écriture française. */
export function valeur(x: number): string {
  return Number(x.toPrecision(4)).toLocaleString("fr-FR", { maximumFractionDigits: 12 });
}
