/**
 * Annotations d'un PDF lues par pdf.js. Ce module ne dépend pas de pdf.js : il reçoit le document
 * (types structurels), ce qui le rend testable ; l'interface charge pdf.js à la demande.
 */
import type { AnnotationPdf } from "./retours";

export interface ContenuTexte {
  items: { str?: string; transform: number[]; width: number; height: number }[];
}
export interface AnnotationBrute {
  subtype: string;
  contentsObj?: { str: string };
  contents?: string;
  titleObj?: { str: string };
  title?: string;
  modificationDate?: string | null;
  rect: number[];
  quadPoints?: ArrayLike<number> | null;
}
export interface PagePdf {
  getAnnotations(): Promise<AnnotationBrute[]>;
  getTextContent(): Promise<ContenuTexte>;
}
export interface DocumentPdf {
  numPages: number;
  getPage(n: number): Promise<PagePdf>;
}

/** Rectangles [x1, y1, x2, y2] couverts par une annotation de marquage (un par ligne de texte). */
function rectangles(a: AnnotationBrute): number[][] {
  const q = a.quadPoints ? Array.from(a.quadPoints) : [];
  const r: number[][] = [];
  for (let i = 0; i + 7 < q.length; i += 8) {
    const xs = [q[i]!, q[i + 2]!, q[i + 4]!, q[i + 6]!];
    const ys = [q[i + 1]!, q[i + 3]!, q[i + 5]!, q[i + 7]!];
    r.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  return r.length ? r : a.rect.length === 4 ? [a.rect] : [];
}

/** Texte de la page sous un rectangle : les mots touchés par la zone, élargis aux mots entiers. */
export function texteSous(contenu: ContenuTexte, zones: number[][]): string {
  const out: string[] = [];
  for (const it of contenu.items) {
    const str = it.str ?? "";
    if (!str.trim() || it.width <= 0) continue;
    const x = it.transform[4]!;
    const y = it.transform[5]!;
    const h = it.height || Math.abs(it.transform[3] ?? 10);
    for (const [x1, y1, x2, y2] of zones as [number, number, number, number][]) {
      // même ligne : le milieu de la hauteur du texte dans la zone
      const milieu = y + h * 0.35;
      if (milieu < y1 || milieu > y2) continue;
      const debut = Math.max(0, (x1 - x) / it.width);
      const fin = Math.min(1, (x2 - x) / it.width);
      if (fin <= 0 || debut >= 1 || fin <= debut) continue;
      let i = Math.floor(debut * str.length);
      let j = Math.ceil(fin * str.length);
      while (i > 0 && !/\s/.test(str[i - 1]!)) i--;
      while (j < str.length && !/\s/.test(str[j]!)) j++;
      out.push(str.slice(i, j).trim());
      break;
    }
  }
  return out.join(" ");
}

/** Toutes les annotations de texte et de marquage d'un document PDF, page par page. */
export async function lireAnnotations(doc: DocumentPdf): Promise<AnnotationPdf[]> {
  const out: AnnotationPdf[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const annotations = await page.getAnnotations();
    if (!annotations.length) continue;
    let contenu: ContenuTexte | null = null;
    for (const a of annotations) {
      const marquage = ["Highlight", "Underline", "Squiggly", "StrikeOut"].includes(a.subtype);
      let couvert = "";
      if (marquage) {
        contenu ??= await page.getTextContent();
        couvert = texteSous(contenu, rectangles(a));
      }
      out.push({
        page: n,
        sousType: a.subtype,
        contenu: a.contentsObj?.str ?? a.contents ?? "",
        auteur: a.titleObj?.str ?? a.title ?? "",
        date: a.modificationDate ?? "",
        couvert,
      });
    }
  }
  return out;
}
