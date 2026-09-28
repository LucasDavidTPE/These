/**
 * Lecture d'un cas de calcul décrit en JSON et mise en forme des résultats (io.py).
 *
 * Même format que `python -m chausspec cas.json`. Différences : rien n'est écrit sur le disque
 * ici (l'interface enregistre les CSV et la synthèse), pas de tracés matplotlib ; une carte de
 * pression peut être incluse dans le cas (`x`, `y`, `P`) au lieu d'un fichier CSV voisin.
 */
import * as L from "./loads";
import * as M from "./materials";
import { solveGrid, type GridOptions, type GridResult } from "./grid";
import { Harmonic, Moving, Static, type Regime } from "./regimes";
import { STRAIN, type Component } from "./spectral";
import { Layer, Structure, type Bottom, type InterfaceKind } from "./structure";

// ------------------------------------------------------------------------------------------
// Format du fichier JSON
// ------------------------------------------------------------------------------------------
export type MaterialJSON =
  | { type: "elastic"; E: number; nu?: number }
  | ({ type: "2S2P1D"; beta?: number | "inf" | null } & Omit<M.TwoS2P1DParams, "beta" | "name">)
  | { type: "KVG"; E0: number; Ei: number[]; taui: number[]; nu?: number }
  | { type: "maxwell"; E_inf: number; Ei: number[]; taui: number[]; nu?: number };

export type ProfileJSON = { type: "box"; a: number } | { type: "halfellipse"; c: number } | { type: "gaussianpairs"; P: number[]; centers: number[]; sig: number[] } | { type: "tabulated"; s: number[]; f: number[] };

export type FootprintJSON = (
  | { type: "rect"; p?: number; lx: number; ly: number }
  | { type: "circle"; p?: number; R: number }
  | { type: "separable"; fx: ProfileJSON; fy: ProfileJSON; amplitude?: number }
  | { type: "map"; file?: string; delimiter?: string; unit?: number; x?: number[]; y?: number[]; P?: number[][] }
) & { force?: number };

export interface WheelJSON {
  x0?: number;
  y0?: number;
  footprint: FootprintJSON;
  qx?: number | null;
  qy?: number | null;
}

export interface GaugeJSON {
  comp: Component;
  z: number;
  x?: number;
  y: number;
}

export interface CaseJSON {
  _commentaire?: string;
  structure: { bottom?: Bottom; interfaces?: InterfaceKind[]; layers: { name?: string; h?: number; material: MaterialJSON }[] };
  loading: { wheels: WheelJSON[] };
  regime?: { type: string; speed?: number; freq?: number };
  grid?: { L?: [number, number]; N?: [number, number]; window?: [number, number, number, number] | null; filter_width?: number };
  outputs?: { dir?: string; depths?: number[]; components?: Component[]; gauges?: GaugeJSON[]; save_fields?: boolean };
}

/** Lit un fichier voisin du cas (carte de pression) : fourni par l'appelant. */
export type ReadFile = (name: string) => string;

// ------------------------------------------------------------------------------------------
export function materialFromDict(d: MaterialJSON): M.Material {
  const t = d.type.toLowerCase();
  if (["elastic", "elastique", "élastique"].includes(t)) {
    const m = d as Extract<MaterialJSON, { type: "elastic" }>;
    return new M.Elastic(m.E, m.nu);
  }
  if (t === "2s2p1d") {
    const m = d as Extract<MaterialJSON, { type: "2S2P1D" }>;
    const beta = m.beta === undefined || m.beta === null || m.beta === "inf" || (m.beta as unknown) === "infini" ? Infinity : Number(m.beta);
    return new M.TwoS2P1D({ ...m, beta });
  }
  if (["kvg", "kelvin-voigt", "generalizedkelvinvoigt"].includes(t)) {
    const m = d as Extract<MaterialJSON, { type: "KVG" }>;
    return new M.GeneralizedKelvinVoigt(m.E0, m.Ei, m.taui, m.nu);
  }
  if (["maxwell", "prony", "generalizedmaxwell"].includes(t)) {
    const m = d as Extract<MaterialJSON, { type: "maxwell" }>;
    return new M.GeneralizedMaxwell(m.E_inf, m.Ei, m.taui, m.nu);
  }
  throw new Error(`type de matériau inconnu : ${t}`);
}

