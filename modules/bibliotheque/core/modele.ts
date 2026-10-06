/**
 * Données de la bibliothèque (SPEC §9.1) : ce qui était réparti sur les feuilles du classeur
 * `Biblio_These_Lucas_MAITRE.xlsx`, un fichier JSON par objet dans l'espace. Ce qui était
 * calculé par une formule ne l'est plus ici : voir calculs.ts.
 */
import type { DefinitionCollection } from "@noyau/stockage";

export const PRIORITES = ["INCONTOURNABLE", "Important", "A consulter"] as const;
export const STATUTS = ["À lire", "En cours", "Lu", "Écarté"] as const;
export const ACCES_DOCUMENT = [
  "PDF libre",
  "PDF libre (dépôt)",
  "Éditeur (abonnement)",
  "Payant (boutique)",
  "Non diffusé (à demander)",
  "Notice en ligne (texte à localiser)",
] as const;
export const VERIFICATIONS = ["Vérifié", "Partiel", "Non vérifié"] as const;
export const STATUTS_DEMANDE = ["À envoyer", "Envoyée", "Reçue", "Abandonnée"] as const;
export const STATUTS_PISTE = ["À chercher", "En cours", "Trouvé", "Abandonné"] as const;

export interface FicheLecture {
  texteLu: string;
  sourceTexte: string;
  objectif: string;
  methode: string;
  resultats: string;
  limites: string;
  pourThese: string;
  aVerifier: string;
  pneu: string;
  contact: string;
  loi: string;
  methodeCategorie: string;
  chargement: string;
  cible: string;
  validation: string;
}

export interface NotesLecture {
  apport: string;
  lien: string;
  equations: string;
  chapitre: string;
  aCiter: string;
  date: string;
}

/** Une case de la grille de lecture croisée : des étiquettes (vocabulaire du critère) et une note libre. */
export interface CelluleLecture {
  etiquettes: string[];
  note: string;
}

/** Lien typé vers une autre référence (« étend », « contredit »…), avec une note. */
export interface LienArticle {
  /** Identifiant de la référence visée (« BIB-020 »). */
  vers: string;
  /** Identifiant du type de lien (voir lecture.ts). */
  type: string;
  note: string;
}

export interface Reference {
  cle: string;
  titre: string;
  /** « Nom, P.; Nom, P. » comme dans le classeur. */
  auteurs: string;
  annee: number | null;
  typeRis: string;
  support: string;
  volume: string;
  numero: string;
  pages: string;
  editeur: string;
  doi: string;
  identifiant: string;
  tfe: boolean;
  axe: number | null;
  priorite: string;
  mois: number | null;
  litteratureGrise: boolean;
  pertinence: number | null;
  /** Catégories de la matrice croisée (« Pneu / Avion »…). */
  categories: string[];
  statut: string;
  dateLecture: string;
  commentaire: string;
  typeLien: string;
  url: string;
  urlRecherche: string;
  acces: string;
  accesDocument: string;
  commentObtenir: string;
  /** Nom du PDF dans le dossier de la racine `biblio-pdf` ; non vide = PDF récupéré. */
  fichierPdf: string;
  dansZotero: boolean;
  noteObsidian: string;
  etatLien: string;
  lienControleLe: string;
  verification: string;
  sourceVerification: string;
  verifieLe: string;
  contribution: string;
  voirAussi: string;
  fiche: FicheLecture;
  notes: NotesLecture;
  /** Grille de lecture croisée : identifiant du critère → case (voir lecture.ts). */
  lecture: Record<string, CelluleLecture>;
  liens: LienArticle[];
}

export interface Demande {
  cles: string;
  references: string;
  interlocuteur: string;
  document: string;
  pourquoi: string;
  delaiIndicatif: string;
  delaiMaxSemaines: number | null;
  moisUsage: number | null;
  dateEnvoi: string;
  statut: string;
  commentaire: string;
}

export interface Correction {
  cle: string;
  champ: string;
  tfe: string;
  correction: string;
  justification: string;
  corrige: boolean;
}

export interface Piste {
  sujet: string;
  axe: number | null;
  constat: string;
  suite: string;
  statut: string;
  referenceTrouvee: string;
}

export interface ObjectifMois {
  titre: string;
  finDeMois: string;
  aDemander: string;
}

