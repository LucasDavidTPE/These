/** Mise en forme française des nombres, unique point de vérité de l'affichage. */

const EXPOSANTS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '+': '' };

export function nb(x, d) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (d === undefined) d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) {
    const [mantisse, exposant] = x.toExponential(2).split('e');
    return mantisse.replace('.', ',') + '·10' +
      exposant.split('').map(c => EXPOSANTS[c] ?? c).join('');
  }
  return x.toFixed(d).replace('.', ',');
}

export function freq(f) {
  return String(f).replace('.', ',');
}

export function entier(n) {
  return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '—';
}

export function duree(ms) {
  return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1).replace('.', ',') + ' s';
}

/** Exposant lisible pour les axes logarithmiques : 10⁻³ plutôt que 1e-3. */
export function puissance(d) {
  const map = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  return '10' + String(Math.round(d)).split('').map(c => map[c] ?? c).join('');
}
