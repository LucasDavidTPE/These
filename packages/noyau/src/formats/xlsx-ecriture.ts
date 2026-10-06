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

/** Présentation facultative d'une feuille (sans elle, le classeur reste le plus simple possible). */
export interface MiseEnForme {
  /** Largeur des colonnes, en caractères. */
  largeurs?: readonly number[];
  /** Colonnes figées à gauche (l'en-tête est toujours figé). */
  figerColonnes?: number;
  /** Filtre automatique sur l'en-tête. */
  filtre?: boolean;
  /** Texte renvoyé à la ligne, aligné en haut. */
  retour?: boolean;
  /** Colonnes calculées ou repères, sur fond gris (modifications ignorées). */
  grisees?: readonly number[];
  /** Listes déroulantes : valeurs permises dans une colonne. */
  listes?: readonly { colonne: number; valeurs: readonly string[] }[];
  /** Zéros sur fond orangé (cases vides d'un croisement). */
  zerosEnEvidence?: boolean;
  /** Lignes de données affichées comme des titres (indices dans `lignes`), en gras. */
  lignesTitres?: readonly number[];
}

export interface Feuille {
  nom: string;
  entetes: readonly string[];
  /** `null` ou nombre non fini → cellule vide. */
  lignes: readonly (readonly Valeur[])[];
  mise?: MiseEnForme;
}

/** Styles (cellXfs) : 1 en-tête, 2 texte renvoyé, 3 grisé, 4 zéro mis en évidence, 5 titre. */
const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF8EA9DB"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  '<xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/** Nom de feuille permis par Excel : 31 caractères, sans \ / ? * [ ] :. */
const nomFeuille = (nom: string) => nom.replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "Feuille1";

function vue(m: MiseEnForme | undefined): string {
  const x = m?.figerColonnes ?? 0;
  if (!x) return '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${x}" ySplit="1" topLeftCell="${colonne(x)}2" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight" activeCell="${colonne(x)}2" sqref="${colonne(x)}2"/></sheetView></sheetViews>`;
}

function xmlFeuille(f: Feuille): string {
  if (f.lignes.length + 1 > LIGNES_MAX_EXCEL) throw new Error(`Trop de lignes pour Excel (${f.lignes.length.toLocaleString("fr-FR")}, 1 048 575 au plus).`);
  const m = f.mise;
  const grisees = new Set(m?.grisees ?? []);
  const titres = new Set(m?.lignesTitres ?? []);
  const cols = m?.largeurs?.length ? `<cols>${m.largeurs.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const s = (style: number) => (m ? ` s="${style}"` : "");
  const xml: string[] = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vue(m)}${cols}<sheetData>`,
    `<row r="1">${f.entetes.map((e, j) => `<c r="${colonne(j)}1"${s(1)} t="inlineStr"><is><t>${echapper(e)}</t></is></c>`).join("")}</row>`,
  ];
  const lettres = f.entetes.map((_, j) => colonne(j));
  f.lignes.forEach((l, i) => {
    const r = i + 2;
    let cellules = "";
    l.forEach((v, j) => {
      const ref = `${lettres[j] ?? colonne(j)}${r}`;
      const style = !m ? 0 : titres.has(i) ? 5 : grisees.has(j) ? 3 : m.zerosEnEvidence && v === 0 ? 4 : m.retour ? 2 : 0;
      const st = style ? ` s="${style}"` : "";
      if (typeof v === "number" && Number.isFinite(v)) cellules += `<c r="${ref}"${st}><v>${v}</v></c>`;
      else if (typeof v === "string" && v !== "") cellules += `<c r="${ref}"${st} t="inlineStr"><is><t${/^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : ""}>${echapper(v)}</t></is></c>`;
      else if (style === 3) cellules += `<c r="${ref}"${st}/>`;
    });
    xml.push(`<row r="${r}">${cellules}</row>`);
  });
  xml.push("</sheetData>");
  const derniere = colonne(Math.max(0, f.entetes.length - 1));
  if (m?.filtre && f.entetes.length) xml.push(`<autoFilter ref="A1:${derniere}${f.lignes.length + 1}"/>`);
  const listes = (m?.listes ?? []).filter((x) => x.valeurs.length);
  if (listes.length) {
    xml.push(`<dataValidations count="${listes.length}">`);
    for (const x of listes) {
      const c = colonne(x.colonne);
      const valeurs = x.valeurs.map((v) => v.replace(/[",]/g, " ")).join(",");
      xml.push(`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorStyle="warning" sqref="${c}2:${c}${Math.max(1000, f.lignes.length + 500)}"><formula1>"${echapper(valeurs.slice(0, 250))}"</formula1></dataValidation>`);
    }
    xml.push("</dataValidations>");
  }
  xml.push("</worksheet>");
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
  const styles = feuilles.some((f) => f.mise);
  const fichiers: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${numeros.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}${styles ? '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' : ""}</Types>`,
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${numeros.map((i) => `<sheet name="${echapper(noms[i - 1]!)}" sheetId="${i}" r:id="rId${i}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${numeros.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}${styles ? `<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` : ""}</Relationships>`,
    ),
  };
  feuilles.forEach((f, i) => (fichiers[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlFeuille(f))));
  if (styles) fichiers["xl/styles.xml"] = strToU8(STYLES);
  return zipSync(fichiers, { level: 6, mtime: DATE_ZIP });
}

/** Classeur d'une seule feuille de nombres. */
export function ecrireXlsx(feuille: string, entetes: readonly string[], lignes: readonly (readonly (number | null)[])[]): Uint8Array {
  return ecrireClasseur([{ nom: feuille, entetes, lignes }]);
}
