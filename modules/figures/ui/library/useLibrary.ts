/**
 * État de la page Bibliothèque. Les décisions (scan, filtres, verrous, conflits) sont
 * prises par src/core/library ; ce store ne fait qu'orchestrer et mémoriser.
 */
import { create } from "zustand";
import {
  EMPTY_FILTER,
  LockedError,
  applyFileOps,
  nextFigureId,
  planConflictResolution,
  planRenumber,
  saveMeta,
  scanLibrary,
  toIsoWithOffset,
  type ConflictCopy,
  type FigureEntry,
  type FigureMeta,
  type LibraryFilter,
  type LibraryIndex,
  type LibrarySort,
} from "../../core/library";
import { dimensionsSvg, enregistrerSvg, regenerer, type Rendu } from "../../core/action";
import { exportGraphSvg, type GraphDoc } from "../../core/graph";
import { svgToPng } from "../editor/raster";
import { parseSettings, serializeSettings } from "../../core/settings";
import { captureDe, choisirRendu, enregistrerAspectExcel, etatGraphique, importerGraphique, lireGraphiques, regenererGraphique, type OrigineExcel, type Rendu as RenduFigure } from "../../core/excelFigures";
import { pdfEnPng } from "./pdfEnPng";
import type { GraphiqueExcel } from "../../core/graph";
import { ajouterAuProjet, creerProjet, listerProjets, modifierProjet, retirerDuProjet, supprimerProjet, type ListeProjets, type Projet } from "../../core/projets";
import { getBackend, type Backend } from "../platform/backend";

/** PNG d'un graphe à 300 dpi (vignette, collage). */
const rendreGraphe = (doc: GraphDoc) => svgToPng(exportGraphSvg(doc), doc.width, doc.height, 300);

