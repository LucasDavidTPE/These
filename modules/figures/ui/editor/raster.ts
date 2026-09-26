/** Rendu PNG d'un SVG dans le navigateur intégré (export PNG 300 / 600 dpi). */
import { pixelSize, setPngDpi } from "../../core/editor";

export async function svgToPng(svg: string, widthMm: number, heightMm: number, dpi: number, background: string | null = null): Promise<Uint8Array> {
  const { width, height } = pixelSize(widthMm, heightMm, dpi);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Rendu SVG impossible."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encodage PNG impossible."))), "image/png"));
    return setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  } finally {
    URL.revokeObjectURL(url);
  }
}
