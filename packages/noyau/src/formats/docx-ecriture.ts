/**
 * Écriture d'un document Word (.docx) simple : titres, paragraphes (gras, italique, indice, exposant, police à
 * chasse fixe), tableaux (cases fusionnées, filets façon booktabs), images PNG et légendes numérotées par Word
 * (champ SEQ, styles intégrés « heading 1 », « caption » : ils prennent le style du document où l'on colle).
 * Déterministe (même entrée → mêmes octets : dates du zip fixes), pour les tests.
 */
import { strToU8, zipSync } from "fflate";

const DATE_ZIP = new Date(1980, 0, 1);

export interface Morceau {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  indice?: boolean;
  exposant?: boolean;
  /** Police à chasse fixe (noms de fichiers). */
  fixe?: boolean;
}

export interface Case {
  morceaux: Morceau[];
  /** Nombre de colonnes couvertes (1 par défaut). */
  colonnes?: number;
}

export type Bloc =
  | { type: "titre"; niveau: 1 | 2 | 3; morceaux: Morceau[] }
  | { type: "paragraphe"; morceaux: Morceau[] }
  | { type: "legende"; genre: "Tableau" | "Table" | "Figure"; morceaux: Morceau[] }
  | { type: "tableau"; entetes: Case[][]; lignes: Case[][] }
  | { type: "image"; png: Uint8Array; largeur: number; hauteur: number };

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function run(m: Morceau): string {
  const pr = [
    m.fixe ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : "",
    m.gras ? "<w:b/>" : "",
    m.italique ? "<w:i/>" : "",
    m.indice ? '<w:vertAlign w:val="subscript"/>' : m.exposant ? '<w:vertAlign w:val="superscript"/>' : "",
  ].join("");
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${echapper(m.texte)}</w:t></w:r>`;
}

const runs = (ms: readonly Morceau[]) => ms.map(run).join("");
const para = (style: string | null, contenu: string, pPr = "") => `<w:p>${style || pPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${pPr}</w:pPr>` : ""}${contenu}</w:p>`;

/** Largeur utile d'une page A4 à marges de 2,5 cm, en EMU (16 cm). */
const LARGEUR_UTILE = 16 * 360000;

function image(rid: string, n: number, largeur: number, hauteur: number): string {
  const cx = Math.min(LARGEUR_UTILE, Math.round(largeur * 9525));
  const cy = Math.round((cx * hauteur) / Math.max(1, largeur));
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Image ${n}"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    "</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>"
  );
}

function tableau(entetes: Case[][], lignes: Case[][]): string {
  const n = Math.max(1, ...[...entetes, ...lignes].map((l) => l.reduce((s, c) => s + (c.colonnes ?? 1), 0)));
  const filet = (cote: string, taille: number) => `<w:${cote} w:val="single" w:sz="${taille}" w:space="0" w:color="000000"/>`;
  const ligne = (l: Case[], i: number, total: number, entete: boolean) =>
    `<w:tr>${entete ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${l
      .map((c) => {
        const bords = [i === 0 && (entete || !entetes.length) ? filet("top", 12) : "", i === total - 1 ? filet("bottom", entete ? 6 : 12) : ""].join("");
        return `<w:tc><w:tcPr>${c.colonnes && c.colonnes > 1 ? `<w:gridSpan w:val="${c.colonnes}"/>` : ""}${bords ? `<w:tcBorders>${bords}</w:tcBorders>` : ""}</w:tcPr>${para(null, runs(entete ? c.morceaux.map((m) => ({ ...m, gras: true })) : c.morceaux), '<w:spacing w:before="20" w:after="20"/><w:jc w:val="center"/>')}</w:tc>`;
      })
      .join("")}</w:tr>`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${Array.from({ length: n }, () => '<w:gridCol w:w="1200"/>').join("")}</w:tblGrid>` +
    entetes.map((l, i) => ligne(l, i, entetes.length, true)).join("") +
    lignes.map((l, i) => ligne(l, i, lignes.length, false)).join("") +
    "</w:tbl>"
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  [1, 2, 3]
    .map(
      (k) =>
        `<w:style w:type="paragraph" w:styleId="Heading${k}"><w:name w:val="heading ${k}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
        `<w:pPr><w:keepNext/><w:spacing w:before="${k === 1 ? 360 : 240}" w:after="120"/><w:jc w:val="left"/><w:outlineLvl w:val="${k - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${[32, 26, 24][k - 1]}"/></w:rPr></w:style>`,
    )
    .join("") +
  '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:qFormat/><w:pPr><w:spacing w:before="60" w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:style>' +
  "</w:styles>";

/** Le document : blocs dans l'ordre ; une légende de tableau se place avant lui, une légende de figure après l'image. */
export function ecrireDocx(blocs: readonly Bloc[]): Uint8Array {
  const corps: string[] = [];
  const medias: Record<string, Uint8Array> = {};
  const rels: string[] = ['<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
  let images = 0;
  // numéros des légendes déjà calculés (Word les recalcule de toute façon à la mise à jour des champs)
  const numeros = new Map<string, number>();
  for (const b of blocs) {
    if (b.type === "titre") corps.push(para(`Heading${b.niveau}`, runs(b.morceaux)));
    else if (b.type === "paragraphe") corps.push(para(null, runs(b.morceaux)));
    else if (b.type === "legende")
      corps.push(
        para(
          "Caption",
          run({ texte: `${b.genre} ` }) + `<w:fldSimple w:instr=" SEQ ${b.genre} \\* ARABIC "><w:r><w:t>${numeros.set(b.genre, (numeros.get(b.genre) ?? 0) + 1).get(b.genre)}</w:t></w:r></w:fldSimple>` + run({ texte: " – " }) + runs(b.morceaux),
          b.genre === "Figure" ? "" : "<w:keepNext/>",
        ),
      );
    else if (b.type === "tableau") corps.push(tableau(b.entetes, b.lignes));
    else {
      images++;
      const rid = `rIdImage${images}`;
      medias[`word/media/image${images}.png`] = b.png;
      rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${images}.png"/>`);
      corps.push(para(null, image(rid, images, b.largeur, b.hauteur), '<w:keepNext/><w:jc w:val="center"/>'));
    }
  }
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<w:body>${corps.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const fichiers: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(document),
    "word/styles.xml": strToU8(STYLES),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`,
    ),
    ...medias,
  };
  return zipSync(fichiers, { level: 6, mtime: DATE_ZIP });
}
