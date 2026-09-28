/**
 * Actions offertes aux autres modules (SPEC §6) :
 * - « figures.enregistrer-image » : une image (courbes d'un essai, courbe maîtresse,
 *   Gantt…) devient une figure de la bibliothèque, avec sa source ;
 * - une figure qui garde son **origine** (module, et ce qu'il faut pour la refaire) peut
 *   être régénérée : la bibliothèque demande l'action « <module>.regenerer-figure » et
 *   remplace l'image, la fiche restant la même.
 * Pur : le système de fichiers et l'horloge sont passés en paramètres.
 */
import { exportGraphSvg, exportPgfplots, validateGraph, type GraphDoc } from "./graph";
import { exportSvg, exportTikz, validateFigure, type FigureDoc } from "./schema";
import { createFigure, saveImageFigure, saveMeta, validateMeta, joinPath, type FigureMeta, type LibraryFs } from "./library";

/**
 * D'où vient une figure, pour la refaire : le module qui l'a produite et ce dont il a
 * besoin (campagne, essai, voies affichées…). Enregistré tel quel dans `meta.json`.
 */
export interface Origine {
  module: string;
  [parametre: string]: unknown;
}

/** Image rendue par un module : PNG, et SVG quand le module sait le produire ; un graphe modifiable s'il en est un. */
export interface Rendu {
  png: Uint8Array;
  svg?: string;
  /** Contenu de graph.json (figures « graphe » : données, axes, légende modifiables dans Figures). */
  graphe?: unknown;
}

/** Rendu PNG d'un graphe (fourni par l'interface : il faut un navigateur pour rastériser). */
export type RenduGraphe = (doc: GraphDoc) => Promise<Uint8Array>;

function grapheValide(brut: unknown): GraphDoc {
  const v = validateGraph(brut);
  if (!v.ok) throw new Error(`Graphe invalide : ${v.errors.map((e) => `${e.path} : ${e.message}`).join(" ; ")}`);
  return v.doc;
}

/** graph.json, export.tex (pgfplots), export.svg et export.png d'un graphe. */
async function ecrireGraphe(fs: LibraryFs, dossier: string, doc: GraphDoc, rendu: RenduGraphe): Promise<void> {
  const pgf = exportPgfplots(doc);
  await fs.writeTextAtomic(joinPath(dossier, "graph.json"), JSON.stringify(doc, null, 2) + "\n");
  await fs.writeTextAtomic(joinPath(dossier, "export.tex"), pgf.tex);
  for (const [nom, contenu] of Object.entries(pgf.files)) await fs.writeTextAtomic(joinPath(dossier, nom), contenu);
  await fs.writeTextAtomic(joinPath(dossier, "export.svg"), exportGraphSvg(doc));
  await fs.writeBytesAtomic(joinPath(dossier, "export.png"), await rendu(doc));
}

export interface DemandeGraphe {
  titre: string;
  source: string;
  tags?: string[];
  origine?: Origine;
  /** Contenu de graph.json (validé ici). */
  graphe: unknown;
}

/** Action « figures.enregistrer-graphe » : un graphe modifiable (axes, légende, export pgfplots) plutôt qu'une image. */
export async function enregistrerGraphe(fs: LibraryFs, d: DemandeGraphe, rendu: RenduGraphe, now: string, host: string): Promise<string> {
  const doc = grapheValide(d.graphe);
  const cree = await createFigure(fs, { title: d.titre, kind: "graph", now, host });
  await ecrireGraphe(fs, cree.folder, doc, rendu);
  const meta: FigureMeta = { ...cree.meta, tags: d.tags ?? [], source: { type: "own", note: d.source } };
  if (d.origine) meta.origine = d.origine;
  await saveMeta(fs, cree.folder, meta, { now, host });
  return cree.folder;
}

/**
 * Régénération d'un graphe : les données (séries, échelles) sont remplacées, la mise en forme
 * choisie dans Figures (taille, titres d'axes, bornes, légende, grille, style, retouches des
 * séries de même nom) est gardée.
 */
export async function remplacerGraphe(fs: LibraryFs, dossier: string, nouveau: unknown, rendu: RenduGraphe, now: string, host: string): Promise<FigureMeta> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  const neuf = grapheValide(nouveau);
  let doc = neuf;
  try {
    const ancien = grapheValide(JSON.parse(await fs.readText(joinPath(dossier, "graph.json"))));
    // Retouches d'une série (couleur, marque, tirets, type, légende) gardées si elle porte le même nom.
    const series = neuf.series.map((sr) => {
      const a = ancien.series.find((x) => x.name === sr.name);
      return a ? { ...sr, type: a.type, legend: a.legend, color: a.color ?? sr.color, mark: a.mark, dash: a.dash } : sr;
    });
    doc = { ...ancien, series, x: { ...ancien.x, log: neuf.x.log }, y: { ...ancien.y, log: neuf.y.log } };
  } catch {
    // pas de graph.json lisible : on repart du graphe neuf
  }
  await ecrireGraphe(fs, dossier, doc, rendu);
  return saveMeta(fs, dossier, { ...v.meta, regenere: now }, { now, host });
}

