/**
 * Citations dans un texte : `[@BIB-020]`, `[@BIB-020; @BIB-065]`, `[@olard2003, p. 12]`. Une clé est
 * l'identifiant d'une référence de la Bibliothèque (« BIB-020 ») ou sa clé BibTeX. Pur : la
 * résolution (auteurs, année) est fournie par l'appelant.
 */

export interface Cite {
  cle: string;
  /** « p. 12 », « chap. 3 »… ; vide sinon. */
  precision: string;
}

const GROUPE = /\[@([^\]\n]+)\]/g;
const CLE = /^@?([A-Za-z0-9][A-Za-z0-9_:.-]*)(?:\s*,\s*(.+))?$/;

/** Les citations d'un groupe « @a; @b, p. 3 », ou null si ce n'en est pas un (texte entre crochets ordinaire). */
function lireGroupe(interieur: string): Cite[] | null {
  const out: Cite[] = [];
  for (const brut of `@${interieur}`.split(";")) {
    const m = CLE.exec(brut.trim());
    if (!m || !brut.trim().startsWith("@")) return null;
    out.push({ cle: m[1]!, precision: (m[2] ?? "").trim() });
  }
  return out.length ? out : null;
}

/** Les clés citées, dans l'ordre de première apparition, sans doublon. */
export function clesCitees(texte: string): string[] {
  const vues = new Set<string>();
  for (const m of texte.matchAll(GROUPE)) for (const c of lireGroupe(m[1]!) ?? []) vues.add(c.cle);
  return [...vues];
}

/**
 * Remplace chaque groupe de citations par le texte que renvoie `rendre` ; un groupe pour lequel
 * `rendre` renvoie null (clé inconnue…) reste tel qu'écrit.
 */
export function remplacerCitations(texte: string, rendre: (cites: Cite[]) => string | null): string {
  return texte.replace(GROUPE, (tout, interieur: string) => {
    const g = lireGroupe(interieur);
    return (g && rendre(g)) ?? tout;
  });
}

export interface ReferenceCitee {
  id: string;
  /** « Olard & Di Benedetto », « Chupin et al. ». */
  auteurs: string;
  annee: string;
  /** Référence complète, une ligne. */
  complete: string;
}

/** « (Olard & Di Benedetto, 2003 ; Burmister, 1945, p. 12) », ou null si une clé est inconnue. */
export function citationAuteurAnnee(cites: Cite[], refs: ReadonlyMap<string, ReferenceCitee>): string | null {
  const parts: string[] = [];
  for (const c of cites) {
    const r = refs.get(c.cle);
    if (!r) return null;
    parts.push(`${r.auteurs}, ${r.annee || "s. d."}${c.precision ? `, ${c.precision}` : ""}`);
  }
  return `(${parts.join(" ; ")})`;
}
