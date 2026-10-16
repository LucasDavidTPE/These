/**
 * Exports « Données » à plusieurs instants (ou à plusieurs valeurs d'un balayage paramétrique) : COMSOL écrit une
 * colonne par grandeur et par instant (« 1e6*solid.eZZ (1) @ t=9 », « … @ t=10 »…). Ici : les paramètres qui
 * varient d'une colonne à l'autre, la vue d'un export à un instant choisi (ou l'enveloppe sur tous les instants),
 * le signal au cours du temps en un point, et la sonde (valeur interpolée en un point d'une carte).
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  grilleCoupe,
  type ColonneComsol,
  type ExportComsol,
  type UniteLongueur,
} from "./comsol";

export interface ValeurParametre {
  /** Texte écrit par COMSOL (« 10 s », « 9 »), clé de la valeur. */
  texte: string;
  nombre: number;
}
export interface Parametre {
  /** Nom du paramètre (« t », « Temps », « lc »). */
  nom: string;
  unite: string;
  valeurs: ValeurParametre[];
}

export type Enveloppe = "max" | "min" | "abs";
export type ChoixParametre = { valeur: string } | { enveloppe: Enveloppe };
/** Choix d'un instant (ou d'une enveloppe) par paramètre ; un paramètre absent : sa première valeur. */
export type Etape = Record<string, ChoixParametre>;

export const LIBELLES_ENVELOPPE: Record<Enveloppe, string> = {
  max: "maximum",
  min: "minimum",
  abs: "plus grande valeur absolue",
};

/** Colonnes « de même grandeur » : même expression, même unité, même libellé imposé. */
const cle = (c: ColonneComsol) =>
  `${c.expression}\u0000${c.unite}\u0000${c.libelle ? JSON.stringify(c.libelle) : ""}`;

function lireValeur(texte: string): ValeurParametre & { unite: string } {
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(.*)$/.exec(
    texte,
  );
  return m
    ? { texte, nombre: Number(m[1]), unite: m[2]!.trim() }
    : { texte, nombre: NaN, unite: "" };
}

/** Paramètres dont la valeur change entre colonnes d'une même grandeur, valeurs dans l'ordre croissant. */
export function parametresVariables(e: ExportComsol): Parametre[] {
  const groupes = new Map<string, ColonneComsol[]>();
  for (const c of e.colonnes)
    groupes.set(cle(c), [...(groupes.get(cle(c)) ?? []), c]);
  const noms: string[] = [];
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    for (const k of new Set(g.flatMap((c) => Object.keys(c.parametres))))
      if (
        new Set(g.map((c) => c.parametres[k] ?? "")).size > 1 &&
        !noms.includes(k)
      )
        noms.push(k);
  }
  return noms.map((nom) => {
    const lues = [
      ...new Set(
        e.colonnes
          .map((c) => c.parametres[nom])
          .filter((x): x is string => x !== undefined),
      ),
    ].map(lireValeur);
    if (lues.every((v) => Number.isFinite(v.nombre)))
      lues.sort((a, b) => a.nombre - b.nombre);
    return {
      nom,
      unite: lues.find((v) => v.unite)?.unite ?? "",
      valeurs: lues.map(({ texte, nombre }) => ({ texte, nombre })),
    };
  });
}

const reduire = (vs: number[], m: Enveloppe) => {
  let r = NaN;
  for (const v of vs) {
    if (!Number.isFinite(v)) continue;
    if (
      Number.isNaN(r) ||
      (m === "max" ? v > r : m === "min" ? v < r : Math.abs(v) > Math.abs(r))
    )
      r = v;
  }
  return r;
};

/**
 * L'export vu à une étape : une colonne par grandeur, celle de l'instant choisi (première valeur par défaut), ou
 * l'enveloppe point par point sur les instants (max, min, plus grande valeur absolue avec son signe). Les
 * colonnes sans le paramètre (grandeur calculée, export d'un seul instant) restent telles quelles. Sans
 * paramètre qui varie, l'export est rendu tel quel.
 */
