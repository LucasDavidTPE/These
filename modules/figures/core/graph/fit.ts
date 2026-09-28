/**
 * Régression d'une série (moindres carrés) : droite, droite par l'origine ou loi puissance
 * (droite en log-log). La courbe et son équation sont tracées sur le graphe, en SVG comme
 * en pgfplots, à partir des mêmes points échantillonnés.
 */
import type { LegendPos } from "./model";

export type FitKind = "lineaire" | "origine" | "puissance";
export const FIT_KINDS: FitKind[] = ["lineaire", "origine", "puissance"];

export interface SeriesFit {
  kind: FitKind;
  /** Équation (et R²) écrite sur la figure. */
  label: boolean;
}

export interface FitResult {
  kind: FitKind;
  /** y = a·x + b (linéaire, origine) ou y = a·x^b (puissance). */
  a: number;
  b: number;
  r2: number;
  n: number;
}

export function parseFit(v: unknown): SeriesFit | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const r = v as Record<string, unknown>;
  if (!FIT_KINDS.includes(r.kind as FitKind)) return undefined;
  return { kind: r.kind as FitKind, label: r.label !== false };
}

/** Coefficients de la régression ; null si les points ne suffisent pas. */
export function fitSeries(x: number[], y: number[], kind: FitKind): FitResult | null {
  let X = x;
  let Y = y;
  if (kind === "puissance") {
    const ok = x.map((v, i) => v > 0 && y[i]! > 0);
    X = x.filter((_, i) => ok[i]).map(Math.log);
    Y = y.filter((_, i) => ok[i]).map(Math.log);
  }
  const n = X.length;
  if (n < (kind === "origine" ? 1 : 2)) return null;
  const mx = X.reduce((s, v) => s + v, 0) / n;
  const my = Y.reduce((s, v) => s + v, 0) / n;
  let a: number;
  let b: number;
  if (kind === "origine") {
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
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  // Loi puissance : ln y = ln a + b ln x.
  return kind === "puissance" ? { kind, a: Math.exp(b), b: a, r2, n } : { kind, a, b, r2, n };
}

export function fitValue(f: FitResult, x: number): number {
  return f.kind === "puissance" ? f.a * x ** f.b : f.a * x + f.b;
}

/**
 * Points de la courbe sur l'étendue des x de la série : deux pour une droite en échelle
 * linéaire, sinon un échantillonnage régulier (géométrique si l'axe des x est log).
 */
export function fitPoints(f: FitResult, x: number[], xLog: boolean, yLog: boolean): [number, number][] {
  const xs = f.kind === "puissance" || xLog ? x.filter((v) => v > 0) : x;
  if (xs.length === 0) return [];
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const straight = f.kind !== "puissance" && !xLog && !yLog;
  const k = straight ? 1 : 60;
  const out: [number, number][] = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const xv = xLog || f.kind === "puissance" ? x0 * (x1 / x0) ** t : x0 + (x1 - x0) * t;
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

/** Équation affichée : « $y = 1{,}23\,x + 4{,}5 \quad R^2 = 0{,}998$ ». */
export function fitLabel(f: FitResult): string {
  let eq: string;
  if (f.kind === "puissance") eq = `y = ${texNumber(f.a)}\\,x^{${texNumber(f.b)}}`;
  else {
    eq = `y = ${texNumber(f.a)}\\,x`;
    if (f.kind === "lineaire" && f.b !== 0) eq += f.b < 0 ? ` - ${texNumber(-f.b)}` : ` + ${texNumber(f.b)}`;
  }
  const r2 = Number(f.r2.toFixed(4)).toString().replace(".", "{,}");
  return `$${eq} \\quad R^2 = ${r2}$`;
}

/** Coin des équations : celui choisi, sinon le haut du côté opposé à la légende. */
export function fitCorner(fitPos: LegendPos | undefined, legend: LegendPos): Exclude<LegendPos, "none"> {
  if (fitPos && fitPos !== "none") return fitPos;
  return legend === "north west" ? "north east" : "north west";
}
