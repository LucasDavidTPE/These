/**
 * Régression d'une série (moindres carrés) : droite, droite par l'origine, polynôme,
 * loi puissance (droite en log-log), exponentielle (droite en semi-log), logarithme.
 * Seuls les points dont le x est dans la plage choisie comptent ; la courbe est tracée sur
 * cette plage, ou prolongée sur toute la série. Elle et son équation sont tracées sur le
 * graphe, en SVG comme en pgfplots, à partir des mêmes points échantillonnés.
 */
import type { LegendPos } from "./model";

export type FitKind = "lineaire" | "origine" | "polynome" | "puissance" | "exponentielle" | "logarithmique";
export const FIT_KINDS: FitKind[] = ["lineaire", "origine", "polynome", "puissance", "exponentielle", "logarithmique"];
export const DEGRE_MIN = 2;
export const DEGRE_MAX = 6;

export interface SeriesFit {
  kind: FitKind;
  /** Équation (et R²) écrite sur la figure. */
  label: boolean;
  /** Polynôme : degré (2 à 6). */
  degre?: number;
  /** Plage des x pris en compte (bornes incluses ; absente = pas de borne). */
  xmin?: number;
  xmax?: number;
  /** Courbe tracée sur toute l'étendue de la série, pas seulement sur la plage. */
  prolonger?: boolean;
}

export interface FitResult {
  kind: FitKind;
  /**
   * y = a·x + b (linéaire, origine), y = a·x^b (puissance), y = a·e^(b·x) (exponentielle),
   * y = a·ln x + b (logarithmique). Polynôme : voir `coefs`.
   */
  a: number;
  b: number;
  /** Polynôme : coefficients c0, c1… cd de y = c0 + c1·x + … + cd·x^d. */
  coefs?: number[];
  /** Polynôme : plus grand |x| des points, pour juger un terme négligeable (bruit d'arrondi). */
  xAbsMax?: number;
  r2: number;
  /** Nombre de points utilisés. */
  n: number;
}

const nombre = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function parseFit(v: unknown): SeriesFit | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (!FIT_KINDS.includes(r.kind as FitKind)) return undefined;
  const f: SeriesFit = { kind: r.kind as FitKind, label: r.label !== false };
  if (f.kind === "polynome") f.degre = Math.min(DEGRE_MAX, Math.max(DEGRE_MIN, Math.round(nombre(r.degre) ?? DEGRE_MIN)));
  const xmin = nombre(r.xmin),
    xmax = nombre(r.xmax);
  if (xmin !== undefined) f.xmin = xmin;
  if (xmax !== undefined) f.xmax = xmax;
  if (r.prolonger === true) f.prolonger = true;
  return f;
}

/** Points de la série retenus pour la régression : x dans [xmin, xmax], x et y finis. */
export function fitSample(x: number[], y: number[], fit: Pick<SeriesFit, "xmin" | "xmax">): { x: number[]; y: number[] } {
  const lo = fit.xmin ?? -Infinity,
    hi = fit.xmax ?? Infinity;
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  const out = { x: [] as number[], y: [] as number[] };
  x.forEach((v, i) => {
    const w = y[i]!;
    if (Number.isFinite(v) && Number.isFinite(w) && v >= a && v <= b) {
      out.x.push(v);
      out.y.push(w);
    }
  });
  return out;
}

/** Droite des moindres carrés de Y en X (ou par l'origine). */
function droite(X: number[], Y: number[], origine: boolean): { a: number; b: number; r2: number } | null {
  const n = X.length;
  if (n < (origine ? 1 : 2)) return null;
  const mx = X.reduce((s, v) => s + v, 0) / n;
  const my = Y.reduce((s, v) => s + v, 0) / n;
  let a: number;
  let b: number;
  if (origine) {
    const sxx = X.reduce((s, v) => s + v * v, 0);
    if (sxx === 0) return null;
    a = X.reduce((s, v, i) => s + v * Y[i]!, 0) / sxx;
    b = 0;
  } else {
    const sxx = X.reduce((s, v) => s + (v - mx) ** 2, 0);
    if (sxx === 0) return null;
    a = X.reduce((s, v, i) => s + (v - mx) * (Y[i]! - my), 0) / sxx;
    b = my - a * mx;
  }
  const ssRes = X.reduce((s, v, i) => s + (Y[i]! - (a * v + b)) ** 2, 0);
  const ssTot = Y.reduce((s, v) => s + (v - my) ** 2, 0);
  return { a, b, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot };
}

