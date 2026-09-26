/**
 * Formatage numérique déterministe pour les exports (SVG, TikZ, pgfplots).
 *
 * Même nombre → même chaîne, octet pour octet, quelle que soit la machine :
 * arrondi à `decimals` décimales (2 par défaut, cf. CLAUDE.md), point décimal,
 * pas de zéros inutiles, jamais de « -0 » ni de notation exponentielle.
 */
/** Au-delà, toFixed() passe en notation exponentielle et la précision n'a plus de sens. */
const MAX_ABS = 1e15;

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Nombre non fini impossible à exporter : ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new RangeError(`Nombre de décimales invalide : ${decimals}`);
  }
  if (Math.abs(value) >= MAX_ABS) {
    throw new RangeError(`Valeur trop grande pour un export lisible : ${value}`);
  }
  const factor = 10 ** decimals;
  // Arrondi « au plus proche, moitié en s'éloignant de zéro », symétrique autour de 0.
  // toPrecision(15) absorbe le bruit binaire (1.005 × 100 = 100.49999999999999).
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const rounded = (Math.sign(value) * Math.round(scaled)) / factor;
  if (rounded === 0) return "0";
  return rounded.toFixed(decimals).replace(/\.?0+$/, "");
}
