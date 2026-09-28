/**
 * Exploitation d'un résultat de grille (portage de GridResult et de io.run_case) : extrêmes,
 * déformations principales, coupes, interpolation, signal d'une jauge, CSV au format de
 * numpy.savetxt, synthèse JSON.
 */
import { cleChamp, type ResultatGrille } from "./grille";

export function champ(r: ResultatGrille, comp: string, z: number): Float64Array {
  const c = r.champs.get(cleChamp(comp, z));
  if (!c) throw new Error(`Champ ${comp} à z = ${z} m non calculé.`);
  return c.re;
}

export interface Extremes {
  max: number;
  x_max: number;
  y_max: number;
  min: number;
  x_min: number;
  y_min: number;
}

export function extremes(r: ResultatGrille, f: Float64Array): Extremes {
  const nx = r.x.length;
  let imax = 0,
    imin = 0;
  for (let i = 1; i < f.length; i++) {
    if (f[i]! > f[imax]!) imax = i;
    if (f[i]! < f[imin]!) imin = i;
  }
  return { max: f[imax]!, x_max: r.x[imax % nx]!, y_max: r.y[Math.floor(imax / nx)]!, min: f[imin]!, x_min: r.x[imin % nx]!, y_min: r.y[Math.floor(imin / nx)]! };
}

/** Valeurs propres d'une matrice symétrique 3×3 (croissantes), méthode trigonométrique. */
export function valeursPropres3(a: number, b: number, c: number, d: number, e: number, f: number): [number, number, number] {
  // [[a, d, e], [d, b, f], [e, f, c]]
  const p1 = d * d + e * e + f * f;
  if (p1 === 0) return [a, b, c].sort((u, v) => u - v) as [number, number, number];
  const q = (a + b + c) / 3;
  const p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1;
  const p = Math.sqrt(p2 / 6);
  const B = [(a - q) / p, d / p, e / p, d / p, (b - q) / p, f / p, e / p, f / p, (c - q) / p];
  const detB = B[0]! * (B[4]! * B[8]! - B[5]! * B[7]!) - B[1]! * (B[3]! * B[8]! - B[5]! * B[6]!) + B[2]! * (B[3]! * B[7]! - B[4]! * B[6]!);
  const rr = Math.min(1, Math.max(-1, detB / 2));
  const phi = Math.acos(rr) / 3;
  const l1 = q + 2 * p * Math.cos(phi);
  const l3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  const l2 = 3 * q - l1 - l3;
  return [l3, l2, l1];
}

/** Plus grande déformation principale ε1 en chaque point (champs réels). */
export function deformationPrincipale(r: ResultatGrille, z: number): Float64Array {
  const g = (c: string) => champ(r, c, z);
  const [exx, eyy, ezz, exy, exz, eyz] = ["exx", "eyy", "ezz", "exy", "exz", "eyz"].map(g) as Float64Array[];
  const out = new Float64Array(exx!.length);
  for (let i = 0; i < out.length; i++) out[i] = valeursPropres3(exx![i]!, eyy![i]!, ezz![i]!, exy![i]!, exz![i]!, eyz![i]!)[2];
  return out;
}

const plusProche = (a: Float64Array, v: number) => {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (Math.abs(a[i]! - v) < Math.abs(a[k]! - v)) k = i;
  return k;
};

/** Coupe selon x en y = y0 (nœud le plus proche). */
export function coupeX(r: ResultatGrille, f: Float64Array, y0: number): { x: Float64Array; v: Float64Array } {
  const j = plusProche(r.y, y0),
    nx = r.x.length;
  return { x: r.x, v: f.slice(j * nx, (j + 1) * nx) };
}

export function coupeY(r: ResultatGrille, f: Float64Array, x0: number): { y: Float64Array; v: Float64Array } {
  const i = plusProche(r.x, x0),
    nx = r.x.length;
  return { y: r.y, v: Float64Array.from(r.y, (_, j) => f[j * nx + i]!) };
}

/** Interpolation bilinéaire (NaN hors grille). */
export function interpoler(r: ResultatGrille, f: Float64Array, x: number, y: number): number {
  const nx = r.x.length,
    ny = r.y.length;
  const fx = (x - r.x[0]!) / (r.x[1]! - r.x[0]!),
    fy = (y - r.y[0]!) / (r.y[1]! - r.y[0]!);
  if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return NaN;
  const i = Math.min(nx - 2, Math.floor(fx)),
    j = Math.min(ny - 2, Math.floor(fy));
  const tx = fx - i,
    ty = fy - j;
  const v = (jj: number, ii: number) => f[jj * nx + ii]!;
  return (1 - ty) * ((1 - tx) * v(j, i) + tx * v(j, i + 1)) + ty * ((1 - tx) * v(j + 1, i) + tx * v(j + 1, i + 1));
}

/** Signal vu par une jauge fixe (x, y) sous une charge roulante à la vitesse V : t = (x − X)/V. */
export function signalJauge(r: ResultatGrille, f: Float64Array, xj: number, yj: number, V: number): { t: number[]; v: number[] } {
  const { x, v } = coupeX(r, f, yj);
  const pts = Array.from(x, (X, i) => [(xj - X) / V, v[i]!] as [number, number]).sort((a, b) => a[0] - b[0]);
  return { t: pts.map((p) => p[0]), v: pts.map((p) => p[1]) };
}

/* ─────────────────────────── écriture ─────────────────────────── */

/** Nombre au format %.6e de numpy (« 1.234560e-04 », « nan »). */
export function e6(v: number): string {
  if (Number.isNaN(v)) return "nan";
  if (!Number.isFinite(v)) return v > 0 ? "inf" : "-inf";
  const [m, ex] = v.toExponential(6).split("e");
  const n = Number(ex);
  return `${m}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
}

/** CSV d'un champ comme io.run_case : 1re ligne x (précédée de nan), 1re colonne y, « ; ». */
export function csvChamp(r: ResultatGrille, comp: string, z: number): string {
  const f = champ(r, comp, z),
    nx = r.x.length;
  const lignes = [`# ${comp} (SI) a z = ${z} m ; 1re ligne : x (m) ; 1re colonne : y (m)`, ["nan", ...Array.from(r.x, e6)].join(";")];
  for (let j = 0; j < r.y.length; j++) lignes.push([e6(r.y[j]!), ...Array.from(f.slice(j * nx, (j + 1) * nx), e6)].join(";"));
  return lignes.join("\n") + "\n";
}

export function synthese(r: ResultatGrille): { meta: Record<string, unknown>; extremes: Record<string, Partial<Extremes>> } {
  const ext: Record<string, Partial<Extremes>> = {};
  for (const { comp, z } of r.cles) ext[`${comp}@z=${z}`] = extremes(r, champ(r, comp, z));
  const toutes = ["exx", "eyy", "ezz", "exy", "exz", "eyz"];
  const zs = [...new Set(r.cles.map((c) => c.z))];
  const reels = [...r.champs.values()].every((c) => c.im === null);
  if (reels && toutes.every((c) => r.cles.some((k) => k.comp === c))) {
    for (const z of zs) {
      const e = extremes(r, deformationPrincipale(r, z));
      ext[`e1@z=${z}`] = { max: e.max, x_max: e.x_max, y_max: e.y_max };
    }
  }
  return { meta: { ...r.meta }, extremes: ext };
}
