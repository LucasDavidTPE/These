/**
 * Cas de calcul au format JSON de chausspec (io.py) : structure, chargement, régime, grille,
 * sorties. Le même fichier se calcule dans l'application et avec `python -m chausspec cas.json`.
 * Extension de l'application : une carte de pression peut être incluse dans le cas
 * (`x`, `y`, `P`) au lieu d'un fichier CSV voisin.
 */
import { carte, Chargement, creneau, demiEllipse, disque, pairesGaussiennes, ramenerA, rectangle, separable, tabule, type Empreinte, type Profil1D } from "./chargements";
import { deuxS2P1D, elastique, kvg, maxwellGeneralise, type Materiau } from "./materiaux";
import type { Composante, Regime } from "./spectral";
import { Structure, type Fond, type Interface } from "./structure";

/* ─────────────────────────── format ─────────────────────────── */

export type MateriauCas =
  | { type: "elastic"; E: number; nu?: number }
  | {
      type: "2S2P1D";
      E00: number;
      E0: number;
      k: number;
      h: number;
      delta: number;
      tau_ref: number;
      beta?: number | "inf" | null;
      T_ref?: number;
      C1?: number | null;
      C2?: number | null;
      T?: number | null;
      nu?: number;
      nu00?: number | null;
      nu0?: number | null;
    }
  | { type: "KVG"; E0: number; Ei: number[]; taui: number[]; nu?: number }
  | { type: "maxwell"; E_inf: number; Ei: number[]; taui: number[]; nu?: number };

export type ProfilCas =
  | { type: "box"; a: number }
  | { type: "halfellipse"; c: number }
  | { type: "gaussianpairs"; P: number[]; centers: number[]; sig: number[] }
  | { type: "tabulated"; s: number[]; f: number[] };

export type EmpreinteCas = (
  | { type: "rect"; p?: number; lx: number; ly: number }
  | { type: "circle"; p?: number; R: number }
  | { type: "separable"; fx: ProfilCas; fy: ProfilCas; amplitude?: number }
  | { type: "map"; file?: string; delimiter?: string; unit?: number; x?: number[]; y?: number[]; P?: number[][] }
) & { force?: number };

export interface RoueCas {
  x0?: number;
  y0?: number;
  footprint: EmpreinteCas;
  qx?: number | null;
  qy?: number | null;
}

export interface CasJSON {
  _commentaire?: string;
  structure: { bottom?: Fond; interfaces?: Interface[]; layers: { name?: string; h?: number; material: MateriauCas }[] };
  loading: { wheels: RoueCas[] };
  regime?: { type: string; speed?: number; freq?: number };
  grid?: { L?: [number, number]; N?: [number, number]; window?: [number, number, number, number] | null; filter_width?: number };
  outputs?: { dir?: string; depths?: number[]; components?: Composante[]; gauges?: { comp: Composante; z: number; x?: number; y: number }[]; save_fields?: boolean };
}

/* ─────────────────────────── lecture ─────────────────────────── */

export function materiauDe(d: MateriauCas & { name?: string }): Materiau {
  const t = d.type.toLowerCase();
  if (["elastic", "elastique", "élastique"].includes(t)) {
    const m = d as { E: number; nu?: number };
    return elastique(m.E, m.nu ?? 0.35);
  }
  if (t === "2s2p1d") {
    const m = d as Extract<MateriauCas, { type: "2S2P1D" }>;
    const beta = m.beta === undefined || m.beta === null || m.beta === "inf" || (m.beta as unknown) === "infini" ? Infinity : Number(m.beta);
    return deuxS2P1D({ ...m, beta });
  }
  if (["kvg", "kelvin-voigt", "generalizedkelvinvoigt"].includes(t)) {
    const m = d as Extract<MateriauCas, { type: "KVG" }>;
    return kvg(m.E0, m.Ei, m.taui, m.nu ?? 0.35);
  }
  if (["maxwell", "prony", "generalizedmaxwell"].includes(t)) {
    const m = d as Extract<MateriauCas, { type: "maxwell" }>;
    return maxwellGeneralise(m.E_inf, m.Ei, m.taui, m.nu ?? 0.35);
  }
  throw new Error(`Type de matériau inconnu : ${d.type}`);
}

function profilDe(d: ProfilCas): Profil1D {
  const t = d.type.toLowerCase();
  if (t === "box") return creneau((d as { a: number }).a);
  if (t === "halfellipse" || t === "demi-ellipse") return demiEllipse((d as { c: number }).c);
  if (t === "gaussianpairs" || t === "gaussiennes") {
    const g = d as Extract<ProfilCas, { type: "gaussianpairs" }>;
    return pairesGaussiennes(g.P, g.centers, g.sig);
  }
  if (t === "tabulated" || t === "tabule") {
    const g = d as Extract<ProfilCas, { type: "tabulated" }>;
    return tabule(g.s, g.f);
  }
  throw new Error(`Profil inconnu : ${d.type}`);
}

