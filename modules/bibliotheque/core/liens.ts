/**
 * Vérification des liens (SPEC §9.3, macro VerifierLiens) : la requête est faite par la
 * plateforme (Rust), seulement sur demande ; ici, le libellé noté dans « État du lien »
 * et le repérage des liens à revoir. Pur et testé.
 */
import type { Reference } from "./modele";

/** Réponse d'une vérification : code HTTP final (null si pas de réponse). */
export interface ReponseLien {
  code: number | null;
  urlFinale: string;
  erreur: string;
}

export const LIEN_OK = "OK";
export const LIEN_MORT = "Lien mort";
export const LIEN_INJOIGNABLE = "Injoignable";

/** « OK (200) », « Lien mort (404) », « Accès restreint (403) », « Injoignable : délai dépassé »… */
export function libelleLien(r: ReponseLien): string {
  const c = r.code;
  if (c === null) {
    const e = r.erreur.toLowerCase();
    const raison = /timeout|timed out/.test(e) ? "délai dépassé" : /dns|resolve|lookup|name/.test(e) ? "nom de site inconnu" : /certificat|certificate|tls/.test(e) ? "certificat refusé" : /adresse invalide/.test(e) ? "adresse invalide" : "pas de réponse";
    return `${LIEN_INJOIGNABLE} : ${raison}`;
  }
  if (c >= 200 && c < 300) return `${LIEN_OK} (${c})`;
  if (c === 404 || c === 410) return `${LIEN_MORT} (${c})`;
  if (c === 401 || c === 403) return `Accès restreint (${c})`;
  if (c === 429) return `Trop de requêtes, à refaire (${c})`;
  if (c >= 500) return `Erreur du serveur (${c})`;
  return `Réponse inattendue (${c})`;
}

/** Lien à revoir : mort, ou injoignable (un accès restreint est normal chez un éditeur). */
export function lienARevoir(etat: string): boolean {
  return etat.startsWith(LIEN_MORT) || etat.startsWith(LIEN_INJOIGNABLE);
}

/** Références dont le lien peut être vérifié (une adresse web). */
export function liensAVerifier<T extends { id: string; valeur: Pick<Reference, "url"> }>(refs: readonly T[]): T[] {
  return refs.filter((r) => /^https?:\/\//i.test(r.valeur.url.trim()));
}
