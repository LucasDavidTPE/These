/**
 * Identifiants et noms de dossiers des figures (SPEC §4).
 *
 * Une figure = un dossier `FIG-0007_structure-a340` : l'ID en préfixe, puis un
 * « slug » lisible tiré du titre. L'ID fait foi, le slug n'est qu'indicatif.
 */

const ID_PREFIX = "FIG-";
const ID_RE = /^FIG-(\d{4,})$/;
const FOLDER_RE = /^(FIG-\d{4,})(?:_(.*))?$/;
const SLUG_MAX = 40;

/** « FIG-0007 » → 7 ; toute autre forme → null. */
export function parseFigureId(id: string): number | null {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** 7 → « FIG-0007 » (au moins 4 chiffres, davantage au-delà de 9999). */
export function formatFigureId(n: number): string {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new RangeError(`Numéro de figure invalide : ${n}`);
  }
  return ID_PREFIX + String(n).padStart(4, "0");
}

/** Attribution d'ID : max(ID existants) + 1 (SPEC §4). Les ID illisibles sont ignorés. */
export function nextFigureId(existing: Iterable<string>): string {
  let max = 0;
  for (const id of existing) {
    const n = parseFigureId(id);
    if (n !== null && n > max) max = n;
  }
  return formatFigureId(max + 1);
}

/**
 * Slug de dossier : minuscules, sans accents, mots séparés par « - », 40 caractères max.
 * Pur ASCII pour éviter tout souci de normalisation Unicode entre machines et OneDrive.
 */
export function slugify(title: string): string {
  const ascii = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .replace(/ß/g, "ss")
    .toLowerCase();
  const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  // Coupe proprement sur une fin de mot si possible.
  const cut = slug.slice(0, SLUG_MAX);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > SLUG_MAX / 2 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

/** « FIG-0007 » + « Structure A340 » → « FIG-0007_structure-a340 ». */
export function figureFolderName(id: string, title: string): string {
  if (parseFigureId(id) === null) throw new RangeError(`ID de figure invalide : ${id}`);
  const slug = slugify(title);
  return slug ? `${id}_${slug}` : id;
}

/** « FIG-0007_structure-a340 » → { id: « FIG-0007 », slug: « structure-a340 » } ; sinon null. */
export function parseFolderName(name: string): { id: string; slug: string } | null {
  const m = FOLDER_RE.exec(name);
  if (!m || parseFigureId(m[1]!) === null) return null;
  return { id: m[1]!, slug: m[2] ?? "" };
}