export interface Parametres {
  /** Premier jour du mois 1 du plan, « AAAA-MM-JJ ». */
  debutPlan: string;
  nbMois: number;
  capaciteHeures: number;
  delaiRelanceJours: number;
  proxy: string;
  bareme: { priorites: Record<string, number>; parMoisDAvance: number; retard: number; tfe: number; verification: number; pdfLibre: number };
  tempsHeures: Record<string, number>;
  axes: { numero: number; intitule: string }[];
  /** Par numéro de mois du plan (1 à nbMois). */
  objectifs: Record<string, ObjectifMois>;
  typesRis: Record<string, string>;
}

export const PARAMETRES_PAR_DEFAUT: Parametres = {
  debutPlan: "2026-10-01",
  nbMois: 6,
  capaciteHeures: 65,
  delaiRelanceJours: 21,
  proxy: "",
  bareme: { priorites: { INCONTOURNABLE: 100, Important: 60, "A consulter": 30 }, parMoisDAvance: 5, retard: 40, tfe: 10, verification: 15, pdfLibre: 5 },
  tempsHeures: { INCONTOURNABLE: 6, Important: 3, "A consulter": 1 },
  axes: [],
  objectifs: {},
  typesRis: {},
};

// ---- Lecture tolérante : un champ absent prend sa valeur par défaut ----

