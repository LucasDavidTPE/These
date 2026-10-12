/**
 * Lecture croisée (SPEC §9.5) : une grille « articles × critères de lecture » remplie d'étiquettes prises
 * dans un vocabulaire qui se construit au fil de la saisie, et des liens typés entre articles.
 *
 *  - Les critères (pneu, contact, loi de comportement, méthode…) et les types de liens sont des réglages
 *    partagés : `bibliotheque/lecture-croisee.json` (avec les définitions des étiquettes et les croisements
 *    enregistrés).
 *  - Les cases et les liens d'un article sont dans sa fiche (`lecture`, `liens` de la référence) : un fichier
 *    par objet, comme le reste de la bibliothèque.
 *  - Une étiquette est un « nœud » : tous les articles qui la portent sont reliés par elle (carte, croisement,
 *    synthèse). Elles se comparent sans casse ni accents (« MEF 3D » = « mef 3d »).
 * Pur : ni DOM ni fichiers.
 */
import { jsonStable } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import { DOSSIER, type CelluleLecture, type LienArticle, type Reference } from "./modele";

export const FICHIER_LECTURE = `${DOSSIER}/lecture-croisee.json`;

export interface Critere {
  /** Identifiant stable (clé des cases dans les fiches). */
  id: string;
  nom: string;
  /** Ce qu'on note dans ce critère (aide affichée à la saisie). */
  aide: string;
}

export interface TypeLien {
  id: string;
  /** « étend » : se lit « A étend B ». */
  nom: string;
  /** « est étendu par » : vu depuis B. Identique au nom pour un lien symétrique. */
  inverse: string;
}

export interface ReglagesLecture {
  version: 1;
  criteres: Critere[];
  typesLiens: TypeLien[];
  /** Définition des étiquettes : critère → étiquette → texte. */
  definitions: Record<string, Record<string, string>>;
  /** Croisements enregistrés (critère en lignes, critère en colonnes), repris dans le classeur Excel. */
  croisements: [string, string][];
}

/** Les dimensions de la fiche de lecture (et du classeur d'origine) servent de critères de départ. */
export const CRITERES_DE_DEPART: readonly (Critere & { champ: keyof Reference["fiche"] })[] = [
  { id: "pneu", nom: "Pneu", aide: "Type de pneu ou de chargement roulant (avion, poids lourd, H40…)", champ: "pneu" },
  { id: "contact", nom: "Contact", aide: "Représentation du contact pneu-chaussée (uniforme, mesuré, rugosité…)", champ: "contact" },
  { id: "loi", nom: "Loi de comportement", aide: "Élastique, viscoélastique (2S2P1D, Huet-Sayegh…), élasto-plastique…", champ: "loi" },
  { id: "methode", nom: "Méthode", aide: "Méthode de calcul ou d'essai (MEF 3D, Burmister, semi-analytique, essai en laboratoire…)", champ: "methodeCategorie" },
  { id: "chargement", nom: "Chargement", aide: "Statique, mobile, dynamique, cyclique…", champ: "chargement" },
  { id: "cible", nom: "Cible", aide: "Ce que l'article cherche à prédire ou mesurer", champ: "cible" },
  { id: "validation", nom: "Validation", aide: "Comment les résultats sont validés (mesures in situ, comparaison numérique…)", champ: "validation" },
];

export const TYPES_LIENS_DE_DEPART: readonly TypeLien[] = [
  { id: "etend", nom: "étend", inverse: "est étendu par" },
  { id: "s-appuie", nom: "s'appuie sur", inverse: "sert de base à" },
  { id: "compare", nom: "se compare à", inverse: "est comparé par" },
  { id: "contredit", nom: "contredit", inverse: "est contredit par" },
  { id: "meme-methode", nom: "même méthode que", inverse: "même méthode que" },
  { id: "donnees", nom: "utilise les données de", inverse: "fournit les données de" },
];

export const reglagesLectureVides = (): ReglagesLecture => ({
  version: 1,
  criteres: CRITERES_DE_DEPART.map(({ id, nom, aide }) => ({ id, nom, aide })),
  typesLiens: TYPES_LIENS_DE_DEPART.map((t) => ({ ...t })),
  definitions: {},
  croisements: [["loi", "methode"]],
});

