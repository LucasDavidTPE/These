/**
 * Aspect Excel en haute définition : le PDF exporté par Excel est rendu par pdf.js (Mozilla,
 * Apache-2.0) à 300 dpi, puis les marges blanches sont retirées (Excel imprime parfois le
 * graphique sur une page entière). Aucun accès réseau.
 */
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/** Rectangle des pixels non blancs (marge de `bord` pixels gardée autour) ; null si tout est blanc. */
export function cadreUtile(data: Uint8ClampedArray, largeur: number, hauteur: number, bord = 8): { x: number; y: number; l: number; h: number } | null {
  let x0 = largeur;
  let y0 = hauteur;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = (y * largeur + x) * 4;
      if (data[i]! < 245 || data[i + 1]! < 245 || data[i + 2]! < 245) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  const x = Math.max(0, x0 - bord);
  const y = Math.max(0, y0 - bord);
  return { x, y, l: Math.min(largeur, x1 + bord + 1) - x, h: Math.min(hauteur, y1 + bord + 1) - y };
}

export async function pdfEnPng(octets: Uint8Array, dpi = 300): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const tache = pdfjs.getDocument({ data: octets.slice() });
  try {
    const page = await (await tache.promise).getPage(1);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: g, viewport }).promise;
    const c = cadreUtile(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (!c) throw new Error("Page blanche.");
    const sortie = document.createElement("canvas");
    sortie.width = c.l;
    sortie.height = c.h;
    sortie.getContext("2d")!.drawImage(canvas, c.x, c.y, c.l, c.h, 0, 0, c.l, c.h);
    const blob = await new Promise<Blob | null>((ok) => sortie.toBlob(ok, "image/png"));
    if (!blob) throw new Error("Encodage PNG impossible.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    await tache.destroy();
  }
}