export function vueEtape(
  e: ExportComsol,
  etape: Etape | null | undefined,
  params: readonly Parametre[] = parametresVariables(e),
): ExportComsol {
  if (!params.length) return e;
  const nc = e.coordonnees.length;
  const fixes: [string, string][] = [];
  let enveloppe: Enveloppe | null = null;
  const enveloppes: string[] = [];
  for (const p of params) {
    const ch = etape?.[p.nom];
    if (ch && "enveloppe" in ch) {
      enveloppe ??= ch.enveloppe;
      enveloppes.push(p.nom);
    } else
      fixes.push([
        p.nom,
        ch && p.valeurs.some((v) => v.texte === ch.valeur)
          ? ch.valeur
          : p.valeurs[0]!.texte,
      ]);
  }
  const groupes = new Map<string, number[]>();
  e.colonnes.forEach((c, j) => {
    if (
      fixes.every(
        ([k, v]) => c.parametres[k] === undefined || c.parametres[k] === v,
      )
    )
      groupes.set(cle(c), [...(groupes.get(cle(c)) ?? []), j]);
  });
  const colonnes: ColonneComsol[] = [];
  const valeurs: Float64Array[] = e.valeurs.slice(0, nc);
  for (const js of groupes.values()) {
    const c0 = e.colonnes[js[0]!]!;
    if (enveloppe && js.length > 1) {
      const sources = js.map((j) => e.valeurs[nc + j]!);
      const v = new Float64Array(e.lignes);
      for (let i = 0; i < e.lignes; i++)
        v[i] = reduire(
          sources.map((s) => s[i]!),
          enveloppe,
        );
      colonnes.push({
        ...c0,
        parametres: {
          ...c0.parametres,
          ...Object.fromEntries(
            enveloppes.map((k) => [
              k,
              `enveloppe (${enveloppe === "abs" ? "|max|" : enveloppe})`,
            ]),
          ),
        },
      });
      valeurs.push(v);
    } else {
      colonnes.push(c0);
      valeurs.push(e.valeurs[nc + js[0]!]!);
    }
  }
  return { ...e, colonnes, valeurs };
}

/** « t = 10 s », « enveloppe (max) sur t » : ce que montre une étape (pour les titres). */
export function titreEtape(
  etape: Etape | null | undefined,
  params: readonly Parametre[],
): string {
  return params
    .map((p) => {
      const ch = etape?.[p.nom];
      if (ch && "enveloppe" in ch)
        return `${ch.enveloppe === "abs" ? "|max|" : ch.enveloppe} sur ${p.nom}`;
      const v =
        ch && p.valeurs.some((x) => x.texte === ch.valeur)
          ? ch.valeur
          : p.valeurs[0]!.texte;
      return `${p.nom} = ${v}`;
    })
    .join(", ");
}

/** Paramètres qui varient dans au moins un des exports (réunis par nom, valeurs réunies et triées). */
export function parametresDesExports(es: readonly ExportComsol[]): Parametre[] {
  const out = new Map<string, Parametre>();
  for (const e of es)
    for (const p of parametresVariables(e)) {
      const deja = out.get(p.nom);
      if (!deja) out.set(p.nom, { ...p, valeurs: [...p.valeurs] });
      else
        for (const v of p.valeurs)
          if (!deja.valeurs.some((x) => x.texte === v.texte))
            deja.valeurs.push(v);
    }
  for (const p of out.values())
    if (p.valeurs.every((v) => Number.isFinite(v.nombre)))
      p.valeurs.sort((a, b) => a.nombre - b.nombre);
  return [...out.values()];
}

/** Nœud le plus proche d'un point (coordonnées du fichier ; `null` = coordonnée ignorée). */
export function noeudProche(
  e: ExportComsol,
  point: readonly (number | null)[],
): number {
  let meilleur = -1;
  let d2 = Infinity;
  for (let i = 0; i < e.lignes; i++) {
    let d = 0;
    point.forEach((p, k) => {
      if (p !== null && k < e.coordonnees.length)
        d += (e.valeurs[k]![i]! - p) ** 2;
    });
    if (d < d2) {
      d2 = d;
      meilleur = i;
    }
  }
  return meilleur;
}

/**
 * Signal au cours du paramètre `parametre` (le temps) en `point` (coordonnées du fichier ; null = coordonnée
 * ignorée) : une « table » comme celles que COMSOL exporte (temps en première colonne, une colonne par
 * grandeur), traçable dans « Signal dans le temps ». Sur une coupe régulière, valeur interpolée dans la maille
 * (comme la sonde) ; sinon, nœud le plus proche. Les autres paramètres suivent `etape`.
 */
