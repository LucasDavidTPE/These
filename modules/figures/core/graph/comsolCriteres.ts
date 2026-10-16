/**
 * Critères de dimensionnement de chaussée calculés sur les exports COMSOL (méthode rationnelle française,
 * LCPC-SETRA ; transposable à l'aéronautique) :
 *  - **traction à la base d'une couche liée** (εt) : la plus forte traction horizontale (εxx, εyy…) sur la ligne
 *    juste au-dessus d'une interface ; loi de fatigue εt,adm = ε6 · k · (N / 10⁶)^b, d'où N = 10⁶ · (εt / (ε6 · k))^(1/b) ;
 *  - **compression au sommet d'une couche non liée / du sol** (εz) : la plus forte compression verticale sur la ligne
 *    juste en dessous ; loi εz,adm = A · N^(−e), d'où N = (εz / A)^(−1/e) (A = 0,012 et e = 0,222 en trafic fort).
 * Chaque critère est réglé une fois pour toute la bibliothèque (avec les interfaces et les correspondances).
 * Sur une coupe, la ligne d'évaluation est interpolée à la cote voulue ; sur un profil vertical, la valeur aussi.
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  libelleColonne,
  versRepere,
  type ExportComsol,
  type UniteLongueur,
} from "./comsol";
import { nomsColonnes, profilsInterpoles } from "./comsolCalcul";
import { GRAPH_FORMAT, type GraphDoc, type Series } from "./model";

export type GenreCritere = "traction" | "compression";

export type Loi =
  | { genre: "fatigue"; epsilon6: number; b: number; k: number }
  | { genre: "sol"; A: number; exposant: number };

export interface Critere {
  id: string;
  nom: string;
  genre: GenreCritere;
  /** Cote de l'interface, coordonnées des fichiers (m, z = 0 en surface, négatif vers le bas). */
  z: number;
  /** Ligne d'évaluation juste au-dessus (base de la couche du dessus) ou juste en dessous de l'interface. */
  cote: "dessus" | "dessous";
  /** Écart entre l'interface et la ligne d'évaluation (m) ; 0 : sur l'interface même. */
  decalage: number;
  /** Variables comparées (noms des colonnes : « exx, eyy », « ezz », « e1 »…). */
  variables: string[];
  loi: Loi;
}

/** Critères proposés au départ (structure BB 8 cm / GB 24 cm / GRH) : à adapter aux matériaux de l'étude. */
export function criteresDefaut(): Critere[] {
  return [
    {
      id: "et-bb",
      nom: "εt base BB",
      genre: "traction",
      z: -0.08,
      cote: "dessus",
      decalage: 0,
      variables: ["exx", "eyy"],
      loi: { genre: "fatigue", epsilon6: 100, b: -0.2, k: 1 },
    },
    {
      id: "et-gb",
      nom: "εt base GB",
      genre: "traction",
      z: -0.32,
      cote: "dessus",
      decalage: 0,
      variables: ["exx", "eyy"],
      loi: { genre: "fatigue", epsilon6: 90, b: -0.2, k: 1 },
    },
    {
      id: "ez-grh",
      nom: "εz sommet GRH",
      genre: "compression",
      z: -0.32,
      cote: "dessous",
      decalage: 0,
      variables: ["ezz"],
      loi: { genre: "sol", A: 0.012, exposant: 0.222 },
    },
  ];
}

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const nombre = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

export function lireCriteres(v: unknown): Critere[] {
  if (!Array.isArray(v)) return criteresDefaut();
  return v.filter(estObjet).flatMap((c, i): Critere[] => {
    if (typeof c.z !== "number") return [];
    const l = estObjet(c.loi) ? c.loi : {};
    const loi: Loi =
      l.genre === "sol"
        ? {
            genre: "sol",
            A: nombre(l.A, 0.012),
            exposant: nombre(l.exposant, 0.222),
          }
        : {
            genre: "fatigue",
            epsilon6: nombre(l.epsilon6, 100),
            b: nombre(l.b, -0.2),
            k: nombre(l.k, 1),
          };
    return [
      {
        id: typeof c.id === "string" ? c.id : `critere-${i + 1}`,
        nom: typeof c.nom === "string" ? c.nom : `Critère ${i + 1}`,
        genre: c.genre === "compression" ? "compression" : "traction",
        z: c.z,
        cote: c.cote === "dessous" ? "dessous" : "dessus",
        decalage: nombre(c.decalage, 0),
        variables: Array.isArray(c.variables)
          ? c.variables.filter((x): x is string => typeof x === "string")
          : [],
        loi,
      },
    ];
  });
}

