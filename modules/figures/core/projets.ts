/**
 * Projets de figures (SPEC §6.1) : un article, un chapitre… Chaque projet est un dossier
 * `_projets/<slug>/` de la bibliothèque (scripts Python, sorties, classeurs Excel) ; les
 * figures restent à leur place et portent la liste de leurs projets (`projets` du meta.json),
 * si bien qu'une figure peut être dans plusieurs projets, ou dans aucun.
 * Pur : le système de fichiers et l'horloge sont passés en paramètres.
 */
import { joinPath, saveMeta, validateMeta, type FigureMeta, type LibraryFs } from "./library";

export const PROJETS_DIR = "_projets";
export const PROJET_FILE = "projet.json";
export const PROJET_FORMAT = 1;
/** Sous-dossiers créés avec chaque projet. */
export const DOSSIERS_PROJET = { scripts: "scripts", sorties: "sorties", excel: "excel" } as const;
const CORBEILLE = "_corbeille";

export interface Projet {
  /** Nom du dossier, fait foi. */
  slug: string;
  titre: string;
  description?: string;
  cree: string;
  modifie: string;
}

export interface ListeProjets {
  projets: Projet[];
  /** Dossiers de `_projets/` illisibles ou sans projet.json valide. */
  problemes: { slug: string; message: string }[];
}

/** « Article MAIRE INFRA27 » → « article-maire-infra27 ». */
export function slugifier(titre: string): string {
  const s = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return s || "projet";
}

export const cheminProjet = (slug: string, ...parts: string[]) => joinPath(PROJETS_DIR, slug, ...parts);

function lireProjet(slug: string, texte: string): Projet {
  const raw = JSON.parse(texte) as Record<string, unknown>;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("projet.json doit contenir un objet.");
  if (typeof raw.titre !== "string" || !raw.titre.trim()) throw new Error("titre manquant.");
  const date = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : "");
  return {
    slug,
    titre: raw.titre,
    ...(typeof raw.description === "string" && raw.description ? { description: raw.description } : {}),
    cree: date("cree"),
    modifie: date("modifie"),
  };
}

function serialiser(p: Projet, brut: Record<string, unknown> = {}): string {
  const sortie: Record<string, unknown> = { ...brut, format: PROJET_FORMAT, ...p };
  delete sortie.slug;
  if (!p.description) delete sortie.description;
  return JSON.stringify(sortie, null, 2) + "\n";
}

