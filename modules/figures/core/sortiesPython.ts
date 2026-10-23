/**
 * Sorties des scripts Python d'un projet (SPEC §6.1) : `sorties/<script>/` contient des graphes
 * (`<nom>.graphe.json`, écrits par these_figures.py) et des images (plt.savefig). Chaque sortie
 * devient une figure qui garde son origine (`{ module: "figures", genre: "script", projet,
 * script, sortie, empreinte }`) : après une nouvelle exécution, elle est « à mettre à jour ».
 * Pur : système de fichiers, horloge et rendus passés en paramètres.
 */
import { empreinte } from "./excelFigures";
import { enregistrerGraphe, enregistrerImage, origineDe, remplacerGraphe, remplacerImage, type Origine, type RenduGraphe } from "./action";
import { validateGraph, type GraphDoc } from "./graph";
import { joinPath, saveMeta, validateMeta, type FigureEntry, type FigureMeta, type LibraryFs } from "./library";
import { cheminProjet, DOSSIERS_PROJET } from "./projets";

export const FORMAT_SORTIE = "these-figures-sortie/1";
/** Version de these_figures.py apportée par l'application (en-tête `__version__`). */
export const VERSION_BIBLIOTHEQUE = "1";

export type GenreSortie = "graphe" | "image" | "svg" | "pdf";

export interface Sortie {
  /** Nom du fichier dans `sorties/<script>/`. */
  fichier: string;
  genre: GenreSortie;
}

export interface OrigineScript extends Origine {
  module: "figures";
  genre: "script";
  projet: string;
  /** Nom du script (« trace.py »). */
  script: string;
  sortie: string;
  empreinte: string;
}

export function origineScript(meta: FigureEntry["meta"]): OrigineScript | null {
  const o = origineDe(meta) as Partial<OrigineScript> | null;
  return o && o.module === "figures" && o.genre === "script" && typeof o.projet === "string" && typeof o.script === "string" && typeof o.sortie === "string" ? (o as OrigineScript) : null;
}

/** « trace.py » → « trace » (dossier de ses sorties). */
export const nomSansExtension = (script: string) => script.replace(/\.py$/i, "");
export const cheminSorties = (projet: string, script: string, ...parts: string[]) => cheminProjet(projet, DOSSIERS_PROJET.sorties, nomSansExtension(script), ...parts);

export function genreDe(fichier: string): GenreSortie | null {
  if (/\.graphe\.json$/i.test(fichier)) return "graphe";
  if (/\.(png|jpe?g)$/i.test(fichier)) return "image";
  if (/\.svg$/i.test(fichier)) return "svg";
  if (/\.pdf$/i.test(fichier)) return "pdf";
  return null;
}

export async function listerSorties(fs: LibraryFs, projet: string, script: string): Promise<Sortie[]> {
  const entrees = await fs.listDir(cheminSorties(projet, script)).catch(() => []);
  return entrees
    .filter((e) => e.kind === "file" && !e.name.endsWith(".tmp"))
    .flatMap((e) => {
      const genre = genreDe(e.name);
      return genre ? [{ fichier: e.name, genre }] : [];
    })
    .sort((a, b) => a.fichier.localeCompare(b.fichier, "fr", { sensitivity: "base" }));
}

/** Contenu d'un `<nom>.graphe.json` : titre et graphe validé. */
export function lireSortieGraphe(texte: string, fichier = ""): { titre: string; graphe: GraphDoc } {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (e) {
    throw new Error(`${fichier} : JSON illisible (${e instanceof Error ? e.message : String(e)}).`, { cause: e });
  }
  const r = brut as { format?: unknown; titre?: unknown; graphe?: unknown };
  if (r?.format !== FORMAT_SORTIE) throw new Error(`${fichier} : format « ${String(r?.format)} » inconnu (attendu ${FORMAT_SORTIE}).`);
  const v = validateGraph(r.graphe);
  if (!v.ok) throw new Error(`${fichier} : graphe invalide — ${v.errors.map((e) => `${e.path} : ${e.message}`).join(" ; ")}`);
  return { titre: typeof r.titre === "string" && r.titre.trim() ? r.titre : fichier.replace(/\.graphe\.json$/i, ""), graphe: v.doc };
}

