/** Décodage / encodage d'images côté interface (canvas du navigateur intégré). */
import { isHeif } from "../../core/format/heif";

export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/** Type MIME deviné (le SVG doit être déclaré pour être décodé). */
function sniff(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder().decode(bytes.slice(0, 200)).trimStart();
  return head.startsWith("<svg") || head.startsWith("<?xml") ? "image/svg+xml" : undefined;
}

/**
 * HEIC → PNG. Le décodeur (libheif compilé en JavaScript, ~3 Mo, LGPL) n'est chargé qu'à la
 * première photo HEIC ouverte ; aucune requête réseau.
 */
export async function heifToPng(bytes: Uint8Array): Promise<Uint8Array> {
  const { heicTo } = await import("heic-to/csp");
  try {
    const png = await heicTo({ blob: new Blob([bytes.slice()], { type: "image/heic" }), type: "image/png" });
    return new Uint8Array(await png.arrayBuffer());
  } catch (e) {
    throw new Error(`Photo HEIC illisible (${e instanceof Error ? e.message : String(e)}).`, { cause: e });
  }
}

export async function decodeImage(bytes: Uint8Array): Promise<DecodedImage> {
  if (isHeif(bytes)) bytes = await heifToPng(bytes);
  const type = sniff(bytes);
  if (type === "image/svg+xml") {
    // Un SVG passe par une balise <img> (createImageBitmap ne lit pas toujours le SVG).
    const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
    try {
      const img = new Image();
      await new Promise<void>((ok, ko) => {
        img.onload = () => ok();
        img.onerror = () => ko(new Error("SVG illisible."));
        img.src = url;
      });
      const w = img.naturalWidth || 800;
      const h = img.naturalHeight || 600;
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      return { width: w, height: h, rgba: data.data };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: data.width, height: data.height, rgba: data.data };
}

export async function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}
