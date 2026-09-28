/**
 * Composants de rhéologie (SPEC §6) : éléments simples et assemblages paramétriques.
 * Tous sont « linéaires » : placés par `from`/`to` ou par `at` + `length` + `rotate`.
 */
import type { ComponentDef, GeometryContext } from "../component";
import type { Primitive } from "../geometry";
import type { ParamSchema } from "../params";
import type { Pt } from "../types";
import { LENGTH_PARAM } from "./common";
import { DEFAULT_RHEO_STYLE, extent, layoutNode, numbered, type RheoNode, type RheoStyle } from "./rheology";

type P = Record<string, unknown>;

const STYLE_PARAMS: ParamSchema = {
  amplitude: { kind: "number", label: "Demi-largeur des ressorts", default: DEFAULT_RHEO_STYLE.amplitude, min: 0.5, max: 20, unit: "mm" },
  width: { kind: "number", label: "Largeur des cylindres", default: DEFAULT_RHEO_STYLE.width, min: 1, max: 30, unit: "mm" },
  coils: { kind: "number", label: "Spires par ressort", default: DEFAULT_RHEO_STYLE.coils, min: 1, max: 20, integer: true },
  gap: { kind: "number", label: "Écart entre branches", default: DEFAULT_RHEO_STYLE.gap, min: 0, max: 50, unit: "mm" },
};

function styleOf(p: P): RheoStyle {
  return { ...DEFAULT_RHEO_STYLE, amplitude: p.amplitude as number, width: p.width as number, coils: p.coils as number, gap: p.gap as number };
}

function str(p: P, k: string): string {
  return (p[k] as string | undefined) ?? "";
}

/** Fabrique un composant de rhéologie à partir d'une fonction « paramètres → réseau ». */
function network(def: {
  type: string;
  label: string;
  params: ParamSchema;
  length: number;
  build(p: P): RheoNode;
  summary(p: P): string;
}): ComponentDef {
  const geo = (p: P, ctx: GeometryContext) => {
    const out: Primitive[] = [];
    const anchors: Record<string, Pt> = {};
    layoutNode(def.build(p), 0, ctx.length, 0, styleOf(p), out, anchors);
    return { out, anchors };
  };
  return {
    type: def.type,
    label: def.label,
    category: "rheologie",
    placement: "segment",
    params: { length: { ...LENGTH_PARAM, default: def.length }, ...def.params, ...STYLE_PARAMS },
    geometry: (p, ctx) => geo(p, ctx).out,
    anchors(p, ctx) {
      const e = extent(def.build(p), styleOf(p));
      return {
        ...geo(p, ctx).anchors,
        center: [ctx.length / 2, 0],
        top: [ctx.length / 2, -e.up],
        bottom: [ctx.length / 2, e.down],
      };
    },
    summary: (p, ctx) => `${def.summary(p)}, longueur ${Math.round(ctx.length * 100) / 100} mm`,
  };
}

const LABEL = (label: string, def: string) => ({ kind: "string" as const, label, default: def, math: true });

export const parabolic = network({
  type: "parabolic",
  label: "Élément parabolique",
  length: 16,
  params: { label: LABEL("Étiquette", "") },
  build: (p) => ({ kind: "parabolic", label: str(p, "label") || undefined }),
  summary: (p) => `élément parabolique ${str(p, "label")}`.trim(),
});

export const slider = network({
  type: "slider",
  label: "Patin (frottement)",
  length: 16,
  params: { label: LABEL("Étiquette", "") },
  build: (p) => ({ kind: "slider", label: str(p, "label") || undefined }),
  summary: (p) => `patin ${str(p, "label")}`.trim(),
});

export const maxwell = network({
  type: "maxwell",
  label: "Maxwell",
  length: 36,
  params: { spring_label: LABEL("Ressort", "$E$"), dashpot_label: LABEL("Amortisseur", "$\\eta$") },
  build: (p) => ({
    kind: "series",
    items: [
      { kind: "spring", label: str(p, "spring_label") },
      { kind: "dashpot", label: str(p, "dashpot_label") },
    ],
  }),
  summary: () => "ressort et amortisseur en série",
});

