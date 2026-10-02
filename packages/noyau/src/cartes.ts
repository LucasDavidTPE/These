/**
 * Cartes : blocs de texte (Markdown) qu'on écrit soi-même dans une page (ChaussSpec, une campagne,
 * une étude). Une « zone » = un dossier de l'espace, `cartes/<zone>/` :
 *   - une carte par fichier `<id>.md` (première ligne « # Titre », puis le texte) ;
 *   - `_cartes.json` : { ordre, masquees } (ordre d'affichage, cartes fournies masquées).
 * Un module peut fournir des cartes par défaut : une carte modifiée garde son id et remplace la
 * version fournie ; « revenir au texte d'origine » range le fichier (jamais effacé).
 */

export interface CarteFournie {
  id: string;
  titre: string;
  texte: string;
  /** Références (clés de la Bibliothèque) affichées sous la carte, si les citations sont actives. */
  sources?: readonly string[];
}

export interface Carte {
  id: string;
  titre: string;
  texte: string;
  sources: readonly string[];
  /** « fournie » : texte de l'application ; « modifiee » : fournie puis réécrite ; « perso » : créée. */
  origine: "fournie" | "modifiee" | "perso";
}

export interface IndexCartes {
  ordre: string[];
  masquees: string[];
}

export const INDEX_CARTES = "_cartes.json";
export const dossierCartes = (zone: string) => `cartes/${zone}`;

const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function lireIndex(brut: unknown): IndexCartes {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  return { ordre: liste(b.ordre), masquees: liste(b.masquees) };
}

export function lireCarteMd(md: string): { titre: string; texte: string } {
  const lignes = md.replace(/\r\n?/g, "\n").split("\n");
  const i = lignes.findIndex((l) => l.trim() !== "");
  const t = i >= 0 ? /^#\s+(.*)$/.exec(lignes[i]!.trim()) : null;
  if (!t) return { titre: "", texte: md.trim() };
  return { titre: t[1]!.trim(), texte: lignes.slice(i + 1).join("\n").trim() };
}

export function ecrireCarteMd(titre: string, texte: string): string {
  return `# ${titre.trim() || "Sans titre"}\n\n${texte.trim()}\n`;
}

/** Identifiant d'une nouvelle carte : lisible, unique à la milliseconde, triable. */
export function nouvelId(maintenant: number): string {
  return `c-${maintenant.toString(36)}`;
}

export const estIdCarte = (id: string) => /^[a-z0-9][a-z0-9-]*$/.test(id);

/**
 * Les cartes à afficher, dans l'ordre : celui de l'index d'abord, puis les fournies dans leur
 * ordre, puis les créées (les plus anciennes d'abord). Les masquées sont à part.
 */
export function assembler(fournies: readonly CarteFournie[], fichiers: ReadonlyMap<string, { titre: string; texte: string }>, index: IndexCartes): { visibles: Carte[]; masquees: Carte[] } {
  const parId = new Map<string, Carte>();
  for (const f of fournies) {
    const ecrite = fichiers.get(f.id);
    parId.set(f.id, ecrite ? { id: f.id, titre: ecrite.titre || f.titre, texte: ecrite.texte, sources: f.sources ?? [], origine: "modifiee" } : { id: f.id, titre: f.titre, texte: f.texte, sources: f.sources ?? [], origine: "fournie" });
  }
  for (const [id, c] of [...fichiers].sort(([a], [b]) => (a < b ? -1 : 1))) if (!parId.has(id)) parId.set(id, { id, titre: c.titre, texte: c.texte, sources: [], origine: "perso" });
  const ordre = [...index.ordre.filter((id) => parId.has(id)), ...[...parId.keys()].filter((id) => !index.ordre.includes(id))];
  const toutes = ordre.map((id) => parId.get(id)!);
  const masquees = new Set(index.masquees);
  return { visibles: toutes.filter((c) => !masquees.has(c.id)), masquees: toutes.filter((c) => masquees.has(c.id)) };
}

/** L'ordre après avoir monté (-1) ou descendu (+1) une carte parmi les visibles. */
export function deplacer(ordre: readonly string[], id: string, sens: -1 | 1): string[] {
  const o = [...ordre];
  const i = o.indexOf(id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= o.length) return o;
  [o[i], o[j]] = [o[j]!, o[i]!];
  return o;
}
