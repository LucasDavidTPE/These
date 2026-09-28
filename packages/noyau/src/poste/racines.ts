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

/**
 * Ce qui vit toujours dans l'espace (SPEC §4.1), quoi que dise le poste : les PDF de la
 * bibliographie et la bibliothèque de figures. Une racine « biblio-pdf » ou un dossier de
 * figures encore déclarés ailleurs sur un poste sont d'anciens emplacements, à rapatrier.
 */
export const DANS_L_ESPACE = { "biblio-pdf": "bibliotheque/pdf", figures: "figures" } as const;
export type DansLEspace = keyof typeof DANS_L_ESPACE;

/** Racines vues par les modules : celles du poste, plus celles qui vivent dans l'espace. */
export function racinesEffectives(racines: Record<string, string>, espace: string | null): Record<string, string> {
  return espace ? { ...racines, "biblio-pdf": absolu(espace, DANS_L_ESPACE["biblio-pdf"]) } : racines;
}

/** Dossier de la bibliothèque de figures : dans l'espace ; sans espace (produit Figurine seul), celui du poste. */
export function dossierFigures(figuresDuPoste: string | null, espace: string | null): string | null {
  return espace ? absolu(espace, DANS_L_ESPACE.figures) : figuresDuPoste;
}

const memeDossier = (a: string, b: string) => a.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() === b.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** Anciens emplacements encore déclarés sur ce poste, hors de l'espace : à rapatrier. */
export function horsEspace(r: { racines: Record<string, string>; figures: string | null }, espace: string | null): { quoi: DansLEspace; chemin: string }[] {
  if (!espace) return [];
  const out: { quoi: DansLEspace; chemin: string }[] = [];
  const pdf = r.racines["biblio-pdf"];
  if (pdf && !memeDossier(pdf, absolu(espace, DANS_L_ESPACE["biblio-pdf"]))) out.push({ quoi: "biblio-pdf", chemin: pdf });
  if (r.figures && !memeDossier(r.figures, absolu(espace, DANS_L_ESPACE.figures))) out.push({ quoi: "figures", chemin: r.figures });
  return out;
}
