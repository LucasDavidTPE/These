/**
 * Études COMSOL : tout ce qu'il faut pour refaire une analyse à l'identique, sur l'autre PC ou quand COMSOL a
 * réexporté ses fichiers. Une étude (`_comsol/etudes/<id>.json` dans la bibliothèque de figures) garde :
 *  - les fichiers, par référence commune aux deux PC (`onedrive:Thèse/COMSOL/x.txt`), avec leur lecture
 *    corrigée, leur légende et leurs transformations (colonnes calculées, repères), rejouées dans l'ordre ;
 *  - les fichiers dérivés (A / B, A − B…), recalculés à l'ouverture ;
 *  - des **recettes** : un tracé de l'atelier (mode et réglages), sérialisable, exécuté par une fonction pure.
 * Un graphe issu d'une recette porte `origine` dans son graph.json : il se régénère depuis les fichiers, en
 * gardant ses retouches (couleurs, titres, tailles).
 */
import { bornesCarte, type PaletteCarte } from "./carte";
import {
  FACTEUR_LONGUEUR,
  geometrie,
  grapheCarte,
  grapheProfils,
  legendes,
  libelleColonne,
  lireComsol,
  type Correspondance,
  type ExportComsol,
  type Interface,
  type SourceLegende,
  type UniteLongueur,
} from "./comsol";
import { ajouterColonne, changerRepere, combiner, grapheBarres, grapheTemporel, motsDuNom, pic, profilsInterpoles, synthese, type LigneSynthese, type ModePic, type Operation, type Statistique } from "./comsolCalcul";
import { hauteurEgale } from "./layout";
import type { GraphDoc, Series } from "./model";

export const ETUDE_FORMAT = "these-comsol-etude/1";
export const DOSSIER_ETUDES = "_comsol/etudes";

export type Transformation = { genre: "colonne"; formule: string; nom: string; unite: string } | { genre: "repere"; k: number; facteur: number; origine: number };

export interface FichierEtude {
  /** Nom du fichier, clé unique dans l'étude. */
  nom: string;
  /** Référence commune aux deux PC (« onedrive:… », « espace:… ») ou d'une racine du poste ; null : inconnue. */
  source: string | null;
  /** Dernier chemin absolu connu (secours si la référence ne se résout pas). */
  absolu: string | null;
  forcer?: number[];
  legende?: string;
  transformations: Transformation[];
}

/** Fichier calculé à partir d'autres (rejoué à l'ouverture). */
export interface Derive {
  nom: string;
  genre: "operation";
  a: string;
  b: string;
  op: Operation;
  legendeA: string;
  legendeB: string;
}

// ---- Recettes (tracés de l'atelier) ----

export type ModeTrace = "profils" | "carte" | "coupe-profils" | "temps" | "comparer" | "synthese";

export interface TraceProfils {
  mode: "profils";
  /** Lignes tracées (noms de fichiers) ; null : toutes. */
  fichiers: string[] | null;
  /** Grandeurs ; vide : εzz (ou la première). */
  expressions: string[];
  orientation: "auto" | "verticale" | "horizontale";
  profondeur: boolean;
}
export interface TraceCarte {
  mode: "carte";
  plan: string | null;
  expression: string | null;
  palette: PaletteCarte | "auto";
  isolignes: number[];
  egalite: boolean;
}
export interface TraceCoupeProfils {
  mode: "coupe-profils";
  plan: string | null;
  expression: string | null;
  sens: "verticales" | "horizontales";
  /** Positions des lignes, dans l'unité de tracé. */
  valeurs: number[];
  profondeur: boolean;
}
export type Reference = { genre: "aucune" } | { genre: "valeur"; valeur: number; texte: string } | { genre: "fichier"; fichier: string; texte: string };
export interface TraceTemps {
  mode: "temps";
  fichiers: string[] | null;
  expressions: string[];
  reference: Reference;
  instant: number | null;
  pic: ModePic | null;
}
export interface TraceComparer {
  mode: "comparer";
  a: string | null;
  b: string | null;
  op: Operation;
  expression: string | null;
}
export interface TraceSynthese {
  mode: "synthese";
  fichiers: string[] | null;
  expressions: string[];
  virgule: boolean;
  barres: { expression: string | null; categorie: number | null; groupe: number | null; statistique: Statistique };
}
export type Trace = TraceProfils | TraceCarte | TraceCoupeProfils | TraceTemps | TraceComparer | TraceSynthese;

