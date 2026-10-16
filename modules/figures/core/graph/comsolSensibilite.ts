/**
 * Sensibilité à un paramètre : comment le pic d'une grandeur (ou sa valeur en un point d'une coupe) varie avec
 * un paramètre — un balayage COMSOL ou les instants d'un même fichier (`@ E=1000`, `@ t=9`…), ou un paramètre
 * de l'en-tête qui change d'un fichier à l'autre (`lc=1`, `lc=2`, `lc=3`). Une courbe par fichier (balayage)
 * ou par groupe de fichiers (mêmes autres paramètres), tableau booktabs.
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  grilleCoupe,
  libelleColonne,
  parametresDe,
  type ExportComsol,
  type LibelleColonne,
  type UniteLongueur,
} from "./comsol";
import { texteLatex } from "./comsolLatex";
import {
  parametresVariables,
  valeurCarte,
  vueEtape,
  type Etape,
} from "./comsolInstants";
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

export type StatSensibilite = "max" | "min" | "abs";
export const LIBELLES_STAT: Record<StatSensibilite, string> = {
  max: "maximum",
  min: "minimum",
  abs: "plus grande valeur absolue",
};

export interface PointSensibilite {
  x: number;
  y: number;
  fichier: string;
  /** Position de l'extremum (unité de tracé) ; absente pour une valeur en un point. */
  position?: Record<string, number>;
}
export interface SerieSensibilite {
  nom: string;
  points: PointSensibilite[];
}

const nombreDe = (t: string | undefined) => {
  const m =
    t === undefined
      ? null
      : /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(t);
  return m ? { v: Number(m[1]), unite: m[2]!.trim() } : null;
};

/** Valeur retenue d'un export : extremum de la colonne (et sa position), ou valeur interpolée en un point d'une coupe. */
export function statistique(
  e: ExportComsol,
  expression: string,
  o: {
    stat: StatSensibilite;
    point?: { x: number; y: number } | null;
    longueur: UniteLongueur;
  },
): { y: number; position?: Record<string, number> } | null {
  if (o.point) {
    const g = geometrie(e);
    if (g.genre !== "coupe" || !g.reguliere) return null;
    const v = valeurCarte(
      grilleCoupe(e, expression, o.longueur),
      o.point.x,
      o.point.y,
    );
    return v === null ? null : { y: v };
  }
  const j = e.colonnes.findIndex((c) => c.expression === expression);
  if (j < 0) return null;
  const col = e.valeurs[e.coordonnees.length + j]!;
  let best = -1;
  for (let i = 0; i < e.lignes; i++) {
    const v = col[i]!;
    if (!Number.isFinite(v)) continue;
    if (
      best < 0 ||
      (o.stat === "max"
        ? v > col[best]!
        : o.stat === "min"
          ? v < col[best]!
          : Math.abs(v) > Math.abs(col[best]!))
    )
      best = i;
  }
  if (best < 0) return null;
  const f =
    FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  return {
    y: col[best]!,
    position: Object.fromEntries(
      e.coordonnees.map((c, k) => [
        c,
        Number((e.valeurs[k]![best]! * f).toPrecision(10)),
      ]),
    ),
  };
}

/** Paramètres de l'en-tête qui changent d'un fichier à l'autre et dont les valeurs sont des nombres. */
export function parametresFichiers(
  es: readonly ExportComsol[],
): { nom: string; unite: string }[] {
  const internes = new Set(
    es.flatMap((e) => parametresVariables(e).map((p) => p.nom)),
  );
  const noms = [
    ...new Set(es.flatMap((e) => Object.keys(parametresDe(e)))),
  ].filter((k) => k !== "Point" && !internes.has(k));
  return noms.flatMap((nom) => {
    const vals = es.map((e) => nombreDe(parametresDe(e)[nom]));
    const nombres = vals.filter(
      (x): x is { v: number; unite: string } => x !== null,
    );
    return nombres.length >= 2 && new Set(nombres.map((x) => x.v)).size >= 2
      ? [{ nom, unite: nombres.find((x) => x.unite)?.unite ?? "" }]
      : [];
  });
}

/** Balayage dans un même fichier : une courbe par fichier, la valeur retenue à chaque valeur du paramètre. */
export function sensibiliteInterne(
  es: readonly ExportComsol[],
  parametre: string,
  expression: string,
  o: {
    stat: StatSensibilite;
    point?: { x: number; y: number } | null;
    longueur: UniteLongueur;
    etape?: Etape | null;
    legende: (e: ExportComsol) => string;
  },
): SerieSensibilite[] {
  return es.flatMap((e) => {
    const params = parametresVariables(e);
    const p = params.find((x) => x.nom === parametre);
    if (!p || !p.valeurs.every((v) => Number.isFinite(v.nombre))) return [];
    const points = p.valeurs.flatMap((v) => {
      const s = statistique(
        vueEtape(
          e,
          { ...(o.etape ?? {}), [p.nom]: { valeur: v.texte } },
          params,
        ),
        expression,
        o,
      );
      return s
        ? [
            {
              x: v.nombre,
              y: s.y,
              fichier: e.nom,
              ...(s.position ? { position: s.position } : {}),
            },
          ]
        : [];
    });
    return points.length ? [{ nom: o.legende(e), points }] : [];
  });
}