// ---- Lecture et écriture des réglages ----

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const objet = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function lireReglagesLecture(brut: unknown): ReglagesLecture {
  const b = objet(brut);
  const vus = new Set<string>();
  const criteres: Critere[] = [];
  for (const c of Array.isArray(b.criteres) ? b.criteres : []) {
    const o = objet(c);
    const id = txt(o.id);
    if (!id || vus.has(id)) continue;
    vus.add(id);
    criteres.push({ id, nom: txt(o.nom) || id, aide: txt(o.aide) });
  }
  const typesVus = new Set<string>();
  const typesLiens: TypeLien[] = [];
  for (const t of Array.isArray(b.typesLiens) ? b.typesLiens : []) {
    const o = objet(t);
    const id = txt(o.id);
    if (!id || typesVus.has(id)) continue;
    typesVus.add(id);
    typesLiens.push({ id, nom: txt(o.nom) || id, inverse: txt(o.inverse) || txt(o.nom) || id });
  }
  const definitions: Record<string, Record<string, string>> = {};
  for (const [c, d] of Object.entries(objet(b.definitions))) {
    const m = Object.fromEntries(Object.entries(objet(d)).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
    if (Object.keys(m).length) definitions[c] = m as Record<string, string>;
  }
  const croisements = (Array.isArray(b.croisements) ? b.croisements : []).filter(
    (x): x is [string, string] => Array.isArray(x) && x.length === 2 && typeof x[0] === "string" && typeof x[1] === "string",
  );
  const vide = reglagesLectureVides();
  return {
    version: 1,
    criteres: criteres.length ? criteres : vide.criteres,
    typesLiens: typesLiens.length ? typesLiens : vide.typesLiens,
    definitions,
    croisements: Array.isArray(b.croisements) ? croisements : vide.croisements,
  };
}

export const ecrireReglagesLecture = (r: ReglagesLecture) => jsonStable(r);

// ---- Étiquettes ----

/** « MEF  3D » → « MEF 3D » (espaces réduits), pour l'affichage et l'enregistrement. */
export const nettoyerEtiquette = (e: string) => e.replace(/\s+/g, " ").trim();
/** Clé de comparaison : sans casse ni accents. */
export const cleEtiquette = (e: string) =>
  nettoyerEtiquette(e)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Ajoute des étiquettes à une liste, sans doublon (casse et accents ignorés), dans l'ordre. */
export function unirEtiquettes(liste: readonly string[], ajout: readonly string[]): string[] {
  const out = [...liste];
  const cles = new Set(out.map(cleEtiquette));
  for (const e of ajout.map(nettoyerEtiquette)) {
    if (!e || cles.has(cleEtiquette(e))) continue;
    cles.add(cleEtiquette(e));
    out.push(e);
  }
  return out;
}

/** Au-delà, un morceau de texte libre n'est pas une étiquette mais une note. */
const ETIQUETTE_MAX = 40;

/** Découpe aux séparateurs (« ; », « , », retour à la ligne, « / » et « + » entourés d'espaces) hors parenthèses. */
function morceaux(texte: string): string[] {
  const out: string[] = [];
  let profondeur = 0;
  let debut = 0;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i]!;
    if (ch === "(" || ch === "[") profondeur++;
    else if ((ch === ")" || ch === "]") && profondeur > 0) profondeur--;
    else if (profondeur === 0) {
      const sep = ch === ";" || ch === "," || ch === "\n" ? 1 : (ch === "/" || ch === "+") && texte[i - 1] === " " && texte[i + 1] === " " ? 1 : 0;
      if (sep) {
        out.push(texte.slice(debut, i));
        debut = i + 1;
      }
    }
  }
  out.push(texte.slice(debut));
  return out;
}

/** « Viscoélastique (2S2P1D, linéaire) » → tête « Viscoélastique », précision « 2S2P1D, linéaire » ; null sans parenthèse finale. */
export function separerParenthese(e: string): { tete: string; precision: string } | null {
  const m = /^(.+?)\s*[([]\s*(.+?)\s*[)\]]\s*$/.exec(nettoyerEtiquette(e));
  if (!m || !m[1]!.trim() || m[1]!.length > ETIQUETTE_MAX) return null;
  return { tete: m[1]!.trim(), precision: m[2]!.trim() };
}

