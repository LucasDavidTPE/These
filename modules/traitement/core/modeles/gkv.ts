/**
 * Kelvin-Voigt généralisé — discrétisation d'un modèle continu en une chaîne de n corps,
 * expression asymptotique du modèle DBN en domaine linéaire (portage de gkv.js).
 *
 *   J*(ω) = 1/E∞ + Σᵢ 1 / (Eᵢ + iωηᵢ)      puis      E* = 1/J*
 *
 * L'identification reprend exactement la feuille « Calibration GKV model » du classeur
 * 2S2P1D.xls, y compris ses deux fonctions VBA :
 *
 *   Tuan(E∞, E, τ, f)  = 1/E∞ + Σ_{j<i} 1 / (Eⱼ·(1 + (2πf·τⱼ)²))
 *   Orion(E∞, E, τ, f) =        Σ_{j<i} (2πf·τⱼ) / (Eⱼ·(1 + (2πf·τⱼ)²))
 *
 * qui ne sont rien d'autre que les parties réelle et imaginaire de la souplesse déjà placée
 * par les corps précédents. À chaque étape, le corps i est calé sur la souplesse qui reste
 * à couvrir à sa fréquence caractéristique fᵢ :
 *
 *   Mᵢ = 1 / [ (Re(1/E*) − Tuan) · (1 + (2πfᵢτᵢ)²) ]
 *   Nᵢ = 1 / [ (−Im(1/E*) − Orion) · (1 + (2πfᵢτᵢ)²) ]
 *   Eᵢ = √(Mᵢ² + Nᵢ²) / √2
 *
 * et le dernier corps referme la souplesse totale sur 1/E00.
 *
 * TIOUAJNI S., DI BENEDETTO H., SAUZÉAT C. & POUGET S., « Approximation of linear
 * viscoelastic model by Generalized Kelvin-Voigt or Generalized Maxwell models », Road
 * Materials and Pavement Design, vol. 12, n° 4, p. 897-930, 2011.
 */
import type { ChaineGKV, Complexe, Constantes, Modele } from "./type";

const DEG = 180 / Math.PI;

/** Identifie la chaîne à partir d'un modèle source déjà calé. */
export function identifierGKV(source: Modele, p: Constantes, o: { nElements?: number; fMin?: number; fMax?: number; affiner?: boolean } = {}): ChaineGKV {
  const n = Math.max(1, Math.min(200, o.nElements ?? 25));
  const fMax = o.fMax ?? 1e14;
  const fMin = o.fMin ?? 1.5e-5;
  const Einf = p.E0!; // module vitreux : le ressort en tête de chaîne
  const E00 = p.E00!; // module statique : ce que la chaîne doit atteindre

  const ratio = 10 ** (Math.log10(fMax / fMin) / n);
  const E: number[] = [],
    tau: number[] = [];
  let inverseCumule = 1 / Einf; // Σ 1/Eⱼ, ressort compris (colonne E du classeur)

  let f = fMax;
  for (let i = 1; i <= n; i++) {
    f = f / ratio;
    const ti = 1 / (2 * Math.PI * f);
    const w = 2 * Math.PI * f;

    // souplesse déjà placée par le ressort et les corps 1..i−1
    let tuan = 1 / Einf,
      orion = 0;
    for (let j = 0; j < E.length; j++) {
      const wt = w * tau[j]!;
      const den = E[j]! * (1 + wt * wt);
      tuan += 1 / den;
      orion += wt / den;
    }

    const cible = source.module!(f, p);
    const w2 = cible.norme * cible.norme;
    const reJ = cible.re / w2; // Re(1/E*)
    const imJ = cible.im / w2; // −Im(1/E*), comme dans le classeur
    const facteur = 1 + (w * ti) ** 2;
    const M = 1 / ((reJ - tuan) * facteur);
    const N = 1 / ((imJ - orion) * facteur);

    let Ei = Math.sqrt(M * M + N * N) / Math.SQRT2;
    if (i === n) {
      const reste = 1 / (1 / E00 - inverseCumule);
      if (reste > 0 && Number.isFinite(reste)) Ei = reste;
    }
    if (!Number.isFinite(Ei) || Ei <= 0) Ei = Math.abs(M) || 1;

    E.push(Ei);
    tau.push(ti);
    inverseCumule += 1 / Ei;
  }

  const chaine: ChaineGKV = { E, tau, Einf, eta: E.map((e, i) => e * tau[i]!) };
  return o.affiner === false ? chaine : affiner(chaine, source, p, fMin, fMax);
}

/**
 * Affinage des souplesses par moindres carrés sous contrainte de positivité.
 *
 * L'identification séquentielle ci-dessus est celle du classeur : chaque corps est calé sur
 * ce que les précédents laissent, sans jamais y revenir. L'erreur s'y accumule, au point
 * d'augmenter quand on ajoute des corps au lieu de diminuer. Or les souplesses 1/Eᵢ entrent
 * LINÉAIREMENT dans J*(ω) :
 *
 *   Re J = 1/E∞ + Σ Jᵢ / (1 + ω²τᵢ²)
 *  −Im J =        Σ Jᵢ ωτᵢ / (1 + ω²τᵢ²)
 *
 * Les temps τᵢ étant fixés par la grille, il ne reste qu'un système linéaire que l'on résout
 * par descente par coordonnées en projetant sur Jᵢ ≥ 0 — une série de Prony au sens propre.
 * Le germe séquentiel sert de point de départ.
 */
