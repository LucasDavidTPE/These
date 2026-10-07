/**
 * Explorer la lecture croisée sans tout afficher à la fois (SPEC §9.5) :
 *  - facettes croisées : on sélectionne des étiquettes, chaque critère montre combien d'articles de la sélection
 *    portent chacune de ses étiquettes (les zéros sont les trous) ;
 *  - constellation : un article (ou une étiquette) au centre, ses étiquettes autour, puis les articles qui en
 *    partagent le plus et ceux qui lui sont liés — lisible, contrairement au graphe complet ;
 *  - nettoyage du vocabulaire : « Viscoélastique (2S2P1D) » → étiquette « Viscoélastique » + note, écritures
 *    voisines fusionnées (pluriels, tirets, casse).
 * Pur : ni DOM ni fichiers.
 */
import { avecCellule, cleEtiquette, separerParenthese, triIds, unirEtiquettes, vocabulaire, type ObjetRef, type ReglagesLecture } from "./lecture";

export { separerParenthese };

// ---- Facettes croisées ----

export interface Choix {
  critere: string;
  /** Clé de l'étiquette (cleEtiquette). */
  cle: string;
}

/** Articles qui portent toutes les étiquettes choisies (sans choix : tous). */
export function filtrer(refs: readonly ObjetRef[], choix: readonly Choix[]): ObjetRef[] {
  if (!choix.length) return [...refs];
  return refs.filter((r) => choix.every((c) => (r.valeur.lecture[c.critere]?.etiquettes ?? []).some((e) => cleEtiquette(e) === c.cle)));
}

export interface Facette {
  critere: string;
  /** Articles de la sélection renseignés pour ce critère. */
  renseignes: number;
  etiquettes: { etiquette: string; cle: string; total: number; dansSelection: number; definition: string }[];
}

/** Pour chaque critère, ses étiquettes avec leur total et leur nombre dans la sélection courante. */
export function facettes(refs: readonly ObjetRef[], selection: readonly ObjetRef[], reglages: ReglagesLecture): Facette[] {
  const ids = new Set(selection.map((r) => r.id));
  return reglages.criteres.map((c) => {
    const voc = vocabulaire(refs, c.id, reglages).filter((e) => e.ids.length);
    return {
      critere: c.id,
      renseignes: selection.filter((r) => r.valeur.lecture[c.id]?.etiquettes.length).length,
      etiquettes: voc.map((e) => ({ etiquette: e.etiquette, cle: e.cle, total: e.ids.length, dansSelection: e.ids.filter((i) => ids.has(i)).length, definition: e.definition })),
    };
  });
}

/** Critères renseignés d'un article (pour les pastilles de couverture). */
export const couverture = (r: ObjetRef, reglages: ReglagesLecture) => reglages.criteres.map((c) => !!r.valeur.lecture[c.id]?.etiquettes.length);

// ---- Constellation ----

export interface Voisin {
  id: string;
  /** Étiquettes communes (« critère|clé »). */
  communes: string[];
  /** Indice de Jaccard sur les étiquettes. */
  score: number;
}

const etiquettesDe = (r: ObjetRef) => new Set(Object.entries(r.valeur.lecture).flatMap(([c, x]) => x.etiquettes.map((e) => `${c}|${cleEtiquette(e)}`)));

/** Articles les plus proches (étiquettes partagées), du plus proche au moins proche. */
export function voisins(refs: readonly ObjetRef[], id: string, max = 12): Voisin[] {
  const moi = refs.find((r) => r.id === id);
  if (!moi) return [];
  const a = etiquettesDe(moi);
  if (!a.size) return [];
  const out: Voisin[] = [];
  for (const r of refs) {
    if (r.id === id || r.valeur.statut === "Écarté") continue;
    const b = etiquettesDe(r);
    const communes = [...a].filter((x) => b.has(x));
    if (!communes.length) continue;
    out.push({ id: r.id, communes, score: communes.length / (a.size + b.size - communes.length) });
  }
  return out.sort((x, y) => y.score - x.score || y.communes.length - x.communes.length || triIds(x.id, y.id)).slice(0, max);
}

/** Étiquettes qui accompagnent le plus souvent une étiquette donnée (tous critères). */
export function compagnes(refs: readonly ObjetRef[], critere: string, cle: string, max = 12): { critere: string; etiquette: string; n: number }[] {
  const porteurs = filtrer(refs, [{ critere, cle }]);
  const m = new Map<string, { critere: string; etiquette: string; n: number }>();
  for (const r of porteurs)
    for (const [c, x] of Object.entries(r.valeur.lecture))
      for (const e of x.etiquettes) {
        const k = `${c}|${cleEtiquette(e)}`;
        if (c === critere && cleEtiquette(e) === cle) continue;
        const v = m.get(k) ?? { critere: c, etiquette: e, n: 0 };
        v.n++;
        m.set(k, v);
      }
  return [...m.values()].sort((a, b) => b.n - a.n || a.etiquette.localeCompare(b.etiquette, "fr")).slice(0, max);
}

