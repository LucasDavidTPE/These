/**
 * Carte en couleurs d'un graphe (`graph.json`, champ facultatif `carte`) : valeurs sur une grille régulière
 * (coupe COMSOL, champ mesuré…), dessinées sous les courbes avec une barre de couleurs. Tout se règle après
 * coup comme le reste du graphe : palette, bornes, nombre de niveaux, libellé, axes, taille.
 */

export const PALETTES_CARTE = ["divergente", "viridis", "inferno", "turbo", "gris"] as const;
export type PaletteCarte = (typeof PALETTES_CARTE)[number];

export const LIBELLES_PALETTES: Record<PaletteCarte, string> = {
  divergente: "Rouge-bleu (centrée sur 0)",
  viridis: "Viridis",
  inferno: "Inferno",
  turbo: "Turbo (arc-en-ciel lisible)",
  gris: "Niveaux de gris",
};

export interface CarteDoc {
  /** Nœuds de la grille, croissants ; une cellule est centrée sur chaque nœud. */
  x: number[];
  y: number[];
  /** Valeurs [ligne y][colonne x] ; null = pas de valeur. */
  v: (number | null)[][];
  palette: PaletteCarte;
  /** Bornes de l'échelle de couleurs ; absentes = valeurs extrêmes (symétriques autour de 0 pour « divergente »). */
  min?: number;
  max?: number;
  /** Nombre de teintes (paliers) ; 2 à 64. */
  niveaux: number;
  /** Titre de la barre de couleurs (« $\varepsilon_{zz}$ (µdef) »). */
  legende: string;
  /** Échelle inversée. */
  inverser: boolean;
  /** Valeurs des isolignes tracées par-dessus (vide ou absent : aucune). */
  isolignes?: number[];
}

const RAMPES: Record<PaletteCarte, string[]> = {
  divergente: ["#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b"],
  viridis: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"],
  inferno: ["#000004", "#1b0c41", "#4a0c6b", "#781c6d", "#a52c60", "#cf4446", "#ed6925", "#fb9b06", "#fcffa4"],
  turbo: ["#30123b", "#4662d7", "#36aaf9", "#1ae4b6", "#72fe5e", "#c8ef34", "#faba39", "#f66b19", "#7a0403"],
  gris: ["#f2f2f2", "#d9d9d9", "#bdbdbd", "#969696", "#737373", "#525252", "#252525"],
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validation tolérante du champ `carte` ; null s'il est absent ou inutilisable (erreur décrite). */
export function parseCarte(raw: unknown, err: (path: string, message: string) => void): CarteDoc | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    err("carte", "doit être un objet.");
    return null;
  }
  const c = raw as Record<string, unknown>;
  const axe = (k: "x" | "y"): number[] | null => {
    const a = c[k];
    if (!Array.isArray(a) || a.length < 2 || !a.every(isNum)) return err(`carte.${k}`, "doit être une liste d'au moins 2 nombres."), null;
    if (a.some((v, i) => i > 0 && v <= a[i - 1]!)) return err(`carte.${k}`, "doit être croissante."), null;
    return [...a];
  };
  const x = axe("x");
  const y = axe("y");
  if (!x || !y) return null;
  const v = c.v;
  if (!Array.isArray(v) || v.length !== y.length || !v.every((l) => Array.isArray(l) && l.length === x.length && l.every((n) => n === null || isNum(n)))) {
    err("carte.v", `doit être un tableau de ${y.length} lignes de ${x.length} valeurs (nombre ou null).`);
    return null;
  }
  const palette = PALETTES_CARTE.includes(c.palette as PaletteCarte) ? (c.palette as PaletteCarte) : "viridis";
  const niveaux = isNum(c.niveaux) ? Math.round(Math.min(64, Math.max(2, c.niveaux))) : 24;
  const out: CarteDoc = { x, y, v: v.map((l) => [...(l as (number | null)[])]), palette, niveaux, legende: typeof c.legende === "string" ? c.legende : "", inverser: c.inverser === true };
  if (Array.isArray(c.isolignes) && c.isolignes.some(isNum)) out.isolignes = [...new Set(c.isolignes.filter(isNum))].sort((a, b) => a - b);
  if (isNum(c.min)) out.min = c.min;
  if (isNum(c.max)) out.max = c.max;
  if (out.min !== undefined && out.max !== undefined && !(out.min < out.max)) err("carte", "min doit être inférieur à max.");
  return out;
}