/**
 * Texte libre d'un ancien champ (« viscoélastique (2S2P1D), MEF 3D ; mobile ») → étiquettes courtes et réutilisables ;
 * les précisions entre parenthèses et les morceaux trop longs pour être une étiquette vont dans la note.
 */
export function decouperTexte(texte: string): CelluleLecture {
  const etiquettes: string[] = [];
  const notes: string[] = [];
  for (const brut of morceaux(texte)) {
    const e = nettoyerEtiquette(brut).replace(/\.$/, "");
    if (!e) continue;
    const s = separerParenthese(e);
    if (s) {
      etiquettes.push(s.tete);
      notes.push(`${s.tete} : ${s.precision}`);
    } else if (e.length > ETIQUETTE_MAX) notes.push(e);
    else etiquettes.push(e);
  }
  return { etiquettes: unirEtiquettes([], etiquettes), note: notes.join(" ; "), valide: false };
}

// ---- Cases : texte d'une cellule Excel « a; b | note » ----

/** Case → « MEF 3D; Burmister | maillage grossier ». */
export function texteCellule(c: CelluleLecture | undefined): string {
  if (!c) return "";
  const e = c.etiquettes.join("; ");
  return c.note.trim() ? `${e}${e ? " " : ""}| ${c.note.trim()}` : e;
}

/** « MEF 3D; Burmister | maillage grossier » → case. Les étiquettes sont séparées par « ; » ou un retour à la ligne. */
export function lireCellule(texte: string): CelluleLecture {
  const i = texte.indexOf("|");
  const tete = i < 0 ? texte : texte.slice(0, i);
  const note = i < 0 ? "" : texte.slice(i + 1).trim();
  return { etiquettes: unirEtiquettes([], tete.split(/[;\n]/)), note, valide: false };
}

/** Forme canonique d'une case, pour savoir si elle a changé : étiquettes triées sans casse ni accents, note. */
export function cleCellule(c: CelluleLecture | undefined): string {
  if (!c) return "";
  const e = [...new Set(c.etiquettes.map(cleEtiquette))].filter(Boolean).sort();
  const n = c.note.replace(/\s+/g, " ").trim();
  return e.length || n ? `${e.join(";")}|${n}` : "";
}

export const estVide = (c: CelluleLecture | undefined) => !c || (!c.etiquettes.length && !c.note.trim());

/** Remplace (ou retire, si vide) la case `critere` d'une référence. */
export function avecCellule(r: Reference, critere: string, c: CelluleLecture): Reference {
  const lecture = { ...r.lecture };
  if (estVide(c)) delete lecture[critere];
  else lecture[critere] = { etiquettes: unirEtiquettes([], c.etiquettes), note: c.note.trim(), valide: c.valide };
  return { ...r, lecture };
}

// ---- Validation : ce qui a été repris automatiquement est « à valider » jusqu'à ce que l'utilisateur le confirme ----

/** Case validée (ou remise « à valider ») ; sans effet sur une case vide. */
export function validerCase(r: Reference, critere: string, valide = true): Reference {
  const c = r.lecture[critere];
  if (!c || c.valide === valide) return r;
  return { ...r, lecture: { ...r.lecture, [critere]: { ...c, valide } } };
}

/** Toutes les cases de l'article validées. */
export function validerArticle(r: Reference): Reference {
  if (Object.values(r.lecture).every((c) => c.valide)) return r;
  return { ...r, lecture: Object.fromEntries(Object.entries(r.lecture).map(([k, c]) => [k, { ...c, valide: true }])) };
}

/** Critères (de la grille) dont la case est remplie mais encore à valider. */
export function aValider(r: Reference, reglages: ReglagesLecture): string[] {
  return reglages.criteres.filter((c) => r.lecture[c.id] && !r.lecture[c.id]!.valide).map((c) => c.id);
}

export interface BilanValidation {
  /** Cases remplies, et parmi elles les validées. */
  cases: number;
  validees: number;
  /** Articles ayant au moins une case à valider. */
  articlesAValider: number;
}

export function bilanValidation(refs: readonly ObjetRef[], reglages: ReglagesLecture): BilanValidation {
  let cases = 0;
  let validees = 0;
  let articlesAValider = 0;
  for (const r of refs) {
    let reste = false;
    for (const c of reglages.criteres) {
      const x = r.valeur.lecture[c.id];
      if (!x) continue;
      cases++;
      if (x.valide) validees++;
      else reste = true;
    }
    if (reste) articlesAValider++;
  }
  return { cases, validees, articlesAValider };
}