/** Facteur qui met une colonne en µdef d'après son unité affichée (µdef, ‰, %, sans dimension). */
export function versMicrodef(unite: string): number | null {
  const u = unite.trim().toLowerCase();
  if (u === "µdef" || u === "µε" || u === "microdef" || u === "ue") return 1;
  if (u === "‰") return 1e3;
  if (u === "%") return 1e4;
  if (u === "-" || u === "1" || u === "") return 1e6;
  return null;
}

/** Nombre de cycles admissibles pour une déformation (µdef, positive) ; null si la loi ne s'applique pas. */
export function cyclesAdmissibles(epsilon: number, loi: Loi): number | null {
  if (!(epsilon > 0)) return null;
  if (loi.genre === "fatigue") {
    if (!(loi.epsilon6 > 0) || !(loi.k > 0) || loi.b >= 0) return null;
    return 1e6 * (epsilon / (loi.epsilon6 * loi.k)) ** (1 / loi.b);
  }
  if (!(loi.A > 0) || !(loi.exposant > 0)) return null;
  return (epsilon / (loi.A * 1e6)) ** (-1 / loi.exposant);
}

/** Déformation admissible (µdef) pour N cycles. */
export function deformationAdmissible(n: number, loi: Loi): number | null {
  if (!(n > 0)) return null;
  return loi.genre === "fatigue"
    ? loi.epsilon6 * loi.k * (n / 1e6) ** loi.b
    : loi.A * 1e6 * n ** -loi.exposant;
}

export interface Evaluation {
  fichier: string;
  critere: string;
  /** Déformation critique (µdef, positive en traction pour εt, en compression pour εz). */
  valeur: number;
  /** Variable qui la donne et position (unité de tracé). */
  variable: string;
  position: Record<string, number>;
  /** Cote réellement évaluée (unité de tracé). */
  zEvalue: number;
  cycles: number | null;
  /** Avec un trafic : déformation admissible et dommage (Miner) N_trafic / N_adm. */
  admissible: number | null;
  dommage: number | null;
}

/**
 * Évalue un critère sur un export (coupe régulière contenant z, ou profil vertical) : ligne à la cote voulue
 * (interpolée), plus forte traction (ou compression) parmi les variables. null s'il ne s'applique pas à ce
 * fichier (pas de z, variables absentes, cote hors du fichier) ; la raison est donnée par `raison`.
 */
