/** Nombres à l'écran : 4 chiffres significatifs, virgule décimale. */
export function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = a !== 0 && (a >= 1e5 || a < 1e-3) ? v.toExponential(3) : String(Number(v.toPrecision(4)));
  return s.replace(".", ",");
}

/** Lecture d'un nombre saisi (virgule ou point décimal) ; null si vide ou illisible. */
export function lireNombre(t: string): number | null {
  const v = Number(t.trim().replace(/\s/g, "").replace(",", "."));
  return t.trim() === "" || !Number.isFinite(v) ? null : v;
}

/** Coordonnée d'un axe, arrondie à 1/10 000 de l'échelle de l'axe (−1,3e-5 sur un axe de 200 : 0). */
export function fmtAxe(v: number, echelle: number): string {
  const q = 10 ** (Math.floor(Math.log10(Math.abs(echelle) || 1)) - 4);
  return fmt(Math.round(v / q) * q);
}