export function profileFromDict(d: ProfileJSON): L.Profile1D {
  const t = d.type.toLowerCase();
  if (t === "box") return new L.Box1D((d as { a: number }).a);
  if (t === "halfellipse" || t === "demi-ellipse") return new L.HalfEllipse1D((d as { c: number }).c);
  if (t === "gaussianpairs" || t === "gaussiennes") {
    const g = d as Extract<ProfileJSON, { type: "gaussianpairs" }>;
    return new L.GaussianPairs1D(g.P, g.centers, g.sig);
  }
  if (t === "tabulated" || t === "tabule") {
    const g = d as Extract<ProfileJSON, { type: "tabulated" }>;
    return new L.Tabulated1D(g.s, g.f);
  }
  throw new Error(`profil inconnu : ${t}`);
}

/** np.loadtxt d'une carte : 1re ligne : abscisses x (1re case ignorée) ; 1re colonne : ordonnées y. */
export function loadMapCsv(text: string, delimiter = ";"): { x: number[]; y: number[]; P: number[][] } {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(delimiter).map((v) => Number(v.trim().replace(",", delimiter === ";" ? "." : ","))));
  if (rows.length < 2) throw new Error("Carte de pression : au moins une ligne d'en-tête (x) et une ligne de valeurs.");
  const x = rows[0]!.slice(1);
  const y = rows.slice(1).map((r) => r[0]!);
  const P = rows.slice(1).map((r) => r.slice(1));
  if ([...x, ...y, ...P.flat()].some((v) => !Number.isFinite(v))) throw new Error("Carte de pression : valeur non numérique.");
  return { x, y, P };
}

export function footprintFromDict(d: FootprintJSON, readFile?: ReadFile): L.Footprint {
  const t = d.type.toLowerCase();
  let fp: L.Footprint;
  if (t === "rect" || t === "rectangle") {
    const r = d as Extract<FootprintJSON, { type: "rect" }>;
    fp = new L.UniformRect(r.p ?? 1.0, r.lx, r.ly);
  } else if (t === "circle" || t === "cercle" || t === "disque") {
    const r = d as Extract<FootprintJSON, { type: "circle" }>;
    fp = new L.UniformCircle(r.p ?? 1.0, r.R);
  } else if (t === "separable" || t === "séparable") {
    const r = d as Extract<FootprintJSON, { type: "separable" }>;
    fp = new L.Separable(profileFromDict(r.fx), profileFromDict(r.fy), r.amplitude ?? 1.0);
  } else if (t === "map" || t === "carte") {
    const r = d as Extract<FootprintJSON, { type: "map" }>;
    let data: { x: number[]; y: number[]; P: number[][] };
    if (r.x && r.y && r.P) data = { x: r.x, y: r.y, P: r.P }; // carte incluse dans le cas
    else if (r.file && readFile) data = loadMapCsv(readFile(r.file), r.delimiter ?? ";");
    else throw new Error(`Carte de pression « ${r.file ?? "?"} » : fichier introuvable (l'inclure dans le cas ou le placer à côté).`);
    const unit = r.unit ?? 1.0;
    fp = new L.PressureMap(data.x, data.y, data.P.map((row) => row.map((v) => v * unit)));
  } else throw new Error(`empreinte inconnue : ${t}`);
  if (d.force !== undefined) fp = fp.scaledTo(d.force);
  return fp;
}

export function regimeFromDict(r: CaseJSON["regime"]): Regime {
  const rt = (r?.type ?? "static").toLowerCase();
  if (rt === "static" || rt === "statique") return new Static();
  if (["moving", "roulant", "charge_roulante"].includes(rt)) return new Moving(Number(r!.speed));
  if (rt === "harmonic" || rt === "harmonique") return new Harmonic(Number(r!.freq));
  throw new Error(`régime inconnu : ${rt}`);
}

export function caseFromDict(c: CaseJSON, readFile?: ReadFile): { structure: Structure; loading: L.Loading; regime: Regime } {
  const s = c.structure;
  const layers = s.layers.map((l) => new Layer(materialFromDict(l.material), l.h ?? 1.0, l.name ?? ""));
  const structure = new Structure(layers, s.bottom ?? "halfspace", s.interfaces);
  const wheels = c.loading.wheels.map((w) => new L.Wheel(footprintFromDict(w.footprint, readFile), w.x0 ?? 0.0, w.y0 ?? 0.0, w.qx ?? null, w.qy ?? null));
  return { structure, loading: new L.Loading(wheels), regime: regimeFromDict(c.regime) };
}