/** D'un fichier à l'autre : fichiers groupés par leurs autres paramètres (une courbe par groupe), triés selon le paramètre. */
export function sensibiliteFichiers(
  es: readonly ExportComsol[],
  parametre: string,
  expression: string,
  o: {
    stat: StatSensibilite;
    point?: { x: number; y: number } | null;
    longueur: UniteLongueur;
  },
): SerieSensibilite[] {
  const autres = parametresFichiers(es)
    .map((p) => p.nom)
    .filter((k) => k !== parametre);
  const autresTextes = [
    ...new Set(es.flatMap((e) => Object.keys(parametresDe(e)))),
  ].filter(
    (k) =>
      k !== parametre &&
      k !== "Point" &&
      !autres.includes(k) &&
      new Set(es.map((e) => parametresDe(e)[k] ?? "")).size > 1,
  );
  const groupes = new Map<string, SerieSensibilite>();
  for (const e of es) {
    const x = nombreDe(parametresDe(e)[parametre]);
    if (!x) continue;
    const s = statistique(e, expression, o);
    if (!s) continue;
    const cle = [...autres, ...autresTextes]
      .map((k) => `${k}=${parametresDe(e)[k] ?? "?"}`)
      .join(", ");
    const g = groupes.get(cle) ?? {
      nom: cle || "tous les fichiers",
      points: [],
    };
    g.points.push({
      x: x.v,
      y: s.y,
      fichier: e.nom,
      ...(s.position ? { position: s.position } : {}),
    });
    groupes.set(cle, g);
  }
  for (const g of groupes.values()) g.points.sort((a, b) => a.x - b.x);
  return [...groupes.values()];
}

/** Graphe : la valeur retenue en fonction du paramètre, une courbe (avec ses points) par série. */
export function grapheSensibilite(
  series: readonly SerieSensibilite[],
  o: {
    parametre: string;
    unite: string;
    libelle: LibelleColonne;
    stat: StatSensibilite;
    point?: { x: number; y: number } | null;
  },
): GraphDoc {
  const quoi = o.point
    ? o.libelle.grandeur
    : o.stat === "abs"
      ? `|${o.libelle.grandeur}| max`
      : `${o.libelle.grandeur} ${o.stat}`;
  const s: Series[] = series.map((x) => ({
    name: x.nom,
    type: "linepoints",
    x: x.points.map((p) => p.x),
    y: x.points.map((p) => Number(p.y.toPrecision(8))),
    legend: series.length > 1,
  }));
  return {
    format: GRAPH_FORMAT,
    width: 120,
    height: 80,
    theme: "these",
    x: {
      label: `${/^[A-Za-z]\w*$/.test(o.parametre) && o.parametre.length <= 2 ? `$${o.parametre}$` : o.parametre}${o.unite ? ` (${o.unite})` : ""}`,
      log: false,
    },
    y: { label: `${quoi} (${o.libelle.unite})`, log: false },
    legend: "north east",
    grid: true,
    bar_width: 3,
    series: s,
  };
}

/** Tableau booktabs : une ligne par valeur du paramètre, une colonne par série. */
export function sensibiliteLatex(
  series: readonly SerieSensibilite[],
  o: {
    parametre: string;
    unite: string;
    libelle: LibelleColonne;
    virgule?: boolean;
  },
): string {
  const n = (v: number | undefined) =>
    v === undefined || !Number.isFinite(v)
      ? "--"
      : `$${o.virgule ? String(Number(v.toPrecision(4))).replace(".", "{,}") : String(Number(v.toPrecision(4)))}$`;
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(
    (a, b) => a - b,
  );
  const out = [
    "% Sensibilité (Thèse, exports COMSOL). Nécessite \\usepackage{booktabs}.",
    "\\begin{table}[htbp]",
    "\\centering",
    `\\begin{tabular}{r${"r".repeat(series.length)}}`,
    "\\toprule",
    ` & \\multicolumn{${series.length}}{c}{${o.libelle.grandeur.includes("$") ? o.libelle.grandeur : texteLatex(o.libelle.grandeur)} (${texteLatex(o.libelle.unite)})} \\\\`,
    `\\cmidrule(lr){2-${series.length + 1}}`,
    `${texteLatex(o.parametre)}${o.unite ? ` (${texteLatex(o.unite)})` : ""} & ${series.map((s) => texteLatex(s.nom)).join(" & ")} \\\\`,
    "\\midrule",
    ...xs.map(
      (x) =>
        `${n(x)} & ${series.map((s) => n(s.points.find((p) => p.x === x)?.y)).join(" & ")} \\\\`,
    ),
    "\\bottomrule",
    "\\end{tabular}",
    "\\end{table}",
    "",
  ];
  return out.join("\n");
}

export const libelleDe = (
  e: ExportComsol,
  expression: string,
): LibelleColonne =>
  libelleColonne(e.colonnes.find((c) => c.expression === expression)!);
