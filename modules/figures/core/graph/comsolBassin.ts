/**
 * Bassin de déflexion calculé par COMSOL, lu comme un essai au déflectomètre (HWD / FWD) : déflexion en surface
 * le long d'une ligne passant par le centre de la charge, déflexions aux géophones (0, 300, 600… mm), indices
 * de bassin et comparaison à un bassin mesuré (rétro-calcul).
 *
 * Indices (déflexions dans l'unité de la grandeur, distances en mm) :
 *  - SCI = D0 − D300 (couches de surface), BDI = D300 − D600 (assise), BCI = D600 − D900 (plate-forme) ;
 *  - AREA = 150 (D0 + 2 D300 + 2 D600 + D900) / D0, en mm (version métrique de l'AREA à 4 géophones) ;
 *  - rayon de courbure R = r² / (2 (D0 − Dr)), en m (r = 0,2 m par défaut ; avec r = 0,25 m et des
 *    déflexions en 1/100 mm, c'est la formule 3125 / (d0 − d25) de la poutre Benkelman).
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  libelleColonne,
  type ExportComsol,
  type UniteLongueur,
} from "./comsol";
import { profilsInterpoles } from "./comsolCalcul";
import { texteLatex } from "./comsolLatex";
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

/** Déflexion : la colonne w / uz (« 1e3*w » → mm), sinon la première. */
export function expressionDeflexion(e: ExportComsol): string | null {
  const c =
    e.colonnes.find((k) => /^u[zZ]$/.test(libelleColonne(k).court)) ??
    e.colonnes.find((k) => /(^|[.*])(w|disp|u3)$/i.test(k.expression.trim()));
  return c?.expression ?? null;
}

/** Facteur de l'unité d'une déflexion vers le mètre (null : unité inconnue). */
export function versMetre(unite: string): number | null {
  const u = unite.trim().toLowerCase();
  return u === "m"
    ? 1
    : u === "mm"
      ? 1e-3
      : u === "µm" || u === "μm" || u === "um"
        ? 1e-6
        : u === "cm"
          ? 1e-2
          : null;
}

type LigneSurface = { s: number[]; k: number; ligne: ExportComsol } | null;

/** Lignes de surface déjà extraites, par export (un export ne change pas ; à lire seulement). */
const surfaces = new WeakMap<ExportComsol, LigneSurface>();

/** Ligne de surface d'un export : profil horizontal tel quel, ou ligne la plus haute d'une coupe contenant z. */
export function ligneSurface(e: ExportComsol): LigneSurface {
  if (!surfaces.has(e)) surfaces.set(e, extraireSurface(e));
  return surfaces.get(e)!;
}

function extraireSurface(e: ExportComsol): LigneSurface {
  const g = geometrie(e);
  const kz = e.coordonnees.findIndex((x) => /^z$/i.test(x));
  if (g.genre === "profil" && g.varient[0] !== kz) {
    const k = g.varient[0]!;
    return { s: [...e.valeurs[k]!], k, ligne: e };
  }
  if (g.genre === "coupe" && g.reguliere && kz >= 0 && g.varient.includes(kz)) {
    const k = g.varient.find((x) => x !== kz)!;
    let haut = -Infinity;
    for (const z of e.valeurs[kz]!) if (z > haut) haut = z;
    // repère en profondeur positive : la surface est la plus petite valeur
    if ((e.repere?.[kz]?.facteur ?? 1) < 0) haut = Math.min(...e.valeurs[kz]!);
    const ligne = profilsInterpoles(e, kz, [haut])[0]!;
    return { s: [...ligne.valeurs[k]!], k, ligne };
  }
  return null;
}

export interface Bassin {
  fichier: string;
  legende: string;
  /** Unité des déflexions (celle de la colonne). */
  unite: string;
  /** Centre de la charge sur la ligne (m, coordonnée COMSOL). */
  centre: number;
  /** Distances au centre (m) et déflexions (positives vers le bas), moyennées des deux côtés si possible. */
  r: number[];
  d: number[];
  /** Déflexion à une distance r (m) ; null hors de la ligne. */
  a: (r: number) => number | null;
  capteurs: { r: number; d: number | null }[];
  indices: {
    D0: number;
    SCI: number | null;
    BDI: number | null;
    BCI: number | null;
    AREA: number | null;
    R: number | null;
  };
}

const interpoler = (
  xs: readonly number[],
  ys: readonly number[],
  x: number,
): number | null => {
  if (!xs.length || x < xs[0]! - 1e-12 || x > xs.at(-1)! + 1e-12) return null;
  for (let i = 0; i + 1 < xs.length; i++)
    if (x <= xs[i + 1]! + 1e-12) {
      const t = xs[i + 1] === xs[i] ? 0 : (x - xs[i]!) / (xs[i + 1]! - xs[i]!);
      return ys[i]! + t * (ys[i + 1]! - ys[i]!);
    }
  return ys.at(-1)!;
};

