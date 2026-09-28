/**
 * Droite de régression (moindres carrés) sur un domaine d'abscisses : pente, ordonnée à
 * l'origine et coefficient de détermination. Sert à lire une vitesse sur une plage choisie
 * (refroidissement d'un TSRST en °C/h, montée de la contrainte…).
 */

export interface Droite {
  pente: number;
  ordonnee: number;
  r2: number;
  /** Nombre de points utilisés. */
  n: number;
  /** Domaine réellement couvert par les points. */
  x0: number;
  x1: number;
}

/** Régression de y sur x pour x ∈ [de, a] (points non finis ignorés) ; null s'il reste moins de deux points. */
export function regressionLineaire(x: readonly number[], y: readonly number[], de = -Infinity, a = Infinity): Droite | null {
  const [lo, hi] = de <= a ? [de, a] : [a, de];
  let n = 0,
    sx = 0,
    sy = 0,
    x0 = Infinity,
    x1 = -Infinity;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!,
      yi = y[i]!;
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || xi < lo || xi > hi) continue;
    n++;
    sx += xi;
    sy += yi;
    if (xi < x0) x0 = xi;
    if (xi > x1) x1 = xi;
  }
  if (n < 2) return null;
  const mx = sx / n,
    my = sy / n;
  let sxx = 0,
    sxy = 0,
    syy = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!,
      yi = y[i]!;
    if (!Number.isFinite(xi) || !Number.isFinite(yi) || xi < lo || xi > hi) continue;
    sxx += (xi - mx) ** 2;
    sxy += (xi - mx) * (yi - my);
    syy += (yi - my) ** 2;
  }
  if (sxx === 0) return null;
  const pente = sxy / sxx;
  return { pente, ordonnee: my - pente * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy), n, x0, x1 };
}