export function signalAuPoint(
  e: ExportComsol,
  point: readonly (number | null)[],
  o: { parametre: string; etape?: Etape | null; nom: string; legende: string },
): ExportComsol {
  const params = parametresVariables(e);
  const p = params.find((x) => x.nom === o.parametre);
  if (!p)
    throw new Error(
      `${e.nom} : pas de colonnes à plusieurs valeurs de « ${o.parametre} ».`,
    );
  if (!e.lignes) throw new Error(`${e.nom} : fichier vide.`);
  const nc = e.coordonnees.length;
  const vues = p.valeurs.map((v) =>
    vueEtape(e, { ...(o.etape ?? {}), [p.nom]: { valeur: v.texte } }, params),
  );
  const g = geometrie(e);
  const [kx, ky] = g.varient as [number, number];
  const px = point[kx];
  const py = point[ky];
  const interpole =
    g.genre === "coupe" &&
    g.reguliere &&
    typeof px === "number" &&
    typeof py === "number";
  let lire: (vue: ExportComsol, j: number) => number;
  let ou: number[];
  if (interpole) {
    // grille dans l'unité du fichier (facteur 1)
    const u = (
      FACTEUR_LONGUEUR[e.uniteLongueur] ? e.uniteLongueur : "m"
    ) as UniteLongueur;
    const f = FACTEUR_LONGUEUR[u]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
    lire = (vue, j) => {
      const v = valeurCarte(
        grilleCoupe(vue, vue.colonnes[j]!.expression, u),
        px * f,
        py * f,
      );
      if (v === null)
        throw new Error(`${e.nom} : le point est hors de la grille.`);
      return v;
    };
    ou = e.coordonnees.map((_, k) =>
      k === kx ? px : k === ky ? py : e.valeurs[k]![0]!,
    );
  } else {
    const i = noeudProche(e, point);
    lire = (vue, j) => vue.valeurs[nc + j]![i]!;
    ou = e.coordonnees.map((_, k) => e.valeurs[k]![i]!);
  }
  const colonnes = vues[0]!.colonnes.map((c) => {
    const parametres: Record<string, string> = {
      ...c.parametres,
      Point: `(${ou.map((x) => Number(x.toPrecision(6))).join(", ")})`,
    };
    delete parametres[p.nom];
    return { ...c, parametres };
  });
  return {
    nom: o.nom,
    meta: { ...e.meta },
    coordonnees: [p.nom],
    uniteLongueur: e.uniteLongueur,
    colonnes,
    valeurs: [
      Float64Array.from(p.valeurs.map((v) => v.nombre)),
      ...colonnes.map((_, j) => Float64Array.from(vues.map((v) => lire(v, j)))),
    ],
    lignes: p.valeurs.length,
    nature: "table",
    uniteArgument: p.unite,
    legende: o.legende,
  };
}

export type Grille = ReturnType<typeof grilleCoupe>;

/** Valeur d'une carte en (x, y) (unité de tracé) : interpolation bilinéaire dans la maille, null hors de la grille. */
export function valeurCarte(
  g: Pick<Grille, "x" | "y" | "v">,
  x: number,
  y: number,
): number | null {
  const cellule = (t: readonly number[], v: number) => {
    if (t.length === 1)
      return Math.abs(v - t[0]!) < 1e-12 ? { i: 0, f: 0 } : null;
    const croissant = t[t.length - 1]! >= t[0]!;
    for (let i = 0; i + 1 < t.length; i++) {
      const [a, b] = croissant ? [t[i]!, t[i + 1]!] : [t[i + 1]!, t[i]!];
      if (v >= a - 1e-12 && v <= b + 1e-12)
        return { i, f: b === a ? 0 : (croissant ? v - a : b - v) / (b - a) };
    }
    return null;
  };
  const cx = cellule(g.x, x);
  const cy = cellule(g.y, y);
  if (!cx || !cy) return null;
  const at = (j: number, i: number) =>
    g.v[Math.min(j, g.y.length - 1)]?.[Math.min(i, g.x.length - 1)] ?? null;
  const coins = [
    [at(cy.i, cx.i), (1 - cx.f) * (1 - cy.f)],
    [at(cy.i, cx.i + 1), cx.f * (1 - cy.f)],
    [at(cy.i + 1, cx.i), (1 - cx.f) * cy.f],
    [at(cy.i + 1, cx.i + 1), cx.f * cy.f],
  ] as const;
  let s = 0;
  let w = 0;
  for (const [v, p] of coins)
    if (v !== null && Number.isFinite(v) && p > 0) {
      s += v * p;
      w += p;
    }
  if (w > 0) return s / w;
  // point exactement sur un nœud (poids nuls ailleurs)
  const n = coins.find(([v]) => v !== null && Number.isFinite(v));
  return n ? n[0] : null;
}

/** Sonde : valeur de `expression` en (x, y) (unité de tracé) sur la carte de chaque plan donné. */
export function sonder(
  plans: readonly ExportComsol[],
  expression: string,
  longueur: UniteLongueur,
  x: number,
  y: number,
): { fichier: string; valeur: number | null }[] {
  return plans.map((p) => {
    try {
      return {
        fichier: p.nom,
        valeur: valeurCarte(grilleCoupe(p, expression, longueur), x, y),
      };
    } catch {
      return { fichier: p.nom, valeur: null };
    }
  });
}

/**
 * Carte affinée : `k` − 1 nœuds interpolés (bilinéaire) entre deux nœuds de la grille, dans chaque direction —
 * un rendu plus lisse qu'avec une cellule par nœud. Les valeurs aux nœuds d'origine ne changent pas.
 */
export function affinerCarte<C extends Pick<Grille, "x" | "y" | "v">>(c: C, k: number): C {
  const n = Math.max(1, Math.min(8, Math.round(k)));
  if (n === 1 || c.x.length < 2 || c.y.length < 2) return c;
  const fin = (t: readonly number[]) => t.flatMap((v, i) => (i + 1 < t.length ? Array.from({ length: n }, (_, j) => Number((v + ((t[i + 1]! - v) * j) / n).toPrecision(12))) : [v]));
  const x = fin(c.x);
  const y = fin(c.y);
  return { ...c, x, y, v: y.map((yy) => x.map((xx) => valeurCarte(c, xx, yy))) };
}
