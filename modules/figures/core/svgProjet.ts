/**
 * Dessins SVG d'un projet (SPEC §6.1) : `svg/*.svg` (dessins de votre logiciel vectoriel, schémas exportés…). Chaque fichier
 * devient une figure « image » dont export.svg est le dessin, liée au fichier
 * (`{ module: "figures", genre: "svg", projet, fichier, empreinte }`) : quand on le retouche
 * dans le logiciel de dessin, la figure est « à mettre à jour ». Pur : le rendu PNG est passé en paramètre.
 */
import { enregistrerSvg, origineDe, remplacerImage, type Origine } from "./action";
import { joinPath, saveMeta, validateMeta, type FigureEntry, type FigureMeta, type LibraryFs } from "./library";
import { cheminProjet, DOSSIERS_PROJET } from "./projets";
import { empreinteOctets } from "./sortiesPython";

export interface OrigineSvg extends Origine {
  module: "figures";
  genre: "svg";
  projet: string;
  /** Nom du fichier dans `svg/`. */
  fichier: string;
  empreinte: string;
}

/** Vignette et collage : PNG d'un SVG (fourni par l'interface). */
export type RenduSvg = (svg: string) => Promise<Uint8Array>;

export function origineSvg(meta: FigureEntry["meta"]): OrigineSvg | null {
  const o = origineDe(meta) as Partial<OrigineSvg> | null;
  return o && o.module === "figures" && o.genre === "svg" && typeof o.projet === "string" && typeof o.fichier === "string" ? (o as OrigineSvg) : null;
}

export const cheminSvg = (projet: string, fichier: string) => cheminProjet(projet, DOSSIERS_PROJET.svg, fichier);
export const empreinteSvg = (texte: string) => empreinteOctets(new TextEncoder().encode(texte));

export type EtatSvg = { etat: "nouveau" } | { etat: "a-jour" | "a-mettre-a-jour"; figure: FigureEntry };

export function etatSvg(projet: string, fichier: string, texte: string, figures: readonly FigureEntry[]): EtatSvg {
  const f = figures.find((e) => {
    const o = origineSvg(e.meta);
    return o?.projet === projet && o.fichier === fichier;
  });
  if (!f) return { etat: "nouveau" };
  return { etat: origineSvg(f.meta)!.empreinte === empreinteSvg(texte) ? "a-jour" : "a-mettre-a-jour", figure: f };
}

/** Copie un SVG dans `svg/` sous un nom libre (« schéma (2).svg » si pris) ; renvoie le nom retenu. */
export async function deposerSvg(fs: LibraryFs, projet: string, nomVoulu: string, texte: string): Promise<string> {
  if (!/<svg\b/i.test(texte)) throw new Error(`« ${nomVoulu} » n'est pas un SVG.`);
  const dossier = cheminProjet(projet, DOSSIERS_PROJET.svg);
  await fs.createDir(dossier).catch(() => undefined);
  const existants = new Set((await fs.listDir(dossier)).map((e) => e.name.toLowerCase()));
  const base = nomVoulu.replace(/\.svg$/i, "").replace(/[\\/:*?"<>|]+/g, "_") || "dessin";
  let nom = `${base}.svg`;
  for (let n = 2; existants.has(nom.toLowerCase()); n++) nom = `${base} (${n}).svg`;
  await fs.writeTextAtomic(joinPath(dossier, nom), texte);
  return nom;
}

/** Ajoute le dessin à la bibliothèque, rangé dans le projet et lié au fichier ; renvoie le dossier de la figure. */
export async function importerSvgProjet(fs: LibraryFs, projet: string, fichier: string, rendu: RenduSvg, now: string, host: string): Promise<string> {
  const svg = await fs.readText(cheminSvg(projet, fichier));
  const dossier = await enregistrerSvg(fs, { titre: fichier.replace(/\.svg$/i, ""), svg, png: await rendu(svg), source: `SVG du projet : ${fichier}` }, now, host);
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  const origine: OrigineSvg = { module: "figures", genre: "svg", projet, fichier, empreinte: empreinteSvg(svg) };
  await saveMeta(fs, dossier, { ...v.meta, origine, projets: [projet] }, { now, host });
  return dossier;
}

/** Après une retouche du fichier : export.svg et la vignette remplacés, fiche gardée, empreinte notée. */
export async function regenererSvgProjet(fs: LibraryFs, dossier: string, o: OrigineSvg, rendu: RenduSvg, now: string, host: string): Promise<void> {
  let svg: string;
  try {
    svg = await fs.readText(cheminSvg(o.projet, o.fichier));
  } catch (e) {
    throw new Error(`« ${o.fichier} » n'est plus dans le dossier svg/ du projet (renommé ou supprimé ?).`, { cause: e });
  }
  await remplacerImage(fs, dossier, { png: await rendu(svg), svg }, now, host);
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  const meta: FigureMeta = { ...v.meta, origine: { ...o, empreinte: empreinteSvg(svg) } };
  await saveMeta(fs, dossier, meta, { now, host });
}