export function nowIso(): string {
  const d = new Date();
  return toIsoWithOffset(d, -d.getTimezoneOffset());
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Editing = { folder: string; status: "editing" } | { folder: string; status: "locked"; message: string };

interface LibraryState {
  backend: Backend | null;
  host: string;
  ready: boolean;
  root: string | null;
  index: LibraryIndex | null;
  /** Projets de la bibliothèque (`_projets/`), relus avec l'index. */
  projets: ListeProjets;
  scanning: boolean;
  error: string | null;
  filter: LibraryFilter;
  sort: LibrarySort;
  selected: string | null;
  editing: Editing | null;
  init(): Promise<void>;
  setRoot(root: string, create: boolean): Promise<void>;
  rescan(): Promise<void>;
  setFilter(patch: Partial<LibraryFilter>): void;
  setSort(sort: LibrarySort): void;
  select(folder: string | null): Promise<void>;
  startEdit(force?: boolean): Promise<void>;
  stopEdit(): Promise<void>;
  save(meta: FigureMeta): Promise<void>;
  resolveConflict(folder: string, conflict: ConflictCopy, keep: "original" | "copy"): Promise<void>;
  renumber(entry: FigureEntry): Promise<void>;
  cleanTemp(folder: string, file: string): Promise<void>;
  /** Remplace l'image d'une figure refaite par le module d'origine. */
  regenerate(folder: string, rendu: Rendu): Promise<void>;
  /** Importe des fichiers .svg comme figures ; renvoie les dossiers créés. */
  importSvg(fichiers: { nom: string; texte: string }[]): Promise<void>;
  creerProjet(titre: string, description?: string): Promise<Projet | null>;
  modifierProjet(slug: string, patch: { titre?: string; description?: string }): Promise<void>;
  supprimerProjet(slug: string): Promise<void>;
  /** Range des figures dans un projet (glisser-déposer, fiche). */
  ajouterAuProjet(dossiers: string[], slug: string): Promise<void>;
  retirerDuProjet(dossier: string, slug: string): Promise<void>;
  /** Graphiques Excel d'un projet → figures liées (PJ2). */
  importerGraphiques(projet: string, classeur: string, graphiques: GraphiqueExcel[]): Promise<void>;
  regenererExcel(dossier: string, origine: OrigineExcel): Promise<void>;
  /** Aspect Excel (PJ3) des graphiques du classeur déjà dans Figures ; renvoie le nombre de figures mises à jour. */
  capturerAspectExcel(projet: string, classeur: string, cheminAbsolu: string): Promise<number>;
  choisirRendu(dossier: string, rendu: RenduFigure): Promise<void>;
  readText(path: string): Promise<string>;
  imageUrl(path: string): string;
}

export const useLibrary = create<LibraryState>()((set, get) => {
  const need = () => {
    const { backend, root } = get();
    if (!backend || !root) throw new Error("Bibliothèque non ouverte.");
    return { backend, root };
  };
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      set({ error: message(e) });
    }
  };

  return {
    backend: null,
    host: "",
    ready: false,
    root: null,
    index: null,
    projets: { projets: [], problemes: [] },
    scanning: false,
    error: null,
    filter: EMPTY_FILTER,
    sort: "modified",
    selected: null,
    editing: null,

    init: async () => {
      if (get().backend) return;
      const backend = await getBackend();
      const [host, text] = await Promise.all([backend.hostName(), backend.readSettings()]);
      const settings = parseSettings(text);
      set({ backend, host });
      if (settings.libraryRoot) {
        await guard(async () => {
          await backend.openRoot(settings.libraryRoot!, false);
          set({ root: settings.libraryRoot });
          await get().rescan();
        });
      }
      set({ ready: true });
    },

    setRoot: async (root, create) =>
      guard(async () => {
        const { backend } = get();
        if (!backend) return;
        await backend.openRoot(root, create);
        await backend.writeSettings(serializeSettings({ version: 1, libraryRoot: root }));
        set({ root, selected: null, editing: null, error: null });
        await get().rescan();
      }),

    rescan: async () =>
      guard(async () => {
        const { backend, root } = need();
        set({ scanning: true });
        try {
          const fs = backend.fs(root);
          const [index, projets] = await Promise.all([scanLibrary(fs), listerProjets(fs)]);
          const filtre = get().filter.projet;
          // projet supprimé (ou retiré par l'autre poste) : retour à toutes les figures
          const garde = filtre === null || filtre === "" || projets.projets.some((p) => p.slug === filtre);
          set({ index, projets, error: null, ...(garde ? {} : { filter: { ...get().filter, projet: null } }) });
        } finally {
          set({ scanning: false });
        }
      }),

    setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
    setSort: (sort) => set({ sort }),

    select: async (folder) => {
      if (get().editing?.status === "editing") await get().stopEdit();
      set({ selected: folder, editing: null });
    },

    startEdit: async (force = false) =>
      guard(async () => {
        const { backend, root } = need();
        const folder = get().selected;
        if (!folder) return;
        try {
          await backend.locks(root).acquire(folder, force);
          set({ editing: { folder, status: "editing" } });
        } catch (e) {
          if (e instanceof LockedError) set({ editing: { folder, status: "locked", message: e.message } });
          else throw e;
        }
        await get().rescan();
      }),

    stopEdit: async () =>
      guard(async () => {
        const { backend, root } = need();
        const editing = get().editing;
        set({ editing: null });
        if (editing?.status === "editing") {
          await backend.locks(root).release(editing.folder).catch(() => false);
          await get().rescan();
        }
      }),

    save: async (meta) =>
      guard(async () => {
        const { backend, root } = need();
        const editing = get().editing;
        if (editing?.status !== "editing") throw new Error("La figure n'est pas ouverte en modification.");
        await saveMeta(backend.fs(root), editing.folder, meta, { now: nowIso(), host: get().host });
        await get().stopEdit();
      }),

    resolveConflict: async (folder, conflict, keep) =>
      guard(async () => {
        const { backend, root } = need();
        const fs = backend.fs(root);
        const archiveExists = (await fs.listDir(folder)).some((e) => e.name === ".conflits" && e.kind === "dir");
        const stamp = nowIso().slice(0, 19);
        await applyFileOps(fs, planConflictResolution(folder, conflict, keep, stamp, archiveExists));
        await get().rescan();
      }),

    renumber: async (entry) =>
      guard(async () => {
        const { backend, root } = need();
        if (!entry.meta) throw new Error("meta.json illisible : renumérotation impossible.");
        const index = get().index;
        const newId = index ? index.nextId : nextFigureId([entry.id]);
        await applyFileOps(backend.fs(root), planRenumber(entry.folder, entry.meta, newId, nowIso(), get().host));
        if (get().selected === entry.folder) set({ selected: null });
        await get().rescan();
      }),

    cleanTemp: async (folder, file) =>
      guard(async () => {
        const { backend, root } = need();
        await backend.removeTemp(root, `${folder}/${file}`);
        await get().rescan();
      }),

    regenerate: async (folder, rendu) =>
      guard(async () => {
        const { backend, root } = need();
        await regenerer(backend.fs(root), folder, rendu, rendreGraphe, nowIso(), get().host);
        await get().rescan();
      }),

    importSvg: async (fichiers) =>
      guard(async () => {
        const { backend, root } = need();
        const fs = backend.fs(root);
        let dernier: string | null = null;
        for (const f of fichiers) {
          const d = dimensionsSvg(f.texte) ?? { largeurMm: 100, hauteurMm: 100 };
          // vignette et collage : PNG à 300 dpi, taille plafonnée (un SVG géant ne doit pas saturer la mémoire)
          const k = Math.min(1, 400 / Math.max(d.largeurMm, d.hauteurMm));
          const png = await svgToPng(f.texte, d.largeurMm * k, d.hauteurMm * k, 300);
          dernier = await enregistrerSvg(fs, { titre: f.nom.replace(/\.svg$/i, ""), svg: f.texte, png, source: `Import SVG (${f.nom})` }, nowIso(), get().host);
        }
        await get().rescan();
        if (dernier) await get().select(dernier);
      }),

    creerProjet: async (titre, description) => {
      let cree: Projet | null = null;
      await guard(async () => {
        const { backend, root } = need();
        cree = await creerProjet(backend.fs(root), { titre, ...(description ? { description } : {}) }, nowIso());
        set({ filter: { ...get().filter, projet: cree.slug } });
        await get().rescan();
      });
      return cree;
    },

    modifierProjet: async (slug, patch) =>
      guard(async () => {
        const { backend, root } = need();
        await modifierProjet(backend.fs(root), slug, patch, nowIso());
        await get().rescan();
      }),

    supprimerProjet: async (slug) =>
      guard(async () => {
        const { backend, root } = need();
        await supprimerProjet(backend.fs(root), slug, nowIso());
        set({ filter: { ...get().filter, projet: null } });
        await get().rescan();
      }),

    ajouterAuProjet: async (dossiers, slug) =>
      guard(async () => {
        const { backend, root } = need();
        const fs = backend.fs(root);
        for (const d of dossiers) await ajouterAuProjet(fs, d, slug, nowIso(), get().host);
        await get().rescan();
      }),

    retirerDuProjet: async (dossier, slug) =>
      guard(async () => {
        const { backend, root } = need();
        await retirerDuProjet(backend.fs(root), dossier, slug, nowIso(), get().host);
        await get().rescan();
      }),

    importerGraphiques: async (projet, classeur, graphiques) =>
      guard(async () => {
        const { backend, root } = need();
        const fs = backend.fs(root);
        for (const g of graphiques) await importerGraphique(fs, projet, classeur, g, rendreGraphe, nowIso(), get().host);
        await get().rescan();
      }),

    regenererExcel: async (dossier, origine) => {
      const { backend, root } = need();
      await regenererGraphique(backend.fs(root), dossier, origine, rendreGraphe, nowIso(), get().host);
      await get().rescan();
    },

    capturerAspectExcel: async (projet, classeur, cheminAbsolu) => {
      const { backend, root } = need();
      const fs = backend.fs(root);
      const [graphiques, captures] = await Promise.all([lireGraphiques(fs, projet, classeur), backend.capturerExcel(cheminAbsolu)]);
      const figures = get().index?.figures ?? [];
      let n = 0;
      for (const g of graphiques) {
        const e = etatGraphique(g, projet, classeur, figures);
        const c = captureDe(g, captures);
        if (!("figure" in e) || !c) continue;
        // PDF vectoriel d'Excel rendu à 300 dpi ; sinon l'image exportée (résolution d'écran)
        const png = c.pdf ? await pdfEnPng(c.pdf).catch(() => c.png) : c.png;
        await enregistrerAspectExcel(fs, e.figure.folder, png, c.pdf, nowIso(), get().host);
        n++;
      }
      await get().rescan();
      return n;
    },

    choisirRendu: async (dossier, rendu) =>
      guard(async () => {
        const { backend, root } = need();
        await choisirRendu(backend.fs(root), dossier, rendu, nowIso(), get().host);
        await get().rescan();
      }),

    readText: async (path) => {
      const { backend, root } = need();
      return backend.fs(root).readText(path);
    },

    imageUrl: (path) => {
      const { backend, root } = need();
      return backend.imageUrl(root, path);
    },
  };
});
