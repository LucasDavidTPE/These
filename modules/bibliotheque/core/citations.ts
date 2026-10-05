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

// ---- Saisie assistée : « [@ol… » propose les références de la Bibliothèque ----

export interface Suggestion {
  id: string;
  /** « Olard & Di Benedetto, 2003 ». */
  court: string;
  titre: string;
}

export interface Completion {
  /** Position du « [@ » ou du « @ » à remplacer. */
  debut: number;
  suggestions: Suggestion[];
}

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Ce qu'on peut proposer au curseur : le texte entre « [@ » (ou un « @ » après un espace, ou après
 * « ; » dans un groupe) et le curseur est la recherche, par mots, dans l'identifiant, la clé, les auteurs,
 * l'année et le titre. Null si le curseur n'est pas dans une citation en cours de saisie.
 */
export function completionCitation(texte: string, curseur: number, refs: readonly { id: string; valeur: Reference }[], exclure = "", max = 8): Completion | null {
  const avant = texte.slice(0, curseur);
  const m = /(^|[\s[;(])@([^\]\n;@]{0,40})$/.exec(avant);
  if (!m) return null;
  const debut = m.index + m[1]!.length - (m[1] === "[" ? 1 : 0);
  const mots = sansAccents(m[2]!).split(/\s+/).filter(Boolean);
  const trouvees: { s: Suggestion; rang: number }[] = [];
  for (const r of refs) {
    if (r.id === exclure) continue;
    const v = r.valeur;
    const court = `${auteursCourts(v.auteurs)}, ${v.annee ?? "s. d."}`;
    const foin = sansAccents(`${r.id} ${v.cle} ${court} ${v.auteurs} ${v.titre}`);
    if (!mots.every((x) => foin.includes(x))) continue;
    const tete = sansAccents(`${r.id} ${v.cle} ${court}`);
    trouvees.push({ s: { id: r.id, court, titre: v.titre }, rang: mots.length === 0 || mots.every((x) => tete.includes(x)) ? 0 : 1 });
  }
  trouvees.sort((a, b) => a.rang - b.rang || a.s.id.localeCompare(b.s.id, "fr", { numeric: true }));
  return trouvees.length ? { debut, suggestions: trouvees.slice(0, max).map((t) => t.s) } : null;
}

/** Remplace la saisie en cours par la citation : « [@BIB-020] », ou « @BIB-020 » dans un groupe déjà ouvert (« [@BIB-001; @… »). */
export function insererCitation(texte: string, curseur: number, c: Completion, id: string): { texte: string; curseur: number } {
  const ouvert = texte.lastIndexOf("[", c.debut) >= 0 && texte.lastIndexOf("]", c.debut) < texte.lastIndexOf("[", c.debut);
  const dedans = ouvert && texte[c.debut] === "@";
  const ajout = dedans ? `@${id}` : `[@${id}]`;
  // un « ] » déjà là (citation corrigée après coup) n'est pas doublé
  const suite = !dedans && texte[curseur] === "]" ? curseur + 1 : curseur;
  return { texte: texte.slice(0, c.debut) + ajout + texte.slice(suite), curseur: c.debut + ajout.length };
}
