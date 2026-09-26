/**
 * Données tabulaires (SPEC §10) : collage depuis Excel (texte tabulé), CSV, et conversion
 * des cellules en nombres avec virgule décimale et espaces de milliers.
 */

export type Cell = string | number | boolean | null;
export type Table = Cell[][];

/**
 * « 1,5 », « 1 234,5 », « 1.5e-3 », « −2 » → nombre ; vide ou texte → null.
 * Espaces (y compris insécables et fines) acceptés comme séparateurs de milliers.
 */
export function parseNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/[\s\u00a0\u202f]/g, "").replace(/−/g, "-");
  if (s === "") return null;
  // « 1.234,5 » (milliers avec point, décimale virgule) → 1234.5
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Séparateur probable : tabulation (collage Excel), sinon « ; », sinon « , ». */
export function detectSeparator(text: string): "\t" | ";" | "," {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 20);
  const count = (sep: string) => lines.reduce((s, l) => s + l.split(sep).length - 1, 0);
  if (count("\t") > 0) return "\t";
  if (count(";") > 0) return ";";
  return ",";
}

/**
 * Texte délimité → tableau de chaînes. Gère les guillemets CSV ("a;b", "" pour ").
 * Les cellules restent des chaînes : la conversion numérique se fait à la sélection des colonnes.
 */
export function parseDelimited(text: string, sep: "\t" | ";" | "," = detectSeparator(text)): Table {
  const rows: Table = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Lignes vides de fin retirées.
  while (rows.length > 0 && rows.at(-1)!.every((c) => c === "" || c === null)) rows.pop();
  return rows;
}

/** Vrai si la première ligne ressemble à des en-têtes (du texte au-dessus de nombres). */
export function looksLikeHeader(t: Table): boolean {
  if (t.length < 2) return false;
  const first = t[0]!;
  const second = t[1]!;
  return first.some((c, i) => typeof c === "string" && c.trim() !== "" && parseNumber(c) === null && parseNumber(second[i] ?? null) !== null);
}

/** Lettre(s) de colonne Excel → indice (A → 0, Z → 25, AA → 26). */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function columnLetters(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export interface ColumnPick {
  /** Ligne d'en-têtes (noms de séries) présente en tête de la plage. */
  header: boolean;
  /** Plage de lignes (indices à partir de 0, bornes incluses) ; par défaut tout. */
  firstRow?: number;
  lastRow?: number;
  x: number;
  ys: number[];
}

export interface ExtractedSeries {
  name: string;
  x: number[];
  y: number[];
  /** Lignes ignorées (valeur manquante ou non numérique). */
  skipped: number;
}

/** Extrait des séries (x commun, plusieurs y) ; les lignes incomplètes sont ignorées et comptées. */
export function extractSeries(t: Table, pick: ColumnPick): ExtractedSeries[] {
  const first = pick.firstRow ?? 0;
  const last = Math.min(pick.lastRow ?? t.length - 1, t.length - 1);
  const header = pick.header ? t[first] : undefined;
  const start = pick.header ? first + 1 : first;
  return pick.ys.map((col) => {
    const out: ExtractedSeries = { name: String(header?.[col] ?? columnLetters(col)).trim() || columnLetters(col), x: [], y: [], skipped: 0 };
    for (let r = start; r <= last; r++) {
      const row = t[r] ?? [];
      const x = parseNumber(row[pick.x] ?? null);
      const y = parseNumber(row[col] ?? null);
      if (x === null || y === null) {
        if (row.some((c) => c !== null && c !== "")) out.skipped++;
        continue;
      }
      out.x.push(x);
      out.y.push(y);
    }
    return out;
  });
}