/** Empreinte d'un contenu binaire (images) : FNV-1a 32 bits. */
export function empreinteOctets(o: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < o.length; i++) {
    h ^= o[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Empreinte d'une sortie telle qu'elle est sur le disque. */
export async function empreinteSortie(fs: LibraryFs, projet: string, script: string, s: Sortie): Promise<string> {
  const chemin = cheminSorties(projet, script, s.fichier);
  return s.genre === "graphe" ? empreinte(lireSortieGraphe(await fs.readText(chemin), s.fichier).graphe) : empreinteOctets(await fs.readBytes(chemin));
}

export type EtatSortie = { etat: "nouveau" } | { etat: "a-jour" | "a-mettre-a-jour"; figure: FigureEntry };

export function etatSortie(s: Sortie, empreinteActuelle: string, projet: string, script: string, figures: readonly FigureEntry[]): EtatSortie {
  const f = figures.find((e) => {
    const o = origineScript(e.meta);
    return o?.projet === projet && o.script === script && o.sortie === s.fichier;
  });
  if (!f) return { etat: "nouveau" };
  return { etat: origineScript(f.meta)!.empreinte === empreinteActuelle ? "a-jour" : "a-mettre-a-jour", figure: f };
}

/** Rendus que seule l'interface sait faire (navigateur) : PNG d'un graphe, d'un SVG, d'un PDF, d'une image quelconque. */
export interface RendusSortie {
  graphe: RenduGraphe;
  svg(svg: string): Promise<Uint8Array>;
  pdf(octets: Uint8Array): Promise<Uint8Array>;
  /** JPEG → PNG (les PNG passent tels quels). */
  image(octets: Uint8Array, fichier: string): Promise<Uint8Array>;
}

async function rangerDansProjet(fs: LibraryFs, dossier: string, projet: string, now: string, host: string): Promise<void> {
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (v.ok) await saveMeta(fs, dossier, { ...v.meta, projets: [projet] }, { now, host });
}

/** PNG (et SVG) d'une sortie image. */
async function imageDe(fs: LibraryFs, chemin: string, s: Sortie, r: RendusSortie): Promise<{ png: Uint8Array; svg?: string; octets: Uint8Array }> {
  const octets = await fs.readBytes(chemin);
  if (s.genre === "svg") {
    const svg = new TextDecoder().decode(octets);
    return { png: await r.svg(svg), svg, octets };
  }
  if (s.genre === "pdf") return { png: await r.pdf(octets), octets };
  return { png: await r.image(octets, s.fichier), octets };
}

/** Ajoute la sortie à la bibliothèque, rangée dans le projet ; renvoie le dossier de la figure. */
export async function importerSortie(fs: LibraryFs, projet: string, script: string, s: Sortie, r: RendusSortie, now: string, host: string): Promise<string> {
  const chemin = cheminSorties(projet, script, s.fichier);
  const source = `Script Python : ${script} › ${s.fichier}`;
  let dossier: string;
  if (s.genre === "graphe") {
    const { titre, graphe } = lireSortieGraphe(await fs.readText(chemin), s.fichier);
    const origine: OrigineScript = { module: "figures", genre: "script", projet, script, sortie: s.fichier, empreinte: empreinte(graphe) };
    dossier = await enregistrerGraphe(fs, { titre, source, origine, graphe }, r.graphe, now, host);
  } else {
    const img = await imageDe(fs, chemin, s, r);
    const origine: OrigineScript = { module: "figures", genre: "script", projet, script, sortie: s.fichier, empreinte: empreinteOctets(img.octets) };
    dossier = await enregistrerImage(fs, { titre: s.fichier.replace(/\.[^.]+$/, ""), png: img.png, ...(img.svg !== undefined ? { svg: img.svg } : {}), source, origine }, now, host);
  }
  await rangerDansProjet(fs, dossier, projet, now, host);
  return dossier;
}

/** Après une nouvelle exécution : données (ou image) remplacées, mise en forme de Figures gardée, empreinte notée. */
export async function regenererSortie(fs: LibraryFs, dossier: string, o: OrigineScript, r: RendusSortie, now: string, host: string): Promise<void> {
  const s: Sortie = { fichier: o.sortie, genre: genreDe(o.sortie) ?? "image" };
  const chemin = cheminSorties(o.projet, o.script, o.sortie);
  let neuve: string;
  try {
    if (s.genre === "graphe") {
      const { graphe } = lireSortieGraphe(await fs.readText(chemin), s.fichier);
      await remplacerGraphe(fs, dossier, graphe, r.graphe, now, host);
      neuve = empreinte(graphe);
    } else {
      const img = await imageDe(fs, chemin, s, r);
      await remplacerImage(fs, dossier, { png: img.png, ...(img.svg !== undefined ? { svg: img.svg } : {}) }, now, host);
      neuve = empreinteOctets(img.octets);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "not-found") throw new Error(`« ${o.sortie} » n'est plus dans les sorties de ${o.script} : relancez le script.`, { cause: e });
    throw e;
  }
  const v = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  if (!v.ok) throw new Error(`meta.json invalide dans ${dossier}.`);
  const meta: FigureMeta = { ...v.meta, origine: { ...o, empreinte: neuve } };
  await saveMeta(fs, dossier, meta, { now, host });
}

/** Version écrite dans l'en-tête d'un these_figures.py (`__version__ = "1"`), null si absente. */
export function versionBibliotheque(texte: string): string | null {
  return /^__version__\s*=\s*["']([^"']+)["']/m.exec(texte)?.[1] ?? null;
}

/**
 * Met (ou remet) these_figures.py dans `scripts/` quand il manque ou qu'il est plus ancien que
 * celui de l'application ; renvoie vrai s'il a été écrit.
 */
export async function installerBibliotheque(fs: LibraryFs, projet: string, contenu: string): Promise<boolean> {
  const chemin = cheminProjet(projet, DOSSIERS_PROJET.scripts, "these_figures.py");
  const voulue = Number(versionBibliotheque(contenu) ?? 0);
  const actuel = await fs.readText(chemin).catch(() => null);
  if (actuel !== null && Number(versionBibliotheque(actuel) ?? 0) >= voulue) return false;
  await fs.createDir(cheminProjet(projet, DOSSIERS_PROJET.scripts)).catch(() => undefined);
  await fs.writeTextAtomic(chemin, contenu);
  return true;
}

/** Script de départ (« Nouveau script ») : un graphe these_figures et la même figure en matplotlib. */
export function modeleScript(nom: string): string {
  return `"""${nom} — tracé du projet (Figures → projet → Scripts Python → Exécuter).

Les graphes enregistrés avec these_figures deviennent des graphes modifiables dans Figures ;
les images enregistrées dans tf.sortie(...) sont ajoutées telles quelles.
"""
import these_figures as tf

# Données : à remplacer (lecture d'un CSV, d'un Excel du projet : "../excel/…", calculs…)
x = [0.1, 1, 3, 10, 30]
y = [8200, 11000, 12500, 14000, 15200]

g = tf.Graphe(x="Fréquence (Hz)", y="|E*| (MPa)", log_x=True, log_y=True)
g.serie("15 °C", x, y, type="linepoints")
g.enregistrer("${nom.replace(/[^\w-]+/g, "_")}", titre="Module complexe à 15 °C")

# Variante matplotlib (si installé) : la figure est reprise telle quelle.
# import matplotlib.pyplot as plt
# fig, ax = plt.subplots()
# ax.loglog(x, y, "o-", label="15 °C")
# ax.set_xlabel("Fréquence (Hz)"); ax.set_ylabel("|E*| (MPa)"); ax.legend()
# tf.depuis_matplotlib(fig, "module_mpl")
# fig.savefig(tf.sortie("module_mpl.png"), dpi=300)
`;
}