/** Réglages de l'atelier au moment du tracé (gardés avec la recette). */
export interface Cadre {
  longueur: UniteLongueur;
  couches: boolean;
  source: SourceLegende;
}

export interface Recette {
  id: string;
  nom: string;
  trace: Trace;
  cadre: Cadre;
}

export interface EtudeComsol {
  format: typeof ETUDE_FORMAT;
  id: string;
  titre: string;
  modifie: string;
  cadre: Cadre;
  fichiers: FichierEtude[];
  derives: Derive[];
  recettes: Recette[];
}

export function traceVide(mode: ModeTrace): Trace {
  switch (mode) {
    case "profils":
      return { mode, fichiers: null, expressions: [], orientation: "auto", profondeur: true };
    case "carte":
      return { mode, plan: null, expression: null, palette: "auto", isolignes: [], egalite: false };
    case "coupe-profils":
      return { mode, plan: null, expression: null, sens: "verticales", valeurs: [], profondeur: true };
    case "temps":
      return { mode, fichiers: null, expressions: [], reference: { genre: "aucune" }, instant: 10, pic: "abs" };
    case "comparer":
      return { mode, a: null, b: null, op: "rapport", expression: null };
    case "synthese":
      return { mode, fichiers: null, expressions: [], virgule: true, barres: { expression: null, categorie: null, groupe: null, statistique: "abs" } };
  }
}

// ---- Exécution ----

export interface ContexteTrace {
  exports: readonly ExportComsol[];
  cadre: Cadre;
  /** Légendes saisies (par nom de fichier). */
  noms: Readonly<Record<string, string>>;
  correspondances: readonly Correspondance[];
  interfaces: readonly Interface[];
}

/** Légende de chaque fichier : saisie, sinon calculée entre fichiers de même forme (correspondances comprises). */
export function legendesDe(c: Pick<ContexteTrace, "exports" | "noms" | "correspondances" | "cadre">): (e: ExportComsol) => string {
  const auto = new Map<ExportComsol, string>();
  for (const g of ["profil", "serie", "coupe", "volume", "point"] as const) {
    const es = c.exports.filter((e) => geometrie(e).genre === g);
    legendes(es, { correspondances: c.correspondances, source: c.cadre.source }).forEach((l, k) => auto.set(es[k]!, l));
  }
  return (e) => c.noms[e.nom] ?? auto.get(e) ?? e.nom.replace(/\.(txt|csv|dat)$/i, "");
}

/** Expressions communes à des exports (dans l'ordre du premier). */
export const expressionsCommunes = (es: readonly ExportComsol[]) => (es.length ? es[0]!.colonnes.map((c) => c.expression).filter((x) => es.every((e) => e.colonnes.some((c) => c.expression === x))) : []);
/** εzz si elle existe, sinon la première. */
export const expressionParDefaut = (xs: readonly string[]) => xs.find((x) => /ezz$/i.test(x)) ?? xs[0] ?? null;
export const courtDe = (e: ExportComsol | undefined, x: string) => {
  const c = e?.colonnes.find((k) => k.expression === x);
  return c ? `${libelleColonne(c).court} (${libelleColonne(c).unite})` : x;
};
const fr = (x: number) => String(Number(x.toPrecision(5))).replace(".", ",").replace("-", "−");