// ------------------------------------------------------------------------------------------
export interface Extreme {
  max: number;
  x_max: number;
  y_max: number;
  min?: number;
  x_min?: number;
  y_min?: number;
}

export interface Summary {
  meta: GridResult["meta"];
  extremes: Record<string, Extreme>;
}

export interface GaugeSignal extends GaugeJSON {
  x: number;
  t: number[];
  f: number[];
}

/** Extrêmes de la partie réelle d'un champ, et leur position. */
export function extremes(res: GridResult, f: Float64Array): Required<Extreme> {
  let imax = 0,
    imin = 0;
  for (let i = 1; i < f.length; i++) {
    if (f[i]! > f[imax]!) imax = i;
    if (f[i]! < f[imin]!) imin = i;
  }
  const nx = res.x.length;
  const at = (k: number): [number, number] => [res.x[k % nx]!, res.y[Math.floor(k / nx)]!];
  const [x_max, y_max] = at(imax);
  const [x_min, y_min] = at(imin);
  return { max: f[imax]!, x_max, y_max, min: f[imin]!, x_min, y_min };
}

/** Profondeurs, composantes et options de grille d'un cas (valeurs par défaut de run_case). */
export function gridSettings(c: CaseJSON): { depths: number[]; comps: Component[]; options: GridOptions } {
  const g = c.grid ?? {};
  const o = c.outputs ?? {};
  return {
    depths: o.depths ?? [0.0],
    comps: o.components ?? ["uz", "exx", "eyy", "ezz"],
    options: { L: g.L ?? [16, 16], N: g.N ?? [1024, 1024], window: g.window ?? null, filterWidth: g.filter_width ?? 0.0 },
  };
}

/**
 * Calcul d'un cas (run_case) : solveur grille, synthèse (extrêmes de chaque champ, e1 si les
 * six déformations sont demandées et les champs réels) et signaux des jauges en roulant.
 */
export function runCase(c: CaseJSON, options: { readFile?: ReadFile; progress?: (part: number, text: string) => void } = {}): { res: GridResult; summary: Summary; gauges: GaugeSignal[] } {
  const { structure, loading, regime } = caseFromDict(c, options.readFile);
  const { depths, comps, options: grid } = gridSettings(c);
  const res = solveGrid(structure, loading, regime, depths, { ...grid, comps, progress: options.progress });
  const summary: Summary = { meta: res.meta, extremes: {} };
  for (const { comp, z } of res.keys) summary.extremes[`${comp}@z=${z}`] = extremes(res, res.get(comp, z).re);
  if (STRAIN.every((s) => comps.includes(s)) && !res.meta.complex) {
    for (const z of depths) {
      const e1 = res.principalStrains(z)[2];
      const { max, x_max, y_max } = extremes(res, e1);
      summary.extremes[`e1@z=${z}`] = { max, x_max, y_max };
    }
  }
  const gauges: GaugeSignal[] = [];
  if (regime instanceof Moving) {
    for (const gd of c.outputs?.gauges ?? []) {
      const { t, f } = res.timeSignal(gd.comp, gd.z, gd.x ?? 0.0, gd.y, regime.speed);
      gauges.push({ ...gd, x: gd.x ?? 0.0, t, f });
    }
  }
  return { res, summary, gauges };
}

// ------------------------------------------------------------------------------------------
/** Nombre au format %.6e de numpy (« 1.234560e-04 », « nan »). */
export function fmtE6(v: number): string {
  if (Number.isNaN(v)) return "nan";
  if (!Number.isFinite(v)) return v > 0 ? "inf" : "-inf";
  const [m, ex] = v.toExponential(6).split("e");
  const n = Number(ex);
  return `${m}e${n < 0 ? "-" : "+"}${String(Math.abs(n)).padStart(2, "0")}`;
}

/** CSV d'un champ comme run_case (np.savetxt) : 1re ligne x (précédée de nan), 1re colonne y, « ; ». */
export function fieldCsv(res: GridResult, comp: string, z: number): string {
  const f = res.get(comp, z).re;
  const nx = res.x.length;
  const lines = [`# ${comp} (SI) a z = ${z} m ; 1re ligne : x (m) ; 1re colonne : y (m)`, ["nan", ...Array.from(res.x, fmtE6)].join(";")];
  for (let j = 0; j < res.y.length; j++) lines.push([fmtE6(res.y[j]!), ...Array.from(f.slice(j * nx, (j + 1) * nx), fmtE6)].join(";"));
  return lines.join("\n") + "\n";
}
