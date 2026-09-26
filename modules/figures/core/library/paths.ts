/**
 * Chemins relatifs à la racine de la bibliothèque (SPEC §4 : jamais de chemin absolu
 * dans les fichiers, car le nom de session Windows diffère d'un PC à l'autre).
 * Séparateur « / » partout ; la conversion vers « \ » est faite côté Rust.
 */

/** Vrai si `p` est un chemin relatif sûr : pas vide, pas absolu, pas de « .. », pas de lecteur. */
export function isSafeRelativePath(p: string): boolean {
  if (p === "" || p.includes("\0")) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return false;
  return p.split(/[/\\]/).every((part) => part !== "" && part !== "." && part !== "..");
}

/** Joint des segments avec « / » (la racine est le chemin vide). */
export function joinPath(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}