// ---- Nettoyage du vocabulaire ----

/** Clé « lâche » : sans accents, casse, tirets, espaces ni pluriel final, pour repérer deux écritures d'une même étiquette. */
export const cleLache = (e: string) =>
  cleEtiquette(e)
    .replace(/[-_'’.]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => (m.length > 3 ? m.replace(/(s|x)$/, "") : m))
    .join(" ");

export interface Separation {
  critere: string;
  etiquette: string;
  tete: string;
  precision: string;
  ids: string[];
}

export interface Fusion {
  critere: string;
  /** Forme gardée (la plus portée). */
  cible: string;
  /** Formes fusionnées dans la cible. */
  sources: string[];
  ids: string[];
}

export interface Propositions {
  separations: Separation[];
  fusions: Fusion[];
  /** Étiquettes trop longues pour en être (plutôt une note), à revoir à la main. */
  longues: { critere: string; etiquette: string; ids: string[] }[];
}

/** Ce que le nettoyage propose, critère par critère. Rien n'est appliqué ici. */
export function proposerNettoyage(refs: readonly ObjetRef[], reglages: ReglagesLecture): Propositions {
  const out: Propositions = { separations: [], fusions: [], longues: [] };
  for (const c of reglages.criteres) {
    const voc = vocabulaire(refs, c.id, reglages).filter((e) => e.ids.length);
    // 1. parenthèses : la tête devient l'étiquette, la précision part en note
    const tetes = new Map<string, number>();
    for (const e of voc) {
      const s = separerParenthese(e.etiquette);
      if (s) {
        out.separations.push({ critere: c.id, etiquette: e.etiquette, tete: s.tete, precision: s.precision, ids: e.ids });
        tetes.set(cleLache(s.tete), (tetes.get(cleLache(s.tete)) ?? 0) + e.ids.length);
      } else if (e.etiquette.length > 45) out.longues.push({ critere: c.id, etiquette: e.etiquette, ids: e.ids });
    }
    // 2. écritures voisines (après séparation) : regroupées sous la plus portée
    const groupes = new Map<string, { forme: string; ids: string[] }[]>();
    for (const e of voc) {
      const s = separerParenthese(e.etiquette);
      const forme = s ? s.tete : e.etiquette;
      const k = cleLache(forme);
      const g = groupes.get(k) ?? [];
      const meme = g.find((x) => cleEtiquette(x.forme) === cleEtiquette(forme));
      if (meme) meme.ids = [...new Set([...meme.ids, ...e.ids])];
      else g.push({ forme, ids: [...e.ids] });
      groupes.set(k, g);
    }
    for (const g of groupes.values()) {
      if (g.length < 2) continue;
      g.sort((a, b) => b.ids.length - a.ids.length || a.forme.length - b.forme.length || a.forme.localeCompare(b.forme, "fr"));
      out.fusions.push({ critere: c.id, cible: g[0]!.forme, sources: g.slice(1).map((x) => x.forme), ids: [...new Set(g.flatMap((x) => x.ids))].sort(triIds) });
    }
  }
  return out;
}

/** Applique les propositions retenues ; renvoie les fiches modifiées. Les précisions retirées des étiquettes vont dans la note de la case. */
export function appliquerNettoyage(refs: readonly ObjetRef[], separations: readonly Separation[], fusions: readonly Fusion[]): ObjetRef[] {
  const sep = new Map(separations.map((s) => [`${s.critere}|${cleEtiquette(s.etiquette)}`, s]));
  const fus = new Map<string, string>();
  for (const f of fusions) for (const s of f.sources) fus.set(`${f.critere}|${cleEtiquette(s)}`, f.cible);
  const out: ObjetRef[] = [];
  for (const r of refs) {
    let v = r.valeur;
    for (const [critere, cell] of Object.entries(r.valeur.lecture)) {
      const notes: string[] = [];
      const etiquettes = cell.etiquettes.map((e) => {
        let x = e;
        const s = sep.get(`${critere}|${cleEtiquette(x)}`);
        if (s) {
          x = s.tete;
          notes.push(s.precision);
        }
        return fus.get(`${critere}|${cleEtiquette(x)}`) ?? x;
      });
      const changees = unirEtiquettes([], etiquettes);
      const note = [cell.note, ...notes].map((n) => n.trim()).filter(Boolean).join(" ; ");
      if (JSON.stringify(changees) !== JSON.stringify(cell.etiquettes) || note !== cell.note) v = avecCellule(v, critere, { etiquettes: changees, note, valide: cell.valide });
    }
    if (v !== r.valeur) out.push({ id: r.id, valeur: v });
  }
  return out;
}
