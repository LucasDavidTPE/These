/**
 * État de la page Détourage. Les calculs (masque, pinceau, composition, source) sont
 * dans src/core/cutout ; ici, on enchaîne les étapes et on garde l'état.
 */
import { create } from "zustand";
import {
  BRUSH_KEEP,
  BRUSH_REMOVE,
  DEFAULT_MASK_SETTINGS,
  composeRgba,
  computeAlpha,
  paintStroke,
  parseClipboardHtml,
  parseSegmentResponse,
  sourceFromOrigin,
  type ClipboardOrigin,
  type MaskSettings,
} from "../../core/cutout";
import { generateCaption, saveImageFigure } from "../../core/library";
import { useLibrary, nowIso } from "../library/useLibrary";
import { getBackend } from "../platform/backend";
import { decodeImage, encodePng, type DecodedImage } from "./imageIO";

export type BrushMode = "off" | "keep" | "remove";

interface CutoutState {
  image: (DecodedImage & { bytes: Uint8Array }) | null;
  mask: Uint8Array | null;
  brush: Uint8Array | null;
  /** Image détourée (RGBA) recalculée à chaque réglage. */
  result: Uint8ClampedArray | null;
  settings: MaskSettings;
  origin: ClipboardOrigin;
  busy: string | null;
  error: string | null;
  info: string | null;
  ms: number | null;
  brushMode: BrushMode;
  brushSize: number;
  showOriginal: boolean;
  load(bytes: Uint8Array, html: string | null): Promise<void>;
  paste(event: ClipboardEvent | null): Promise<void>;
  open(): Promise<void>;
  setSettings(patch: Partial<MaskSettings>): void;
  setBrush(mode: BrushMode, size?: number): void;
  stroke(from: [number, number], to: [number, number]): void;
  resetBrush(): void;
  toggleOriginal(show: boolean): void;
  copy(): Promise<void>;
  saveAs(): Promise<void>;
  saveToLibrary(title: string): Promise<string | null>;
  clear(): void;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useCutout = create<CutoutState>()((set, get) => {
  const recompute = () => {
    const { image, mask, brush, settings } = get();
    if (!image || !mask || !brush) return;
    const alpha = computeAlpha(mask, brush, image.width, image.height, settings);
    set({ result: composeRgba(image.rgba, alpha) });
  };

  const resultPng = async () => {
    const { image, result } = get();
    if (!image || !result) throw new Error("Aucune image détourée.");
    return encodePng(image.width, image.height, result);
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    set({ busy: label, error: null, info: null });
    try {
      await fn();
    } catch (e) {
      set({ error: msg(e) });
    } finally {
      set({ busy: null });
    }
  };

  return {
    image: null,
    mask: null,
    brush: null,
    result: null,
    settings: DEFAULT_MASK_SETTINGS,
    origin: {},
    busy: null,
    error: null,
    info: null,
    ms: null,
    brushMode: "off",
    brushSize: 20,
    showOriginal: false,

    load: (bytes, html) =>
      run("Détourage en cours…", async () => {
        const image = await decodeImage(bytes);
        set({ image: { ...image, bytes }, mask: null, result: null, origin: parseClipboardHtml(html) });
        const backend = await getBackend();
        const seg = parseSegmentResponse(await backend.segment(bytes));
        if (seg.width !== image.width || seg.height !== image.height) {
          throw new Error("Le masque ne correspond pas à l'image.");
        }
        set({ mask: seg.mask, brush: new Uint8Array(seg.mask.length), ms: seg.ms });
        recompute();
      }),

    paste: (event) =>
      run("Lecture du presse-papier…", async () => {
        const backend = await getBackend();
        const pasted = await backend.pasteImage(event);
        if (!pasted) throw new Error("Le presse-papier ne contient pas d'image.");
        await get().load(pasted.bytes, pasted.html);
      }),

    open: () =>
      run("Ouverture…", async () => {
        const backend = await getBackend();
        const bytes = await backend.openImageFile();
        if (bytes) await get().load(bytes, null);
      }),

    setSettings: (patch) => {
      set({ settings: { ...get().settings, ...patch } });
      recompute();
    },

    setBrush: (mode, size) => set({ brushMode: mode, brushSize: size ?? get().brushSize }),

    stroke: (from, to) => {
      const { image, brush, brushMode, brushSize } = get();
      if (!image || !brush || brushMode === "off") return;
      const changed = paintStroke(brush, image.width, image.height, from, to, brushSize / 2, brushMode === "keep" ? BRUSH_KEEP : BRUSH_REMOVE);
      if (changed > 0) recompute();
    },

    resetBrush: () => {
      const { mask } = get();
      if (!mask) return;
      set({ brush: new Uint8Array(mask.length) });
      recompute();
    },

    toggleOriginal: (show) => set({ showOriginal: show }),

    copy: () =>
      run("Copie…", async () => {
        const backend = await getBackend();
        await backend.copyPng(await resultPng());
        set({ info: "Image copiée (avec transparence)." });
      }),

    saveAs: () =>
      run("Enregistrement…", async () => {
        const backend = await getBackend();
        if (await backend.savePngAs(await resultPng(), "detourage.png")) set({ info: "Image enregistrée." });
      }),

    saveToLibrary: async (title) => {
      let folder: string | null = null;
      await run("Enregistrement dans la bibliothèque…", async () => {
        const lib = useLibrary.getState();
        await lib.init();
        const { backend, root, host } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        const { image } = get();
        if (!image) throw new Error("Aucune image.");
        const original = await encodePng(image.width, image.height, image.rgba);
        const source = sourceFromOrigin(get().origin);
        const created = await saveImageFigure(backend.fs(root), {
          title: title.trim() || "Image détourée",
          original,
          result: await resultPng(),
          source,
          caption: generateCaption(source) || undefined,
          now: nowIso(),
          host,
        });
        folder = created.folder;
        await useLibrary.getState().rescan();
        set({ info: `Enregistrée dans la bibliothèque : ${created.meta.id}.` });
      });
      return folder;
    },

    clear: () => set({ image: null, mask: null, brush: null, result: null, origin: {}, ms: null, error: null, info: null }),
  };
});
