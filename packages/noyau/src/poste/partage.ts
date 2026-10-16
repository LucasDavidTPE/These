/**
 * Racines communes aux deux PC, sans aucun réglage (SPEC §4.1) :
 *  - `espace:` : l'espace Thèse lui-même ;
 *  - `onedrive:` : le dossier OneDrive qui contient l'espace (« OneDrive », « OneDrive - entpe.fr »…). Son
 *    chemin change d'un PC à l'autre (nom d'utilisateur), mais ce qu'il contient est le même partout.
 * Les autres racines (un dossier local, une clé USB…) sont réglées sur chaque poste : c'est le dernier recours.
 * Partagé par les modules qui suivent des fichiers hors de l'espace (Manuscrits, Figures → COMSOL).
 */
import { absolu } from "../stockage/chemins";
import { lireReference, referenceDepuisChemin } from "./racines";

export const RACINE_ESPACE = "espace";
export const RACINE_ONEDRIVE = "onedrive";
/** Racines communes aux deux PC (jamais réglées dans le poste). */
export const RACINES_PARTAGEES: readonly string[] = [RACINE_ESPACE, RACINE_ONEDRIVE];

/** « C:\Users\x\Thèse\ch1.docx » → { dossier: « C:\Users\x\Thèse », nom: « ch1.docx » }. */
export function scinder(chemin: string): { dossier: string; nom: string } {
  const i = Math.max(chemin.lastIndexOf("/"), chemin.lastIndexOf("\\"));
  return i < 0 ? { dossier: "", nom: chemin } : { dossier: chemin.slice(0, i), nom: chemin.slice(i + 1) };
}

/** Dossier OneDrive qui contient l'espace : le premier dossier « OneDrive » ou « OneDrive - … » de son chemin ; null sinon. */
export function dossierOneDrive(espace: string | null): string | null {
  if (!espace) return null;
  const sep = espace.includes("\\") ? "\\" : "/";
  const parts = espace.replace(/[\\/]+$/, "").split(/[\\/]/);
  const i = parts.findIndex((p, j) => j > 0 && /^OneDrive( - .+)?$/i.test(p));
  return i > 0 ? parts.slice(0, i + 1).join(sep) : null;
}

/** Les racines communes de ce poste : l'espace et son dossier OneDrive. */
export function racinesPartagees(espace: string | null): Record<string, string> {
  const od = dossierOneDrive(espace);
  return { ...(od ? { [RACINE_ONEDRIVE]: od } : {}), ...(espace ? { [RACINE_ESPACE]: espace } : {}) };
}

/** Source commune aux deux PC d'un chemin absolu (dans l'espace, sinon dans OneDrive) ; null s'il est ailleurs. */
export function sourcePartagee(chemin: string, espace: string | null): string | null {
  const p = racinesPartagees(espace);
  if (p[RACINE_ESPACE]) {
    const s = referenceDepuisChemin(chemin, { [RACINE_ESPACE]: p[RACINE_ESPACE] });
    if (s) return s;
  }
  return p[RACINE_ONEDRIVE] ? referenceDepuisChemin(chemin, { [RACINE_ONEDRIVE]: p[RACINE_ONEDRIVE] }) : null;
}

/**
 * Source d'un chemin absolu : d'abord l'espace, puis OneDrive (communs aux deux PC), et seulement ensuite les
 * racines du poste ; null s'il est hors de toutes.
 */
export function versSource(chemin: string, espace: string | null, racines: Record<string, string>): string | null {
  const locales = Object.fromEntries(Object.entries(racines).filter(([n]) => !RACINES_PARTAGEES.includes(n)));
  return sourcePartagee(chemin, espace) ?? referenceDepuisChemin(chemin, locales);
}

export type Resolution =
  | { ok: true; racine: string; chemin: string; dossier: string; absolu: string }
  | { ok: false; racine: string; message: string };

/** Chemin absolu de la source sur ce poste, ou la raison pour laquelle on ne le connaît pas. */
export function resoudreSource(source: string, espace: string | null, racines: Record<string, string>): Resolution {
  const ref = lireReference(source);
  if (!ref) return { ok: false, racine: "", message: `Source invalide : « ${source} ».` };
  const dossier = RACINES_PARTAGEES.includes(ref.racine) ? racinesPartagees(espace)[ref.racine] : racines[ref.racine];
  if (!dossier) {
    return {
      ok: false,
      racine: ref.racine,
      message:
        ref.racine === RACINE_ESPACE
          ? "Aucun espace n'est ouvert."
          : ref.racine === RACINE_ONEDRIVE
            ? "L'espace de ce PC n'est pas dans un dossier OneDrive : les fichiers rangés dans OneDrive ne peuvent pas être retrouvés."
            : `Le dossier « ${ref.racine} » n'est pas réglé sur ce PC.`,
    };
  }
  return { ok: true, racine: ref.racine, chemin: ref.chemin, dossier, absolu: absolu(dossier, ref.chemin) };
}