/**
 * Bassin d'un export : déflexion `expression` le long de la ligne de surface, centre = point de plus forte
 * déflexion (ou `centre`, en m), distances `capteurs` (m), rayon de courbure à `rayon` (m).
 */
export function bassin(
  e: ExportComsol,
  o: {
    expression: string;
    centre?: number | null;
    capteurs: readonly number[];
    rayon: number;
    legende: string;
  },
): Bassin {
  const l = ligneSurface(e);
  if (!l)
    throw new Error(
      `${e.nom} : ni ligne horizontale, ni coupe contenant z (pas de surface où lire le bassin).`,
    );
  const j = l.ligne.colonnes.findIndex((c) => c.expression === o.expression);
  if (j < 0) throw new Error(`${e.nom} : pas de colonne ${o.expression}.`);
  const unite = libelleColonne(l.ligne.colonnes[j]!).unite;
  const fm = 1 / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1); // coordonnée du fichier → m
  const pts = l.s
    .map(
      (s, i) =>
        [s * fm, l.ligne.valeurs[l.ligne.coordonnees.length + j]![i]!] as const,
    )
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  pts.sort((a, b) => a[0] - b[0]);
  if (pts.length < 2)
    throw new Error(`${e.nom} : trop peu de points sur la ligne.`);
  const xs = pts.map((p) => p[0]);
  const ws = pts.map((p) => p[1]);
  let iMax = 0;
  ws.forEach((w, i) => Math.abs(w) > Math.abs(ws[iMax]!) && (iMax = i));
  const centre = o.centre ?? xs[iMax]!;
  const w0 = interpoler(xs, ws, centre);
  if (w0 === null)
    throw new Error(`${e.nom} : le centre ${centre} m est hors de la ligne.`);
  const signe = w0 < 0 ? -1 : 1; // déflexion positive vers le bas
  const a = (r: number) => {
    const g = interpoler(xs, ws, centre - r);
    const d = interpoler(xs, ws, centre + r);
    const v = g !== null && d !== null ? (g + d) / 2 : (g ?? d);
    return v === null ? null : v * signe;
  };
  const rMax = Math.max(centre - xs[0]!, xs.at(-1)! - centre);
  const n = 120;
  const r = Array.from({ length: n + 1 }, (_, i) => (rMax * i) / n);
  const d = r.map((x) => a(x) ?? NaN);
  const D = (x: number) => a(x);
  const D0 = a(0)!;
  const dif = (p: number | null, q: number | null) =>
    p !== null && q !== null ? p - q : null;
  const [d3, d6, d9] = [D(0.3), D(0.6), D(0.9)];
  const m = versMetre(unite);
  const dr = D(o.rayon);
  return {
    fichier: e.nom,
    legende: o.legende,
    unite,
    centre,
    r,
    d,
    a,
    capteurs: o.capteurs.map((x) => ({ r: x, d: D(x) })),
    indices: {
      D0,
      SCI: dif(D0, d3),
      BDI: dif(d3, d6),
      BCI: dif(d6, d9),
      AREA:
        d3 !== null && d6 !== null && d9 !== null && D0 !== 0
          ? (150 * (D0 + 2 * d3 + 2 * d6 + d9)) / D0
          : null,
      R:
        m !== null && dr !== null && D0 - dr > 0
          ? o.rayon ** 2 / (2 * (D0 - dr) * m)
          : null,
    },
  };
}

export interface Mesure {
  /** Distances au centre (m) et déflexions (m). */
  r: number[];
  d: number[];
}

/** Écart d'un bassin calculé à un bassin mesuré : RMS (unité du calcul), RMS relatif (%), écart sur D0 (%). */
export function ecartMesure(
  b: Bassin,
  m: Mesure,
): { rms: number; relatif: number; d0: number | null } | null {
  const f = versMetre(b.unite);
  if (f === null) return null;
  const paires = m.r
    .map((r, i) => [b.a(r), m.d[i]! / f] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null);
  if (!paires.length) return null;
  const rms = Math.sqrt(
    paires.reduce((s, [c, x]) => s + (c - x) ** 2, 0) / paires.length,
  );
  const moy = paires.reduce((s, [, x]) => s + Math.abs(x), 0) / paires.length;
  const i0 = m.r.findIndex((r) => Math.abs(r) < 1e-9);
  return {
    rms,
    relatif: moy ? (100 * rms) / moy : NaN,
    d0:
      i0 >= 0 && m.d[i0]
        ? (100 * (b.indices.D0 - m.d[i0]! / f)) / (m.d[i0]! / f)
        : null,
  };
}

