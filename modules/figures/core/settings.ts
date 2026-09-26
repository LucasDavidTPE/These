/**
 * Réglages propres à chaque poste (SPEC §4) : stockés dans le dossier de configuration
 * local de l'appli, **pas** dans OneDrive. La taille de fenêtre est gérée à part
 * (greffon window-state de Tauri).
 */

export interface LocalSettings {
  version: 1;
  /** Chemin absolu de la racine de la bibliothèque sur ce poste ; null au premier lancement. */
  libraryRoot: string | null;
}

export const DEFAULT_SETTINGS: LocalSettings = { version: 1, libraryRoot: null };

/** Lecture tolérante : un fichier absent, abîmé ou d'une autre version donne les défauts. */
export function parseSettings(text: string | null): LocalSettings {
  if (!text) return { ...DEFAULT_SETTINGS };
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
    const root = (raw as Record<string, unknown>).libraryRoot;
    return { version: 1, libraryRoot: typeof root === "string" && root.trim() !== "" ? root : null };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function serializeSettings(s: LocalSettings): string {
  return JSON.stringify({ version: 1, libraryRoot: s.libraryRoot }, null, 2) + "\n";
}

/** Dossier proposé au premier lancement : `<OneDrive>\Figurine`. */
export function proposedRoot(oneDrive: string): string {
  const sep = oneDrive.includes("\\") ? "\\" : "/";
  return oneDrive.replace(/[\\/]+$/, "") + sep + "Figurine";
}
