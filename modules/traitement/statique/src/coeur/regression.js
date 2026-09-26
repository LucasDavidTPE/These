/**
 * Régression sinusoïdale aux moindres carrés sur la base (sin ωt, cos ωt).
 * C'est le cœur de la feuille « Traitement » du classeur.
 *
 *   F4 = Σ sin²      G4 = Σ cos²      H4 = Σ sin·cos
 *   N4 = Σ a·sin     O4 = Σ a·cos
 *   A  = (N4·G4 − O4·H4) / (F4·G4 − H4²)
 *   B  = (O4·F4 − N4·H4) / (F4·G4 − H4²)
 *   amplitude = √(A² + B²)
 *   phase     = ±ARCCOS(A/amplitude)·180/π      (le signe est celui de B)
 *   indice    = Σ|centré − ajusté| / (nDiv · amplitude) · 100
 *
 * Les trois compteurs sont volontairement distincts, parce que le classeur
 * en utilise trois différents (voir traitement.js) :
 *   nCentre  points du centrage           Excel : I2−1, plafonné à 410
 *   nSomme   points des sommes            Excel : I2,   plafonné à 410
 *   nDiv     diviseur de l'indice         Excel : I2,   NON plafonné
 */

const DEG = 180 / Math.PI;

export const AJUSTEMENT_VIDE = Object.freeze({
  moyenne: NaN, A: NaN, B: NaN, amplitude: NaN, phase: NaN, indice: NaN
});

/**
 * @param {Float64Array} valeurs  signal, à partir de l'indice 0
 * @param {Float64Array} temps    même origine que `valeurs`
 * @param {number} freq           Hz
 */
export function ajusterSinus(valeurs, temps, freq, nSomme, nCentre, nDiv = nSomme) {
  const w = 2 * Math.PI * freq;

  let m = 0;
  for (let i = 0; i < nCentre; i++) m += valeurs[i];
  m /= nCentre;

  let Ss = 0, Sc = 0, Ssc = 0, Sas = 0, Sac = 0;
  for (let i = 0; i < nSomme; i++) {
    const wt = w * temps[i];
    const s = Math.sin(wt), c = Math.cos(wt);
    Ss += s * s; Sc += c * c; Ssc += s * c;
    const a = valeurs[i] - m;
    Sas += a * s; Sac += a * c;
  }
  const det = Ss * Sc - Ssc * Ssc;
  const A = (Sas * Sc - Sac * Ssc) / det;
  const B = (Sac * Ss - Sas * Ssc) / det;
  const amplitude = Math.sqrt(A * A + B * B);
  let phase = Math.acos(A / amplitude) * DEG;
  if (!(B > 0)) phase = -phase;

  const phr = phase / DEG;
  let q = 0;
  for (let i = 0; i < nSomme; i++) {
    q += Math.abs((valeurs[i] - m) - amplitude * Math.sin(w * temps[i] + phr));
  }

  return { moyenne: m, A, B, amplitude, phase, indice: q / (nDiv * amplitude) * 100 };
}
