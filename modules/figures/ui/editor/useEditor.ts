/**
 * État de l'éditeur de schémas. Toute la logique (opérations, historique, géométrie,
 * exports) vient de src/core ; ce store garde l'état et relie l'interface à la bibliothèque.
 */
import { create } from "zustand";
import {
  addItem,
  alignItems,
  commit,
  copyItems,
  createHistory,
  deleteItems,
  distributeItems,
  emptyFigure,
  moveItems,
  pasteItems,
  redo,
  reorderItems,
  undo,
  type Align,
  type History,
  type ItemClipboard,
  type Reorder,
} from "../../core/editor";
import { LockedError, createFigure, joinPath, saveMeta, validateMeta, type FigureMeta } from "../../core/library";
import { THEMES, exportSvg, exportTikz, generateSty, validateFigure, type FigureDoc, type Pt } from "../../core/schema";
import { nowIso, useLibrary } from "../library/useLibrary";
import { getBackend } from "../platform/backend";
import { svgToPng } from "./raster";

type Message = { kind: "error" | "info"; text: string } | null;

interface EditorState {
  history: History<FigureDoc>;
  /** Document provisoire pendant un glisser (non enregistré dans l'historique). */
  preview: FigureDoc | null;
  selection: string[];
  title: string;
  folder: string | null;
  meta: FigureMeta | null;
  readOnly: boolean;
  dirty: boolean;
  showGrid: boolean;
  snap: boolean;
  /** Pixels par mm. */
  zoom: number;
  /** Coin haut gauche de la vue, en mm. */
  pan: Pt;
  clipboard: ItemClipboard | null;
  message: Message;
  busy: boolean;

