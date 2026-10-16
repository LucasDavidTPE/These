/**
 * Convergence du maillage : le même cas calculé sur un maillage grossier et sur un maillage raffiné
 * (`coupeXZ_R1_EL_het.txt` / `coupeXZ_R1_EL-fin_het.txt`). Pour chaque paire et chaque grandeur : pic des deux
 * maillages, écart sur le pic, plus grand écart point à point et sa position, norme L2 relative de la
 * différence. Le maillage fin sert de référence. Grilles identiques comparées point à point ; sinon le fin est
 * interpolé aux points du grossier (dans la maille d'une coupe, linéairement le long d'un profil).
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  grilleCoupe,
  libelleColonne,
  type ExportComsol,
  type LibelleColonne,
  type UniteLongueur,
} from "./comsol";
import { motsDuNom } from "./comsolCalcul";
import { texteLatex } from "./comsolLatex";
import { valeurCarte } from "./comsolInstants";
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

export interface PaireMaillage {
  grossier: string;
  fin: string;
}

const FIN = /^(.*?)[-_ ]?(fin|fine|raffine|raffiné|refined)$/i;

/**
 * Paires trouvées d'après les noms : un mot terminé par « fin » (« EL-fin ») et le même nom avec ce mot sans le
 * suffixe (« EL »).
 */
export function pairesMaillage(
  exports: readonly ExportComsol[],
): PaireMaillage[] {
  const cle = (mots: string[]) => mots.join("\u0000").toLowerCase();
  const parCle = new Map(exports.map((e) => [cle(motsDuNom(e.nom)), e.nom]));
  const out: PaireMaillage[] = [];
  for (const e of exports) {
    const mots = motsDuNom(e.nom);
    mots.forEach((m, k) => {
      const f = FIN.exec(m);
      if (!f || !f[1]) return;
      const g = parCle.get(cle(mots.map((x, i) => (i === k ? f[1]! : x))));
      if (g && g !== e.nom) out.push({ grossier: g, fin: e.nom });
    });
  }
  return out;
}

export interface LigneMaillage {
  paire: PaireMaillage;
  expression: string;
  libelle: LibelleColonne;
  /** Pics (valeur de plus grande valeur absolue, avec son signe). */
  picGrossier: number;
  picFin: number;
  /** (|pic grossier| − |pic fin|) / |pic fin|, en %. */
  ecartPic: number;
  /** Plus grand |grossier − fin| point à point, sa position (unité de tracé) et sa part du pic fin (%). */
  ecartMax: number;
  ecartMaxRelatif: number;
  position: Record<string, number>;
  /** ‖grossier − fin‖₂ / ‖fin‖₂ sur les points communs, en %. */
  l2: number;
  /** Points comparés, et comment (« mêmes points » ou « fin interpolé »). */
  points: number;
  methode: "points" | "interpolation";
}

const pic = (v: ArrayLike<number>) => {
  let p = NaN;
  for (let i = 0; i < v.length; i++)
    if (
      Number.isFinite(v[i]!) &&
      (Number.isNaN(p) || Math.abs(v[i]!) > Math.abs(p))
    )
      p = v[i]!;
  return p;
};