/** Les articles avec leurs seules cases validées (croiser ou synthétiser sur ce qui a été vérifié). */
export function seulementValidees(refs: readonly ObjetRef[]): ObjetRef[] {
  return refs.map((r) => {
    const lecture = Object.fromEntries(Object.entries(r.valeur.lecture).filter(([, c]) => c.valide));
    return Object.keys(lecture).length === Object.keys(r.valeur.lecture).length ? r : { id: r.id, valeur: { ...r.valeur, lecture } };
  });
}

// ---- Initialisation depuis la fiche de lecture et la Matrice croisée du classeur ----

export interface ObjetRef {
  id: string;
  valeur: Reference;
}

/**
 * Première ouverture : crée les réglages (critères de départ, plus un critère par groupe de la Matrice
 * croisée qui n'en a pas déjà un) et remplit la grille des articles qui n'en ont pas encore, à partir des
 * champs « Pneu », « Contact »… de leur fiche et de leurs catégories (« Pneu / Avion » → étiquette « Avion »
 * dans le critère « Pneu »). Les champs d'origine ne sont pas effacés. Idempotent.
 */
export function initialiser(refs: readonly ObjetRef[], existants: ReglagesLecture | null): { reglages: ReglagesLecture; modifiees: ObjetRef[] } {
  const reglages = existants ? structuredClone(existants) : reglagesLectureVides();
  const parNom = new Map(reglages.criteres.map((c) => [cleEtiquette(c.nom), c.id]));
  const critereDuGroupe = (groupe: string): string => {
    const cle = cleEtiquette(groupe);
    const connu = parNom.get(cle) ?? reglages.criteres.find((c) => c.id === slugifier(groupe))?.id;
    if (connu) return connu;
    let id = slugifier(groupe) || "categorie";
    for (let i = 2; reglages.criteres.some((c) => c.id === id); i++) id = `${slugifier(groupe) || "categorie"}-${i}`;
    reglages.criteres.push({ id, nom: nettoyerEtiquette(groupe), aide: "" });
    parNom.set(cle, id);
    return id;
  };
  // les groupes de catégories deviennent des critères, dans l'ordre où on les rencontre
  for (const r of refs) for (const cat of r.valeur.categories) critereDuGroupe(cat.includes(" / ") ? cat.slice(0, cat.indexOf(" / ")) : "Catégories");

  const modifiees: ObjetRef[] = [];
  for (const r of refs) {
    if (Object.keys(r.valeur.lecture).length) continue;
    let v = r.valeur;
    for (const c of CRITERES_DE_DEPART) {
      if (!reglages.criteres.some((x) => x.id === c.id)) continue;
      const texte = v.fiche[c.champ];
      if (texte.trim()) v = avecCellule(v, c.id, decouperTexte(texte));
    }
    for (const cat of v.categories) {
      const [groupe, nom] = cat.includes(" / ") ? [cat.slice(0, cat.indexOf(" / ")), cat.slice(cat.indexOf(" / ") + 3)] : ["Catégories", cat];
      const id = critereDuGroupe(groupe);
      const avant = v.lecture[id] ?? { etiquettes: [], note: "", valide: false };
      v = avecCellule(v, id, { ...avant, etiquettes: unirEtiquettes(avant.etiquettes, [nom]) });
    }
    if (v !== r.valeur) modifiees.push({ id: r.id, valeur: v });
  }
  return { reglages, modifiees };
}

// ---- Vocabulaire ----

export interface EntreeVocabulaire {
  /** Forme affichée : la plus fréquente parmi les écritures rencontrées. */
  etiquette: string;
  cle: string;
  /** Références qui portent l'étiquette, dans l'ordre des identifiants. */
  ids: string[];
  definition: string;
}

