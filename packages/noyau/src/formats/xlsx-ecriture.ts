/**
 * Écriture d'un classeur .xlsx : une ou plusieurs feuilles, en-têtes (texte) puis nombres
 * ou textes. Déterministe (même entrée → mêmes octets : dates du zip fixes), pour les tests
 * golden (SPEC §11).
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

export type Valeur = number | string | null;

export interface Feuille {
  nom: string;
  entetes: readonly string[];
  /** `null` ou nombre non fini → cellule vide. */
  lignes: readonly (readonly Valeur[])[];
}

/** Nom de feuille permis par Excel : 31 caractères, sans \ / ? * [ ] :. */
const nomFeuille = (nom: string) => nom.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Feuille1";

function xmlFeuille(f: Feuille): string {
  if (f.lignes.length + 1 > LIGNES_MAX_EXCEL) throw new Error(`Trop de lignes pour Excel (${f.lignes.length.toLocaleString("fr-FR")}, 1 048 575 au plus).`);
  const xml: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>',
    `<row r="1">${f.entetes.map((e, j) => `<c r="${colonne(j)}1" t="inlineStr"><is><t>${echapper(e)}</t></is></c>`).join("")}</row>`,
  ];
  const lettres = f.entetes.map((_, j) => colonne(j));
  f.lignes.forEach((l, i) => {
    const r = i + 2;
    let cellules = "";
    l.forEach((v, j) => {
      const ref = `${lettres[j] ?? colonne(j)}${r}`;
      if (typeof v === "number" && Number.isFinite(v)) cellules += `<c r="${ref}"><v>${v}</v></c>`;
      else if (typeof v === "string" && v !== "") cellules += `<c r="${ref}" t="inlineStr"><is><t>${echapper(v)}</t></is></c>`;
    });
    xml.push(`<row r="${r}">${cellules}</row>`);
  });
  xml.push("</sheetData></worksheet>");
  return xml.join("");
}

/** Classeur de plusieurs feuilles, dans l'ordre donné (noms rendus uniques). */
export function ecrireClasseur(feuilles: readonly Feuille[]): Uint8Array {
  if (!feuilles.length) throw new Error("Un classeur a au moins une feuille.");
  const noms: string[] = [];
  for (const f of feuilles) {
    let n = nomFeuille(f.nom);
    for (let k = 2; noms.some((x) => x.toLowerCase() === n.toLowerCase()); k++) n = `${nomFeuille(f.nom).slice(0, 28)} (${k})`;
    noms.push(n);
  }
  const numeros = feuilles.map((_, i) => i + 1);
  const fichiers: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${numeros.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${numeros.map((i) => `<sheet name="${echapper(noms[i - 1]!)}" sheetId="${i}" r:id="rId${i}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${numeros.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}</Relationships>`,
    ),
  };
  feuilles.forEach((f, i) => (fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlFeuille(f))));
  return zipSync(fichiers, { level: 6, mtime: DATE_ZIP });
}

/** Classeur d'une seule feuille de nombres. */
export function ecrireXlsx(feuille: string, entetes: readonly string[], lignes: readonly (readonly (number | null)[])[]): Uint8Array {
  return ecrireClasseur([{ nom: feuille, entetes, lignes }]);
}