export const kelvinVoigt = network({
  type: "kelvin_voigt",
  label: "Kelvin-Voigt",
  length: 30,
  params: { spring_label: LABEL("Ressort", "$E$"), dashpot_label: LABEL("Amortisseur", "$\\eta$") },
  build: (p) => ({
    kind: "parallel",
    branches: [
      { kind: "spring", label: str(p, "spring_label") },
      { kind: "dashpot", label: str(p, "dashpot_label") },
    ],
  }),
  summary: () => "ressort et amortisseur en parallèle",
});

export const generalizedMaxwell = network({
  type: "generalized_maxwell",
  label: "Maxwell généralisé",
  length: 40,
  params: {
    n: { kind: "number", label: "Nombre de branches de Maxwell", default: 3, min: 1, max: 30, integer: true },
    spring_label: LABEL("Ressorts (modèle, {i} = numéro)", "$E_{i}$"),
    dashpot_label: LABEL("Amortisseurs (modèle)", "$\\eta_{i}$"),
    with_equilibrium: { kind: "boolean", label: "Ressort d'équilibre en parallèle", default: true },
    equilibrium_label: LABEL("Ressort d'équilibre", "$E_\\infty$"),
  },
  build: (p) => {
    const branches: RheoNode[] = [];
    if (p.with_equilibrium) branches.push({ kind: "spring", label: str(p, "equilibrium_label") });
    for (let i = 1; i <= (p.n as number); i++) {
      branches.push({
        kind: "series",
        items: [
          { kind: "spring", label: numbered(str(p, "spring_label"), i) },
          { kind: "dashpot", label: numbered(str(p, "dashpot_label"), i) },
        ],
      });
    }
    return { kind: "parallel", branches };
  },
  summary: (p) => `${p.n} branches de Maxwell${p.with_equilibrium ? " + ressort d'équilibre" : ""}`,
});

export const kvg = network({
  type: "kvg",
  label: "Kelvin-Voigt généralisé (KVG)",
  length: 120,
  params: {
    n: { kind: "number", label: "Nombre d'éléments de Kelvin-Voigt", default: 3, min: 1, max: 30, integer: true },
    spring_label: LABEL("Ressorts (modèle, {i} = numéro)", "$E_{i}$"),
    dashpot_label: LABEL("Amortisseurs (modèle)", "$\\eta_{i}$"),
    with_spring: { kind: "boolean", label: "Ressort instantané en série", default: true },
    spring0_label: LABEL("Ressort instantané", "$E_0$"),
    with_dashpot: { kind: "boolean", label: "Amortisseur en série", default: false },
    dashpot0_label: LABEL("Amortisseur en série", "$\\eta_0$"),
  },
  build: (p) => {
    const items: RheoNode[] = [];
    if (p.with_spring) items.push({ kind: "spring", label: str(p, "spring0_label"), weight: 0.8 });
    for (let i = 1; i <= (p.n as number); i++) {
      items.push({
        kind: "parallel",
        weight: 1,
        branches: [
          { kind: "spring", label: numbered(str(p, "spring_label"), i) },
          { kind: "dashpot", label: numbered(str(p, "dashpot_label"), i) },
        ],
      });
    }
    if (p.with_dashpot) items.push({ kind: "dashpot", label: str(p, "dashpot0_label"), weight: 0.8 });
    return { kind: "series", items };
  },
  summary: (p) => `${p.n} éléments de Kelvin-Voigt${p.with_spring ? " + ressort" : ""}${p.with_dashpot ? " + amortisseur" : ""} en série`,
});

export const model2s2p1d = network({
  type: "model_2s2p1d",
  label: "Modèle 2S2P1D",
  length: 70,
  params: {
    e00_label: LABEL("Ressort E00", "$E_{00}$"),
    e0_label: LABEL("Ressort E0 − E00", "$E_0 - E_{00}$"),
    k_label: LABEL("Parabolique k", "$k$"),
    h_label: LABEL("Parabolique h", "$h$"),
    eta_label: LABEL("Amortisseur", "$\\eta$"),
  },
  build: (p) => ({
    kind: "parallel",
    branches: [
      { kind: "spring", label: str(p, "e00_label") },
      {
        kind: "series",
        items: [
          { kind: "spring", label: str(p, "e0_label") },
          { kind: "parabolic", label: str(p, "k_label") },
          { kind: "parabolic", label: str(p, "h_label") },
          { kind: "dashpot", label: str(p, "eta_label") },
        ],
      },
    ],
  }),
  summary: () => "2 ressorts, 2 éléments paraboliques, 1 amortisseur (Olard et Di Benedetto)",
});