/** Vocabulaire d'un critère : étiquettes utilisées (et définies sans être utilisées), les plus courantes d'abord. */
export function vocabulaire(refs: readonly ObjetRef[], critere: string, reglages?: ReglagesLecture): EntreeVocabulaire[] {
  const m = new Map<string, { formes: Map<string, number>; ids: string[] }>();
  const ajouter = (e: string, id: string | null) => {
    const cle = cleEtiquette(e);
    if (!cle) return;
    const x = m.get(cle) ?? { formes: new Map<string, number>(), ids: [] as string[] };
    x.formes.set(nettoyerEtiquette(e), (x.formes.get(nettoyerEtiquette(e)) ?? 0) + (id ? 1 : 0));
    if (id && !x.ids.includes(id)) x.ids.push(id);
    m.set(cle, x);
  };
  for (const r of refs) for (const e of r.valeur.lecture[critere]?.etiquettes ?? []) ajouter(e, r.id);
  const defs = reglages?.definitions[critere] ?? {};
  for (const e of Object.keys(defs)) ajouter(e, null);
  const defParCle = new Map(Object.entries(defs).map(([e, d]) => [cleEtiquette(e), d]));
  return [...m.entries()]
    .map(([cle, x]) => {
      // la forme la plus portée ; à égalité, celle qui a ses accents (« Éléments finis » plutôt que « Elements finis »)
      const accents = (f: string) => [...f].filter((ch) => ch.normalize("NFD").length > 1).length;
      const etiquette = [...x.formes.entries()].sort((a, b) => b[1] - a[1] || accents(b[0]) - accents(a[0]) || a[0].localeCompare(b[0], "fr"))[0]![0];
      return { etiquette, cle, ids: x.ids.sort(triIds), definition: defParCle.get(cle) ?? "" };
    })
    .sort((a, b) => b.ids.length - a.ids.length || a.etiquette.localeCompare(b.etiquette, "fr", { sensitivity: "base" }));
}

export const triIds = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true });

/** Renomme une étiquette dans toutes les fiches (ou la fusionne avec une existante) ; `nouvelle` vide la retire. */
export function renommerEtiquette(refs: readonly ObjetRef[], critere: string, ancienne: string, nouvelle: string): ObjetRef[] {
  const cle = cleEtiquette(ancienne);
  const out: ObjetRef[] = [];
  for (const r of refs) {
    const c = r.valeur.lecture[critere];
    if (!c || !c.etiquettes.some((e) => cleEtiquette(e) === cle)) continue;
    const etiquettes = unirEtiquettes(
      [],
      c.etiquettes.flatMap((e) => (cleEtiquette(e) === cle ? (nettoyerEtiquette(nouvelle) ? [nouvelle] : []) : [e])),
    );
    out.push({ id: r.id, valeur: avecCellule(r.valeur, critere, { ...c, etiquettes }) });
  }
  return out;
}

/** Définition d'une étiquette dans les réglages (vide = retirée). */
export function definir(reglages: ReglagesLecture, critere: string, etiquette: string, definition: string): ReglagesLecture {
  const defs = { ...(reglages.definitions[critere] ?? {}) };
  for (const k of Object.keys(defs)) if (cleEtiquette(k) === cleEtiquette(etiquette)) delete defs[k];
  if (definition.trim()) defs[nettoyerEtiquette(etiquette)] = definition.trim();
  const definitions = { ...reglages.definitions, [critere]: defs };
  if (!Object.keys(defs).length) delete definitions[critere];
  return { ...reglages, definitions };
}

// ---- Liens entre articles ----

export interface LienVu {
  /** L'autre article. */
  id: string;
  type: string;
  /** Libellé lu depuis l'article courant (« étend » ou « est étendu par »). */
  libelle: string;
  note: string;
  sens: "sortant" | "entrant";
}

export const cleLien = (de: string, l: Pick<LienArticle, "type" | "vers">) => `${de}|${l.type}|${l.vers}`;

/** Liens d'un article : ceux qu'il porte et ceux que les autres portent vers lui. */
export function liensDe(refs: readonly ObjetRef[], id: string, types: readonly TypeLien[]): LienVu[] {
  const t = new Map(types.map((x) => [x.id, x]));
  const out: LienVu[] = [];
  const moi = refs.find((r) => r.id === id);
  for (const l of moi?.valeur.liens ?? []) out.push({ id: l.vers, type: l.type, libelle: t.get(l.type)?.nom ?? l.type, note: l.note, sens: "sortant" });
  for (const r of refs)
    for (const l of r.valeur.liens)
      if (l.vers === id && r.id !== id) out.push({ id: r.id, type: l.type, libelle: t.get(l.type)?.inverse ?? l.type, note: l.note, sens: "entrant" });
  return out;
}