const lignesDe = (es: readonly ExportComsol[]) => es.filter((e) => geometrie(e).genre === "profil");
const plansDe = (es: readonly ExportComsol[]) => es.filter((e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere);
const tablesDe = (es: readonly ExportComsol[]) => es.filter((e) => e.nature === "table");
const parNom = (es: readonly ExportComsol[], nom: string | null) => (nom ? es.find((e) => e.nom === nom) : undefined);
const choisis = (tous: readonly ExportComsol[], noms: string[] | null) => (noms ? tous.filter((e) => noms.includes(e.nom)) : [...tous]);
const garder = (liste: string[], dispo: readonly string[], defaut: string | null) => {
  const l = liste.filter((x) => dispo.includes(x));
  return l.length ? l : defaut ? [defaut] : [];
};

/**
 * Recette complétée d'après les fichiers ouverts : fichier, grandeur… par défaut là où rien n'est choisi, et
 * choix devenus impossibles (fichier retiré) remplacés. C'est ce que l'interface affiche et ce qui s'exécute.
 */
export function normaliser(t: Trace, exports: readonly ExportComsol[]): Trace {
  switch (t.mode) {
    case "profils": {
      const l = choisis(lignesDe(exports), t.fichiers);
      const dispo = expressionsCommunes(l.length ? l : lignesDe(exports));
      return { ...t, expressions: garder(t.expressions, dispo, expressionParDefaut(dispo)) };
    }
    case "carte":
    case "coupe-profils": {
      const plans = plansDe(exports);
      const p = parNom(plans, t.plan) ?? plans[0];
      const dispo = p ? p.colonnes.map((c) => c.expression) : [];
      const x = t.expression && dispo.includes(t.expression) ? t.expression : expressionParDefaut(dispo);
      return { ...t, plan: p?.nom ?? null, expression: x };
    }
    case "temps": {
      const l = choisis(tablesDe(exports), t.fichiers);
      const dispo = expressionsCommunes(l.length ? l : tablesDe(exports));
      return { ...t, expressions: garder(t.expressions, dispo, dispo[0] ?? null) };
    }
    case "comparer": {
      const a = parNom(exports, t.a) ?? exports[0];
      const b = parNom(exports, t.b) ?? exports.find((e) => e !== a);
      const dispo = a && b ? expressionsCommunes([a, b]) : [];
      return { ...t, a: a?.nom ?? null, b: b?.nom ?? null, expression: t.expression && dispo.includes(t.expression) ? t.expression : expressionParDefaut(dispo) };
    }
    case "synthese": {
      const l = t.fichiers ? choisis(exports, t.fichiers) : exports.filter((e) => !e.legende && e.nature !== "table" && geometrie(e).genre !== "point");
      const dispo = expressionsCommunes(l);
      const expressions = garder(t.expressions, dispo, expressionParDefaut(dispo));
      const mots = l.length ? motsDuNom(l[0]!.nom) : [];
      return {
        ...t,
        fichiers: l.map((e) => e.nom),
        expressions,
        barres: {
          ...t.barres,
          expression: t.barres.expression && expressions.includes(t.barres.expression) ? t.barres.expression : (expressions[0] ?? null),
          categorie: t.barres.categorie ?? Math.max(0, mots.length - 1),
          groupe: t.barres.groupe ?? Math.max(0, mots.length - 2),
        },
      };
    }
  }
}

export interface ResultatTrace {
  doc: GraphDoc;
  titre: string;
  /** Tableau de synthèse (mode synthèse). */
  lignes?: LigneSynthese[];
  /** Fichier calculé (mode comparer), à garder dans la liste si on le souhaite. */
  calcule?: ExportComsol;
}

const interfacesSi = (c: ContexteTrace) => (c.cadre.couches ? c.interfaces : undefined);

/**
 * Carte d'un plan avec les lignes de la recette « profils dans une coupe » (a, b, c…) : ce sur quoi on clique.
 * null tant qu'il n'y a pas de plan.
 */
export function carteDeSelection(t0: TraceCoupeProfils, c: ContexteTrace): GraphDoc | null {
  const t = normaliser(t0, c.exports) as TraceCoupeProfils;
  const p = parNom(c.exports, t.plan);
  if (!p || !t.expression) return null;
  const doc = grapheCarte(p, t.expression, c.cadre.longueur, { interfaces: interfacesSi(c) });
  const lettre = (i: number) => String.fromCharCode(97 + (i % 26));
  return { ...doc, reperes: [...(doc.reperes ?? []), ...t.valeurs.map((v, i) => ({ axe: t.sens === "verticales" ? ("x" as const) : ("y" as const), valeur: v, texte: lettre(i), trait: "solid" as const }))] };
}

/** Exécute une recette : le graphe (et le tableau, pour une synthèse) ; null s'il manque de quoi tracer. */
export function executerTrace(t0: Trace, c: ContexteTrace): ResultatTrace | null {
  const t = normaliser(t0, c.exports);
  const legende = legendesDe(c);
  const L = c.cadre.longueur;
  switch (t.mode) {
    case "profils": {
      const l = choisis(lignesDe(c.exports), t.fichiers);
      if (!l.length || !t.expressions.length) return null;
      const enZ = l.every((e) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));
      const doc = grapheProfils(l, { expressions: t.expressions, longueur: L, profondeur: enZ && t.orientation !== "horizontale" && t.profondeur, orientation: t.orientation, noms: l.map(legende), interfaces: interfacesSi(c) });
      const titre = t.expressions.length === 1 ? `${courtDe(l[0], t.expressions[0]!)} — ${l.length} profil(s) COMSOL` : `Profils COMSOL — ${l.map(legende).join(", ")}`;
      return { doc, titre };
    }
    case "carte": {
      const p = parNom(c.exports, t.plan);
      if (!p || !t.expression) return null;
      let doc = grapheCarte(p, t.expression, L, { interfaces: interfacesSi(c) });
      doc = { ...doc, carte: { ...doc.carte!, ...(t.palette !== "auto" ? { palette: t.palette } : {}), ...(t.isolignes.length ? { isolignes: [...t.isolignes] } : {}) } };
      if (t.egalite) doc = { ...doc, egalite: true, height: hauteurEgale({ ...doc, egalite: true }) };
      return { doc, titre: `${legende(p)} — ${courtDe(p, t.expression)}` };
    }
    case "coupe-profils": {
      const p = parNom(c.exports, t.plan);
      if (!p || !t.expression || !t.valeurs.length) return null;
      const [kx, ky] = geometrie(p).varient as [number, number];
      const fixe = t.sens === "verticales" ? kx : ky;
      const nomFixe = p.coordonnees[fixe]!.toLowerCase();
      const f = FACTEUR_LONGUEUR[L]! / (FACTEUR_LONGUEUR[p.uniteLongueur] ?? 1);
      const lettre = (i: number) => String.fromCharCode(97 + (i % 26));
      const profils = profilsInterpoles(
        p,
        fixe,
        t.valeurs.map((v) => v / f),
      ).map((x, i) => ({ ...x, legende: `${lettre(i)}. $${nomFixe}$ = ${fr(t.valeurs[i]!)} ${L}` }));
      return {
        doc: grapheProfils(profils, { expressions: [t.expression], longueur: L, profondeur: t.profondeur, interfaces: interfacesSi(c) }),
        titre: `${courtDe(p, t.expression)} — profils à ${nomFixe} = ${t.valeurs.map(fr).join(" ; ")} ${L}`,
      };
    }
    case "temps": {
      const l = choisis(tablesDe(c.exports), t.fichiers);
      if (!l.length || !t.expressions.length) return null;
      let reference: { valeur: number; texte: string } | null = null;
      if (t.reference.genre === "valeur") reference = { valeur: t.reference.valeur, texte: t.reference.texte };
      else if (t.reference.genre === "fichier") {
        const e = parNom(c.exports, t.reference.fichier);
        if (!e) throw new Error(`Référence : le fichier ${t.reference.fichier} n'est plus ouvert.`);
        const j = e.colonnes.findIndex((k) => k.expression === t.expressions[0]);
        if (j < 0) throw new Error(`${legende(e)} n'a pas la grandeur ${courtDe(l[0], t.expressions[0]!)}.`);
        const pk = pic(e.valeurs[0]!, e.valeurs[e.coordonnees.length + j]!, "abs");
        if (pk) reference = { valeur: Number(pk.y.toPrecision(6)), texte: t.reference.texte || legende(e) };
      }
      return {
        doc: grapheTemporel(l, { expressions: t.expressions, noms: l.map(legende), reference, instant: t.instant, pic: t.pic }),
        titre: `${courtDe(l[0], t.expressions[0]!)} au cours du temps — ${l.map(legende).join(", ")}`,
      };
    }
    case "comparer": {
      const A = parNom(c.exports, t.a);
      const B = parNom(c.exports, t.b);
      if (!A || !B || !t.expression) return null;
      if (A === B) throw new Error("A et B sont le même fichier.");
      const res = combiner(A, B, t.op, { nomA: legende(A), nomB: legende(B), expressions: [t.expression] });
      const g = geometrie(res).genre;
      const titre = `${courtDe(A, t.expression)} : ${res.legende}`;
      if (g === "coupe") return { doc: grapheCarte(res, t.expression, L, { interfaces: interfacesSi(c) }), titre, calcule: res };
      if (g === "profil") return { doc: grapheProfils([res], { expressions: [t.expression], longueur: L, profondeur: true, noms: [res.legende!], interfaces: interfacesSi(c) }), titre, calcule: res };
      if (g === "serie") return { doc: grapheTemporel([res], { expressions: [t.expression], noms: [res.legende!] }), titre, calcule: res };
      throw new Error("Ce genre de fichier ne se trace pas directement ; le résultat peut aller dans la synthèse.");
    }
    case "synthese": {
      const l = choisis(c.exports, t.fichiers);
      if (!l.length || !t.expressions.length) return null;
      const lignes = synthese(l, t.expressions, { longueur: L, correspondances: c.correspondances }).map((x) => ({ ...x, legende: legende(l.find((e) => e.nom === x.fichier)!) }));
      const b = t.barres;
      const doc = grapheBarres(lignes, { expression: b.expression ?? t.expressions[0]!, categorie: b.categorie ?? 0, groupe: b.groupe ?? 0, statistique: b.statistique, correspondances: c.correspondances });
      return { doc, titre: `${courtDe(l[0], b.expression ?? t.expressions[0]!)} — synthèse COMSOL`, lignes };
    }
  }
}