  doc(): FigureDoc;
  /** Applique une opération ; refuse (avec message) un document invalide. */
  apply(fn: (doc: FigureDoc) => FigureDoc, selection?: string[]): boolean;
  setPreview(doc: FigureDoc | null): void;
  commitPreview(): void;
  select(ids: string[]): void;
  add(type: string, at: Pt): void;
  deleteSelection(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  nudge(d: Pt): void;
  align(how: Align): void;
  distribute(axis: "h" | "v"): void;
  reorder(how: Reorder): void;
  undo(): void;
  redo(): void;
  setView(zoom: number, pan: Pt): void;
  toggle(key: "showGrid" | "snap"): void;
  setTitle(title: string): void;
  newFigure(): Promise<void>;
  openFromLibrary(folder: string): Promise<void>;
  saveToLibrary(): Promise<void>;
  copyTikz(): Promise<void>;
  copySvg(): Promise<void>;
  copyPng(dpi: number): Promise<void>;
  exportAs(kind: "png300" | "png600" | "png600white" | "svg" | "tex" | "texStandalone" | "sty"): Promise<void>;
  say(message: Message): void;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function serializeFigure(doc: FigureDoc): string {
  return JSON.stringify(doc, null, 2) + "\n";
}

export const useEditor = create<EditorState>()((set, get) => {
  const run = async (fn: () => Promise<void>) => {
    set({ busy: true, message: null });
    try {
      await fn();
    } catch (e) {
      set({ message: { kind: "error", text: errText(e) } });
    } finally {
      set({ busy: false });
    }
  };

  const releaseLock = async () => {
    const { folder, readOnly } = get();
    const { backend, root } = useLibrary.getState();
    if (folder && !readOnly && backend && root) await backend.locks(root).release(folder).catch(() => false);
  };

  return {
    history: createHistory(emptyFigure()),
    preview: null,
    selection: [],
    title: "",
    folder: null,
    meta: null,
    readOnly: false,
    dirty: false,
    showGrid: true,
    snap: true,
    zoom: 5,
    pan: [-5, -5],
    clipboard: null,
    message: null,
    busy: false,

    doc: () => get().preview ?? get().history.present,

    apply: (fn, selection) => {
      let next: FigureDoc;
      try {
        next = fn(get().history.present);
      } catch (e) {
        set({ message: { kind: "error", text: errText(e) } });
        return false;
      }
      const v = validateFigure(next);
      if (!v.ok) {
        set({ message: { kind: "error", text: v.errors.map((e) => `${e.path} : ${e.message}`).join("\n") } });
        return false;
      }
      const ids = new Set(v.doc.items.map((i) => i.id));
      set({
        history: commit(get().history, v.doc),
        preview: null,
        dirty: true,
        message: null,
        selection: (selection ?? get().selection).filter((id) => ids.has(id)),
      });
      return true;
    },

    setPreview: (doc) => set({ preview: doc }),
    commitPreview: () => {
      const p = get().preview;
      if (p) get().apply(() => p);
      else set({ preview: null });
    },

    select: (ids) => set({ selection: ids }),

    add: (type, at) => {
      let id = "";
      get().apply((d) => {
        const r = addItem(d, type, at);
        id = r.id;
        return r.doc;
      });
      if (id) set({ selection: [id] });
    },

    deleteSelection: () => get().apply((d) => deleteItems(d, get().selection), []),
    copy: () => set({ clipboard: copyItems(get().doc(), get().selection) }),
    cut: () => {
      get().copy();
      get().deleteSelection();
    },
    paste: () => {
      const clip = get().clipboard;
      if (!clip) return;
      let ids: string[] = [];
      const g = get().doc().canvas.grid || 1;
      get().apply((d) => {
        const r = pasteItems(d, clip, [5 * g, 5 * g]);
        ids = r.ids;
        return r.doc;
      });
      set({ selection: ids, clipboard: { ...clip, items: clip.items.map((it) => ({ ...it })) } });
    },
    duplicate: () => {
      get().copy();
      get().paste();
    },
    nudge: (d) => get().apply((doc) => moveItems(doc, get().selection, d)),
    align: (how) => get().apply((d) => alignItems(d, get().selection, how)),
    distribute: (axis) => get().apply((d) => distributeItems(d, get().selection, axis)),
    reorder: (how) => get().apply((d) => reorderItems(d, get().selection, how)),
    undo: () => set({ history: undo(get().history), preview: null, dirty: true }),
    redo: () => set({ history: redo(get().history), preview: null, dirty: true }),
    setView: (zoom, pan) => set({ zoom: Math.min(60, Math.max(0.5, zoom)), pan }),
    toggle: (key) => set({ [key]: !get()[key] } as Partial<EditorState>),
    setTitle: (title) => set({ title, dirty: true }),
    say: (message) => set({ message }),

    newFigure: async () => {
      await releaseLock();
      set({ history: createHistory(emptyFigure()), preview: null, selection: [], title: "", folder: null, meta: null, readOnly: false, dirty: false, message: null });
    },

    openFromLibrary: (folder) =>
      run(async () => {
        const { backend, root } = useLibrary.getState();
        if (!backend || !root) throw new Error("Bibliothèque non ouverte.");
        const fs = backend.fs(root);
        const v = validateFigure(JSON.parse(await fs.readText(joinPath(folder, "figure.json"))));
        if (!v.ok) throw new Error(`figure.json invalide :\n${v.errors.map((e) => `${e.path} : ${e.message}`).join("\n")}`);
        const m = validateMeta(JSON.parse(await fs.readText(joinPath(folder, "meta.json"))));
        await releaseLock();
        let readOnly = false;
        let message: Message = null;
        try {
          await backend.locks(root).acquire(folder);
        } catch (e) {
          if (!(e instanceof LockedError)) throw e;
          readOnly = true;
          message = { kind: "error", text: `${e.message} : ouverte en lecture seule.` };
        }
        set({
          history: createHistory(v.doc),
          preview: null,
          selection: [],
          folder,
          meta: m.ok ? m.meta : null,
          title: m.ok ? m.meta.title : folder,
          readOnly,
          dirty: false,
        });
        set({ message });
      }),

    saveToLibrary: () =>
      run(async () => {
        const { backend, root, host } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        if (get().readOnly) throw new Error("Figure ouverte en lecture seule (verrouillée sur un autre poste).");
        const fs = backend.fs(root);
        const doc = get().history.present;
        let { folder, meta } = get();
        if (!folder || !meta) {
          const created = await createFigure(fs, { title: get().title.trim() || "Schéma", kind: "schema", now: nowIso(), host });
          folder = created.folder;
          meta = created.meta;
          await backend.locks(root).acquire(folder);
        }
        const svg = exportSvg(doc);
        await fs.writeTextAtomic(joinPath(folder, "figure.json"), serializeFigure(doc));
        await fs.writeTextAtomic(joinPath(folder, "export.svg"), svg);
        await fs.writeTextAtomic(joinPath(folder, "export.tex"), exportTikz(doc));
        await fs.writeBytesAtomic(joinPath(folder, "export.png"), await svgToPng(svg, doc.canvas.width, doc.canvas.height, 300));
        const title = get().title.trim() || meta.title;
        const saved = await saveMeta(fs, folder, { ...meta, title }, { now: nowIso(), host });
        set({ folder, meta: saved, dirty: false, message: { kind: "info", text: `Enregistré : ${saved.id} (figure.json, export.tex, export.svg, export.png).` } });
        await useLibrary.getState().rescan();
      }),

    copyTikz: () =>
      run(async () => {
        await (await getBackend()).copyText(exportTikz(get().history.present));
        set({ message: { kind: "info", text: "TikZ copié (nécessite \\usepackage{figurine})." } });
      }),

    copySvg: () =>
      run(async () => {
        const doc = get().history.present;
        const svg = exportSvg(doc);
        await (await getBackend()).copySvg(svg, await svgToPng(svg, doc.canvas.width, doc.canvas.height, 300));
        set({ message: { kind: "info", text: "SVG copié." } });
      }),

    exportAs: (kind) =>
      run(async () => {
        const doc = get().history.present;
        const backend = await getBackend();
        const base = (get().meta?.id ?? "schema").toLowerCase();
        let done: boolean;
        if (kind.startsWith("png")) {
          const dpi = kind === "png300" ? 300 : 600;
          const png = await svgToPng(exportSvg(doc), doc.canvas.width, doc.canvas.height, dpi, kind === "png600white" ? "white" : null);
          done = await backend.savePngAs(png, `${base}-${dpi}dpi.png`);
        } else if (kind === "svg") {
          done = await backend.saveTextAs(exportSvg(doc), `${base}.svg`, "svg");
        } else if (kind === "sty") {
          done = await backend.saveTextAs(generateSty(THEMES[doc.theme] ?? THEMES.these!), "figurine.sty", "sty");
        } else {
          done = await backend.saveTextAs(exportTikz(doc, { standalone: kind === "texStandalone" }), `${base}.tex`, "tex");
        }
        if (done) set({ message: { kind: "info", text: "Export enregistré." } });
      }),

    copyPng: (dpi) =>
      run(async () => {
        const doc = get().history.present;
        await (await getBackend()).copyPng(await svgToPng(exportSvg(doc), doc.canvas.width, doc.canvas.height, dpi));
        set({ message: { kind: "info", text: `PNG copié (${dpi} dpi, fond transparent).` } });
      }),
  };
});
