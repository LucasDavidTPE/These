/**
 * Les références vues par les autres modules quand ils citent `[@BIB-020]` : noms courts et année
 * pour le texte, référence complète pour une liste « Références ». Le tout se coupe d'un réglage
 * partagé (`bibliotheque/citations.json`) : les autres modules laissent alors `[@…]` tel qu'écrit.
 */
import type { ReferenceCitee } from "@noyau/citations";
import type { Reference } from "./modele";

export const FICHIER_CITATIONS = "bibliotheque/citations.json";

export interface ReglageCitations {
  actives: boolean;
}

export const CITATIONS_PAR_DEFAUT: ReglageCitations = { actives: true };

export function lireReglageCitations(brut: unknown): ReglageCitations {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  return { actives: b.actives !== false };
}

const nom = (a: string) => (a.includes(",") ? a.slice(0, a.indexOf(",")) : a).trim();

/** « Olard & Di Benedetto », « Chupin et al. », « AFNOR ». */
export function auteursCourts(auteurs: string): string {
  const l = auteurs.split(";").map((a) => a.trim()).filter(Boolean);
  if (!l.length) return "Anonyme";
  return l.length === 1 ? nom(l[0]!) : l.length === 2 ? `${nom(l[0]!)} & ${nom(l[1]!)}` : `${nom(l[0]!)} et al.`;
}

/** « Olard, F.; Di Benedetto, H. (2003). Titre. Support, 4(2), 185-224. https://doi.org/… » */
export function referenceComplete(r: Reference): string {
  const auteurs = r.auteurs.split(";").map((a) => a.trim()).filter(Boolean).join(", ") || "Anonyme";
  const volume = r.volume ? `${r.volume}${r.numero ? `(${r.numero})` : ""}` : "";
  const support = [r.support, volume, r.pages].filter(Boolean).join(", ");
  const lien = r.doi ? ` https://doi.org/${r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : "";
  return `${auteurs} (${r.annee ?? "s. d."}). ${r.titre.replace(/\.$/, "")}.${support ? ` ${support}.` : ""}${lien}`.trim();
}

export function referenceCitee(id: string, r: Reference): ReferenceCitee {
  return { id, auteurs: auteursCourts(r.auteurs), annee: r.annee === null ? "" : String(r.annee), complete: referenceComplete(r) };
}

/** Les références demandées, par identifiant (« BIB-020 ») ou par clé BibTeX. */
export function resoudre(refs: readonly { id: string; valeur: Reference }[], cles: readonly string[]): Record<string, ReferenceCitee> {
  const parId = new Map(refs.map((r) => [r.id, r]));
  const parCle = new Map(refs.filter((r) => r.valeur.cle).map((r) => [r.valeur.cle, r]));
  const out: Record<string, ReferenceCitee> = {};
  for (const c of cles) {
    const r = parId.get(c) ?? parCle.get(c);
    if (r) out[c] = referenceCitee(r.id, r.valeur);
  }
  return out;
}
