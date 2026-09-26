/**
 * Action « figures.enregistrer-image » offerte aux autres modules (SPEC §6) : une image
 * (courbe d'essai, courbe maîtresse, Gantt…) devient une figure de la bibliothèque, avec
 * sa source. Pur : le système de fichiers et l'horloge sont passés en paramètres.
 */
import { saveImageFigure, type LibraryFs } from "./library";

export interface DemandeImage {
  titre: string;
  png: Uint8Array;
  /** D'où vient l'image : « Campagnes, B2C4 bio, Essai1 ». */
  source: string;
  tags?: string[];
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
  return r.folder;
}
