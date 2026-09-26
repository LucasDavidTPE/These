/**
 * Écriture d'un classeur .xlsx d'une feuille : en-têtes (texte) puis nombres. Déterministe
 * (même entrée → mêmes octets : dates du zip fixes), pour les tests golden (SPEC §11).
 */
import { strToU8, zipSync } from "fflate";

const DATE_ZIP = new Date(1980, 0, 1);

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colonne(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Nombre de lignes maximal d'une feuille Excel (en-tête compris). */
export const LIGNES_MAX_EXCEL = 1_048_576;

/**
 * `lignes` : une ligne par tableau ; `null` ou non fini → cellule vide.
 * Le nom de feuille est tronqué à 31 caractères et nettoyé (règles d'Excel).
 */
export function ecrireXlsx(feuille: string, entetes: readonly string[], lignes: readonly (readonly (number | null)[])[]): Uint8Array {
  if (lignes.length + 1 > LIGNES_MAX_EXCEL) throw new Error(`Trop de lignes pour Excel (${lignes.length.toLocaleString("fr-FR")}, 1 048 575 au plus).`);
  const nom = feuille.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Feuille1";
  const xml: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>',
    `<row r="1">${entetes.map((e, j) => `<c r="${colonne(j)}1" t="inlineStr"><is><t>${echapper(e)}</t></is></c>`).join("")}</row>`,
  ];
  const lettres = entetes.map((_, j) => colonne(j));
  lignes.forEach((l, i) => {
    const r = i + 2;
    let cellules = "";
    l.forEach((v, j) => {
      if (v !== null && Number.isFinite(v)) cellules += `<c r="${lettres[j] ?? colonne(j)}${r}"><v>${v}</v></c>`;
    });
    xml.push(`<row r="${r}">${cellules}</row>`);
  });
  xml.push("</sheetData></worksheet>");
  const fichiers: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${echapper(nom)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/worksheets/sheet1.xml": strToU8(xml.join("")),
  };
  return zipSync(fichiers, { level: 6, mtime: DATE_ZIP });
}
