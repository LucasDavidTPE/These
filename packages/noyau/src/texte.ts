/**
 * Texte : recherche insensible à la casse et aux accents, noms de fichiers lisibles.
 * Repris de Figurine (src/core/library/search.ts et ids.ts).
 */

/** Minuscules, sans accents, espaces normalisés : la forme sur laquelle on cherche. */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si tous les mots de `requete` se trouvent dans `texte` (dans n'importe quel ordre). */
export function correspond(texte: string, requete: string): boolean {
  const mots = normaliser(requete).split(" ").filter(Boolean);
  if (mots.length === 0) return true;
  const t = normaliser(texte);
  return mots.every((m) => t.includes(m));
}

const SLUG_MAX = 40;

/**
 * « Structure A340 » → « structure-a340 » : minuscules, sans accents, mots séparés par
 * « - », 40 caractères au plus. Pur ASCII, pour éviter tout souci de normalisation
 * Unicode entre deux machines et OneDrive.
 */
export function slugifier(titre: string): string {
  const ascii = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ß/g, "ss")
    .toLowerCase();
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  const coupe = slug.slice(0, SLUG_MAX);
  const tiret = coupe.lastIndexOf("-");
  return (tiret > SLUG_MAX / 2 ? coupe.slice(0, tiret) : coupe).replace(/-+$/, "");
}
