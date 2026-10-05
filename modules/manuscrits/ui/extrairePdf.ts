/**
 * Annotations d'un PDF reçu, lues par pdf.js (Mozilla, Apache-2.0) chargé seulement à la demande ;
 * aucun accès réseau : le fichier est lu sur place. Version « legacy » comme pour l'aperçu des PDF.
 */
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { lireAnnotations } from "../core/lirePdf";
import type { AnnotationPdf } from "../core/retours";

export async function annotationsPdf(octets: Uint8Array): Promise<AnnotationPdf[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const tache = pdfjs.getDocument({ data: octets.slice() });
  try {
    return await lireAnnotations((await tache.promise) as never);
  } finally {
    await tache.destroy();
  }
}
