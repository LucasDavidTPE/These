/**
 * Où est le `.docx` d'une partie. Une source s'écrit `racine:chemin` (comme les données brutes, SPEC §4.1).
 *
 * Deux racines sont **communes aux deux PC**, sans aucun réglage, et toujours préférées :
 *  - `espace:` : l'espace Thèse lui-même ;
 *  - `onedrive:` : le dossier OneDrive qui contient l'espace (« OneDrive », « OneDrive - entpe.fr »…). Son
 *    chemin change d'un PC à l'autre (nom d'utilisateur), mais ce qu'il contient est le même partout.
 * Les autres racines (un dossier local, une clé USB…) sont réglées sur chaque poste : c'est le dernier recours,
 * pour un fichier qui n'est pas synchronisé.
 */
import { joindre, Introuvable, type Fichiers } from "@noyau/stockage";
import { estNomRacine } from "@noyau/poste/reglages";
import { ecrireReference, lireReference } from "@noyau/poste/racines";
import { slugifier } from "@noyau/texte";
import type { Manuscrit } from "./plan";

export { RACINE_ESPACE, RACINE_ONEDRIVE, RACINES_PARTAGEES, scinder, dossierOneDrive, racinesPartagees, sourcePartagee, versSource, resoudreSource } from "@noyau/poste/partage";
export type { Resolution } from "@noyau/poste/partage";
import { RACINES_PARTAGEES, scinder, sourcePartagee, versSource } from "@noyau/poste/partage";

/** Nom de racine proposé pour un dossier : son nom en minuscules sans accents, unique parmi `pris`. */
export function racineProposee(dossier: string, pris: ReadonlySet<string>): string {
  let base = slugifier(scinder(dossier).nom).replace(/^[^a-z]+/, "") || "manuscrit";
  if (!estNomRacine(base)) base = "manuscrit";
  if (RACINES_PARTAGEES.includes(base)) base = `${base}-2`;
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
    const racine = existante ?? racineProposee(dossier, new Set([...Object.keys(racines), ...Object.keys(nouvelles), ...RACINES_PARTAGEES]));
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

/**
 * Rend communes aux deux PC les sources qui ne le sont pas encore : une partie lue sur ce PC dans un dossier
 * réglé localement, mais dont le fichier est en fait dans l'espace ou dans OneDrive, est réécrite en
 * `espace:` / `onedrive:`. Seules les parties **effectivement lues** (`lues` : identifiant → chemin absolu du
 * fichier trouvé) sont converties : un dossier mal réglé sur ce PC ne peut donc pas abîmer le plan.
 */
export function partagerSources(m: Manuscrit, lues: ReadonlyMap<string, string>, espace: string | null): { m: Manuscrit; converties: number } {
  let converties = 0;
  const parties = m.parties.map((p) => {
    const ref = lireReference(p.source);
    const chemin = lues.get(p.id);
    if (!ref || RACINES_PARTAGEES.includes(ref.racine) || !chemin) return p;
    const source = sourcePartagee(chemin, espace);
    if (!source || source === p.source) return p;
    converties++;
    return { ...p, source };
  });
  return { m: converties ? { ...m, parties } : m, converties };
}

/**
 * Relie une partie à un fichier choisi ou retrouvé sur ce PC (`chemin` absolu). Par ordre de préférence :
 *  1. le fichier est dans l'espace ou OneDrive : source commune, valable sur les deux PC ;
 *  2. il porte le même chemin relatif sous la racine locale de la partie : la source ne change pas, seul le
 *     dossier de cette racine est (re)réglé sur ce PC (l'autre PC garde le sien) ;
 *  3. sinon : nouvelle source, avec au besoin une nouvelle racine pour ce PC.
 */
export function relierFichier(source: string, chemin: string, espace: string | null, racines: Record<string, string>): { source: string; racine?: [string, string] } {
  const partagee = sourcePartagee(chemin, espace);
  if (partagee) return { source: partagee };
  const ref = lireReference(source);
  const norm = chemin.replace(/\\/g, "/").toLowerCase();
  if (ref && ref.chemin && !RACINES_PARTAGEES.includes(ref.racine) && norm.endsWith(`/${ref.chemin.toLowerCase()}`)) {
    return { source, racine: [ref.racine, chemin.slice(0, chemin.length - ref.chemin.length - 1)] };
  }
  const r = rattacher([chemin], espace, racines);
  const nouvelle = Object.entries(r.nouvellesRacines)[0];
  return { source: r.sources[0]!.source, ...(nouvelle ? { racine: nouvelle } : {}) };
}
