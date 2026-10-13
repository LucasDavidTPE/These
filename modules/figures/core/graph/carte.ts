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