/** Ajoute (ou remplace la note d') un lien ; un article ne se lie pas à lui-même. */
export function lier(r: ObjetRef, l: LienArticle): Reference {
  if (l.vers === r.id || !l.vers || !l.type) return r.valeur;
  const autres = r.valeur.liens.filter((x) => !(x.vers === l.vers && x.type === l.type));
  return { ...r.valeur, liens: [...autres, { vers: l.vers, type: l.type, note: l.note.trim() }].sort((a, b) => triIds(a.vers, b.vers) || a.type.localeCompare(b.type)) };
}

export function delier(r: Reference, vers: string, type: string): Reference {
  return { ...r, liens: r.liens.filter((x) => !(x.vers === vers && x.type === type)) };
}

// ---- Croisement ----

export interface Croisement {
  lignes: EntreeVocabulaire[];
  colonnes: EntreeVocabulaire[];
  /** « cléLigne|cléColonne » → identifiants des articles qui portent les deux étiquettes. */
  cases: Map<string, string[]>;
  /** Articles renseignés pour les deux critères (les autres ne comptent pas dans les cases vides). */
  renseignes: number;
}

/** Tableau croisé de deux critères (ou d'un critère avec lui-même : co-occurrences). */
export function croiser(refs: readonly ObjetRef[], critereLignes: string, critereColonnes: string, reglages?: ReglagesLecture): Croisement {
  const lignes = vocabulaire(refs, critereLignes, reglages).filter((e) => e.ids.length);
  const colonnes = vocabulaire(refs, critereColonnes, reglages).filter((e) => e.ids.length);
  const cases = new Map<string, string[]>();
  let renseignes = 0;
  for (const r of refs) {
    const a = r.valeur.lecture[critereLignes]?.etiquettes ?? [];
    const b = r.valeur.lecture[critereColonnes]?.etiquettes ?? [];
    if (!a.length || !b.length) continue;
    renseignes++;
    for (const x of new Set(a.map(cleEtiquette)))
      for (const y of new Set(b.map(cleEtiquette))) {
        if (critereLignes === critereColonnes && x === y) continue;
        const k = `${x}|${y}`;
        cases.set(k, [...(cases.get(k) ?? []), r.id]);
      }
  }
  return { lignes, colonnes, cases, renseignes };
}

// ---- Synthèse ----

/**
 * Synthèse d'un critère en Markdown, prête à reprendre dans l'état de l'art : une section par étiquette
 * (définition, articles cités en `[@BIB-…]` avec leur titre et leur note), puis les liens entre ces articles.
 */
export function synthese(refs: readonly ObjetRef[], reglages: ReglagesLecture, critere: string, titre: (id: string) => string): string {
  const c = reglages.criteres.find((x) => x.id === critere);
  const voc = vocabulaire(refs, critere, reglages).filter((e) => e.ids.length);
  const parId = new Map(refs.map((r) => [r.id, r.valeur]));
  const types = new Map(reglages.typesLiens.map((t) => [t.id, t]));
  const lignes: string[] = [`# ${c?.nom ?? critere}`, ""];
  if (c?.aide) lignes.push(`*${c.aide}*`, "");
  for (const e of voc) {
    lignes.push(`## ${e.etiquette} (${e.ids.length})`, "");
    if (e.definition) lignes.push(e.definition, "");
    for (const id of e.ids) {
      const note = parId.get(id)?.lecture[critere]?.note ?? "";
      lignes.push(`- [@${id}] *${titre(id)}*${note ? ` — ${note}` : ""}`);
    }
    const ids = new Set(e.ids);
    const liens = e.ids.flatMap((id) => (parId.get(id)?.liens ?? []).filter((l) => ids.has(l.vers)).map((l) => `- [@${id}] ${types.get(l.type)?.nom ?? l.type} [@${l.vers}]${l.note ? ` — ${l.note}` : ""}`));
    if (liens.length) lignes.push("", "Liens :", ...liens);
    lignes.push("");
  }
  const sans = refs.filter((r) => r.valeur.statut !== "Écarté" && !r.valeur.lecture[critere]).length;
  if (sans) lignes.push(`*${sans} article(s) non renseigné(s) pour ce critère.*`, "");
  return lignes.join("\n");
}
