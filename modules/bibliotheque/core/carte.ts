/**
 * Carte de la lecture croisée : un graphe dont les nœuds sont les articles et les étiquettes (méthodes,
 * lois, matériaux…). Un article est relié aux étiquettes qu'il porte et aux articles qu'il cite dans ses
 * liens typés. Disposition par forces (Fruchterman-Reingold), déterministe : mêmes données, même carte.
 * Pur : ni DOM ni fichiers.
 */
import { citation } from "./calculs";
import { cleEtiquette, vocabulaire, type ObjetRef, type ReglagesLecture } from "./lecture";

export interface Noeud {
  /** « BIB-020 » pour un article, « e:<critère>:<clé> » pour une étiquette. */
  id: string;
  type: "article" | "etiquette";
  libelle: string;
  /** Article : statut de lecture ; étiquette : identifiant du critère. */
  groupe: string;
  /** Nombre de liens (taille du nœud). */
  degre: number;
  x: number;
  y: number;
}

export interface Arete {
  de: string;
  vers: string;
  /** « etiquette » (article → étiquette) ou l'identifiant du type de lien entre articles. */
  type: string;
}

export interface OptionsCarte {
  /** Critères dont les étiquettes apparaissent comme nœuds. */
  criteres: string[];
  /** Montrer les liens typés entre articles. */
  liens: boolean;
  /** Une étiquette portée par moins d'articles n'est pas montrée (1 = toutes). */
  minArticles: number;
  /** Articles écartés de la lecture masqués. */
  sansEcartes: boolean;
}

export interface Carte {
  noeuds: Noeud[];
  aretes: Arete[];
}

export const idEtiquette = (critere: string, etiquette: string) => `e:${critere}:${cleEtiquette(etiquette)}`;

export function construireCarte(refs: readonly ObjetRef[], reglages: ReglagesLecture, o: OptionsCarte): Carte {
  const visibles = refs.filter((r) => !(o.sansEcartes && r.valeur.statut === "Écarté"));
  const ids = new Set(visibles.map((r) => r.id));
  const noeuds = new Map<string, Noeud>();
  const aretes: Arete[] = [];
  for (const critere of o.criteres) {
    for (const e of vocabulaire(visibles, critere, reglages)) {
      if (e.ids.length < Math.max(1, o.minArticles)) continue;
      const id = idEtiquette(critere, e.etiquette);
      noeuds.set(id, { id, type: "etiquette", libelle: e.etiquette, groupe: critere, degre: 0, x: 0, y: 0 });
      for (const a of e.ids) aretes.push({ de: a, vers: id, type: "etiquette" });
    }
  }
  if (o.liens)
    for (const r of visibles) for (const l of r.valeur.liens) if (ids.has(l.vers) && l.vers !== r.id) aretes.push({ de: r.id, vers: l.vers, type: l.type });
  const utilises = new Set(aretes.flatMap((a) => [a.de, a.vers]));
  for (const r of visibles) {
    if (!utilises.has(r.id)) continue;
    noeuds.set(r.id, { id: r.id, type: "article", libelle: citation(r.valeur) || r.valeur.titre.slice(0, 40) || r.id, groupe: r.valeur.statut, degre: 0, x: 0, y: 0 });
  }
  const gardees = aretes.filter((a) => noeuds.has(a.de) && noeuds.has(a.vers));
  for (const a of gardees) {
    noeuds.get(a.de)!.degre++;
    noeuds.get(a.vers)!.degre++;
  }
  return { noeuds: [...noeuds.values()], aretes: gardees };
}

/** Graine stable d'une chaîne (FNV-1a), pour placer les nœuds au départ. */
function graine(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Dispose les nœuds dans un rectangle `largeur × hauteur` (modifie `x`, `y`). Répulsion entre tous les nœuds,
 * attraction le long des arêtes, légère gravité vers le centre pour garder les îlots proches.
 */
export function disposer(carte: Carte, largeur: number, hauteur: number, iterations = 300): Carte {
  const n = carte.noeuds.length;
  if (!n) return carte;
  const index = new Map(carte.noeuds.map((x, i) => [x.id, i]));
  const k = Math.min(110, Math.sqrt((largeur * hauteur) / n) * 0.45);
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  carte.noeuds.forEach((x, i) => {
    const g = graine(x.id);
    const angle = ((g % 3600) / 3600) * 2 * Math.PI;
    const rayon = (0.15 + ((g >>> 12) % 1000) / 1000 / 2.2) * Math.min(largeur, hauteur);
    X[i] = largeur / 2 + rayon * Math.cos(angle);
    Y[i] = hauteur / 2 + rayon * Math.sin(angle);
  });
  const aretes = carte.aretes.map((a) => [index.get(a.de)!, index.get(a.vers)!] as const);
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = Math.min(largeur, hauteur) / 8;
  const refroidissement = temperature / (iterations + 1);
  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        let ex = X[i]! - X[j]!;
        let ey = Y[i]! - Y[j]!;
        let d2 = ex * ex + ey * ey;
        if (d2 < 0.01) {
          ex = ((i - j) % 7) * 0.1 + 0.05;
          ey = ((j - i) % 5) * 0.1 + 0.05;
          d2 = ex * ex + ey * ey;
        }
        const f = (k * k) / d2;
        dx[i]! += ex * f;
        dy[i]! += ey * f;
        dx[j]! -= ex * f;
        dy[j]! -= ey * f;
      }
    for (const [a, b] of aretes) {
      const ex = X[a]! - X[b]!;
      const ey = Y[a]! - Y[b]!;
      const d = Math.sqrt(ex * ex + ey * ey) || 0.01;
      const f = d / k;
      dx[a]! -= ex * f;
      dy[a]! -= ey * f;
      dx[b]! += ex * f;
      dy[b]! += ey * f;
    }
    for (let i = 0; i < n; i++) {
      // gravité : garde les îlots (articles sans lien commun) près du centre
      dx[i]! += (largeur / 2 - X[i]!) * 0.06 * k * 0.05;
      dy[i]! += (hauteur / 2 - Y[i]!) * 0.06 * k * 0.05;
      const d = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!) || 1;
      const pas = Math.min(d, temperature);
      X[i] = X[i]! + (dx[i]! / d) * pas;
      Y[i] = Y[i]! + (dy[i]! / d) * pas;
    }
    temperature = Math.max(0.5, temperature - refroidissement);
  }
  // mise à l'échelle dans le cadre (marges pour les libellés), proportions gardées
  const marge = 60;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, X[i]!);
    x1 = Math.max(x1, X[i]!);
    y0 = Math.min(y0, Y[i]!);
    y1 = Math.max(y1, Y[i]!);
  }
  const echelle = Math.min((largeur - 2 * marge) / Math.max(x1 - x0, 1), (hauteur - 2 * marge) / Math.max(y1 - y0, 1), 1.6);
  const cx = (largeur - (x1 - x0) * echelle) / 2;
  const cy = (hauteur - (y1 - y0) * echelle) / 2;
  const arrondi = (v: number) => Math.round(v * 10) / 10;
  return { ...carte, noeuds: carte.noeuds.map((x, i) => ({ ...x, x: arrondi(cx + (X[i]! - x0) * echelle), y: arrondi(cy + (Y[i]! - y0) * echelle) })) };
}

/** Voisins d'un nœud (pour la mise en évidence au survol). */
export function voisins(carte: Carte, id: string): Set<string> {
  const v = new Set<string>([id]);
  for (const a of carte.aretes) {
    if (a.de === id) v.add(a.vers);
    if (a.vers === id) v.add(a.de);
  }
  return v;
}
