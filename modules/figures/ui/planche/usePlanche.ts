/** État de la page Planches : la planche, les graphes qu'elle assemble (lus dans la bibliothèque), enregistrement. */
import { create } from "zustand";
import { lirePlanche, plancheSvg, planchePgfplots, plancheVide, validateGraph, type GraphDoc, type PlancheDoc } from "../../core/graph";
import { createFigure, joinPath, saveMeta, validateMeta, type FigureMeta } from "../../core/library";
import { svgToPng } from "../editor/raster";
import { nowIso, useLibrary } from "../library/useLibrary";
import { getBackend } from "../platform/backend";

interface PlancheState {
  doc: PlancheDoc;
  /** Graphes lus, par dossier. */
  graphes: Record<string, { titre: string; doc: GraphDoc }>;
  folder: string | null;
  meta: FigureMeta | null;
  title: string;
  busy: boolean;
  message: { kind: "error" | "info"; text: string } | null;
  set(patch: Partial<PlancheDoc>): void;
  setTitle(t: string): void;
  nouvelle(): void;
  ajouter(dossier: string): Promise<void>;
  retirer(i: number): void;
  deplacer(i: number, d: number): void;
  /** Relit les graphes depuis la bibliothèque (après les avoir modifiés). */
  relire(): Promise<void>;
  openFromLibrary(folder: string): Promise<void>;
  enregistrer(): Promise<void>;
  exporter(kind: "svg" | "png" | "tex"): Promise<void>;
  copier(kind: "svg" | "png" | "tex"): Promise<void>;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function lireGraphe(dossier: string): Promise<{ titre: string; doc: GraphDoc }> {
  const { backend, root } = useLibrary.getState();
  if (!backend || !root) throw new Error("Bibliothèque non ouverte.");
  const fs = backend.fs(root);
  const v = validateGraph(JSON.parse(await fs.readText(joinPath(dossier, "graph.json"))));
  if (!v.ok) throw new Error(`${dossier} : graph.json invalide.`);
  const m = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
  return { titre: m.ok ? m.meta.title : dossier, doc: v.doc };
}

export const usePlanche = create<PlancheState>()((set, get) => {
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
  /** Graphes de la planche, dans l'ordre ; null : case vide (matrice incomplète) ou graphe illisible. */
  const docs = (): (GraphDoc | null)[] => get().doc.panneaux.map((p) => (p.dossier ? (get().graphes[p.dossier]?.doc ?? null) : null));
  const svg = () => plancheSvg(get().doc, docs());
  const png = async (dpi = 300) => {
    const s = svg();
    const mm = (k: "width" | "height") => Number(new RegExp(`${k}="([\\d.]+)mm"`).exec(s)?.[1] ?? 100);
    return svgToPng(s, mm("width"), mm("height"), dpi, "white");
  };
  return {
    doc: plancheVide(),
    graphes: {},
    folder: null,
    meta: null,
    title: "Planche",
    busy: false,
    message: null,
    set: (patch) => set({ doc: { ...get().doc, ...patch } }),
    setTitle: (title) => set({ title }),
    nouvelle: () => set({ doc: plancheVide(), graphes: {}, folder: null, meta: null, title: "Planche", message: null }),
    ajouter: (dossier) =>
      run(async () => {
        const g = get().graphes[dossier] ?? (await lireGraphe(dossier));
        set({ graphes: { ...get().graphes, [dossier]: g }, doc: { ...get().doc, panneaux: [...get().doc.panneaux, { dossier }] } });
      }),
    retirer: (i) => set({ doc: { ...get().doc, panneaux: get().doc.panneaux.filter((_, k) => k !== i) } }),
    deplacer: (i, d) => {
      const p = [...get().doc.panneaux];
      const [x] = p.splice(i, 1);
      p.splice(Math.max(0, Math.min(p.length, i + d)), 0, x!);
      set({ doc: { ...get().doc, panneaux: p } });
    },
    relire: () =>
      run(async () => {
        const graphes: PlancheState["graphes"] = {};
        const manquants: string[] = [];
        for (const p of get().doc.panneaux) {
          if (!p.dossier) continue;
          try {
            graphes[p.dossier] = await lireGraphe(p.dossier);
          } catch {
            manquants.push(p.dossier);
          }
        }
        set({ graphes, message: manquants.length ? { kind: "error", text: `Graphes introuvables ou illisibles : ${manquants.join(", ")}.` } : { kind: "info", text: "Graphes relus : la planche est à jour." } });
      }),
    openFromLibrary: (folder) =>
      run(async () => {
        await useLibrary.getState().init();
        const { backend, root } = useLibrary.getState();
        if (!backend || !root) throw new Error("Bibliothèque non ouverte.");
        const fs = backend.fs(root);
        const doc = lirePlanche(JSON.parse(await fs.readText(joinPath(folder, "planche.json"))));
        const m = validateMeta(JSON.parse(await fs.readText(joinPath(folder, "meta.json"))));
        set({ doc, folder, meta: m.ok ? m.meta : null, title: m.ok ? m.meta.title : folder, graphes: {} });
        await get().relire();
      }),
    enregistrer: () =>
      run(async () => {
        await useLibrary.getState().init();
        const { backend, root, host } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        const fs = backend.fs(root);
        let { folder, meta } = get();
        if (!folder || !meta) {
          const created = await createFigure(fs, { title: get().title.trim() || "Planche", kind: "planche", now: nowIso(), host });
          folder = created.folder;
          meta = created.meta;
        }
        await fs.writeTextAtomic(joinPath(folder, "planche.json"), JSON.stringify(get().doc, null, 2) + "\n");
        await fs.writeTextAtomic(joinPath(folder, "export.svg"), svg());
        await fs.writeTextAtomic(joinPath(folder, "export.tex"), planchePgfplots(get().doc, docs()));
        await fs.writeBytesAtomic(joinPath(folder, "export.png"), await png());
        const saved = await saveMeta(fs, folder, { ...meta, title: get().title.trim() || meta.title }, { now: nowIso(), host });
        set({ folder, meta: saved, message: { kind: "info", text: `Planche enregistrée : ${saved.id}.` } });
        await useLibrary.getState().rescan();
      }),
    exporter: (kind) =>
      run(async () => {
        const b = await getBackend();
        const ok = kind === "png" ? await b.savePngAs(await png(600), "planche-600dpi.png") : await b.saveTextAs(kind === "svg" ? svg() : planchePgfplots(get().doc, docs()), kind === "svg" ? "planche.svg" : "planche.tex", kind);
        if (ok) set({ message: { kind: "info", text: "Export enregistré." } });
      }),
    copier: (kind) =>
      run(async () => {
        const b = await getBackend();
        if (kind === "tex") await b.copyText(planchePgfplots(get().doc, docs()));
        else if (kind === "svg") await b.copySvg(svg(), await png());
        else await b.copyPng(await png());
        set({ message: { kind: "info", text: kind === "tex" ? "pgfplots copié (nécessite \\usepackage{figurine})." : `${kind.toUpperCase()} copié.` } });
      }),
  };
});
