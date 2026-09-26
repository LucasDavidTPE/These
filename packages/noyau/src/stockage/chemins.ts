/**
 * Chemins relatifs à la racine d'un dossier (l'espace, la bibliothèque de figures…).
 *
 * Jamais de chemin absolu dans les fichiers partagés : le nom de session Windows diffère
 * d'un PC à l'autre (SPEC §4.1). Séparateur « / » partout ; la conversion vers « \ » est
 * faite côté Rust. Le chemin vide désigne la racine elle-même.
 */

/** Vrai si `p` est un chemin relatif sûr : pas vide, pas absolu, pas de « .. », pas de lecteur. */
export function estCheminRelatifSur(p: string): boolean {
  if (p === "" || p.includes("\0")) return false;
  if (p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:/.test(p)) return false;
  return p.split(/[/\\]/).every((part) => part !== "" && part !== "." && part !== "..");
}

/** Joint des segments avec « / » (les segments vides sont ignorés). */
export function joindre(...parts: string[]): string {
  return parts.filter((p) => p !== "").join("/");
}

/** Dossier parent (« » pour un fichier à la racine). */
export function parent(chemin: string): string {
  const i = chemin.lastIndexOf("/");
  return i < 0 ? "" : chemin.slice(0, i);
}

/** Dernier segment d'un chemin. */
export function nomDe(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf("/") + 1);
}

/**
 * Chemin absolu sur ce poste : `racine` (absolue, avec son séparateur) + `relatif` (« / »).
 * Le séparateur est déduit de la racine : « \ » sous Windows.
 */
export function absolu(racine: string, relatif: string): string {
  const sep = racine.includes("\\") ? "\\" : "/";
  const base = racine.replace(/[\\/]+$/, "");
  return relatif === "" ? base : base + sep + relatif.split("/").join(sep);
}