/** Valeurs extrêmes présentes dans la carte. */
export function etendueCarte(c: CarteDoc): [number, number] {
  let a = Infinity;
  let b = -Infinity;
  for (const l of c.v)
    for (const v of l)
      if (v !== null) {
        if (v < a) a = v;
        if (v > b) b = v;
      }
  return a <= b ? [a, b] : [0, 1];
}

/** Bornes de l'échelle de couleurs : imposées, sinon extrêmes (symétriques autour de 0 en « divergente »). */
export function bornesCarte(c: CarteDoc): [number, number] {
  const [a, b] = etendueCarte(c);
  if (c.palette === "divergente" && c.min === undefined && c.max === undefined) {
    const m = Math.max(Math.abs(a), Math.abs(b)) || 1;
    return [-m, m];
  }
  const lo = c.min ?? a;
  const hi = c.max ?? b;
  return hi > lo ? [lo, hi] : [lo, lo + 1];
}

function interp(rampe: string[], t: number): string {
  const u = Math.max(0, Math.min(1, t)) * (rampe.length - 1);
  const i = Math.min(rampe.length - 2, Math.floor(u));
  const f = u - i;
  const a = rampe[i]!;
  const b = rampe[i + 1]!;
  const c = (s: string, k: number) => parseInt(s.slice(1 + 2 * k, 3 + 2 * k), 16);
  return `#${[0, 1, 2].map((k) => Math.round(c(a, k) + f * (c(b, k) - c(a, k))).toString(16).padStart(2, "0")).join("")}`;
}

/** Couleur de chaque palier (du bas au haut de l'échelle). */
export function couleursCarte(c: CarteDoc): string[] {
  const r = RAMPES[c.palette];
  const rampe = c.inverser ? [...r].reverse() : r;
  return Array.from({ length: c.niveaux }, (_, k) => interp(rampe, (k + 0.5) / c.niveaux));
}

/** Palier d'une valeur (0 … niveaux − 1 ; les valeurs hors bornes prennent le palier extrême). */
export function palier(c: CarteDoc, bornes: [number, number], v: number): number {
  const [lo, hi] = bornes;
  return Math.min(c.niveaux - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo || 1)) * c.niveaux)));
}

/** Bornes de la cellule `i` d'un axe de nœuds (milieux entre nœuds, nœud extrême au bord). */
export function bordCellule(g: readonly number[], i: number): [number, number] {
  const a = i === 0 ? g[0]! : (g[i - 1]! + g[i]!) / 2;
  const b = i === g.length - 1 ? g[i]! : (g[i]! + g[i + 1]!) / 2;
  return [a, b];
}

/** Carte aux axes échangés (x ↔ y), valeurs transposées. */
export function transposerCarte(c: CarteDoc): CarteDoc {
  return { ...c, x: [...c.y], y: [...c.x], v: c.x.map((_, i) => c.y.map((__, j) => c.v[j]![i] ?? null)) };
}

// ---- Isolignes (carrés marchants sur les nœuds de la grille) ----

type Pt2 = [number, number];

/**
 * Isoligne `niveau` d'une carte : polylignes en coordonnées des données, interpolées linéairement sur les arêtes
 * entre nœuds. Les mailles qui touchent une valeur absente sont sautées ; un col (4 croisements) est tranché par
 * la moyenne de la maille.
 */
