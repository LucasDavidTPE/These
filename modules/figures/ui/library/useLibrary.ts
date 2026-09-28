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
import { regenerer, type Rendu } from "../../core/action";
import { exportGraphSvg } from "../../core/graph";
import { svgToPng } from "../editor/raster";
import { parseSettings, serializeSettings } from "../../core/settings";
import { getBackend, type Backend } from "../platform/backend";

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
          set({ index: await scanLibrary(backend.fs(root)), error: null });
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
        await regenerer(backend.fs(root), folder, rendu, (doc) => svgToPng(exportGraphSvg(doc), doc.width, doc.height, 300), nowIso(), get().host);
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
