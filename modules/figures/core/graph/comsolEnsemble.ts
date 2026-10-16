/**
 * Vue d'ensemble de l'étude : la même grandeur pour tous les cas d'un coup — petites cartes (ou petits profils)
 * à la même échelle, rangées en matrice d'après les mots des noms de fichiers, le pic écrit sous chacune. Pour
 * voir d'un œil ce qui change d'un cas à l'autre avant de choisir quoi tracer en grand.
 *
 * Et les grandeurs dérivées usuelles, proposées d'après les colonnes d'un fichier (déformations principales dans
 * un plan, cisaillement maximal, déformation volumique…), à ajouter comme colonnes calculées.
 */
import { bornesCarte } from "./carte";
import {
  geometrie,
  grapheCarte,
  grapheProfils,
  libelleColonne,
  type ExportComsol,
  type Interface,
  type UniteLongueur,
} from "./comsol";
import { nomsColonnes } from "./comsolCalcul";
import { motsVariables, ranger, type Matrice } from "./comsolLot";
import { statistique } from "./comsolSensibilite";
import type { GraphDoc } from "./model";

export interface CaseEnsemble {
  fichier: string;
  doc: GraphDoc;
  pic: { y: number; position?: Record<string, number> } | null;
}

/** Cas présentables ensemble : plans réguliers, ou lignes, qui ont la grandeur. */
export function casEnsemble(
  exports: readonly ExportComsol[],
  genre: "coupe" | "profil",
  expression: string,
): ExportComsol[] {
  return exports.filter((e) => {
    const g = geometrie(e);
    return (
      g.genre === genre &&
      (genre === "profil" || g.reguliere) &&
      e.colonnes.some((c) => c.expression === expression)
    );
  });
}

/**
 * Petites figures de chaque cas, échelle commune (couleurs d'une carte, axes d'un profil), rangées par deux mots
 * des noms (n° `ligne`, `colonne` ; défaut : les deux premiers mots qui varient).
 */
export function vueEnsemble(
  exports: readonly ExportComsol[],
  genre: "coupe" | "profil",
  expression: string,
  o: {
    longueur: UniteLongueur;
    ligne?: number | null;
    colonne?: number | null;
    interfaces?: readonly Interface[];
    legende: (e: ExportComsol) => string;
  },
): { matrice: Matrice; cases: Map<string, CaseEnsemble> } {
  const es = casEnsemble(exports, genre, expression);
  if (!es.length) throw new Error("Aucun cas avec cette grandeur.");
  const noms = es.map((e) => e.nom);
  const v = motsVariables(noms);
  const ligne =
    o.ligne === undefined ? (v.length >= 2 ? v[0]!.k : null) : o.ligne;
  const colonne =
    o.colonne === undefined
      ? v.length >= 2
        ? v[1]!.k
        : (v[0]?.k ?? null)
      : o.colonne;
  let matrice: Matrice;
  try {
    matrice = ranger(noms, ligne, colonne);
  } catch {
    // deux cas dans la même case : une seule ligne, dans l'ordre des fichiers
    matrice = { lignes: [""], colonnes: es.map(o.legende), cases: [noms] };
  }
  const cases = new Map<string, CaseEnsemble>();
  if (genre === "coupe") {
    const docs = es.map((e) =>
      grapheCarte(e, expression, o.longueur, { interfaces: o.interfaces }),
    );
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of docs) {
      const [a, b] = bornesCarte(d.carte!);
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
    es.forEach((e, i) =>
      cases.set(e.nom, {
        fichier: e.nom,
        doc: {
          ...docs[i]!,
          width: 90,
          height: Math.min(70, Math.max(35, docs[i]!.height * 0.6)),
          carte: { ...docs[i]!.carte!, min: lo, max: hi },
        },
        pic: statistique(e, expression, { stat: "abs", longueur: o.longueur }),
      }),
    );
  } else {
    const docs = es.map((e) =>
      grapheProfils([e], {
        expressions: [expression],
        longueur: o.longueur,
        profondeur: true,
        noms: [o.legende(e)],
        interfaces: o.interfaces,
      }),
    );
    const xs = docs.flatMap((d) => d.series.flatMap((s) => s.x));
    const ys = docs.flatMap((d) => d.series.flatMap((s) => s.y));
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    es.forEach((e, i) => {
      const d = docs[i]!;
      cases.set(e.nom, {
        fichier: e.nom,
        doc: {
          ...d,
          width: 70,
          height: 70,
          legend: "none",
          x: { ...d.x, min: x0, max: x1 },
          y: { ...d.y, ...(d.y.min === undefined ? { min: y0, max: y1 } : {}) },
        },
        pic: statistique(e, expression, { stat: "abs", longueur: o.longueur }),
      });
    });
  }
  return { matrice, cases };
}

