/**
 * Où est le `.docx` d'une partie. Les fichiers Word peuvent vivre n'importe où et ne sont pas
 * au même endroit sur les deux PC : une source s'écrit `racine:chemin` (comme les données brutes,
 * SPEC §4.1), la racine étant un nom dont chaque poste règle le dossier ; « espace » désigne
 * l'espace Thèse lui-même.
 */
import { absolu, joindre, Introuvable, type Fichiers } from "@noyau/stockage";
import { estNomRacine } from "@noyau/poste/reglages";
import { ecrireReference, lireReference, referenceDepuisChemin } from "@noyau/poste/racines";
import { slugifier } from "@noyau/texte";

export const RACINE_ESPACE = "espace";

/** « C:\Users\x\Thèse\ch1.docx » → { dossier: « C:\Users\x\Thèse », nom: « ch1.docx » }. */
export function scinder(chemin: string): { dossier: string; nom: string } {
  const i = Math.max(chemin.lastIndexOf("/"), chemin.lastIndexOf("\\"));
  return i < 0 ? { dossier: "", nom: chemin } : { dossier: chemin.slice(0, i), nom: chemin.slice(i + 1) };
}

/** Source d'un chemin absolu d'après les racines du poste (et l'espace) ; null s'il est hors de toutes. */
export function versSource(chemin: string, espace: string | null, racines: Record<string, string>): string | null {
  return referenceDepuisChemin(chemin, espace ? { ...racines, [RACINE_ESPACE]: espace } : racines);
}

export type Resolution =
  | { ok: true; racine: string; chemin: string; dossier: string; absolu: string }
  | { ok: false; racine: string; message: string };

/** Chemin absolu de la source sur ce poste, ou la raison pour laquelle on ne le connaît pas. */
export function resoudreSource(source: string, espace: string | null, racines: Record<string, string>): Resolution {
  const ref = lireReference(source);
  if (!ref) return { ok: false, racine: "", message: `Source invalide : « ${source} ».` };
  const dossier = ref.racine === RACINE_ESPACE ? espace : racines[ref.racine];
  if (!dossier) {
    return {
      ok: false,
      racine: ref.racine,
      message: ref.racine === RACINE_ESPACE ? "Aucun espace n'est ouvert." : `Le dossier « ${ref.racine} » n'est pas réglé sur ce PC.`,
    };
  }
  return { ok: true, racine: ref.racine, chemin: ref.chemin, dossier, absolu: absolu(dossier, ref.chemin) };
}

/** Nom de racine proposé pour un dossier : son nom en minuscules sans accents, unique parmi `pris`. */
export function racineProposee(dossier: string, pris: ReadonlySet<string>): string {
  let base = slugifier(scinder(dossier).nom).replace(/^[^a-z]+/, "") || "manuscrit";
  if (!estNomRacine(base)) base = "manuscrit";
  if (base === RACINE_ESPACE) base = "espace-2";
  let nom = base;
  for (let i = 2; pris.has(nom); i++) nom = `${base}-${i}`;
  return nom;
}

export interface Rattachement {
  /** Chemin absolu choisi → source. */
  sources: { absolu: string; source: string }[];
  /** Racines à déclarer sur ce poste pour que les sources se résolvent (dossier absolu par nom). */
  nouvellesRacines: Record<string, string>;
}

/**
 * Transforme des chemins absolus en sources. Un fichier hors de toute racine connue reçoit une
 * nouvelle racine : son dossier (un même dossier = une même racine).
 */
export function rattacher(chemins: readonly string[], espace: string | null, racines: Record<string, string>): Rattachement {
  const nouvelles: Record<string, string> = {};
  const sources: Rattachement["sources"] = [];
  for (const abs of chemins) {
    const connu = versSource(abs, espace, { ...racines, ...nouvelles });
    if (connu) {
      sources.push({ absolu: abs, source: connu });
      continue;
    }
    const { dossier, nom } = scinder(abs);
    const norm = (p: string) => p.replace(/\\/g, "/").toLowerCase();
    const existante = Object.entries(nouvelles).find(([, d]) => norm(d) === norm(dossier))?.[0];
    const racine = existante ?? racineProposee(dossier, new Set([...Object.keys(racines), ...Object.keys(nouvelles), RACINE_ESPACE]));
    nouvelles[racine] = dossier;
    sources.push({ absolu: abs, source: ecrireReference({ racine, chemin: nom }) });
  }
  return { sources, nouvellesRacines: nouvelles };
}

/** Vrai si l'erreur dit « fichier ou dossier absent » (par opposition à un accès refusé, un fichier verrouillé…). */
export const estIntrouvable = (e: unknown) => e instanceof Introuvable || (e as { code?: string } | null)?.code === "not-found";

/**
 * Cherche un fichier par son nom (casse ignorée) sous `fs`, à `profondeur` niveaux au plus et dans la limite de
 * `maxDossiers` dossiers visités. Renvoie les dossiers (relatifs à `fs`, « » = la racine) qui le contiennent,
 * les moins profonds d'abord. Sert à retrouver les fichiers Word quand le dossier réglé sur ce PC n'est pas le bon.
 */
export async function chercherFichier(fs: Fichiers, nom: string, profondeur = 3, maxDossiers = 300): Promise<string[]> {
  const voulu = nom.toLowerCase();
  const trouves: string[] = [];
  const file = [{ dossier: "", niveau: 0 }];
  let vus = 0;
  while (file.length && vus < maxDossiers) {
    const { dossier, niveau } = file.shift()!;
    vus++;
    const entrees = await fs.listDir(dossier).catch(() => []);
    if (entrees.some((e) => e.kind === "file" && e.name.toLowerCase() === voulu)) trouves.push(dossier);
    if (niveau < profondeur) for (const e of entrees) if (e.kind === "dir" && !e.name.startsWith(".")) file.push({ dossier: joindre(dossier, e.name), niveau: niveau + 1 });
  }
  return trouves;
}