function affiner(chaine: ChaineGKV, source: Modele, p: Constantes, fMin: number, fMax: number): ChaineGKV {
  const { tau, Einf } = chaine;
  const n = tau.length;

  // points d'évaluation : douze par décade, plafonnés
  const decades = Math.log10(fMax / fMin);
  const m = Math.min(400, Math.max(40, Math.round(decades * 12)));
  const A: Float64Array[] = [],
    b: number[] = [],
    poids: number[] = [];
  for (let q = 0; q < m; q++) {
    const f = fMin * 10 ** ((decades * q) / (m - 1));
    const w = 2 * Math.PI * f;
    const cible = source.module!(f, p);
    const j2 = cible.norme * cible.norme;
    const reJ = cible.re / j2,
      imJ = cible.im / j2;
    const echelle = 1 / Math.hypot(reJ, imJ); // erreur relative sur la souplesse
    const lr = new Float64Array(n),
      li = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const wt = w * tau[i]!,
        d = 1 + wt * wt;
      lr[i] = 1 / d;
      li[i] = wt / d;
    }
    A.push(lr, li);
    b.push((reJ - 1 / Einf) * 1, imJ);
    poids.push(echelle, echelle);
  }

  // équations normales pondérées
  const G = Array.from({ length: n }, () => new Float64Array(n));
  const c = new Float64Array(n);
  for (let q = 0; q < A.length; q++) {
    const w2 = poids[q]! * poids[q]!,
      ligne = A[q]!,
      bq = b[q]!;
    for (let i = 0; i < n; i++) {
      if (ligne[i] === 0) continue;
      c[i]! += w2 * ligne[i]! * bq;
      const gi = G[i]!;
      for (let j = 0; j < n; j++) gi[j]! += w2 * ligne[i]! * ligne[j]!;
    }
  }
  // légère régularisation : évite les souplesses qui se compensent deux à deux
  const trace = G.reduce((s, g, i) => s + g[i]!, 0) / n;
  for (let i = 0; i < n; i++) G[i]![i]! += 1e-7 * trace;

  const J = chaine.E.map((e) => (Number.isFinite(e) && e > 0 ? 1 / e : 0));
  for (let it = 0; it < 600; it++) {
    let bouge = 0;
    for (let i = 0; i < n; i++) {
      let s = c[i]!;
      const gi = G[i]!;
      for (let j = 0; j < n; j++) if (j !== i) s -= gi[j]! * J[j]!;
      const v = Math.max(0, s / gi[i]!);
      bouge = Math.max(bouge, Math.abs(v - J[i]!));
      J[i] = v;
    }
    if (bouge < 1e-18) break;
  }

  const E = J.map((j) => (j > 0 ? 1 / j : Infinity));
  return { E, tau, Einf, eta: E.map((e, i) => e * tau[i]!), affine: true };
}

export function moduleGKV(f: number, chaine: ChaineGKV): Complexe {
  const w = 2 * Math.PI * f;
  let jr = 1 / chaine.Einf,
    ji = 0;
  for (let i = 0; i < chaine.E.length; i++) {
    const wt = w * chaine.tau[i]!;
    const den = chaine.E[i]! * (1 + wt * wt);
    jr += 1 / den;
    ji -= wt / den;
  }
  const d = jr * jr + ji * ji;
  const re = jr / d,
    im = -ji / d;
  return { re, im, norme: Math.hypot(re, im), phase: Math.atan(im / re) * DEG };
}

const gkv: Modele = {
  id: "gkv",
  nom: "Kelvin-Voigt généralisé",
  resume: "Chaîne de n corps identifiée sur un modèle continu déjà calé — expression asymptotique du DBN.",
  reference: "Tiouajni, Di Benedetto, Sauzéat & Pouget, RMPD 2011",
  derive: true, // ne se cale pas sur les points, il découle d'un autre modèle
  parametres: [
    { cle: "nElements", label: "n corps", min: 1, max: 100, pas: 1, groupe: "module" },
    { cle: "fMin", label: "f min", unite: "Hz", min: -8, max: 0, pas: 0.1, log: true, groupe: "module" },
    { cle: "fMax", label: "f max", unite: "Hz", min: 2, max: 16, pas: 0.1, log: true, groupe: "module" },
  ],
  defauts: { nElements: 25, fMin: 1.5e-5, fMax: 1e14 },
  bornes: { nElements: [1, 100], fMin: [1e-10, 1], fMax: [1, 1e18] },
  ajustables: [],
  ajustablesPoisson: [],
  identifier: identifierGKV,
  moduleChaine: moduleGKV,
};

export default gkv;
