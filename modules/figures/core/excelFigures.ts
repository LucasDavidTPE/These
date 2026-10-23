/**
 * Graphiques Excel d'un projet devenus figures (SPEC §6.1). La figure garde son origine
 * (`{ module: "figures", genre: "excel", projet, classeur, graphique, empreinte }`) : le
 * classeur reste la source, « Régénérer » relit ses plages en gardant la mise en forme faite
 * dans Figures. L'empreinte (données et axes traduits) dit si le classeur a changé depuis.
 * Pur : système de fichiers, horloge et rendu PNG passés en paramètres.
 */
import { enregistrerGraphe, origineDe, remplacerGraphe, type Origine, type RenduGraphe } from "./action";
import { graphiquesDuClasseur, type GraphDoc, type GraphiqueExcel } from "./graph";
import { saveMeta, validateMeta, joinPath, type FigureEntry, type LibraryFs } from "./library";
import { cheminProjet, DOSSIERS_PROJET } from "./projets";

export interface OrigineExcel extends Origine {
  module: "figures";
  genre: "excel";
  projet: string;
  /** Nom du fichier dans `excel/` du projet. */
  classeur: string;
  /** « Feuille/Nom de l'objet » (GraphiqueExcel.id). */
  graphique: string;
  empreinte: string;
}

export function origineExcel(meta: FigureEntry["meta"]): OrigineExcel | null {
  const o = origineDe(meta) as Partial<OrigineExcel> | null;
  return o && o.module === "figures" && o.genre === "excel" && typeof o.projet === "string" && typeof o.classeur === "string" && typeof o.graphique === "string" ? (o as OrigineExcel) : null;
}

/** Empreinte des données d'un graphe (séries, catégories, échelles) : FNV-1a 32 bits, en hexadécimal. */
export function empreinte(doc: GraphDoc): string {
  const texte = JSON.stringify([doc.series.map((s) => [s.name, s.x, s.y]), doc.x.categories ?? null, doc.x.log, doc.y.log]);
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const cheminClasseur = (projet: string, classeur: string) => cheminProjet(projet, DOSSIERS_PROJET.excel, classeur);

export async function lireGraphiques(fs: LibraryFs, projet: string, classeur: string): Promise<GraphiqueExcel[]> {
  return graphiquesDuClasseur(await fs.readBytes(cheminClasseur(projet, classeur)));
}

export type EtatGraphique = { etat: "nouveau" } | { etat: "a-jour" | "a-mettre-a-jour"; figure: FigureEntry } | { etat: "illisible" };

/** Où en est chaque graphique du classeur par rapport à la bibliothèque. */
export function etatGraphique(g: GraphiqueExcel, projet: string, classeur: string, figures: readonly FigureEntry[]): EtatGraphique {
  if (!g.graphe) return { etat: "illisible" };
  const f = figures.find((e) => {
    const o = origineExcel(e.meta);
    return o?.projet === projet && o.classeur === classeur && o.graphique === g.id;
  });
  if (!f) return { etat: "nouveau" };
  return { etat: origineExcel(f.meta)!.empreinte === empreinte(g.graphe) ? "a-jour" : "a-mettre-a-jour", figure: f };
}

const titreParDefaut = (g: GraphiqueExcel, classeur: string) => g.titre || `${classeur.replace(/\.xls[xm]$/i, "")} — ${g.nom}`;

/** Ajoute le graphique à la bibliothèque, rangé dans le projet ; renvoie le dossier de la figure. */
export async function importerGraphique(fs: LibraryFs, projet: string, classeur: string, g: GraphiqueExcel, rendu: RenduGraphe, now: string, host: string): Promise<string> {
  if (!g.graphe) throw new Error(`« ${g.nom} » : rien de traduisible dans ce graphique.`);
  const origine: OrigineExcel = { module: "figures", genre: "excel", projet, classeur, graphique: g.id, empreinte: empreinte(g.graphe) };
  const dossier = await enregistrerGraphe(fs, { titre: titreParDefaut(g, classeur), source: `Excel : ${classeur} › ${g.feuille} › ${g.nom}`, origine, graphe: g.graphe }, rendu, now, host);
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (v.ok) await saveMeta(fs, dossier, { ...v.meta, projets: [projet] }, { now, host });
  return dossier;
}

/**
 * Pour « Régénérer » (action figures.regenerer-figure) : le graphe relu dans le classeur, et
 * l'origine à jour (nouvelle empreinte) à réécrire dans la fiche après remplacement.
 */
export async function relireGraphique(fs: LibraryFs, o: OrigineExcel): Promise<{ graphe: GraphDoc; origine: OrigineExcel }> {
  let liste: GraphiqueExcel[];
  try {
    liste = await lireGraphiques(fs, o.projet, o.classeur);
  } catch (e) {
    throw new Error(`Classeur « ${o.classeur} » introuvable ou illisible dans le projet (${e instanceof Error ? e.message : String(e)}).`, { cause: e });
  }
  const g = liste.find((x) => x.id === o.graphique);
  if (!g) throw new Error(`Le graphique « ${o.graphique} » n'est plus dans « ${o.classeur} » (renommé ou supprimé ?).`);
  if (!g.graphe) throw new Error(`« ${g.nom} » : rien de traduisible dans ce graphique.`);
  return { graphe: g.graphe, origine: { ...o, empreinte: empreinte(g.graphe) } };
}

/** Écrit la nouvelle empreinte dans la fiche (après la régénération). */
export async function noterEmpreinte(fs: LibraryFs, dossier: string, origine: OrigineExcel, now: string, host: string): Promise<void> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  await saveMeta(fs, dossier, { ...v.meta, origine }, { now, host });
}

/** « Régénérer » : relit le classeur, remplace les données (mise en forme de Figures gardée), note l'empreinte. */
export async function regenererGraphique(fs: LibraryFs, dossier: string, o: OrigineExcel, rendu: RenduGraphe, now: string, host: string): Promise<void> {
  const r = await relireGraphique(fs, o);
  await remplacerGraphe(fs, dossier, r.graphe, rendu, now, host);
  await noterEmpreinte(fs, dossier, r.origine, now, host);
}