export function isoligne(c: CarteDoc, niveau: number): Pt2[][] {
  const { x, y, v } = c;
  // arête horizontale h:i:j entre (i, j) et (i+1, j) ; verticale v:i:j entre (i, j) et (i, j+1)
  const point = (id: string): Pt2 => {
    const [k, a, b] = id.split(":");
    const i = Number(a);
    const j = Number(b);
    const v0 = v[j]![i]!;
    const v1 = k === "h" ? v[j]![i + 1]! : v[j + 1]![i]!;
    const t = v1 === v0 ? 0.5 : (niveau - v0) / (v1 - v0);
    return k === "h" ? [x[i]! + t * (x[i + 1]! - x[i]!), y[j]!] : [x[i]!, y[j]! + t * (y[j + 1]! - y[j]!)];
  };
  const segments: [string, string][] = [];
  for (let j = 0; j + 1 < y.length; j++) {
    for (let i = 0; i + 1 < x.length; i++) {
      // coins : a (i, j), b (i+1, j), cc (i+1, j+1), d (i, j+1)
      const vals = [v[j]![i], v[j]![i + 1], v[j + 1]![i + 1], v[j + 1]![i]];
      if (vals.some((w) => w === null || w === undefined)) continue;
      const haut = (vals as number[]).map((w) => w >= niveau);
      // arêtes : 0 bas (a-b), 1 droite (b-c), 2 haut (d-c), 3 gauche (a-d)
      const aretes = [`h:${i}:${j}`, `v:${i + 1}:${j}`, `h:${i}:${j + 1}`, `v:${i}:${j}`];
      const coupe = [haut[0] !== haut[1], haut[1] !== haut[2], haut[3] !== haut[2], haut[0] !== haut[3]];
      const n = coupe.filter(Boolean).length;
      if (n === 2) {
        const [p, q] = aretes.filter((_, k) => coupe[k]);
        segments.push([p!, q!]);
      } else if (n === 4) {
        const centre = (vals as number[]).reduce((s2, w) => s2 + w, 0) / 4 >= niveau;
        // on isole chaque coin dont l'état diffère du centre : coin → ses deux arêtes
        const coins: [number, number][] = [
          [0, 3],
          [0, 1],
          [1, 2],
          [2, 3],
        ];
        coins.forEach(([e1, e2], k) => {
          if (haut[k] !== centre) segments.push([aretes[e1]!, aretes[e2]!]);
        });
      }
    }
  }
  // chaînage des segments par arêtes communes
  const parArete = new Map<string, number[]>();
  segments.forEach(([p, q], k) => {
    for (const e of [p, q]) parArete.set(e, [...(parArete.get(e) ?? []), k]);
  });
  const vu = new Set<number>();
  const lignes: Pt2[][] = [];
  const suivre = (depart: number, debut: string) => {
    const chemin = [debut];
    let k = depart;
    let bout = debut;
    while (!vu.has(k)) {
      vu.add(k);
      const [p, q] = segments[k]!;
      bout = p === bout ? q : p;
      chemin.push(bout);
      const suivant = (parArete.get(bout) ?? []).find((m) => !vu.has(m));
      if (suivant === undefined) break;
      k = suivant;
    }
    lignes.push(chemin.map(point));
  };
  // d'abord les lignes ouvertes (une extrémité sur une seule maille), puis les boucles
  segments.forEach(([p, q], k) => {
    if (vu.has(k)) return;
    if ((parArete.get(p) ?? []).length === 1) suivre(k, p);
    else if ((parArete.get(q) ?? []).length === 1) suivre(k, q);
  });
  segments.forEach(([p], k) => {
    if (!vu.has(k)) suivre(k, p);
  });
  return lignes;
}

/** Point où écrire la valeur d'une isoligne : le milieu de sa plus longue polyligne (null si vide). */
export function placeEtiquette(lignes: Pt2[][], echelle: (p: Pt2) => Pt2 = (p) => p): Pt2 | null {
  let best: Pt2[] | null = null;
  let lmax = -1;
  for (const l of lignes) {
    const e = l.map(echelle);
    const lg = e.slice(1).reduce((s2, p, k) => s2 + Math.hypot(p[0] - e[k]![0], p[1] - e[k]![1]), 0);
    if (lg > lmax) {
      lmax = lg;
      best = l;
    }
  }
  return best ? best[Math.floor(best.length / 2)]! : null;
}
