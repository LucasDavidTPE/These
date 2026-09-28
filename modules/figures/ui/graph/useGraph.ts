/**
 * État de la page Graphes. Lecture des données, modèle et exports : src/core/graph.
 */
import { create } from "zustand";
import {
  emptyGraph,
  exportGraphSvg,
  exportPgfplots,
  extractSeries,
  looksLikeHeader,
  readDataFile,
  readPasted,
  parseStyle,
  STYLES_DIR,
  styleFileName,
  validateGraph,
  type GraphDoc,
  type GraphStyle,
  type Series,
  type Sheet,
} from "../../core/graph";
import { LockedError, createFigure, joinPath, saveMeta, validateMeta, type FigureMeta } from "../../core/library";
import { svgToPng } from "../editor/raster";
import { nowIso, useLibrary } from "../library/useLibrary";
import { getBackend } from "../platform/backend";

export interface Pick {
  sheet: number;
  header: boolean;
  firstRow: number;
  lastRow: number;
  x: number;
  ys: number[];
}

interface GraphState {
  doc: GraphDoc;
  sheets: Sheet[];
  sourceName: string;
  pick: Pick;
  folder: string | null;
  meta: FigureMeta | null;
  title: string;
  dataFiles: boolean;
  busy: boolean;
  message: { kind: "error" | "info"; text: string } | null;

