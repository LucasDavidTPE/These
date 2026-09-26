/**
 * Verrou d'édition `.lock` (SPEC §4) : {"host": "PC-TRAVAIL", "since": "…"}.
 *
 * La pose et la levée sont faites côté Rust (src-tauri/src/library/lock.rs), qui applique
 * la même règle des 12 h ; ici on ne fait que lire et interpréter, pour l'affichage.
 */
import { isIsoDateTime } from "./dates";

export const LOCK_FILE = ".lock";
/** Au-delà, un verrou d'un autre poste est considéré comme oublié (plantage, PC éteint). */
export const STALE_LOCK_HOURS = 12;

export interface LockInfo {
  host: string;
  since: string;
}

/**
 * - `free`  : pas de verrou ;
 * - `mine`  : posé par ce poste (par exemple avant un plantage) → on le reprend ;
 * - `other` : posé par un autre poste il y a moins de 12 h → lecture seule + « forcer » ;
 * - `stale` : autre poste, plus de 12 h → on peut le reprendre, avec un avertissement.
 */
export type LockStatus = "free" | "mine" | "other" | "stale";

/** Lit le contenu d'un `.lock` ; null s'il est illisible (on le traite alors comme périmé). */
export function parseLock(text: string): LockInfo | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null) return null;
    const { host, since } = raw as Record<string, unknown>;
    if (typeof host !== "string" || host.trim() === "") return null;
    if (typeof since !== "string" || !isIsoDateTime(since)) return null;
    return { host, since };
  } catch {
    return null;
  }
}

/** Les noms de poste Windows ne tiennent pas compte de la casse. */
export function sameHost(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function lockStatus(lock: LockInfo | null, currentHost: string, now: Date): LockStatus {
  if (lock === null) return "free";
  if (sameHost(lock.host, currentHost)) return "mine";
  const ageMs = now.getTime() - Date.parse(lock.since);
  // Horloge de l'autre PC en avance (âge négatif) : on considère le verrou comme récent.
  return ageMs > STALE_LOCK_HOURS * 3_600_000 ? "stale" : "other";
}
