/**
 * Figures rattachées à une campagne ou à une étude. Deux façons :
 * - par l'origine : une figure produite depuis une campagne (courbes d'un essai, traitement
 *   2S2P1D d'un essai de campagne) lui appartient d'office ;
 * - à la main : `meta.json` garde la liste `rattachements` ({ type, id, titre }).
 * Pur : le système de fichiers et l'horloge sont passés en paramètres.
 */
import { joinPath, saveMeta, scanLibrary, thumbnailFile, validateMeta, type FigureMeta, type LibraryFs } from "./library";

export interface Cible {
  type: "campagne" | "etude";
  /** Identifiant dans l'espace : slug de la campagne, dossier de l'étude. */
  id: string;
  titre?: string;
}

export interface FigureLiee {
  dossier: string;
  id: string;
  titre: string;
  vignette: string | null;
  /** « origine » : produite depuis la cible ; « manuel » : rattachée à la main (peut être détachée). */
  lien: "origine" | "manuel";
}

const memeCible = (a: Cible, b: Cible) => a.type === b.type && a.id === b.id;

export function rattachementsDe(meta: FigureMeta | null | undefined): Cible[] {
  const r = meta?.rattachements;
  if (!Array.isArray(r)) return [];
  return r.flatMap((x) => {
    const c = x as Partial<Cible>;
    return (c.type === "campagne" || c.type === "etude") && typeof c.id === "string" && c.id ? [{ type: c.type, id: c.id, ...(typeof c.titre === "string" ? { titre: c.titre } : {}) }] : [];
  });
}

/** Cibles déduites de l'origine enregistrée par le module qui a produit la figure. */
export function ciblesDeOrigine(meta: FigureMeta | null | undefined): Cible[] {
  const o = meta?.origine as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return [];
  if (o.module === "campagnes" && typeof o.campagne === "string") return [{ type: "campagne", id: o.campagne }];
  const d = o.demande as Record<string, unknown> | undefined;
  if (o.module === "traitement" && d && typeof d.campagne === "string" && d.campagne) return [{ type: "campagne", id: d.campagne }];
  return [];
}

export function lienAvec(meta: FigureMeta | null | undefined, cible: Cible): FigureLiee["lien"] | null {
  if (rattachementsDe(meta).some((c) => memeCible(c, cible))) return "manuel";
  if (ciblesDeOrigine(meta).some((c) => memeCible(c, cible))) return "origine";
  return null;
}

/** Les figures d'une campagne ou d'une étude, les plus récentes d'abord. */
export async function figuresDe(fs: LibraryFs, cible: Cible): Promise<FigureLiee[]> {
  const { figures } = await scanLibrary(fs);
  const liees = figures.flatMap((f) => {
    const lien = lienAvec(f.meta, cible);
    return f.meta && lien ? [{ f: { dossier: f.folder, id: f.id, titre: f.meta.title, vignette: thumbnailFile(f), lien } satisfies FigureLiee, date: Date.parse(f.meta.modified) }] : [];
  });
  return liees.sort((a, b) => b.date - a.date || b.f.id.localeCompare(a.f.id)).map((x) => x.f);
}

async function lireMeta(fs: LibraryFs, dossier: string): Promise<FigureMeta> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  return v.meta;
}

export async function rattacher(fs: LibraryFs, dossier: string, cible: Cible, now: string, host: string): Promise<void> {
  const meta = await lireMeta(fs, dossier);
  const liste = rattachementsDe(meta);
  if (liste.some((c) => memeCible(c, cible))) return;
  await saveMeta(fs, dossier, { ...meta, rattachements: [...liste, cible] }, { now, host });
}

export async function detacher(fs: LibraryFs, dossier: string, cible: Cible, now: string, host: string): Promise<void> {
  const meta = await lireMeta(fs, dossier);
  const liste = rattachementsDe(meta);
  if (!liste.some((c) => memeCible(c, cible))) return;
  await saveMeta(fs, dossier, { ...meta, rattachements: liste.filter((c) => !memeCible(c, cible)) }, { now, host });
}