export interface ColonneProposee {
  nom: string;
  formule: string;
  unite: string;
  explication: string;
}

/** Grandeurs dérivées calculables à partir des colonnes d'un export (noms courts : exx, ezz, exz…). */
export function colonnesProposees(e: ExportComsol): ColonneProposee[] {
  const n = nomsColonnes(e);
  const a = (x: string) => n.has(x);
  const unite = (x: string) => {
    const j = n.get(x);
    return j === undefined || j < e.coordonnees.length
      ? ""
      : libelleColonne(e.colonnes[j - e.coordonnees.length]!).unite;
  };
  const out: ColonneProposee[] = [];
  for (const [p, q, r, plan] of [
    ["exx", "ezz", "exz", "x-z"],
    ["eyy", "ezz", "eyz", "y-z"],
    ["exx", "eyy", "exy", "x-y"],
  ] as const) {
    if (!a(p) || !a(q) || !a(r)) continue;
    const u = unite(p);
    const rayon = `sqrt((0.5*(${p}-${q}))^2 + ${r}^2)`;
    out.push(
      {
        nom: `ε1 (${plan})`,
        formule: `0.5*(${p}+${q}) + ${rayon}`,
        unite: u,
        explication: `Déformation principale majeure dans le plan ${plan} (${r} tensoriel).`,
      },
      {
        nom: `ε3 (${plan})`,
        formule: `0.5*(${p}+${q}) - ${rayon}`,
        unite: u,
        explication: `Déformation principale mineure dans le plan ${plan}.`,
      },
      {
        nom: `γmax (${plan})`,
        formule: `2*${rayon}`,
        unite: u,
        explication: `Cisaillement maximal dans le plan ${plan} (ε1 − ε3).`,
      },
    );
  }
  if (a("exx") && a("eyy") && a("ezz"))
    out.push({
      nom: "εvol",
      formule: "exx + eyy + ezz",
      unite: unite("exx"),
      explication: "Déformation volumique (trace du tenseur).",
    });
  if (a("exx") && a("eyy"))
    out.push({
      nom: "εh max",
      formule: "max(exx, eyy)",
      unite: unite("exx"),
      explication:
        "Plus forte déformation horizontale (traction à la base des couches liées).",
    });
  if (a("ezz"))
    out.push({
      nom: "|εzz|",
      formule: "abs(ezz)",
      unite: unite("ezz"),
      explication:
        "Compression verticale comptée positive (critère d'orniérage).",
    });
  if (a("sxx") && a("szz") && a("sxz"))
    out.push({
      nom: "τmax (x-z)",
      formule: "sqrt((0.5*(sxx-szz))^2 + sxz^2)",
      unite: unite("sxx"),
      explication: "Contrainte de cisaillement maximale dans le plan x-z.",
    });
  if (a("sxx") && a("syy") && a("szz") && a("sxy") && a("syz") && a("sxz"))
    out.push({
      nom: "σVM",
      formule:
        "sqrt(0.5*((sxx-syy)^2 + (syy-szz)^2 + (szz-sxx)^2) + 3*(sxy^2 + syz^2 + sxz^2))",
      unite: unite("sxx"),
      explication: "Contrainte équivalente de von Mises.",
    });
  // déjà présentes : non proposées
  const deja = new Set(e.colonnes.map((c) => libelleColonne(c).court));
  return out.filter((c) => !deja.has(c.nom));
}