export const huetSayegh = network({
  type: "huet_sayegh",
  label: "Modèle de Huet-Sayegh",
  length: 60,
  params: {
    e00_label: LABEL("Ressort E00", "$E_{00}$"),
    e0_label: LABEL("Ressort E0 − E00", "$E_0 - E_{00}$"),
    k_label: LABEL("Parabolique k", "$k$"),
    h_label: LABEL("Parabolique h", "$h$"),
  },
  build: (p) => ({
    kind: "parallel",
    branches: [
      { kind: "spring", label: str(p, "e00_label") },
      {
        kind: "series",
        items: [
          { kind: "spring", label: str(p, "e0_label") },
          { kind: "parabolic", label: str(p, "k_label") },
          { kind: "parabolic", label: str(p, "h_label") },
        ],
      },
    ],
  }),
  summary: () => "2 ressorts, 2 éléments paraboliques (Huet, Sayegh)",
});

export const zener = network({
  type: "zener",
  label: "Zener (solide linéaire standard)",
  length: 40,
  params: {
    e00_label: LABEL("Ressort d'équilibre", "$E_{00}$"),
    e1_label: LABEL("Ressort de la branche", "$E_0 - E_{00}$"),
    eta_label: LABEL("Amortisseur", "$\\eta$"),
  },
  build: (p) => ({
    kind: "parallel",
    branches: [
      { kind: "spring", label: str(p, "e00_label") },
      {
        kind: "series",
        items: [
          { kind: "spring", label: str(p, "e1_label") },
          { kind: "dashpot", label: str(p, "eta_label") },
        ],
      },
    ],
  }),
  summary: () => "ressort en parallèle d'une branche de Maxwell",
});

export const burgers = network({
  type: "burgers",
  label: "Burgers",
  length: 64,
  params: {
    e1_label: LABEL("Ressort (Maxwell)", "$E_1$"),
    eta1_label: LABEL("Amortisseur (Maxwell)", "$\\eta_1$"),
    e2_label: LABEL("Ressort (Kelvin-Voigt)", "$E_2$"),
    eta2_label: LABEL("Amortisseur (Kelvin-Voigt)", "$\\eta_2$"),
  },
  build: (p) => ({
    kind: "series",
    items: [
      { kind: "spring", label: str(p, "e1_label"), weight: 0.8 },
      { kind: "dashpot", label: str(p, "eta1_label"), weight: 0.8 },
      {
        kind: "parallel",
        branches: [
          { kind: "spring", label: str(p, "e2_label") },
          { kind: "dashpot", label: str(p, "eta2_label") },
        ],
      },
    ],
  }),
  summary: () => "Maxwell et Kelvin-Voigt en série",
});

/** Liaison rigide (barre) entre deux points : relie des branches ou un bâti. */
export const link: ComponentDef = {
  type: "link",
  label: "Liaison rigide",
  category: "rheologie",
  placement: "segment",
  params: {
    length: { ...LENGTH_PARAM, default: 10 },
    thick: { kind: "boolean", label: "Barre épaisse", default: false },
  },
  geometry: (p, { length }) => [
    { kind: "path", segs: [{ op: "M", p: [0, 0] }, { op: "L", p: [length, 0] }], stroke: p.thick ? "trait epais" : "trait", fill: "none" },
  ],
  anchors: (_p, { length }) => ({ start: [0, 0], end: [length, 0], center: [length / 2, 0] }),
  summary: (_p, { length }) => `longueur ${Math.round(length * 100) / 100} mm`,
};

/** Nœud (point de jonction). */
export const node: ComponentDef = {
  type: "node",
  label: "Nœud",
  category: "rheologie",
  placement: "point",
  params: { radius: { kind: "number", label: "Rayon", default: 0.6, min: 0.1, max: 5, unit: "mm" } },
  geometry: (p) => [{ kind: "circle", c: [0, 0], r: p.radius as number, stroke: "trait fin", fill: "blanc" }],
  anchors: () => ({ center: [0, 0] }),
  summary: () => "point de jonction",
};