/** Valeurs du fin aux points du grossier (mêmes points, ou interpolées). */
function finAuxPoints(
  g: ExportComsol,
  f: ExportComsol,
  expression: string,
): { v: (number | null)[]; methode: LigneMaillage["methode"] } {
  const nc = g.coordonnees.length;
  const jf = f.colonnes.findIndex((c) => c.expression === expression);
  const cle = (e: ExportComsol, i: number) =>
    e.coordonnees
      .map((_, k) => Number(e.valeurs[k]![i]!.toPrecision(10)))
      .join(";");
  if (g.coordonnees.join() === f.coordonnees.join() && g.lignes === f.lignes) {
    const index = new Map<string, number>();
    for (let i = 0; i < f.lignes; i++) index.set(cle(f, i), i);
    const v = Array.from({ length: g.lignes }, (_, i) => {
      const j = index.get(cle(g, i));
      return j === undefined ? null : f.valeurs[nc + jf]![j]!;
    });
    if (v.every((x) => x !== null)) return { v, methode: "points" };
  }
  const gg = geometrie(g);
  const gf = geometrie(f);
  if (
    gg.genre === "coupe" &&
    gf.genre === "coupe" &&
    gf.reguliere &&
    gg.varient.join() === gf.varient.join()
  ) {
    const u = (
      FACTEUR_LONGUEUR[f.uniteLongueur] ? f.uniteLongueur : "m"
    ) as UniteLongueur;
    const grille = grilleCoupe(f, expression, u);
    const [kx, ky] = gg.varient as [number, number];
    const k =
      (FACTEUR_LONGUEUR[f.uniteLongueur] ?? 1) /
      (FACTEUR_LONGUEUR[g.uniteLongueur] ?? 1);
    return {
      v: Array.from({ length: g.lignes }, (_, i) =>
        valeurCarte(grille, g.valeurs[kx]![i]! * k, g.valeurs[ky]![i]! * k),
      ),
      methode: "interpolation",
    };
  }
  if (
    gg.genre === "profil" &&
    gf.genre === "profil" &&
    gg.varient[0] === gf.varient[0]
  ) {
    const kk = gf.varient[0]!;
    const k =
      (FACTEUR_LONGUEUR[f.uniteLongueur] ?? 1) /
      (FACTEUR_LONGUEUR[g.uniteLongueur] ?? 1);
    const pts = Array.from(
      { length: f.lignes },
      (_, i) => [f.valeurs[kk]![i]!, f.valeurs[nc + jf]![i]!] as const,
    )
      .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
      .sort((a, b) => a[0] - b[0]);
    const xs = pts.map((p) => p[0]);
    const lin = (x: number) => {
      if (!xs.length || x < xs[0]! - 1e-12 || x > xs.at(-1)! + 1e-12)
        return null;
      for (let i = 0; i + 1 < xs.length; i++)
        if (x <= xs[i + 1]! + 1e-12)
          return (
            pts[i]![1] +
            (xs[i + 1] === xs[i]
              ? 0
              : ((x - xs[i]!) / (xs[i + 1]! - xs[i]!)) *
                (pts[i + 1]![1] - pts[i]![1]))
          );
      return pts.at(-1)![1];
    };
    return {
      v: Array.from({ length: g.lignes }, (_, i) =>
        lin(g.valeurs[kk]![i]! * k),
      ),
      methode: "interpolation",
    };
  }
  throw new Error(
    `${g.nom} et ${f.nom} ne se comparent pas : formes différentes (ligne, plan) ou coordonnées différentes.`,
  );
}

