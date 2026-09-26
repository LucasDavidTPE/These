/**
 * Dates ISO 8601 avec décalage horaire explicite, comme dans meta.json (SPEC §3) :
 * « 2026-10-02T09:14:00+02:00 ». Le décalage est passé en paramètre pour rester
 * déterministe (l'UI fournit `-new Date().getTimezoneOffset()`).
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Vrai si `s` est une date ISO 8601 complète avec fuseau, et une date réelle. */
export function isIsoDateTime(s: string): boolean {
  return ISO_RE.test(s) && !Number.isNaN(Date.parse(s));
}

/** Formate `date` dans le fuseau décalé de `offsetMinutes` par rapport à UTC (+120 = Paris l'été). */
export function toIsoWithOffset(date: Date, offsetMinutes: number): string {
  if (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 14 * 60) {
    throw new RangeError(`Décalage horaire invalide : ${offsetMinutes} min`);
  }
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return (
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
  );
}
