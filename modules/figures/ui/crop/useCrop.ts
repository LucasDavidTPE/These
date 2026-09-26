/**
 * État de la page Recadrage ; la géométrie et le traitement d'image viennent de src/core/crop.
 */
import { create } from "zustand";
import { setPngDpi } from "../../core/editor";
import {
  autoTrim,
  cropImage,
  dragHandle,
  fitRatio,
  fullRect,
  outputSize,
  readPngDpi,
  rectFromMargins,
  resample,
  rotate90,
  type Handle,
  type Image,
  type Margins,
  type Rect,
} from "../../core/crop";
import { joinPath, saveCropFigure, thumbnailFile, type FigureEntry, type FigureMeta } from "../../core/library";
import { decodeImage, encodePng } from "../cutout/imageIO";
import { nowIso, useLibrary } from "../library/useLibrary";
import { getBackend } from "../platform/backend";

interface CropState {
  /** Image d'origine (avant rotation) et ses octets. */
  original: (Image & { bytes: Uint8Array }) | null;
  /** Image après rotation : c'est sur elle que porte le rectangle. */
  image: Image | null;
  rotation: number;
  rect: Rect;
  ratio: number | null;
  /** Résolution de l'image source (pHYs du PNG, sinon 96 dpi). */
  sourceDpi: number;
  target: { widthMm?: number; heightMm?: number };
  outDpi: number;
  from: FigureMeta | null;
  title: string;
  busy: boolean;
  message: { kind: "error" | "info"; text: string } | null;

  load(bytes: Uint8Array, from?: FigureMeta | null): Promise<void>;
  loadFromLibrary(entry: FigureEntry): Promise<void>;
  paste(event: ClipboardEvent | null): Promise<void>;
  open(): Promise<void>;
  setRect(r: Rect): void;
  drag(handle: Handle, dx: number, dy: number, start: Rect): void;
  setRatio(ratio: number | null): void;
  setMargins(m: Margins): void;
  trim(mode: "transparent" | "blanc"): void;
  rotate(delta: number): void;
  setTarget(t: { widthMm?: number; heightMm?: number }): void;
  set(patch: Partial<Pick<CropState, "sourceDpi" | "outDpi" | "title">>): void;
  resultSize(): { width: number; height: number };
  render(): Promise<Uint8Array>;
  copy(): Promise<void>;
  saveAs(): Promise<void>;
  saveToLibrary(): Promise<void>;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const useCrop = create<CropState>()((set, get) => {
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

  return {
    original: null,
    image: null,
    rotation: 0,
    rect: { x: 0, y: 0, w: 1, h: 1 },
    ratio: null,
    sourceDpi: 96,
    target: {},
    outDpi: 300,
    from: null,
    title: "",
    busy: false,
    message: null,

    load: (bytes, from = null) =>
      run(async () => {
        const img = await decodeImage(bytes);
        const image: Image = { width: img.width, height: img.height, rgba: img.rgba };
        set({
          original: { ...image, bytes },
          image,
          rotation: 0,
          rect: fullRect(image),
          sourceDpi: readPngDpi(bytes) ?? 96,
          target: {},
          from,
          title: from ? `${from.title} (recadrage)` : "",
        });
      }),

    loadFromLibrary: (entry) =>
      run(async () => {
        const { backend, root } = useLibrary.getState();
        const file = thumbnailFile(entry);
        if (!backend || !root || !file) throw new Error("Aucune image dans cette figure.");
        const bytes = await backend.fs(root).readBytes(joinPath(entry.folder, file));
        await get().load(bytes, entry.meta);
      }),

    paste: (event) =>
      run(async () => {
        const pasted = await (await getBackend()).pasteImage(event);
        if (!pasted) throw new Error("Le presse-papier ne contient pas d'image.");
        await get().load(pasted.bytes);
      }),

    open: () =>
      run(async () => {
        const bytes = await (await getBackend()).openImageFile();
        if (bytes) await get().load(bytes);
      }),

    setRect: (r) => {
      const img = get().image;
      if (img) set({ rect: fitRatio(r, get().ratio, img.width, img.height) });
    },

    drag: (handle, dx, dy, start) => {
      const img = get().image;
      if (img) set({ rect: dragHandle(start, handle, dx, dy, get().ratio, img.width, img.height) });
    },

    setRatio: (ratio) => {
      set({ ratio });
      get().setRect(get().rect);
    },

    setMargins: (m) => {
      const img = get().image;
      if (img) set({ rect: fitRatio(rectFromMargins(img.width, img.height, m, get().sourceDpi), get().ratio, img.width, img.height) });
    },

    trim: (mode) => {
      const img = get().image;
      if (img) set({ rect: autoTrim(img, mode), ratio: null });
    },

    rotate: (delta) => {
      const o = get().original;
      if (!o) return;
      const rotation = (((get().rotation + delta) % 4) + 4) % 4;
      const image = rotate90(o, rotation);
      set({ rotation, image, rect: fullRect(image), ratio: null });
    },

    setTarget: (target) => set({ target }),
    set: (patch) => set(patch),

    resultSize: () => outputSize(get().rect, get().target, get().outDpi),

    render: async () => {
      const { image, rect, outDpi } = get();
      if (!image) throw new Error("Aucune image.");
      const size = get().resultSize();
      const out = resample(cropImage(image, rect), size.width, size.height);
      return setPngDpi(await encodePng(out.width, out.height, out.rgba), outDpi);
    },

    copy: () =>
      run(async () => {
        await (await getBackend()).copyPng(await get().render());
        set({ message: { kind: "info", text: "Image recadrée copiée." } });
      }),

    saveAs: () =>
      run(async () => {
        if (await (await getBackend()).savePngAs(await get().render(), "recadrage.png")) set({ message: { kind: "info", text: "Image enregistrée." } });
      }),

    saveToLibrary: () =>
      run(async () => {
        await useLibrary.getState().init();
        const { backend, root, host } = useLibrary.getState();
        if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque (page Bibliothèque).");
        const { original, rect, rotation, outDpi, from, title } = get();
        if (!original) throw new Error("Aucune image.");
        const size = get().resultSize();
        const created = await saveCropFigure(backend.fs(root), {
          title: title.trim() || "Recadrage",
          original: await encodePng(original.width, original.height, original.rgba),
          result: await get().render(),
          from: from ?? undefined,
          crop: { rotation, rect, output: { ...size, dpi: outDpi } },
          now: nowIso(),
          host,
        });
        await useLibrary.getState().rescan();
        set({ message: { kind: "info", text: `Enregistré dans la bibliothèque : ${created.meta.id}${from ? ` (d'après ${from.id})` : ""}.` } });
      }),
  };
});
