/**
 * Collection d'objets JSON, un fichier par objet (SPEC §4.1) : `references/BIB-001.json`.
 *
 * Deux PC qui modifient deux objets différents ne se gênent jamais ; un conflit OneDrive
 * ne touche qu'un objet. L'ID est le nom du fichier : c'est lui qui fait foi. Il est
 * aussi recopié dans le JSON (champ `id`) pour qu'un fichier se lise seul.
 */
import { joindre } from "./chemins";
import { detecterCopieConflit, estTemporaireOrphelin, planResolution, type ChoixConflit, type CopieConflit, type OperationFichier } from "./conflits";
import { DejaExistant, jsonStable, type Fichiers } from "./fichiers";
import { formaterId, idSuivant, lireId, type FormatId } from "./ids";
import type { Probleme } from "./problemes";

export interface DefinitionCollection<T> {
  /** Dossier relatif à la racine de l'espace : « bibliotheque/references ». */
  dossier: string;
  format: FormatId;
  /**
   * Valide et normalise le contenu lu (sans le champ `id`). Lève une `Error` au message
   * lisible si le contenu est inexploitable : le fichier est alors signalé, pas perdu.
   */
  lire(brut: Record<string, unknown>): T;
}

export interface ObjetCharge<T> {
  id: string;
  /** Chemin du fichier, relatif à la racine. */
  chemin: string;
  valeur: T;
}

export interface EtatCollection<T> {
  /** Triés par numéro d'ID. */
  objets: ObjetCharge<T>[];
  problemes: Probleme[];
}

const EXT = ".json";

function idDuFichier(def: Pick<DefinitionCollection<unknown>, "format">, nom: string): string | null {
  if (!nom.endsWith(EXT)) return null;
  const id = nom.slice(0, -EXT.length);
  return lireId(def.format, id) === null ? null : id;
}

export async function chargerCollection<T>(fs: Fichiers, def: DefinitionCollection<T>): Promise<EtatCollection<T>> {
  if (!(await fs.exists(def.dossier))) return { objets: [], problemes: [] };
  const entrees = (await fs.listDir(def.dossier)).filter((e) => e.kind === "file");
  const canoniques = entrees.map((e) => e.name).filter((n) => idDuFichier(def, n) !== null);
  const objets: ObjetCharge<T>[] = [];
  const problemes: Probleme[] = [];

  for (const { name } of entrees) {
    const chemin = joindre(def.dossier, name);
    const id = idDuFichier(def, name);
    if (id === null) {
      if (estTemporaireOrphelin(name)) {
        problemes.push({ type: "temporaire", chemin });
        continue;
      }
      const conflit = detecterCopieConflit(name, canoniques);
      if (conflit) problemes.push({ type: "conflit", dossier: def.dossier, conflit, format: def.format });
      continue; // autre fichier : ignoré (une note, un fichier de l'utilisateur…)
    }
    try {
      const brut: unknown = JSON.parse(await fs.readText(chemin));
      if (typeof brut !== "object" || brut === null || Array.isArray(brut)) throw new Error("Le fichier ne contient pas un objet JSON.");
      const reste: Record<string, unknown> = { ...(brut as Record<string, unknown>) };
      delete reste.id;
      objets.push({ id, chemin, valeur: def.lire(reste) });
    } catch (e) {
      const detail = e instanceof SyntaxError ? `JSON invalide : ${e.message}` : e instanceof Error ? e.message : String(e);
      problemes.push({ type: "illisible", chemin, detail });
    }
  }
  objets.sort((a, b) => lireId(def.format, a.id)! - lireId(def.format, b.id)!);
  return { objets, problemes };
}

function contenu(id: string, valeur: object): string {
  return jsonStable({ id, ...valeur });
}

/** Nombre d'essais quand l'autre PC a pris le même ID entre-temps. */
const ESSAIS_CREATION = 10;

/**
 * Crée un objet sous l'ID suivant et renvoie cet ID. L'écriture est exclusive : si le
 * fichier existe déjà (créé entre le scan et l'écriture), on passe au numéro suivant.
 */
export async function creerObjet<T extends object>(fs: Fichiers, def: DefinitionCollection<T>, valeur: T): Promise<string> {
  await fs.ensureDir(def.dossier);
  const noms = (await fs.listDir(def.dossier)).map((e) => e.name);
  let id = idSuivant(def.format, noms.map((n) => idDuFichier(def, n)).filter((i): i is string => i !== null));
  for (let i = 0; i < ESSAIS_CREATION; i++) {
    try {
      await fs.writeTextNew(joindre(def.dossier, id + EXT), contenu(id, valeur));
      return id;
    } catch (e) {
      if (!(e instanceof DejaExistant)) throw e;
      id = formaterId(def.format, lireId(def.format, id)! + 1);
    }
  }
  throw new Error(`Impossible de réserver un identifiant dans ${def.dossier}.`);
}

/** Enregistre (remplace) l'objet `id`, atomiquement. */
export async function enregistrerObjet<T extends object>(fs: Fichiers, def: DefinitionCollection<T>, id: string, valeur: T): Promise<void> {
  if (lireId(def.format, id) === null) throw new RangeError(`Identifiant invalide pour ${def.dossier} : ${id}`);
  await fs.ensureDir(def.dossier);
  await fs.writeTextAtomic(joindre(def.dossier, id + EXT), contenu(id, valeur));
}

export async function appliquer(fs: Fichiers, ops: OperationFichier[]): Promise<void> {
  for (const op of ops) {
    if (op.op === "mkdir") await fs.createDir(op.path);
    else await fs.rename(op.from, op.to);
  }
}

/**
 * Résout une copie de conflit d'une collection. Avec « garder les deux », la copie devient
 * un nouvel objet sous l'ID suivant (son champ `id` interne est corrigé au prochain
 * enregistrement ; c'est le nom du fichier qui fait foi).
 */
export async function resoudreConflit(
  fs: Fichiers,
  def: Pick<DefinitionCollection<unknown>, "dossier" | "format">,
  conflit: CopieConflit,
  choix: ChoixConflit,
  horodatage: string,
): Promise<void> {
  let nouveauNom: string | undefined;
  if (choix === "les-deux") {
    const noms = (await fs.listDir(def.dossier)).map((e) => e.name);
    nouveauNom = idSuivant(def.format, noms.map((n) => idDuFichier(def, n)).filter((i): i is string => i !== null)) + EXT;
  }
  const archiveExiste = await fs.exists(joindre(def.dossier, ".conflits"));
  await appliquer(fs, planResolution(def.dossier, conflit, choix, horodatage, archiveExiste, nouveauNom));
}