// ---- Fichiers : relecture et transformations ----

/** Applique une transformation à un export (colonne calculée, changement de repère). */
export function transformer(e: ExportComsol, t: Transformation): ExportComsol {
  return t.genre === "colonne" ? ajouterColonne(e, t) : changerRepere(e, t.k, { facteur: t.facteur, origine: t.origine });
}

/** Un fichier lu tel quel → tel que l'étude le veut : lecture corrigée, puis transformations dans l'ordre. */
export function appliquerFichier(brut: ExportComsol, f: Pick<FichierEtude, "forcer" | "transformations">): ExportComsol {
  let e: ExportComsol = { ...brut };
  if (f.forcer) e.forcer = [...f.forcer];
  else delete e.forcer;
  for (const t of f.transformations) e = transformer(e, t);
  return e;
}

/** Relit un fichier de l'étude : lecture, lecture corrigée, transformations dans l'ordre. */
export function construireExport(texte: string, f: FichierEtude): ExportComsol {
  return appliquerFichier(lireComsol(texte, f.nom), f);
}

/** Recalcule les fichiers dérivés (dans l'ordre : un dérivé peut en utiliser un autre). Les impossibles sont signalés. */
export function construireDerives(base: readonly ExportComsol[], derives: readonly Derive[]): { exports: ExportComsol[]; erreurs: string[] } {
  const out = [...base];
  const erreurs: string[] = [];
  for (const d of derives) {
    const a = out.find((e) => e.nom === d.a);
    const b = out.find((e) => e.nom === d.b);
    if (!a || !b) {
      erreurs.push(`${d.nom} : ${!a ? d.a : d.b} manque.`);
      continue;
    }
    try {
      out.push({ ...combiner(a, b, d.op, { nomA: d.legendeA, nomB: d.legendeB }), nom: d.nom });
    } catch (e) {
      erreurs.push(`${d.nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { exports: out, erreurs };
}

// ---- Régénération d'une figure ----

/**
 * Remplace les données d'une figure par celles d'une nouvelle exécution de sa recette, en gardant ses retouches :
 * styles, titres d'axes, noms des séries, taille, repères ajoutés à la main, palette et bornes de la carte. Les
 * bornes d'axes égales à l'ancienne grille suivent la nouvelle ; les annotations calculées (pics) sont refaites.
 */
export function rafraichirDonnees(ancien: GraphDoc, neuf: GraphDoc, o: { annotationsCalculees?: boolean } = {}): GraphDoc {
  const series: Series[] = neuf.series.map((s, i) => {
    const a = ancien.series[i];
    return a ? { ...a, x: [...s.x], y: [...s.y] } : s;
  });
  const out: GraphDoc = { ...ancien, series };
  if (neuf.carte) {
    out.carte = ancien.carte ? { ...ancien.carte, x: [...neuf.carte.x], y: [...neuf.carte.y], v: neuf.carte.v.map((l) => [...l]) } : neuf.carte;
    // bornes d'axes posées sur l'ancienne grille → la nouvelle grille
    for (const k of ["x", "y"] as const) {
      const ag = ancien.carte?.[k];
      const ng = neuf.carte[k];
      if (ag && ancien[k].min === ag[0] && ancien[k].max === ag.at(-1)) out[k] = { ...ancien[k], min: ng[0], max: ng.at(-1) };
    }
  }
  if (o.annotationsCalculees) {
    if (neuf.annotations) out.annotations = neuf.annotations;
    else delete out.annotations;
    // références et instants recalculés aussi (la référence peut venir d'un fichier)
    out.reperes = [...(neuf.reperes ?? [])];
  }
  if (neuf.x.categories) out.x = { ...out.x, categories: neuf.x.categories };
  return out;
}

/** Les bornes de couleurs communes ont-elles changé ? (pour prévenir que l'échelle d'une planche peut bouger) */
export const memesBornes = (a: GraphDoc, b: GraphDoc) => !a.carte || !b.carte || bornesCarte(a.carte).join() === bornesCarte(b.carte).join();

// ---- Lecture / écriture ----

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const chaines = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const nombres = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : []);
const MODES: ModeTrace[] = ["profils", "carte", "coupe-profils", "temps", "comparer", "synthese"];

export function lireCadre(v: unknown): Cadre {
  const c = estObjet(v) ? v : {};
  return {
    longueur: c.longueur === "m" || c.longueur === "cm" ? c.longueur : "mm",
    couches: c.couches !== false,
    source: c.source === "nom" || c.source === "parametres" || c.source === "les-deux" ? c.source : "auto",
  };
}

/** Recette lue avec tolérance : un champ inconnu ou abîmé reprend sa valeur par défaut. */
export function lireTrace(v: unknown): Trace | null {
  if (!estObjet(v) || !MODES.includes(v.mode as ModeTrace)) return null;
  const base = traceVide(v.mode as ModeTrace);
  const ch = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : null);
  const liste = (k: string) => (v[k] === null ? null : Array.isArray(v[k]) ? chaines(v[k]) : null);
  switch (base.mode) {
    case "profils":
      return { ...base, fichiers: liste("fichiers"), expressions: chaines(v.expressions), orientation: v.orientation === "verticale" || v.orientation === "horizontale" ? v.orientation : "auto", profondeur: v.profondeur !== false };
    case "carte":
      return { ...base, plan: ch("plan"), expression: ch("expression"), palette: typeof v.palette === "string" ? (v.palette as PaletteCarte) : "auto", isolignes: nombres(v.isolignes), egalite: v.egalite === true };
    case "coupe-profils":
      return { ...base, plan: ch("plan"), expression: ch("expression"), sens: v.sens === "horizontales" ? "horizontales" : "verticales", valeurs: nombres(v.valeurs), profondeur: v.profondeur !== false };
    case "temps": {
      const r = estObjet(v.reference) ? v.reference : {};
      const reference: Reference =
        r.genre === "valeur" && typeof r.valeur === "number"
          ? { genre: "valeur", valeur: r.valeur, texte: typeof r.texte === "string" ? r.texte : "" }
          : r.genre === "fichier" && typeof r.fichier === "string"
            ? { genre: "fichier", fichier: r.fichier, texte: typeof r.texte === "string" ? r.texte : "" }
            : { genre: "aucune" };
      return { ...base, fichiers: liste("fichiers"), expressions: chaines(v.expressions), reference, instant: typeof v.instant === "number" ? v.instant : null, pic: v.pic === "max" || v.pic === "min" || v.pic === "abs" ? v.pic : null };
    }
    case "comparer":
      return { ...base, a: ch("a"), b: ch("b"), op: v.op === "difference" || v.op === "ecart" ? v.op : "rapport", expression: ch("expression") };
    case "synthese": {
      const b = estObjet(v.barres) ? v.barres : {};
      return {
        ...base,
        fichiers: liste("fichiers"),
        expressions: chaines(v.expressions),
        virgule: v.virgule !== false,
        barres: {
          expression: typeof b.expression === "string" ? b.expression : null,
          categorie: typeof b.categorie === "number" ? b.categorie : null,
          groupe: typeof b.groupe === "number" ? b.groupe : null,
          statistique: b.statistique === "max" || b.statistique === "min" ? b.statistique : "abs",
        },
      };
    }
  }
}

export function lireEtude(raw: unknown): EtudeComsol {
  const r = estObjet(raw) ? raw : {};
  const fichiers: FichierEtude[] = (Array.isArray(r.fichiers) ? r.fichiers : []).filter(estObjet).flatMap((f) => {
    if (typeof f.nom !== "string") return [];
    const transformations: Transformation[] = (Array.isArray(f.transformations) ? f.transformations : []).filter(estObjet).flatMap((t): Transformation[] => {
      if (t.genre === "colonne" && typeof t.formule === "string") return [{ genre: "colonne", formule: t.formule, nom: typeof t.nom === "string" ? t.nom : t.formule, unite: typeof t.unite === "string" ? t.unite : "" }];
      if (t.genre === "repere" && typeof t.k === "number" && typeof t.facteur === "number" && typeof t.origine === "number") return [{ genre: "repere", k: t.k, facteur: t.facteur, origine: t.origine }];
      return [];
    });
    return [
      {
        nom: f.nom,
        source: typeof f.source === "string" ? f.source : null,
        absolu: typeof f.absolu === "string" ? f.absolu : null,
        ...(Array.isArray(f.forcer) ? { forcer: nombres(f.forcer) } : {}),
        ...(typeof f.legende === "string" ? { legende: f.legende } : {}),
        transformations,
      },
    ];
  });
  const derives: Derive[] = (Array.isArray(r.derives) ? r.derives : []).filter(estObjet).flatMap((d): Derive[] =>
    typeof d.nom === "string" && typeof d.a === "string" && typeof d.b === "string"
      ? [{ nom: d.nom, genre: "operation", a: d.a, b: d.b, op: d.op === "difference" || d.op === "ecart" ? d.op : "rapport", legendeA: typeof d.legendeA === "string" ? d.legendeA : d.a, legendeB: typeof d.legendeB === "string" ? d.legendeB : d.b }]
      : [],
  );
  const recettes: Recette[] = (Array.isArray(r.recettes) ? r.recettes : []).filter(estObjet).flatMap((x): Recette[] => {
    const trace = lireTrace(x.trace);
    return trace && typeof x.id === "string" ? [{ id: x.id, nom: typeof x.nom === "string" ? x.nom : x.id, trace, cadre: lireCadre(x.cadre) }] : [];
  });
  return {
    format: ETUDE_FORMAT,
    id: typeof r.id === "string" ? r.id : "etude",
    titre: typeof r.titre === "string" ? r.titre : "Étude COMSOL",
    modifie: typeof r.modifie === "string" ? r.modifie : "",
    cadre: lireCadre(r.cadre),
    fichiers,
    derives,
    recettes,
  };
}

/** Identifiant d'étude ou de recette : le titre en minuscules sans accents, unique parmi `pris`. */
export function identifiant(titre: string, pris: ReadonlySet<string>): string {
  const base =
    titre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "etude";
  let id = base;
  for (let i = 2; pris.has(id); i++) id = `${base}-${i}`;
  return id;
}

export const fichierEtude = (id: string) => `${DOSSIER_ETUDES}/${id}.json`;