const txt = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
function objet(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function champs<T extends object>(modele: T, brut: unknown): T {
  const b = objet(brut);
  return Object.fromEntries(Object.keys(modele).map((k) => [k, txt(b[k])])) as T;
}

export const FICHE_VIDE: FicheLecture = {
  texteLu: "",
  sourceTexte: "",
  objectif: "",
  methode: "",
  resultats: "",
  limites: "",
  pourThese: "",
  aVerifier: "",
  pneu: "",
  contact: "",
  loi: "",
  methodeCategorie: "",
  chargement: "",
  cible: "",
  validation: "",
};
export const NOTES_VIDES: NotesLecture = { apport: "", lien: "", equations: "", chapitre: "", aCiter: "", date: "" };

export function lireReference(b: Record<string, unknown>): Reference {
  if (typeof b.titre !== "string" && typeof b.cle !== "string") throw new Error("Ni clé ni titre : ce n'est pas une référence.");
  const t = (k: string) => txt(b[k]);
  return {
    cle: t("cle"),
    titre: t("titre"),
    auteurs: t("auteurs"),
    annee: num(b.annee),
    typeRis: t("typeRis"),
    support: t("support"),
    volume: t("volume"),
    numero: t("numero"),
    pages: t("pages"),
    editeur: t("editeur"),
    doi: t("doi"),
    identifiant: t("identifiant"),
    tfe: bool(b.tfe),
    axe: num(b.axe),
    priorite: t("priorite"),
    mois: num(b.mois),
    litteratureGrise: bool(b.litteratureGrise),
    pertinence: num(b.pertinence),
    categories: Array.isArray(b.categories) ? b.categories.filter((c): c is string => typeof c === "string") : [],
    statut: t("statut") || "À lire",
    dateLecture: t("dateLecture"),
    commentaire: t("commentaire"),
    typeLien: t("typeLien"),
    url: t("url"),
    urlRecherche: t("urlRecherche"),
    acces: t("acces"),
    accesDocument: t("accesDocument"),
    commentObtenir: t("commentObtenir"),
    fichierPdf: t("fichierPdf"),
    dansZotero: bool(b.dansZotero),
    noteObsidian: t("noteObsidian"),
    etatLien: t("etatLien"),
    lienControleLe: t("lienControleLe"),
    verification: t("verification"),
    sourceVerification: t("sourceVerification"),
    verifieLe: t("verifieLe"),
    contribution: t("contribution"),
    voirAussi: t("voirAussi"),
    fiche: champs(FICHE_VIDE, b.fiche),
    notes: champs(NOTES_VIDES, b.notes),
    lecture: lireGrille(b.lecture),
    liens: Array.isArray(b.liens)
      ? b.liens.flatMap((l) => {
          const o = objet(l);
          return txt(o.vers) && txt(o.type) ? [{ vers: txt(o.vers), type: txt(o.type), note: txt(o.note) }] : [];
        })
      : [],
  };
}

function lireGrille(v: unknown): Record<string, CelluleLecture> {
  const out: Record<string, CelluleLecture> = {};
  for (const [k, c] of Object.entries(objet(v))) {
    const o = objet(c);
    const etiquettes = Array.isArray(o.etiquettes) ? o.etiquettes.filter((e): e is string => typeof e === "string" && e.trim() !== "") : [];
    const note = txt(o.note);
    if (etiquettes.length || note) out[k] = { etiquettes, note };
  }
  return out;
}

export function lireDemande(b: Record<string, unknown>): Demande {
  const t = (k: string) => txt(b[k]);
  return {
    cles: t("cles"),
    references: t("references"),
    interlocuteur: t("interlocuteur"),
    document: t("document"),
    pourquoi: t("pourquoi"),
    delaiIndicatif: t("delaiIndicatif"),
    delaiMaxSemaines: num(b.delaiMaxSemaines),
    moisUsage: num(b.moisUsage),
    dateEnvoi: t("dateEnvoi"),
    statut: t("statut") || "À envoyer",
    commentaire: t("commentaire"),
  };
}

export function lireCorrection(b: Record<string, unknown>): Correction {
  const t = (k: string) => txt(b[k]);
  return { cle: t("cle"), champ: t("champ"), tfe: t("tfe"), correction: t("correction"), justification: t("justification"), corrige: bool(b.corrige) };
}

export function lirePiste(b: Record<string, unknown>): Piste {
  const t = (k: string) => txt(b[k]);
  return { sujet: t("sujet"), axe: num(b.axe), constat: t("constat"), suite: t("suite"), statut: t("statut") || "À chercher", referenceTrouvee: t("referenceTrouvee") };
}

export function lireParametres(brut: unknown): Parametres {
  const b = objet(brut);
  const d = PARAMETRES_PAR_DEFAUT;
  const bar = objet(b.bareme);
  const nombres = (v: unknown, def: Record<string, number>) =>
    Object.fromEntries(Object.entries({ ...def, ...objet(v) }).filter((e): e is [string, number] => typeof e[1] === "number"));
  return {
    debutPlan: /^\d{4}-\d{2}-\d{2}$/.test(txt(b.debutPlan)) ? txt(b.debutPlan) : d.debutPlan,
    nbMois: num(b.nbMois) ?? d.nbMois,
    capaciteHeures: num(b.capaciteHeures) ?? d.capaciteHeures,
    delaiRelanceJours: num(b.delaiRelanceJours) ?? d.delaiRelanceJours,
    proxy: txt(b.proxy),
    bareme: {
      priorites: nombres(bar.priorites, d.bareme.priorites),
      parMoisDAvance: num(bar.parMoisDAvance) ?? d.bareme.parMoisDAvance,
      retard: num(bar.retard) ?? d.bareme.retard,
      tfe: num(bar.tfe) ?? d.bareme.tfe,
      verification: num(bar.verification) ?? d.bareme.verification,
      pdfLibre: num(bar.pdfLibre) ?? d.bareme.pdfLibre,
    },
    tempsHeures: nombres(b.tempsHeures, d.tempsHeures),
    axes: Array.isArray(b.axes)
      ? b.axes.map(objet).filter((a) => typeof a.numero === "number").map((a) => ({ numero: a.numero as number, intitule: txt(a.intitule) }))
      : [],
    objectifs: Object.fromEntries(Object.entries(objet(b.objectifs)).map(([k, v]) => [k, champs({ titre: "", finDeMois: "", aDemander: "" }, v)])),
    typesRis: Object.fromEntries(Object.entries(objet(b.typesRis)).map(([k, v]) => [k, txt(v)])),
  };
}

// ---- Collections de l'espace ----

export const DOSSIER = "bibliotheque";
export const FICHIER_PARAMETRES = `${DOSSIER}/parametres.json`;
export const FICHIER_ANALYSE = `${DOSSIER}/analyse/analyse-croisee.md`;

export const REFERENCES: DefinitionCollection<Reference> = { dossier: `${DOSSIER}/references`, format: { prefixe: "BIB-", chiffres: 3 }, lire: lireReference };
export const DEMANDES: DefinitionCollection<Demande> = { dossier: `${DOSSIER}/demandes`, format: { prefixe: "DEM-", chiffres: 3 }, lire: lireDemande };
export const CORRECTIONS: DefinitionCollection<Correction> = { dossier: `${DOSSIER}/corrections`, format: { prefixe: "COR-", chiffres: 3 }, lire: lireCorrection };
export const PISTES: DefinitionCollection<Piste> = { dossier: `${DOSSIER}/pistes`, format: { prefixe: "PIS-", chiffres: 3 }, lire: lirePiste };

export function nouvelleReference(): Reference {
  return lireReference({ titre: "" });
}