export function evaluer(
  e: ExportComsol,
  c: Critere,
  o: { longueur: UniteLongueur; trafic?: number | null },
): Evaluation | { raison: string } {
  const g = geometrie(e);
  const kz = e.coordonnees.findIndex((x) => /^z$/i.test(x));
  if (kz < 0) return { raison: "pas de coordonnée z" };
  const noms = nomsColonnes(e);
  const cols = c.variables
    .map((v) => ({ v, j: noms.get(v.toLowerCase()) }))
    .filter(
      (x): x is { v: string; j: number } =>
        x.j !== undefined && x.j >= e.coordonnees.length,
    );
  if (!cols.length)
    return { raison: `variables ${c.variables.join(", ")} absentes` };
  // cote dans le repère du fichier (profondeur positive comprise), côté choisi
  const signe = (e.repere?.[kz]?.facteur ?? 1) < 0 ? -1 : 1;
  const sens = (c.cote === "dessus" ? 1 : -1) * signe;
  let zRep = versRepere(e, kz, c.z) + sens * Math.abs(c.decalage);
  // l'export s'arrête souvent juste avant l'interface (−0,3199 pour −0,32) : on prend le bord du fichier s'il est
  // à moins de 1 % de l'étendue, et seulement du côté demandé (jamais de l'autre côté de l'interface)
  {
    const zs = e.valeurs[kz]!;
    let min = Infinity;
    let max = -Infinity;
    for (const z of zs) {
      if (z < min) min = z;
      if (z > max) max = z;
    }
    const tol = 0.01 * (max - min);
    for (const bord of [min, max])
      if ((bord - zRep) * sens > 0 && Math.abs(bord - zRep) <= tol) zRep = bord;
  }
  let ligne: ExportComsol;
  let indices: number[];
  if (g.genre === "coupe" && g.reguliere && g.varient.includes(kz)) {
    try {
      ligne = profilsInterpoles(e, kz, [zRep])[0]!;
    } catch {
      return { raison: "cote hors de la coupe" };
    }
    indices = Array.from({ length: ligne.lignes }, (_, i) => i);
  } else if (g.genre === "profil" && g.varient[0] === kz) {
    // profil vertical : interpolation linéaire à la cote voulue
    const zs = e.valeurs[kz]!;
    const ordre = Array.from({ length: e.lignes }, (_, i) => i).sort(
      (a, b) => zs[a]! - zs[b]!,
    );
    const k = ordre.findIndex(
      (i, n) =>
        n + 1 < ordre.length && zRep >= zs[i]! && zRep <= zs[ordre[n + 1]!]!,
    );
    if (k < 0) return { raison: "cote hors du profil" };
    const i0 = ordre[k]!;
    const i1 = ordre[k + 1]!;
    const t = zs[i1] === zs[i0] ? 0 : (zRep - zs[i0]!) / (zs[i1]! - zs[i0]!);
    ligne = {
      ...e,
      valeurs: e.valeurs.map((col) =>
        Float64Array.from([(1 - t) * col[i0]! + t * col[i1]!]),
      ),
      lignes: 1,
    };
    indices = [0];
  } else return { raison: "ni coupe contenant z, ni profil vertical" };
  const f =
    FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
  let meilleur: { valeur: number; i: number; v: string } | null = null;
  for (const { v, j } of cols) {
    const lib = libelleColonne(e.colonnes[j - e.coordonnees.length]!);
    const m = versMicrodef(lib.unite);
    if (m === null)
      return {
        raison: `${v} : unité « ${lib.unite} » non convertible en µdef`,
      };
    for (const i of indices) {
      const x = ligne.valeurs[j]![i]! * m;
      if (!Number.isFinite(x)) continue;
      const critique = c.genre === "traction" ? x : -x;
      if (!meilleur || critique > meilleur.valeur)
        meilleur = { valeur: critique, i, v };
    }
  }
  if (!meilleur) return { raison: "aucune valeur sur la ligne" };
  const cycles = cyclesAdmissibles(meilleur.valeur, c.loi);
  const trafic = o.trafic && o.trafic > 0 ? o.trafic : null;
  return {
    fichier: e.nom,
    critere: c.id,
    valeur: meilleur.valeur,
    variable: meilleur.v,
    position: Object.fromEntries(
      e.coordonnees.map((x, k) => [
        x,
        Number((ligne.valeurs[k]![meilleur!.i]! * f).toPrecision(10)),
      ]),
    ),
    zEvalue: Number((zRep * f).toPrecision(10)),
    cycles,
    admissible: trafic ? deformationAdmissible(trafic, c.loi) : null,
    dommage: trafic && cycles ? trafic / cycles : null,
  };
}

export interface TableauCriteres {
  criteres: Critere[];
  /** Une ligne par fichier, une case par critère (évaluation, ou raison de l'absence). */
  lignes: {
    fichier: string;
    legende: string;
    cases: (Evaluation | { raison: string })[];
  }[];
}

export function tableauCriteres(
  exports: readonly ExportComsol[],
  criteres: readonly Critere[],
  o: {
    longueur: UniteLongueur;
    trafic?: number | null;
    legende: (e: ExportComsol) => string;
  },
): TableauCriteres {
  return {
    criteres: [...criteres],
    lignes: exports.map((e) => ({
      fichier: e.nom,
      legende: o.legende(e),
      cases: criteres.map((c) => evaluer(e, c, o)),
    })),
  };
}

const ok = (x: Evaluation | { raison: string } | undefined): x is Evaluation =>
  !!x && "valeur" in x;

/** Critère le plus contraignant d'un cas (le moins de cycles admissibles). */
export function critereDimensionnant(
  l: TableauCriteres["lignes"][number],
  criteres: readonly Critere[],
): { critere: Critere; cycles: number } | null {
  let m: { critere: Critere; cycles: number } | null = null;
  l.cases.forEach((x, k) => {
    if (ok(x) && x.cycles !== null && (!m || x.cycles < m.cycles))
      m = { critere: criteres[k]!, cycles: x.cycles };
  });
  return m;
}

export type AffichageCriteres = "cycles" | "deformation" | "relatif";

/**
 * Barres : un groupe par cas, une barre par critère ; cycles admissibles (échelle log), déformations (µdef), ou
 * cycles rapportés au cas de référence (%).
 */