/** Lit un bassin collé : une ligne par géophone, « distance déflexion » (mm et µm par défaut). */
export function lireMesure(
  texte: string,
  o: { distance: UniteLongueur; deflexion: "µm" | "mm" | "1/100 mm" },
): Mesure {
  const fr = o.distance === "m" ? 1 : o.distance === "cm" ? 1e-2 : 1e-3;
  const fd = o.deflexion === "µm" ? 1e-6 : o.deflexion === "mm" ? 1e-3 : 1e-5;
  const r: number[] = [];
  const d: number[] = [];
  for (const ligne of texte.split(/\r?\n/)) {
    const n = ligne
      .trim()
      .replace(/(\d),(\d)/g, "$1.$2")
      .split(/[\s;\t]+/)
      .map(Number)
      .filter((x) => Number.isFinite(x));
    if (n.length >= 2) {
      r.push(n[0]! * fr);
      d.push(Math.abs(n[1]!) * fd);
    }
  }
  return { r, d };
}

/** Graphe des bassins : déflexion (vers le bas) en fonction de la distance au centre ; géophones en pointillés. */
export function grapheBassins(
  bs: readonly Bassin[],
  o: {
    longueur: UniteLongueur;
    mesure?: Mesure | null;
    capteurs?: readonly number[];
  },
): GraphDoc {
  const f = FACTEUR_LONGUEUR[o.longueur]!;
  const unite = bs[0]?.unite ?? "";
  const series: Series[] = bs.map((b) => {
    const pts = b.r
      .map((x, i) => [x * f, b.d[i]!] as const)
      .filter(([, y]) => Number.isFinite(y));
    return {
      name: b.legende,
      type: "line",
      x: pts.map((p) => Number(p[0].toPrecision(8))),
      y: pts.map((p) => Number(p[1].toPrecision(8))),
      legend: true,
    };
  });
  const fm = versMetre(unite);
  if (o.mesure && o.mesure.r.length && fm !== null)
    series.push({
      name: "Mesure",
      type: "points",
      x: o.mesure.r.map((x) => Number((x * f).toPrecision(8))),
      y: o.mesure.d.map((x) => Number((x / fm).toPrecision(8))),
      legend: true,
      mark: "square",
      color: "#000000",
    });
  return {
    format: GRAPH_FORMAT,
    width: 130,
    height: 80,
    theme: "these",
    x: {
      label: `Distance au centre de la charge (${o.longueur})`,
      log: false,
      min: 0,
    },
    y: { label: `Déflexion (${unite})`, log: false, inverse: true, min: 0 },
    legend: "south east",
    grid: true,
    bar_width: 3,
    ...(o.capteurs?.length
      ? {
          reperes: o.capteurs
            .filter((r) => r > 0)
            .map((r) => ({
              axe: "x" as const,
              valeur: Number((r * f).toPrecision(8)),
              texte: `$D_{${Math.round(r * 1000)}}$`,
              trait: "dotted" as const,
            })),
        }
      : {}),
    series,
  };
}

/** Tableau booktabs des indices de bassin (un cas par ligne). */
export function bassinsLatex(
  bs: readonly Bassin[],
  o: {
    virgule?: boolean;
    ecarts?: (ReturnType<typeof ecartMesure> | null)[];
  } = {},
): string {
  const n = (v: number | null, ch = 3) =>
    v === null || !Number.isFinite(v)
      ? "--"
      : `$${(o.virgule ? String(Number(v.toPrecision(ch))).replace(".", "{,}") : String(Number(v.toPrecision(ch)))).replace("-", "-")}$`;
  const u = (bs[0]?.unite ?? "").replace(/µ/g, "\\textmu{}");
  const avecMesure = o.ecarts?.some(Boolean);
  const out = [
    "% Indices de bassin (Thèse, exports COMSOL). Nécessite \\usepackage{booktabs}.",
    "\\begin{table}[htbp]",
    "\\centering",
    `\\begin{tabular}{l${"r".repeat(7)}${avecMesure ? "r" : ""}}`,
    "\\toprule",
    `Cas & $D_0$ & SCI & BDI & BCI & AREA & $R$${avecMesure ? " & RMS" : ""} \\\\`,
    ` & (${u}) & (${u}) & (${u}) & (${u}) & (mm) & (m)${avecMesure ? ` & (\\%)` : ""} \\\\`,
    "\\midrule",
  ];
  bs.forEach((b, i) => {
    const x = b.indices;
    const e = o.ecarts?.[i];
    out.push(
      `${texteLatex(b.legende)} & ${n(x.D0)} & ${n(x.SCI)} & ${n(x.BDI)} & ${n(x.BCI)} & ${n(x.AREA)} & ${n(x.R)}${avecMesure ? ` & ${e ? n(e.relatif, 2) : "--"}` : ""} \\\\`,
    );
  });
  out.push("\\bottomrule", "\\end{tabular}", "\\end{table}", "");
  return out.join("\n");
}
