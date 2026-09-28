/**
 * Modèles rhéologiques élémentaires, à ressorts et amortisseurs linéaires : Maxwell,
 * Kelvin-Voigt, Zener (solide linéaire standard) et Burgers. Trop pauvres pour un enrobé
 * sur toute la plage de fréquences, ils servent de repère, d'exercice ou de point de départ
 * (un seul temps de relaxation), et se calent avec les mêmes boutons que le 2S2P1D.
 *
 * Les temps caractéristiques (τ = η/E) plutôt que les viscosités : ce sont eux que la
 * translation temps-température déplace (changement de Tref).
 */
import type { Complexe, ModeleCale, Parametre } from "./type";

const DEG = 180 / Math.PI;

function complexe(re: number, im: number): Complexe {
  return { re, im, norme: Math.hypot(re, im), phase: Math.atan2(im, re) * DEG };
}

/** E* = 1/J* */
function inverse(jr: number, ji: number): Complexe {
  const d = jr * jr + ji * ji;
  return complexe(jr / d, -ji / d);
}

/** Branche de Maxwell (ressort E, temps τ) : E·iωτ / (1 + iωτ). */
function maxwell(w: number, E: number, tau: number): [number, number] {
  const x = w * tau,
    d = 1 + x * x;
  return [(E * x * x) / d, (E * x) / d];
}

/*
 * Clés propres à chaque modèle (EM, tauM…) : un τ de Maxwell n'a pas le sens du τE du
 * 2S2P1D, et caler un modèle élémentaire ne doit pas abîmer le calage 2S2P1D gardé à côté.
 */
const module = (cle: string, label: string, max = 60000, min = 100): Parametre => ({ cle, label, unite: "MPa", min, max, pas: 10, groupe: "module" });
const temps = (cle: string, label = "τ"): Parametre => ({ cle, label, unite: "s", min: -12, max: 6, pas: 0.01, log: true, temps: true, groupe: "module" });

export const mMaxwell: ModeleCale = {
  id: "maxwell",
  nom: "Maxwell",
  resume: "Ressort E0 et amortisseur η = E0·τ en série : un liquide, qui s'écoule sous charge constante.",
  reference: "Maxwell 1867",
  parametres: [module("EM", "E0"), temps("tauM")],
  defauts: { EM: 30000, tauM: 1e-3 },
  bornes: { EM: [1, 1e6], tauM: [1e-14, 1e8] },
  ajustables: ["EM", "tauM"],
  ajustablesPoisson: [],
  elementaire: true,
  module: (f, p) => complexe(...maxwell(2 * Math.PI * f, p.EM!, p.tauM!)),
};

export const mKelvinVoigt: ModeleCale = {
  id: "kelvin-voigt",
  nom: "Kelvin-Voigt",
  resume: "Ressort E00 et amortisseur η = E00·τ en parallèle : un solide sans élasticité instantanée.",
  reference: "Kelvin 1865 · Voigt 1892",
  parametres: [module("EKV", "E00", 60000, 0), temps("tauKV")],
  defauts: { EKV: 5000, tauKV: 1e-3 },
  bornes: { EKV: [1e-3, 1e6], tauKV: [1e-14, 1e8] },
  ajustables: ["EKV", "tauKV"],
  ajustablesPoisson: [],
  elementaire: true,
  module: (f, p) => complexe(p.EKV!, p.EKV! * 2 * Math.PI * f * p.tauKV!),
};

export const mZener: ModeleCale = {
  id: "zener",
  nom: "Zener",
  resume: "Solide linéaire standard : ressort E00 en parallèle d'une branche de Maxwell (E0 − E00, τ). Un seul temps de relaxation.",
  reference: "Zener 1948",
  parametres: [module("EZ00", "E00", 5000, 0), module("EZ0", "E0"), temps("tauZ")],
  defauts: { EZ00: 100, EZ0: 30000, tauZ: 1e-3 },
  bornes: { EZ00: [0, 1e5], EZ0: [1, 1e6], tauZ: [1e-14, 1e8] },
  ajustables: ["EZ00", "EZ0", "tauZ"],
  ajustablesPoisson: [],
  elementaire: true,
  module: (f, p) => {
    const [re, im] = maxwell(2 * Math.PI * f, p.EZ0! - p.EZ00!, p.tauZ!);
    return complexe(p.EZ00! + re, im);
  },
};

export const mBurgers: ModeleCale = {
  id: "burgers",
  nom: "Burgers",
  resume: "Maxwell (E1, η1 = E1·τ1) en série avec Kelvin-Voigt (E2, η2 = E2·τ2) : fluage instantané, retardé puis visqueux.",
  reference: "Burgers 1935",
  parametres: [module("EB1", "E1"), temps("tauB1", "τ1"), module("EB2", "E2", 60000, 10), temps("tauB2", "τ2")],
  defauts: { EB1: 30000, tauB1: 10, EB2: 5000, tauB2: 1e-2 },
  bornes: { EB1: [1, 1e6], tauB1: [1e-14, 1e10], EB2: [1e-3, 1e6], tauB2: [1e-14, 1e10] },
  ajustables: ["EB1", "tauB1", "EB2", "tauB2"],
  ajustablesPoisson: [],
  elementaire: true,
  module: (f, p) => {
    // J* = 1/E1 + 1/(iωη1) + 1/(E2·(1 + iωτ2))
    const w = 2 * Math.PI * f;
    const x = w * p.tauB2!,
      d = p.EB2! * (1 + x * x);
    return inverse(1 / p.EB1! + 1 / d, -1 / (w * p.EB1! * p.tauB1!) - x / d);
  },
};
