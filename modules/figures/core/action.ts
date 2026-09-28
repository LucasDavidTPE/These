/**
 * Actions offertes aux autres modules (SPEC §6) :
 * - « figures.enregistrer-image » : une image (courbes d'un essai, courbe maîtresse,
 *   Gantt…) devient une figure de la bibliothèque, avec sa source ;
 * - une figure qui garde son **origine** (module, et ce qu'il faut pour la refaire) peut
 *   être régénérée : la bibliothèque demande l'action « <module>.regenerer-figure » et
 *   remplace l'image, la fiche restant la même.
 * Pur : le système de fichiers et l'horloge sont passés en paramètres.
 */
import { saveImageFigure, saveMeta, validateMeta, joinPath, type FigureMeta, type LibraryFs } from "./library";

/**
 * D'où vient une figure, pour la refaire : le module qui l'a produite et ce dont il a
 * besoin (campagne, essai, voies affichées…). Enregistré tel quel dans `meta.json`.
 */
export interface Origine {
  module: string;
  [parametre: string]: unknown;
}

/** Image rendue par un module : PNG, et SVG quand le module sait le produire. */
export interface Rendu {
  png: Uint8Array;
  svg?: string;
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
