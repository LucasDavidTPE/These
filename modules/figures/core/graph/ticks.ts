/**
 * Bornes et graduations « rondes », partagées par l'export SVG et pgfplots (les deux
 * reçoivent exactement les mêmes valeurs et les mêmes libellés).
 */

export interface AxisScale {
  min: number;
  max: number;
  ticks: number[];
  /** Libellés en notation LaTeX/texte, virgule décimale. */
  labels: string[];
  log: boolean;
}

/** Pas « rond » : 1, 2, 2,5 ou 5 × 10^k, pour environ `target` intervalles. */
export function niceStep(range: number, target = 5): number {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const f = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return f * p;
}

function decimals(step: number): number {
  for (let d = 0; d <= 10; d++) if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-9 * 10 ** d) return d;
  return 10;
}

/** « 12 500,5 » : virgule décimale, espace fine entre milliers (≥ 10 000 ou avec un pair ≥ 1 000). */
export function formatTick(v: number, dec: number, thousands: boolean): string {
  const fixed = (Math.abs(v) < 10 ** -(dec + 1) ? 0 : v).toFixed(dec);
  const [int, frac] = fixed.replace("-", "").split(".");
  const grouped = thousands ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : int!;
  return (v < 0 && Number(fixed) !== 0 ? "−" : "") + grouped + (frac ? `,${frac}` : "");
}

export function linearScale(dataMin: number, dataMax: number, fixed: { min?: number; max?: number } = {}, target = 5): AxisScale {
  let lo = fixed.min ?? dataMin;
  let hi = fixed.max ?? dataMax;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1];
  if (hi - lo < 1e-12) {
    const pad = Math.abs(lo) > 0 ? Math.abs(lo) * 0.1 : 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep(hi - lo, target);
  const min = fixed.min ?? Math.floor(lo / step + 1e-9) * step;
  const max = fixed.max ?? Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step - 1e-9) * step; t <= max + step * 1e-9; t += step) ticks.push(Math.round(t / step) * step);
  const dec = decimals(step);
  const thousands = ticks.some((t) => Math.abs(t) >= 10000);
  return { min, max, ticks, labels: ticks.map((t) => formatTick(t, dec, thousands)), log: false };
}

export function logScale(dataMin: number, dataMax: number, fixed: { min?: number; max?: number } = {}): AxisScale {
  const lo = fixed.min ?? dataMin;
  const hi = fixed.max ?? dataMax;
  if (!(lo > 0) || !(hi > 0)) throw new RangeError("Échelle logarithmique : valeurs strictement positives requises.");
  let k0 = Math.floor(Math.log10(lo) + 1e-9);
  let k1 = Math.ceil(Math.log10(hi) - 1e-9);
  if (k1 === k0) k1 = k0 + 1;
  const min = fixed.min ?? 10 ** k0;
  const max = fixed.max ?? 10 ** k1;
  k0 = Math.ceil(Math.log10(min) - 1e-9);
  k1 = Math.floor(Math.log10(max) + 1e-9);
  const ticks: number[] = [];
  const labels: string[] = [];
  for (let k = k0; k <= k1; k++) {
    ticks.push(10 ** k);
    labels.push(`$10^{${k}}$`);
  }
  return { min, max, ticks, labels, log: true };
}

/** Position relative (0 à 1) d'une valeur sur l'axe. */
export function project(s: AxisScale, v: number): number {
  if (s.log) return (Math.log10(v) - Math.log10(s.min)) / (Math.log10(s.max) - Math.log10(s.min));
  return (v - s.min) / (s.max - s.min);
}
