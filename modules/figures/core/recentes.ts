/**
 * Dernières figures modifiées, pour l'Accueil (action « figures.recentes »). Pur : le
 * système de fichiers est passé en paramètre.
 */
import { scanLibrary, thumbnailFile, type LibraryFs } from "./library";

export interface FigureRecente {
  dossier: string;
  id: string;
  titre: string;
  /** Date ISO 8601 (avec fuseau) de la dernière modification. */
  date: string;
  /** Fichier d'aperçu dans le dossier de la figure (export.png, export.svg, original.png). */
  vignette: string | null;
}

export async function figuresRecentes(fs: LibraryFs, n: number): Promise<FigureRecente[]> {
  const { figures } = await scanLibrary(fs);
  return figures
    .flatMap((f) => (f.meta ? [{ dossier: f.folder, id: f.id, titre: f.meta.title, date: f.meta.modified, vignette: thumbnailFile(f) }] : []))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || b.id.localeCompare(a.id))
    .slice(0, n);
}
