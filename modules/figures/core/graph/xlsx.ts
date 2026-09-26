/**
 * Lecture des classeurs .xlsx (Office Open XML) : un zip de fichiers XML. Seules les
 * valeurs sont lues (pas les formats ni les formules : leur dernière valeur calculée).
 * Sans DOM : analyse par expressions régulières du XML produit par Excel / LibreOffice.
 */
import { strFromU8, unzipSync } from "fflate";
import { columnIndex, type Cell, type Table } from "./table";

export interface Sheet {
  name: string;
  rows: Table;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : undefined;
}

/** Texte d'un élément contenant des <t> (texte simple ou enrichi <r><t>). */
function textOf(xml: string): string {
  let out = "";
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) out += decodeXml(m[1] ?? "");
  return out;
}

function sharedStrings(files: Record<string, Uint8Array>): string[] {
  const f = files["xl/sharedStrings.xml"];
  if (!f) return [];
  return [...strFromU8(f).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]!));
}

function resolveTarget(target: string): string {
  const t = target.replace(/^\/?xl\//, "").replace(/^\//, "");
  return `xl/${t}`;
}

/** Feuilles du classeur, dans l'ordre des onglets. */
export function readXlsx(bytes: Uint8Array): Sheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("Fichier .xlsx illisible (archive invalide). Les anciens .xls ne sont pas pris en charge : les enregistrer en .xlsx.");
  }
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new Error("Fichier .xlsx invalide (xl/workbook.xml absent).");
  const rels = files["xl/_rels/workbook.xml.rels"] ? strFromU8(files["xl/_rels/workbook.xml.rels"]) : "";
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relTarget.set(id, resolveTarget(target));
  }
  const strings = sharedStrings(files);
  const sheets: Sheet[] = [];
  let n = 0;
  for (const m of strFromU8(wb).matchAll(/<sheet\b[^>]*\/?>/g)) {
    n++;
    const name = attr(m[0], "name") ?? `Feuille ${n}`;
    const rid = attr(m[0], "r:id");
    const path = (rid && relTarget.get(rid)) ?? `xl/worksheets/sheet${n}.xml`;
    const f = files[path];
    sheets.push({ name, rows: f ? readSheet(strFromU8(f), strings) : [] });
  }
  return sheets;
}

function readSheet(xml: string, strings: string[]): Table {
  const rows: Table = [];
  let maxCol = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rAttr = attr(rm[0], "r");
    const rIndex = rAttr ? Number(rAttr) - 1 : rows.length;
    const cells: Cell[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const open = `<c${cm[1]}>`;
      const ref = attr(open, "r");
      const col = ref ? columnIndex(/^[A-Z]+/i.exec(ref)![0]) : nextCol;
      nextCol = col + 1;
      const type = attr(open, "t") ?? "n";
      const body = cm[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === "s") value = v !== undefined ? (strings[Number(v)] ?? null) : null;
      else if (type === "inlineStr") value = textOf(body);
      else if (type === "str") value = v !== undefined ? decodeXml(v) : null;
      else if (type === "b") value = v === "1";
      else if (type === "e") value = null;
      else if (v !== undefined) value = Number(v);
      cells[col] = value;
      maxCol = Math.max(maxCol, col + 1);
    }
    rows[rIndex] = cells;
  }
  // Lignes et cellules manquantes → null ; tableau rectangulaire.
  const out: Table = [];
  for (let r = 0; r < rows.length; r++) {
    const src = rows[r] ?? [];
    out.push(Array.from({ length: maxCol }, (_, c) => src[c] ?? null));
  }
  while (out.length > 0 && out.at(-1)!.every((c) => c === null)) out.pop();
  return out;
}
