/**
 * Références aux données qui vivent hors de l'espace (SPEC §4.1) : `essais:tsrst-lucas/Essai1`.
 *
 * Aucun chemin absolu n'est écrit dans l'espace : on écrit un nom de racine et un chemin
 * relatif, et chaque poste traduit la racine grâce à ses réglages. Le jour où les données
 * changent de disque, on corrige une ligne dans les réglages. Même principe que le
 * `config.toml` de these-lgcb.
 */
import { absolu, estCheminRelatifSur } from "../stockage/chemins";
import { estNomRacine } from "./reglages";

export interface Reference {
  racine: string;
  /** Relatif à la racine, séparateur « / » ; vide = la racine elle-même. */
  chemin: string;
}

/** « essais:tsrst-lucas/Essai1 » → { racine, chemin } ; null si la forme est invalide. */
export function lireReference(texte: string): Reference | null {
  const i = texte.indexOf(":");
  if (i <= 0) return null;
  const racine = texte.slice(0, i);
  const chemin = texte.slice(i + 1).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!estNomRacine(racine)) return null;
  if (chemin !== "" && !estCheminRelatifSur(chemin)) return null;
  return { racine, chemin };
}

export function ecrireReference(ref: Reference): string {
  return `${ref.racine}:${ref.chemin}`;
}

export type Resolution =
  | { ok: true; chemin: string }
  | { ok: false; raison: "reference-invalide" | "racine-inconnue"; message: string };

/** Chemin absolu sur ce poste, d'après ses racines. */
export function resoudre(texte: string, racines: Record<string, string>): Resolution {
  const ref = lireReference(texte);
  if (!ref) return { ok: false, raison: "reference-invalide", message: `Référence invalide : « ${texte} »` };
  const base = racines[ref.racine];
  if (!base) {
    return { ok: false, raison: "racine-inconnue", message: `La racine « ${ref.racine} » n'est pas déclarée sur ce poste.` };
  }
  return { ok: true, chemin: absolu(base, ref.chemin) };
}

/**
 * Inverse : si `chemin` (absolu) est sous l'une des racines, la référence correspondante.
 * Sert quand l'utilisateur choisit un dossier dans une boîte de dialogue. La racine la plus
 * longue gagne ; la comparaison ignore la casse et le type de séparateur (Windows).
 */
export function referenceDepuisChemin(chemin: string, racines: Record<string, string>): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const cible = norm(chemin);
  let meilleure: { nom: string; base: string } | null = null;
  for (const [nom, base] of Object.entries(racines)) {
    const b = norm(base);
    const dedans = cible.toLowerCase() === b.toLowerCase() || cible.toLowerCase().startsWith(b.toLowerCase() + "/");
    if (dedans && (!meilleure || b.length > meilleure.base.length)) meilleure = { nom, base: b };
  }
  if (!meilleure) return null;
  return ecrireReference({ racine: meilleure.nom, chemin: cible.slice(meilleure.base.length).replace(/^\/+/, "") });
}