export function grapheCriteres(
  t: TableauCriteres,
  o: { affichage: AffichageCriteres; reference?: string | null },
): GraphDoc {
  const ref = t.lignes.find((l) => l.fichier === o.reference);
  const series: Series[] = t.criteres.map((c, k) => {
    const pts = t.lignes
      .map((l, i) => {
        const x = l.cases[k];
        if (!ok(x)) return null;
        let y: number | null =
          o.affichage === "deformation" ? x.valeur : x.cycles;
        if (o.affichage === "relatif") {
          const r = ref?.cases[k];
          y =
            ok(r) && r.cycles && x.cycles ? (100 * x.cycles) / r.cycles : null;
        }
        return y !== null &&
          Number.isFinite(y) &&
          (o.affichage !== "cycles" || y > 0)
          ? ([i + 1, y] as const)
          : null;
      })
      .filter((p): p is readonly [number, number] => p !== null);
    return {
      name: c.nom,
      type: "bar",
      x: pts.map((p) => p[0]),
      y: pts.map((p) => Number(p[1].toPrecision(6))),
      legend: true,
    };
  });
  const label =
    o.affichage === "cycles"
      ? "Cycles admissibles $N$"
      : o.affichage === "deformation"
        ? "Déformation critique (µdef)"
        : `$N$ / $N_{\\mathrm{réf}}$ (%)`;
  // place pour la légende au-dessus des barres (en haut à gauche)
  const haut = Math.max(0, ...series.flatMap((s) => s.y));
  const max =
    haut > 0
      ? o.affichage === "cycles"
        ? 10 ** Math.ceil(Math.log10(haut) + 1.5)
        : Number((haut * 1.45).toPrecision(2))
      : undefined;
  return {
    format: GRAPH_FORMAT,
    width: 140,
    height: 80,
    theme: "these",
    x: { label: "", log: false, categories: t.lignes.map((l) => l.legende) },
    y: {
      label,
      log: o.affichage === "cycles",
      ...(max !== undefined
        ? { max, ...(o.affichage !== "cycles" ? { min: 0 } : {}) }
        : {}),
    },
    legend: "north west",
    grid: false,
    bar_width: Math.max(
      2,
      Math.min(6, 80 / Math.max(1, t.lignes.length * t.criteres.length)),
    ),
    ...(o.affichage === "relatif"
      ? {
          reperes: [
            {
              axe: "y" as const,
              valeur: 100,
              texte: "référence",
              trait: "dashed" as const,
            },
          ],
        }
      : {}),
    series: series.filter((s) => s.x.length),
  };
}

const fmt = (v: number, ch = 3) => {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-2 && v !== 0)) {
    const e = Math.floor(Math.log10(Math.abs(v)));
    return `$${String(Number((v / 10 ** e).toPrecision(ch)))} \\times 10^{${e}}$`;
  }
  return `$${String(Number(v.toPrecision(ch)))}$`;
};

/** Tableau LaTeX booktabs : par cas, déformation critique et cycles admissibles de chaque critère, et le critère dimensionnant. */
export function criteresLatex(
  t: TableauCriteres,
  o: { virgule?: boolean; trafic?: number | null } = {},
): string {
  const v = (s: string) =>
    o.virgule ? s.replace(/(\d)\.(\d)/g, "$1{,}$2") : s;
  const esc = (s: string) =>
    s.includes("$") ? s : s.replace(/([&%#_{}])/g, "\\$1");
  const n = t.criteres.length;
  const out = [
    "% Critères de dimensionnement (Thèse, exports COMSOL). Nécessite \\usepackage{booktabs}.",
    "\\begin{table}[htbp]",
    "\\centering",
    `\\begin{tabular}{l${"rr".repeat(n)}l}`,
    "\\toprule",
    ` & ${t.criteres.map((c) => `\\multicolumn{2}{c}{${esc(c.nom)}}`).join(" & ")} & \\\\`,
    t.criteres
      .map((_, k) => `\\cmidrule(lr){${2 + 2 * k}-${3 + 2 * k}}`)
      .join(" "),
    `Cas & ${t.criteres.map(() => `$\\varepsilon$ (µdef) & $N_{\\mathrm{adm}}$`).join(" & ")} & Dimensionnant \\\\`,
    "\\midrule",
  ];
  for (const l of t.lignes) {
    const d = critereDimensionnant(l, t.criteres);
    out.push(
      `${esc(l.legende)} & ${l.cases.map((x) => (ok(x) ? `${v(fmt(x.valeur))} & ${v(x.cycles ? fmt(x.cycles) : "—")}` : "— & —")).join(" & ")} & ${d ? esc(d.critere.nom) : "—"} \\\\`,
    );
  }
  out.push("\\bottomrule", "\\end{tabular}");
  if (o.trafic) out.push(`% Trafic de calcul : ${o.trafic} cycles.`);
  out.push("\\end{table}", "");
  return out.join("\n");
}