  update(patch: Partial<GraphDoc>): void;
  setSeries(i: number, patch: Partial<Series>): void;
  removeSeries(i: number): void;
  moveSeries(i: number, d: number): void;
  openFile(): Promise<void>;
  paste(text: string): void;
  setPick(patch: Partial<Pick>): void;
  addSeries(): void;
  newGraph(): void;
  openFromLibrary(folder: string): Promise<void>;
  saveToLibrary(): Promise<void>;
  copyPgfplots(): Promise<void>;
  copySvg(): Promise<void>;
  copyPng(): Promise<void>;
  exportAs(kind: "tex" | "svg" | "png"): Promise<void>;
  set(patch: Partial<Pick & { title: string; dataFiles: boolean }>): void;
  /** Styles enregistrés dans la bibliothèque (`_styles-graphes/`, un fichier par style). */
  userStyles: GraphStyle[];
  loadStyles(): Promise<void>;
  saveStyle(name: string): Promise<void>;
  deleteStyle(name: string): Promise<void>;
  /** Remplace le graphe par un modèle (nouvelle figure). */
  fromTemplate(doc: GraphDoc, title: string): void;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function defaultPick(sheets: Sheet[], sheet = 0): Pick {
  const rows = sheets[sheet]?.rows ?? [];
  const cols = Math.max(0, ...rows.map((r) => r.length));
  return { sheet, header: looksLikeHeader(rows), firstRow: 0, lastRow: Math.max(0, rows.length - 1), x: 0, ys: cols > 1 ? [1] : [] };
}

export const useGraph = create<GraphState>()((set, get) => {
  const run = async (fn: () => Promise<void>) => {
    set({ busy: true, message: null });
    try {
      await fn();
    } catch (e) {
      set({ message: { kind: "error", text: msg(e) } });
    } finally {
      set({ busy: false });
    }
  };
  const checked = () => {
    const v = validateGraph(get().doc);
    if (!v.ok) throw new Error(v.errors.map((e) => `${e.path} : ${e.message}`).join("\n"));
    if (v.doc.series.length === 0) throw new Error("Ajoutez au moins une série.");
    return v.doc;
  };
  const png = async (dpi = 300) => {
    const doc = checked();
    return svgToPng(exportGraphSvg(doc), doc.width, doc.height, dpi);
  };
  const releaseLock = async () => {
    const { folder } = get();
    const { backend, root } = useLibrary.getState();
    if (folder && backend && root) await backend.locks(root).release(folder).catch(() => false);
  };

  return {
    doc: emptyGraph(),
    sheets: [],
    sourceName: "",
    pick: { sheet: 0, header: true, firstRow: 0, lastRow: 0, x: 0, ys: [] },
    folder: null,
    meta: null,
    title: "",
    dataFiles: false,
    busy: false,
    message: null,
    userStyles: [],

    update: (patch) => set({ doc: { ...get().doc, ...patch } }),
    setSeries: (i, patch) => set({ doc: { ...get().doc, series: get().doc.series.map((s, j) => (j === i ? { ...s, ...patch } : s)) } }),
    removeSeries: (i) => set({ doc: { ...get().doc, series: get().doc.series.filter((_, j) => j !== i) } }),
    moveSeries: (i, d) => {
      const series = [...get().doc.series];
      const [s] = series.splice(i, 1);
      series.splice(Math.max(0, Math.min(series.length, i + d)), 0, s!);
      set({ doc: { ...get().doc, series } });
    },

    openFile: () =>
      run(async () => {
        const f = await (await getBackend()).openDataFile();
        if (!f) return;
        const sheets = readDataFile(f.name, f.bytes);
        set({ sheets, sourceName: f.name, pick: defaultPick(sheets) });
      }),

    paste: (text) => {
      try {
        const sheets = readPasted(text);
        set({ sheets, sourceName: "Collage", pick: defaultPick(sheets), message: null });
      } catch (e) {
        set({ message: { kind: "error", text: msg(e) } });
      }
    },

    setPick: (patch) => {
      const p = { ...get().pick, ...patch };
      if (patch.sheet !== undefined && patch.sheet !== get().pick.sheet) set({ pick: defaultPick(get().sheets, patch.sheet) });
      else set({ pick: p });
    },

    addSeries: () => {
      const { sheets, pick, doc } = get();
      const rows = sheets[pick.sheet]?.rows ?? [];
      const found = extractSeries(rows, pick);
      const added: Series[] = found.filter((s) => s.x.length > 0).map((s) => ({ name: s.name, type: "linepoints", x: s.x, y: s.y, legend: true }));
      const skipped = found.reduce((n, s) => n + s.skipped, 0);
      if (added.length === 0) {
        set({ message: { kind: "error", text: "Aucune valeur numérique dans ces colonnes." } });
        return;
      }
      const header = pick.header ? rows[pick.firstRow] : undefined;
      const xLabel = doc.x.label || (header ? String(header[pick.x] ?? "") : "");
      set({
        doc: { ...doc, series: [...doc.series, ...added], x: { ...doc.x, label: xLabel } },
        message: { kind: "info", text: `${added.length} série(s) ajoutée(s)${skipped ? ` ; ${skipped} ligne(s) non numérique(s) ignorée(s)` : ""}.` },
      });
    },

    newGraph: () => {
      void releaseLock();
      set({ doc: emptyGraph(), folder: null, meta: null, title: "", message: null });
    },

    openFromLibrary: (folder) =>
      run(async () => {
        const { backend, root } = useLibrary.getState();
        if (!backend || !root) throw new Error("Bibliothèque non ouverte.");
        const fs = backend.fs(root);
        const v = validateGraph(JSON.parse(await fs.readText(joinPath(folder, "graph.json"))));
        if (!v.ok) throw new Error(`graph.json invalide :\n${v.errors.map((e) => `${e.path} : ${e.message}`).join("\n")}`);
        const m = validateMeta(JSON.parse(await fs.readText(joinPath(folder, "meta.json"))));
        await releaseLock();
        try {
          await backend.locks(root).acquire(folder);
        } catch (e) {
          if (e instanceof LockedError) throw new Error(`${e.message} : fermez-la sur l'autre poste ou forcez depuis la bibliothèque.`, { cause: e });
          throw e;
        }
        set({ doc: v.doc, folder, meta: m.ok ? m.meta : null, title: m.ok ? m.meta.title : folder });
      }),

    saveToLibrary: () =>
      run(async () => {
        await useLibrary.getState().init();
        const { backend, root, host } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        const doc = checked();
        const fs = backend.fs(root);
        let { folder, meta } = get();
        if (!folder || !meta) {
          const created = await createFigure(fs, { title: get().title.trim() || "Graphe", kind: "graph", now: nowIso(), host });
          folder = created.folder;
          meta = created.meta;
          await backend.locks(root).acquire(folder);
        }
        const pgf = exportPgfplots(doc, { dataFiles: get().dataFiles });
        await fs.writeTextAtomic(joinPath(folder, "graph.json"), JSON.stringify(doc, null, 2) + "\n");
        await fs.writeTextAtomic(joinPath(folder, "export.tex"), pgf.tex);
        for (const [name, content] of Object.entries(pgf.files)) await fs.writeTextAtomic(joinPath(folder, name), content);
        await fs.writeTextAtomic(joinPath(folder, "export.svg"), exportGraphSvg(doc));
        await fs.writeBytesAtomic(joinPath(folder, "export.png"), await png());
        const saved = await saveMeta(fs, folder, { ...meta, title: get().title.trim() || meta.title }, { now: nowIso(), host });
        set({ folder, meta: saved, message: { kind: "info", text: `Enregistré : ${saved.id}.${get().dataFiles ? " Données dans export-<n>.dat (définir \\figurinedatadir)." : ""}` } });
        await useLibrary.getState().rescan();
      }),

    copyPgfplots: () =>
      run(async () => {
        await (await getBackend()).copyText(exportPgfplots(checked()).tex);
        set({ message: { kind: "info", text: "pgfplots copié (nécessite \\usepackage{figurine})." } });
      }),
    copySvg: () =>
      run(async () => {
        const doc = checked();
        await (await getBackend()).copySvg(exportGraphSvg(doc), await png());
        set({ message: { kind: "info", text: "SVG copié." } });
      }),
    copyPng: () =>
      run(async () => {
        await (await getBackend()).copyPng(await png());
        set({ message: { kind: "info", text: "PNG copié (300 dpi)." } });
      }),
    exportAs: (kind) =>
      run(async () => {
        const backend = await getBackend();
        const doc = checked();
        const ok =
          kind === "png"
            ? await backend.savePngAs(await png(600), "graphe-600dpi.png")
            : kind === "svg"
              ? await backend.saveTextAs(exportGraphSvg(doc), "graphe.svg", "svg")
              : await backend.saveTextAs(exportPgfplots(doc, { standalone: true }).tex, "graphe.tex", "tex");
        if (ok) set({ message: { kind: "info", text: "Export enregistré." } });
      }),
    loadStyles: async () => {
      const { backend, root } = useLibrary.getState();
      if (!backend || !root) return set({ userStyles: [] });
      const fs = backend.fs(root);
      const styles: GraphStyle[] = [];
      try {
        for (const e of await fs.listDir(STYLES_DIR)) {
          if (e.kind === "dir" || !e.name.endsWith(".json")) continue;
          try {
            const st = parseStyle(JSON.parse(await fs.readText(joinPath(STYLES_DIR, e.name))));
            if (st) styles.push(st);
          } catch {
            // style illisible (copie de conflit OneDrive…) : ignoré
          }
        }
      } catch {
        // pas encore de dossier de styles
      }
      set({ userStyles: styles.sort((a, b) => a.name.localeCompare(b.name, "fr")) });
    },

    saveStyle: (name) =>
      run(async () => {
        const { backend, root } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        const style = get().doc.style;
        if (!style) throw new Error("Choisissez d'abord un style ou une palette à enregistrer.");
        const fs = backend.fs(root);
        await fs.createDir(STYLES_DIR).catch(() => undefined);
        const named = { ...style, name: name.trim() };
        await fs.writeTextAtomic(joinPath(STYLES_DIR, styleFileName(named.name)), JSON.stringify(named, null, 2) + "\n");
        set({ doc: { ...get().doc, style: named }, message: { kind: "info", text: `Style « ${named.name} » enregistré dans la bibliothèque (${STYLES_DIR}), disponible sur les deux postes.` } });
        await get().loadStyles();
      }),

    deleteStyle: (name) =>
      run(async () => {
        const { backend, root } = useLibrary.getState();
        if (!backend || !root) return;
        const fs = backend.fs(root);
        // pas de suppression dans la bibliothèque : le fichier est rangé à part, récupérable
        await fs.createDir(joinPath(STYLES_DIR, ".supprimes")).catch(() => undefined);
        const file = styleFileName(name);
        await fs.rename(joinPath(STYLES_DIR, file), joinPath(STYLES_DIR, ".supprimes", `${Date.now()}-${file}`));
        set({ message: { kind: "info", text: `Style « ${name} » retiré (rangé dans ${STYLES_DIR}/.supprimes).` } });
        await get().loadStyles();
      }),

    fromTemplate: (doc, title) => {
      void releaseLock();
      set({ doc: JSON.parse(JSON.stringify(doc)) as GraphDoc, folder: null, meta: null, title, message: { kind: "info", text: `Modèle « ${title} » : valeurs d'exemple, à remplacer par vos données (Données à gauche).` } });
    },

    set: (patch) => {
      const { title, dataFiles, ...pick } = patch;
      if (title !== undefined) set({ title });
      if (dataFiles !== undefined) set({ dataFiles });
      if (Object.keys(pick).length) get().setPick(pick);
    },
  };
});