/** Carte CSV (numpy.loadtxt) : 1re ligne x (1re case ignorée), 1re colonne y. */
export function lireCarteCSV(texte: string, sep = ";"): { x: number[]; y: number[]; P: number[][] } {
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const nombres = lignes.map((l) => l.split(sep).map((v) => Number(v.trim().replace(",", sep === ";" ? "." : ","))));
  if (nombres.length < 2) throw new Error("Carte de pression : au moins une ligne d'en-tête (x) et une ligne de valeurs.");
  const x = nombres[0]!.slice(1);
  const y = nombres.slice(1).map((l) => l[0]!);
  const P = nombres.slice(1).map((l) => l.slice(1));
  if ([...x, ...y, ...P.flat()].some((v) => !Number.isFinite(v))) throw new Error("Carte de pression : valeur non numérique.");
  return { x, y, P };
}

export function empreinteDe(d: EmpreinteCas, lireFichier?: (nom: string) => string): Empreinte {
  const t = d.type.toLowerCase();
  let e: Empreinte;
  if (t === "rect" || t === "rectangle") {
    const r = d as { p?: number; lx: number; ly: number };
    e = rectangle(r.p ?? 1, r.lx, r.ly);
  } else if (t === "circle" || t === "cercle" || t === "disque") {
    const r = d as { p?: number; R: number };
    e = disque(r.p ?? 1, r.R);
  } else if (t === "separable" || t === "séparable") {
    const r = d as Extract<EmpreinteCas, { type: "separable" }>;
    e = separable(profilDe(r.fx), profilDe(r.fy), r.amplitude ?? 1);
  } else if (t === "map" || t === "carte") {
    const r = d as Extract<EmpreinteCas, { type: "map" }>;
    let c: { x: number[]; y: number[]; P: number[][] };
    if (r.P && r.x && r.y) c = { x: r.x, y: r.y, P: r.P };
    else if (r.file && lireFichier) c = lireCarteCSV(lireFichier(r.file), r.delimiter ?? ";");
    else throw new Error(`Carte de pression « ${r.file ?? "?"} » : fichier introuvable (l'inclure dans le cas ou le placer à côté).`);
    const u = r.unit ?? 1;
    e = carte(c.x, c.y, u === 1 ? c.P : c.P.map((l) => l.map((v) => v * u)));
  } else throw new Error(`Empreinte inconnue : ${d.type}`);
  return d.force !== undefined ? ramenerA(e, d.force) : e;
}

export function regimeDe(r: CasJSON["regime"]): Regime {
  const t = (r?.type ?? "static").toLowerCase();
  if (t === "static" || t === "statique") return { type: "static" };
  if (["moving", "roulant", "charge_roulante"].includes(t)) return { type: "moving", speed: Number(r!.speed) };
  if (t === "harmonic" || t === "harmonique") return { type: "harmonic", freq: Number(r!.freq) };
  throw new Error(`Régime inconnu : ${r?.type}`);
}

export function casDe(cas: CasJSON, lireFichier?: (nom: string) => string): { structure: Structure; chargement: Chargement; regime: Regime } {
  const s = cas.structure;
  const structure = new Structure(
    s.layers.map((l) => ({ materiau: materiauDe(l.material), epaisseur: l.h ?? 1, nom: l.name ?? "" })),
    s.bottom ?? "halfspace",
    s.interfaces,
  );
  const chargement = new Chargement(cas.loading.wheels.map((w) => ({ empreinte: empreinteDe(w.footprint, lireFichier), x0: w.x0 ?? 0, y0: w.y0 ?? 0, qx: w.qx ?? null, qy: w.qy ?? null })));
  return { structure, chargement, regime: regimeDe(cas.regime) };
}

/** Options de grille et sorties d'un cas (valeurs par défaut de io.run_case). */
export function sortiesDe(cas: CasJSON) {
  const g = cas.grid ?? {},
    o = cas.outputs ?? {};
  return {
    L: g.L ?? ([16, 16] as [number, number]),
    N: g.N ?? ([1024, 1024] as [number, number]),
    fenetre: g.window ?? null,
    filtre: g.filter_width ?? 0,
    profondeurs: o.depths ?? [0],
    comps: o.components ?? (["uz", "exx", "eyy", "ezz"] as Composante[]),
    jauges: o.gauges ?? [],
  };
}
