/** Décodage d'une image (fichier, presse-papiers) par le navigateur : pixels RGBA + image affichable. */
import type { ImageChargee } from "./etat";

export const EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", bmp: "image/bmp", gif: "image/gif" };

export async function decoder(octets: Uint8Array, ext: string): Promise<ImageChargee> {
  const e = ext.toLowerCase().replace(/^\./, "");
  const blob = new Blob([octets as BlobPart], { type: TYPES[e] ?? "application/octet-stream" });
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(e === "heic" || e === "heif" ? "Image HEIC : l'enregistrer d'abord en PNG ou JPEG (ou l'importer dans Figures)." : "Image illisible : PNG, JPEG, WebP, BMP ou GIF attendu.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const c = canvas.getContext("2d", { willReadFrequently: true })!;
  // fond blanc sous les images transparentes (captures d'écran, PNG exportés)
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(bitmap, 0, 0);
  const d = c.getImageData(0, 0, canvas.width, canvas.height);
  return { rgba: { width: d.width, height: d.height, data: d.data }, source: canvas, octets, ext: e === "jpeg" ? "jpg" : e };
}

/** PNG d'un canevas (images d'exemple, captures collées). */
export async function enPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("Encodage PNG impossible.");
  return new Uint8Array(await blob.arrayBuffer());
}
