/**
 * Dates ISO 8601 avec décalage horaire explicite : « 2026-10-02T09:14:00+02:00 ».
 * Le décalage est passé en paramètre pour rester déterministe (l'interface fournit
 * `-new Date().getTimezoneOffset()`). Repris de Figurine.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Vrai si `s` est une date ISO 8601 complète avec fuseau, et une date réelle. */
export function estDateIso(s: string): boolean {
  return ISO_RE.test(s) && !Number.isNaN(Date.parse(s));
}

/** Formate `date` dans le fuseau décalé de `decalageMinutes` par rapport à UTC (+120 = Paris l'été). */
export function isoAvecDecalage(date: Date, decalageMinutes: number): string {
  if (!Number.isInteger(decalageMinutes) || Math.abs(decalageMinutes) > 14 * 60) {
    throw new RangeError(`Décalage horaire invalide : ${decalageMinutes} min`);
  }
  const local = new Date(date.getTime() + decalageMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const signe = decalageMinutes < 0 ? "-" : "+";
  const abs = Math.abs(decalageMinutes);
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}` +
    `${signe}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}

/** Horodatage utilisable dans un nom de fichier : « 2026-09-25T17-02-00 ». */
export function horodatageFichier(date: Date, decalageMinutes: number): string {
  return isoAvecDecalage(date, decalageMinutes).slice(0, 19).replace(/:/g, "-");
}
