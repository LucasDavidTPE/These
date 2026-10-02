/**
 * Première page d'un PDF en PNG, rendue sur place par pdf.js (Mozilla, Apache-2.0), chargé
 * seulement quand un aperçu est demandé. Aucun accès réseau : le PDF est lu dans l'espace.
 */
// Version « legacy » : elle embarque les compléments JavaScript récents dont pdf.js a besoin
// (Map.getOrInsertComputed…), absents de certaines versions de WebView2.
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

export async function premierePagePng(octets: Uint8Array, largeur = 640): Promise<Uint8Array> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Copie : pdf.js transfère le tampon au worker, l'appelant garde le sien.
  const tache = pdfjs.getDocument({ data: octets.slice() });
  try {
    const doc = await tache.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: largeur / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: g, viewport }).promise;
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
    if (!blob) throw new Error("Encodage PNG impossible.");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    await tache.destroy();
  }
}
