/**
 * Petites fonctions numériques partagées.
 * Aucune ne doit allouer : elles tournent sur des centaines de milliers
 * de points.
 */

/** Excel : =SI(x>180 ; x-360 ; SI(x<-180 ; x+360 ; x)) */
export function recentrer180(x) {
  if (x > 180) return x - 360;
  if (x < -180) return x + 360;
  return x;
}

export function moyenne(a, n = a.length) {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i];
  return s / n;
}

/** ECARTYPE d'Excel : écart-type d'échantillon, dénominateur n−1. */
export function ecartType(a) {
  const n = a.length;
  if (n < 2) return NaN;
  const m = moyenne(a);
  let s = 0;
  for (let i = 0; i < n; i++) { const d = a[i] - m; s += d * d; }
  return Math.sqrt(s / (n - 1));
}

// Math.min.apply sur un tableau de 250 000 valeurs dépasse la pile d'appel :
// ces deux fonctions existent pour ne jamais avoir à le faire.
export function minimum(a, f) {
  let m = Infinity;
  for (let i = 0; i < a.length; i++) { const v = f ? f(a[i]) : a[i]; if (v < m) m = v; }
  return m;
}
export function maximum(a, f) {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = f ? f(a[i]) : a[i]; if (v > m) m = v; }
  return m;
}

export function aplatir(tableaux) {
  const o = [];
  for (const t of tableaux) for (const v of t) o.push(v);
  return o;
}

export function uniques(a) {
  return a.filter((v, i, s) => s.indexOf(v) === i).sort((x, y) => x - y);
}

/**
 * Conversion permissive : accepte le nombre déjà typé, la virgule décimale
 * française, les espaces fines des exports machine.
 */
export function nombre(v) {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/[\s  ]/g, '').replace(',', '.');
  const x = parseFloat(s);
  return Number.isNaN(x) ? NaN : x;
}
