/**
 * Identifiants des objets : un préfixe et un numéro à largeur fixe (`BIB-001`, `PH-0012`).
 * Attribution : max(existants) + 1 au moment de la création, en scannant (SPEC §4.1).
 */

export interface FormatId {
  /** « BIB- », « PH- »… */
  prefixe: string;
  /** Largeur minimale du numéro (3 → « 001 ») ; au-delà, le numéro s'allonge. */
  chiffres: number;
}

function echapper(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** « BIB-007 » → 7 ; toute autre forme (autre préfixe, trop peu de chiffres, 0) → null. */
export function lireId(format: FormatId, id: string): number | null {
  const m = new RegExp(`^${echapper(format.prefixe)}(\\d{${format.chiffres},})$`).exec(id);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function formaterId(format: FormatId, n: number): string {
  if (!Number.isSafeInteger(n) || n <= 0) throw new RangeError(`Numéro invalide : ${n}`);
  return format.prefixe + String(n).padStart(format.chiffres, "0");
}

/** max(ID existants lisibles) + 1 ; les ID illisibles sont ignorés. */
export function idSuivant(format: FormatId, existants: Iterable<string>): string {
  let max = 0;
  for (const id of existants) {
    const n = lireId(format, id);
    if (n !== null && n > max) max = n;
  }
  return formaterId(format, max + 1);
}