export interface DemandeSchema {
  titre: string;
  source: string;
  tags?: string[];
  origine?: Origine;
  /** Contenu de figure.json (validé ici). */
  schema: unknown;
}

/** Rendu PNG d'un schéma (fourni par l'interface). */
export type RenduSchema = (svg: string, doc: FigureDoc) => Promise<Uint8Array>;

/**
 * Action « figures.enregistrer-schema » : un schéma modifiable dans l'éditeur de schémas
 * (figure.json, export.tex TikZ, export.svg, export.png), par exemple le modèle rhéologique
 * calé dans le traitement, ses constantes en étiquettes.
 */
export async function enregistrerSchema(fs: LibraryFs, d: DemandeSchema, rendu: RenduSchema, now: string, host: string): Promise<string> {
  const v = validateFigure(d.schema);
  if (!v.ok) throw new Error(`Schéma invalide : ${v.errors.map((e) => `${e.path} : ${e.message}`).join(" ; ")}`);
  const cree = await createFigure(fs, { title: d.titre, kind: "schema", now, host });
  const svg = exportSvg(v.doc);
  await fs.writeTextAtomic(joinPath(cree.folder, "figure.json"), JSON.stringify(v.doc, null, 2) + "\n");
  await fs.writeTextAtomic(joinPath(cree.folder, "export.svg"), svg);
  await fs.writeTextAtomic(joinPath(cree.folder, "export.tex"), exportTikz(v.doc));
  await fs.writeBytesAtomic(joinPath(cree.folder, "export.png"), await rendu(svg, v.doc));
  const meta: FigureMeta = { ...cree.meta, tags: d.tags ?? [], source: { type: "own", note: d.source } };
  if (d.origine) meta.origine = d.origine;
  await saveMeta(fs, cree.folder, meta, { now, host });
  return cree.folder;
}

export interface DemandeImage extends Rendu {
  titre: string;
  /** D'où vient l'image : « Campagnes, B2C4 bio, Essai1 ». */
  source: string;
  tags?: string[];
  /** Pour pouvoir régénérer la figure depuis les données. */
  origine?: Origine;
}

export async function enregistrerImage(fs: LibraryFs, d: DemandeImage, now: string, host: string): Promise<string> {
  const r = await saveImageFigure(fs, {
    title: d.titre,
    original: d.png,
    result: d.png,
    source: { type: "own", note: d.source },
    tags: d.tags ?? [],
    now,
    host,
  });
  if (d.svg !== undefined) await fs.writeTextAtomic(joinPath(r.folder, "export.svg"), d.svg);
  if (d.origine) await saveMeta(fs, r.folder, { ...r.meta, origine: d.origine }, { now, host });
  return r.folder;
}

/** Origine enregistrée d'une figure, si elle en a une valide. */
export function origineDe(meta: FigureMeta | null | undefined): Origine | null {
  const o = meta?.origine;
  return o && typeof o === "object" && !Array.isArray(o) && typeof (o as Origine).module === "string" ? (o as Origine) : null;
}

/** Nom de l'action qui refait une figure : « campagnes.regenerer-figure ». */
export const actionRegeneration = (o: Origine) => `${o.module}.regenerer-figure`;

/**
 * Remplace l'image d'une figure régénérée (export.png, et export.svg s'il est fourni) et
 * note la date de régénération ; l'original, les tags, la source et la légende restent.
 */
export async function remplacerImage(fs: LibraryFs, dossier: string, rendu: Rendu, now: string, host: string): Promise<FigureMeta> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  await fs.writeBytesAtomic(joinPath(dossier, "export.png"), rendu.png);
  if (rendu.svg !== undefined) await fs.writeTextAtomic(joinPath(dossier, "export.svg"), rendu.svg);
  return saveMeta(fs, dossier, { ...v.meta, regenere: now }, { now, host });
}

/**
 * Régénération selon la nature de la figure : une figure « graphe » reprend le graph.json
 * rendu (mise en forme gardée) ; une figure « image » (d'avant la 0.2.7) reste une image.
 */
export async function regenerer(fs: LibraryFs, dossier: string, r: Rendu, rendu: RenduGraphe, now: string, host: string): Promise<FigureMeta> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (v.ok && v.meta.kind === "graph" && r.graphe !== undefined) return remplacerGraphe(fs, dossier, r.graphe, rendu, now, host);
  return remplacerImage(fs, dossier, r, now, host);
}