/** Écarts entre maillages pour une paire et une grandeur. */
export function comparerMaillages(
  g: ExportComsol,
  f: ExportComsol,
  expression: string,
  longueur: UniteLongueur,
): LigneMaillage {
  const jg = g.colonnes.findIndex((c) => c.expression === expression);
  const jf = f.colonnes.findIndex((c) => c.expression === expression);
  if (jg < 0 || jf < 0)
    throw new Error(
      `${jg < 0 ? g.nom : f.nom} n'a pas la grandeur ${expression}.`,
    );
  const nc = g.coordonnees.length;
  const vg = g.valeurs[nc + jg]!;
  const { v: vf, methode } = finAuxPoints(g, f, expression);
  const picG = pic(vg);
  const picF = pic(f.valeurs[f.coordonnees.length + jf]!);
  let ecartMax = 0;
  let iMax = -1;
  let s2 = 0;
  let f2 = 0;
  let n = 0;
  vf.forEach((x, i) => {
    const y = vg[i]!;
    if (x === null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    n++;
    s2 += (y - x) ** 2;
    f2 += x ** 2;
    if (Math.abs(y - x) > ecartMax) {
      ecartMax = Math.abs(y - x);
      iMax = i;
    }
  });
  if (!n) throw new Error(`${g.nom} et ${f.nom} n'ont aucun point en commun.`);
  const fl =
    FACTEUR_LONGUEUR[longueur]! / (FACTEUR_LONGUEUR[g.uniteLongueur] ?? 1);
  return {
    paire: { grossier: g.nom, fin: f.nom },
    expression,
    libelle: libelleColonne(g.colonnes[jg]!),
    picGrossier: picG,
    picFin: picF,
    ecartPic: picF
      ? (100 * (Math.abs(picG) - Math.abs(picF))) / Math.abs(picF)
      : NaN,
    ecartMax,
    ecartMaxRelatif: picF ? (100 * ecartMax) / Math.abs(picF) : NaN,
    position:
      iMax < 0
        ? {}
        : Object.fromEntries(
            g.coordonnees.map((c, k) => [
              c,
              Number((g.valeurs[k]![iMax]! * fl).toPrecision(10)),
            ]),
          ),
    l2: f2 ? 100 * Math.sqrt(s2 / f2) : NaN,
    points: n,
    methode,
  };
}

/** Diagramme : écart sur le pic (%) par paire (catégories), une série par grandeur. */
export function grapheMaillage(
  lignes: readonly LigneMaillage[],
  legende: (fichier: string) => string,
  mesure: "pic" | "l2" | "max" = "pic",
): GraphDoc {
  const paires = [
    ...new Map(
      lignes.map((l) => [`${l.paire.grossier}|${l.paire.fin}`, l.paire]),
    ).values(),
  ];
  const expressions = [...new Set(lignes.map((l) => l.expression))];
  const series: Series[] = expressions.map((x) => {
    const pts = paires.flatMap((p, i) => {
      const l = lignes.find(
        (y) =>
          y.expression === x &&
          y.paire.grossier === p.grossier &&
          y.paire.fin === p.fin,
      );
      const v = l
        ? mesure === "pic"
          ? l.ecartPic
          : mesure === "l2"
            ? l.l2
            : l.ecartMaxRelatif
        : NaN;
      return Number.isFinite(v)
        ? [[i + 1, Number(v.toPrecision(6))] as const]
        : [];
    });
    const lib = lignes.find((y) => y.expression === x)!.libelle;
    return {
      name: lib.grandeur,
      type: "bar",
      x: pts.map((p) => p[0]),
      y: pts.map((p) => p[1]),
      legend: true,
    };
  });
  return {
    format: GRAPH_FORMAT,
    width: 130,
    height: 75,
    theme: "these",
    x: {
      label: "",
      log: false,
      categories: paires.map(
        (p) => `${legende(p.grossier)} / ${legende(p.fin)}`,
      ),
    },
    y: {
      label:
        mesure === "pic"
          ? "Écart sur le pic, grossier / fin (%)"
          : mesure === "l2"
            ? "Écart L2 relatif (%)"
            : "Plus grand écart / pic fin (%)",
      log: false,
    },
    legend: "north east",
    grid: true,
    bar_width: Math.max(
      2,
      Math.min(6, 60 / Math.max(1, paires.length * expressions.length)),
    ),
    reperes: [{ axe: "y", valeur: 0, texte: "", trait: "solid" }],
    series,
  };
}

/** Tableau booktabs de la convergence. */
export function maillageLatex(
  lignes: readonly LigneMaillage[],
  legende: (fichier: string) => string,
  o: { virgule?: boolean; anglais?: boolean } = {},
): string {
  const n = (v: number, ch = 3) =>
    Number.isFinite(v)
      ? `$${o.virgule ? String(Number(v.toPrecision(ch))).replace(".", "{,}") : String(Number(v.toPrecision(ch)))}$`
      : "--";
  const en = o.anglais === true;
  const out = [
    `% ${en ? "Mesh convergence" : "Convergence du maillage"} (Thèse, exports COMSOL). Nécessite \\usepackage{booktabs}.`,
    "\\begin{table}[htbp]",
    "\\centering",
    "\\begin{tabular}{llrrrrr}",
    "\\toprule",
    en
      ? "Case & Quantity & Coarse peak & Fine peak & Peak diff. (\\%) & Max diff. (\\%) & L2 (\\%) \\\\"
      : "Cas & Grandeur & Pic grossier & Pic fin & Écart pic (\\%) & Écart max (\\%) & L2 (\\%) \\\\",
    "\\midrule",
  ];
  for (const l of lignes)
    out.push(
      `${texteLatex(legende(l.paire.grossier))} & ${l.libelle.grandeur.includes("$") ? l.libelle.grandeur : texteLatex(l.libelle.grandeur)} (${texteLatex(l.libelle.unite)}) & ${n(l.picGrossier)} & ${n(l.picFin)} & ${n(l.ecartPic, 2)} & ${n(l.ecartMaxRelatif, 2)} & ${n(l.l2, 2)} \\\\`,
    );
  out.push("\\bottomrule", "\\end{tabular}", "\\end{table}", "");
  return out.join("\n");
}