/**
 * Polynôme de degré d des moindres carrés. Calculé en t = (x − moyenne) / étendue, où les
 * équations normales sont bien conditionnées, puis réécrit en puissances de x.
 */
function polynome(x: number[], y: number[], d: number): number[] | null {
  const n = x.length;
  if (new Set(x).size < d + 1) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const sx = Math.max(...x.map((v) => Math.abs(v - mx))) || 1;
  const t = x.map((v) => (v - mx) / sx);
  // Équations normales : A c = r, A[j][k] = Σ t^(j+k), r[j] = Σ y t^j.
  const A = Array.from({ length: d + 1 }, (_, j) => Array.from({ length: d + 1 }, (_, k) => t.reduce((s, v) => s + v ** (j + k), 0)));
  const r = Array.from({ length: d + 1 }, (_, j) => t.reduce((s, v, i) => s + y[i]! * v ** j, 0));
  for (let col = 0; col <= d; col++) {
    let piv = col;
    for (let i = col + 1; i <= d; i++) if (Math.abs(A[i]![col]!) > Math.abs(A[piv]![col]!)) piv = i;
    if (Math.abs(A[piv]![col]!) < 1e-12 * n) return null;
    [A[col], A[piv]] = [A[piv]!, A[col]!];
    [r[col], r[piv]] = [r[piv]!, r[col]!];
    for (let i = 0; i <= d; i++) {
      if (i === col) continue;
      const f = A[i]![col]! / A[col]![col]!;
      for (let k = col; k <= d; k++) A[i]![k]! -= f * A[col]![k]!;
      r[i]! -= f * r[col]!;
    }
  }
  const ct = r.map((v, j) => v / A[j]![j]!);
  // p(x) = Σ_j ct_j ((x − mx)/sx)^j = Σ_j ct_j sx^−j Σ_k C(j,k) x^k (−mx)^(j−k)
  const c = new Array<number>(d + 1).fill(0);
  for (let j = 0; j <= d; j++) {
    let binom = 1;
    for (let k = 0; k <= j; k++) {
      c[k]! += (ct[j]! / sx ** j) * binom * (-mx) ** (j - k);
      binom = (binom * (j - k)) / (k + 1);
    }
  }
  return c;
}

/** Coefficients de la régression ; null si les points ne suffisent pas. */
export function fitSeries(x: number[], y: number[], kind: FitKind, degre = DEGRE_MIN): FitResult | null {
  if (kind === "polynome") {
    const d = Math.min(DEGRE_MAX, Math.max(DEGRE_MIN, Math.round(degre)));
    const coefs = polynome(x, y, d);
    if (!coefs) return null;
    const my = y.reduce((s, v) => s + v, 0) / y.length;
    const val = (v: number) => coefs.reduceRight((s, c) => s * v + c, 0);
    const ssRes = x.reduce((s, v, i) => s + (y[i]! - val(v)) ** 2, 0);
    const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
    return { kind, a: coefs[d]!, b: coefs[0]!, coefs, xAbsMax: Math.max(...x.map(Math.abs)), r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n: x.length };
  }
  // Les autres se ramènent à une droite, après changement de variable (R² dans ces variables, comme Excel).
  const garde = (ok: (u: number, v: number) => boolean) => x.map((u, i) => ok(u, y[i]!));
  let X = x,
    Y = y;
  if (kind === "puissance" || kind === "exponentielle" || kind === "logarithmique") {
    const ok = garde((u, v) => (kind === "exponentielle" || u > 0) && (kind === "logarithmique" || v > 0));
    X = x.filter((_, i) => ok[i]);
    Y = y.filter((_, i) => ok[i]);
    if (kind !== "exponentielle") X = X.map(Math.log);
    if (kind !== "logarithmique") Y = Y.map(Math.log);
  }
  const d = droite(X, Y, kind === "origine");
  if (!d) return null;
  // ln y = ln a + b ln x ; ln y = ln a + b x.
  if (kind === "puissance" || kind === "exponentielle") return { kind, a: Math.exp(d.b), b: d.a, r2: d.r2, n: X.length };
  return { kind, a: d.a, b: d.b, r2: d.r2, n: X.length };
}