/** Projets de la bibliothèque, triés par titre. */
export async function listerProjets(fs: LibraryFs): Promise<ListeProjets> {
  const racine = await fs.listDir("").catch(() => []);
  if (!racine.some((e) => e.kind === "dir" && e.name === PROJETS_DIR)) return { projets: [], problemes: [] };
  const projets: Projet[] = [];
  const problemes: ListeProjets["problemes"] = [];
  for (const e of await fs.listDir(PROJETS_DIR)) {
    if (e.kind !== "dir" || e.name.startsWith("_") || e.name.startsWith(".")) continue;
    try {
      projets.push(lireProjet(e.name, await fs.readText(cheminProjet(e.name, PROJET_FILE))));
    } catch (err) {
      problemes.push({ slug: e.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  projets.sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }) || a.slug.localeCompare(b.slug));
  return { projets, problemes };
}

/** Crée le dossier du projet et ses sous-dossiers ; le slug est rendu unique (« -2 », « -3 »…). */
export async function creerProjet(fs: LibraryFs, args: { titre: string; description?: string }, now: string): Promise<Projet> {
  const titre = args.titre.trim();
  if (!titre) throw new Error("Donnez un titre au projet.");
  await fs.createDir(PROJETS_DIR).catch(() => undefined);
  const base = slugifier(titre);
  let slug = base;
  for (let n = 2; ; n++) {
    try {
      await fs.createDir(cheminProjet(slug));
      break;
    } catch (e) {
      if ((e as { code?: string }).code !== "already-exists" || n > 999) throw e;
      slug = `${base}-${n}`;
    }
  }
  for (const d of Object.values(DOSSIERS_PROJET)) await fs.createDir(cheminProjet(slug, d)).catch(() => undefined);
  const projet: Projet = { slug, titre, ...(args.description?.trim() ? { description: args.description.trim() } : {}), cree: now, modifie: now };
  await fs.writeTextAtomic(cheminProjet(slug, PROJET_FILE), serialiser(projet));
  return projet;
}

/** Titre et description ; les champs inconnus de projet.json sont gardés. */
export async function modifierProjet(fs: LibraryFs, slug: string, patch: { titre?: string; description?: string }, now: string): Promise<Projet> {
  const chemin = cheminProjet(slug, PROJET_FILE);
  const texte = await fs.readText(chemin);
  const ancien = lireProjet(slug, texte);
  const titre = (patch.titre ?? ancien.titre).trim();
  if (!titre) throw new Error("Donnez un titre au projet.");
  const description = (patch.description ?? ancien.description ?? "").trim();
  const projet: Projet = { ...ancien, titre, modifie: now, ...(description ? { description } : {}) };
  if (!description) delete projet.description;
  await fs.writeTextAtomic(chemin, serialiser(projet, JSON.parse(texte) as Record<string, unknown>));
  return projet;
}

/**
 * Retire le projet de la liste : son dossier part dans `_projets/_corbeille/<slug>-<date>`
 * (rien n'est effacé, il se récupère à la main). Les figures ne sont pas touchées : un slug
 * inconnu dans leur liste est simplement ignoré.
 */
export async function supprimerProjet(fs: LibraryFs, slug: string, now: string): Promise<string> {
  await fs.createDir(joinPath(PROJETS_DIR, CORBEILLE)).catch(() => undefined);
  const dest = joinPath(PROJETS_DIR, CORBEILLE, `${slug}-${now.slice(0, 19).replace(/[:T]/g, "-")}`);
  await fs.rename(cheminProjet(slug), dest);
  return dest;
}

/** Projets d'une figure (slugs), sans doublon. */
export function projetsDe(meta: FigureMeta | null | undefined): string[] {
  const p = meta?.projets;
  if (!Array.isArray(p)) return [];
  return [...new Set(p.filter((x): x is string => typeof x === "string" && x !== ""))];
}

async function lireMeta(fs: LibraryFs, dossier: string): Promise<FigureMeta> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  return v.meta;
}

/** Range la figure dans le projet ; n'écrit rien si elle y est déjà. */
export async function ajouterAuProjet(fs: LibraryFs, dossier: string, slug: string, now: string, host: string): Promise<boolean> {
  const meta = await lireMeta(fs, dossier);
  const liste = projetsDe(meta);
  if (liste.includes(slug)) return false;
  await saveMeta(fs, dossier, { ...meta, projets: [...liste, slug] }, { now, host });
  return true;
}

export async function retirerDuProjet(fs: LibraryFs, dossier: string, slug: string, now: string, host: string): Promise<boolean> {
  const meta = await lireMeta(fs, dossier);
  const liste = projetsDe(meta);
  if (!liste.includes(slug)) return false;
  const reste = liste.filter((s) => s !== slug);
  const neuf: FigureMeta = { ...meta, projets: reste };
  if (reste.length === 0) delete neuf.projets;
  await saveMeta(fs, dossier, neuf, { now, host });
  return true;
}

export interface FichiersProjet {
  /** Scripts Python (`scripts/*.py`), sans la bibliothèque fournie. */
  scripts: string[];
  /** Classeurs (`excel/*.xlsx|xlsm`). */
  classeurs: string[];
}

const nomsDans = async (fs: LibraryFs, dossier: string, ext: RegExp) =>
  (await fs.listDir(dossier).catch(() => []))
    .filter((e) => e.kind === "file" && ext.test(e.name) && !e.name.startsWith("~$") && !e.name.endsWith(".tmp"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

export const BIBLIOTHEQUE_PYTHON = "these_figures.py";

export async function fichiersProjet(fs: LibraryFs, slug: string): Promise<FichiersProjet> {
  const scripts = (await nomsDans(fs, cheminProjet(slug, DOSSIERS_PROJET.scripts), /\.py$/i)).filter((n) => n !== BIBLIOTHEQUE_PYTHON);
  const classeurs = await nomsDans(fs, cheminProjet(slug, DOSSIERS_PROJET.excel), /\.xls[xm]$/i);
  return { scripts, classeurs };
}