export function fitValue(f: FitResult, x: number): number {
  switch (f.kind) {
    case "puissance":
      return f.a * x ** f.b;
    case "exponentielle":
      return f.a * Math.exp(f.b * x);
    case "logarithmique":
      return f.a * Math.log(x) + f.b;
    case "polynome":
      return (f.coefs ?? []).reduceRight((s, c) => s * x + c, 0);
    default:
      return f.a * x + f.b;
  }
}

/**
 * Points de la courbe sur l'étendue des x donnés : deux pour une droite en échelle
 * linéaire, sinon un échantillonnage régulier (géométrique si l'axe des x est log).
 */
export function fitPoints(f: FitResult, x: number[], xLog: boolean, yLog: boolean): [number, number][] {
  const positifs = xLog || f.kind === "puissance" || f.kind === "logarithmique";
  const xs = positifs ? x.filter((v) => v > 0) : x.filter(Number.isFinite);
  if (xs.length === 0) return [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const straight = (f.kind === "lineaire" || f.kind === "origine") && !xLog && !yLog;
  const k = straight ? 1 : f.kind === "polynome" ? 120 : 60;
  const out: [number, number][] = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const xv = xLog ? x0 * (x1 / x0) ** t : x0 + (x1 - x0) * t;
    const yv = fitValue(f, xv);
    if (Number.isFinite(yv) && (!yLog || yv > 0)) out.push([xv, yv]);
  }
  return out;
}

/** Nombre en TeX à 4 chiffres significatifs, virgule décimale, puissance de 10 si besoin. */
export function texNumber(v: number, digits = 4): string {
  if (v === 0 || !Number.isFinite(v)) return "0";
  const e = Math.floor(Math.log10(Math.abs(v)));
  const dec = (m: number) => {
    return Number(m.toPrecision(digits)).toString().replace(".", "{,}");
  };
  if (e >= 5 || e <= -3) {
    let m = v / 10 ** e;
    let ee = e;
    if (Math.abs(Number(m.toPrecision(digits))) >= 10) {
      m /= 10;
      ee += 1;
    }
    return `${dec(m)} \\times 10^{${ee}}`;
  }
  return dec(v);
}

/** « + 4{,}5 » / « - 4{,}5 » : terme suivant d'une somme. */
const terme = (v: number) => (v < 0 ? ` - ${texNumber(-v)}` : ` + ${texNumber(v)}`);

/** Équation affichée : « $y = 1{,}23\,x + 4{,}5 \quad R^2 = 0{,}998$ ». */
export function fitLabel(f: FitResult): string {
  let eq: string;
  switch (f.kind) {
    case "puissance":
      eq = `y = ${texNumber(f.a)}\\,x^{${texNumber(f.b)}}`;
      break;
    case "exponentielle":
      eq = `y = ${texNumber(f.a)}\\,e^{${texNumber(f.b)}\\,x}`;
      break;
    case "logarithmique":
      eq = `y = ${texNumber(f.a)}\\,\\ln x${f.b !== 0 ? terme(f.b) : ""}`;
      break;
    case "polynome": {
      const c = f.coefs ?? [];
      const puissance = (k: number) => (k === 0 ? "" : k === 1 ? "\\,x" : `\\,x^{${k}}`);
      // Un terme qui ne pèse rien sur la plage des x (1e−10 du plus gros) est du bruit d'arrondi.
      const e = f.xAbsMax || 1;
      const poids = c.map((v, k) => Math.abs(v) * e ** k);
      const seuil = 1e-10 * Math.max(...poids);
      const termes = c.map((v, k) => [v, k] as const).reverse().filter(([v, k]) => v !== 0 && poids[k]! > seuil);
      eq = "y = " + (termes.length ? termes.map(([v, k], j) => (j === 0 ? texNumber(v) : terme(v)) + puissance(k)).join("") : "0");
      break;
    }
    default:
      eq = `y = ${texNumber(f.a)}\\,x`;
      if (f.kind === "lineaire" && f.b !== 0) eq += terme(f.b);
  }
  const r2 = Number(f.r2.toFixed(4)).toString().replace(".", "{,}");
  return `$${eq} \\quad R^2 = ${r2}$`;
}

/** Coin des équations : celui choisi, sinon le haut du côté opposé à la légende. */
export function fitCorner(fitPos: LegendPos | undefined, legend: LegendPos): Exclude<LegendPos, "none"> {
  if (fitPos && fitPos !== "none") return fitPos;
  return legend === "north west" ? "north east" : "north west";
}
