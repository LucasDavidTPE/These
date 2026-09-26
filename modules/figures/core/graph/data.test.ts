import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { columnIndex, columnLetters, detectSeparator, extractSeries, looksLikeHeader, parseDelimited, parseNumber } from "./table";
import { decodeText, readDataFile } from "./source";
import { readXlsx } from "./xlsx";

const fixtures = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "tests", "fixtures");

describe("nombres", () => {
  it("virgule décimale, espaces de milliers, notation scientifique", () => {
    expect(parseNumber("1,5")).toBe(1.5);
    expect(parseNumber("25 000,5")).toBe(25000.5);
    expect(parseNumber("25 000")).toBe(25000);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("1.5e-3")).toBe(0.0015);
    expect(parseNumber("−2")).toBe(-2);
    expect(parseNumber(3)).toBe(3);
    for (const bad of ["", "abc", "1,2,3", "12 mm", null, true]) expect(parseNumber(bad as never)).toBeNull();
  });
});

describe("texte collé / CSV", () => {
  it("collage depuis Excel (tabulations, virgule décimale)", () => {
    const t = parseDelimited("f (Hz)\tE* (MPa)\r\n0,1\t8 200\r\n1\t11 000\r\n\r\n");
    expect(detectSeparator("a\tb")).toBe("\t");
    expect(t).toEqual([["f (Hz)", "E* (MPa)"], ["0,1", "8 200"], ["1", "11 000"]]);
    expect(looksLikeHeader(t)).toBe(true);
  });

  it("CSV français (point-virgule) et guillemets", () => {
    const t = parseDelimited(readFileSync(join(fixtures, "module-fr.csv"), "utf8"));
    expect(t[0]).toEqual(["Température (°C)", "Module (MPa)"]);
    const [s] = extractSeries(t, { header: true, x: 0, ys: [1] });
    expect(s).toEqual({ name: "Module (MPa)", x: [-10, 0, 10, 20, 30], y: [25000.5, 18200, 11400, 6300.25, 3100], skipped: 0 });
    expect(parseDelimited('a,"b,c",d\n"x ""y""",2,3', ",")).toEqual([["a", "b,c", "d"], ['x "y"', "2", "3"]]);
  });

  it("colonnes Excel", () => {
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("AA")).toBe(26);
    expect(columnLetters(27)).toBe("AB");
  });
});

describe("classeur .xlsx", () => {
  it("fichier réel (openpyxl, chaînes en ligne) : feuilles, en-têtes, valeurs, trous", () => {
    const sheets = readXlsx(readFileSync(join(fixtures, "graph-essai.xlsx")));
    expect(sheets.map((s) => s.name)).toEqual(["Essai 1", "Module & phase"]);
    const essai = sheets[0]!.rows;
    expect(essai[0]).toEqual(["t (s)", "ε (µm/m)", "Remarque"]);
    expect(essai[1]).toEqual([0, 0, "ok"]);
    expect(essai[2]![2]).toBeNull();
    const [eps] = extractSeries(essai, { header: true, x: 0, ys: [1] });
    expect(eps!.x).toHaveLength(11);
    expect(eps!.skipped).toBe(1); // ligne « fin » sans valeurs
    const mod = sheets[1]!.rows;
    expect(mod[1]).toEqual([0.1, 8200, 1500, "1,5", true]);
    const series = extractSeries(mod, { header: true, x: 0, ys: [1, 2] });
    expect(series.map((s) => s.name)).toEqual(["E* (MPa) 10 °C", "E* (MPa) 30 °C"]);
    expect(series[1]!.y).toEqual([1500, 2600, 3400, 4600, 5900]);
  });

  it("chaînes partagées et texte enrichi, comme les écrit Excel", () => {
    const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`);
    const bytes = zipSync({
      "xl/workbook.xml": xml(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Données" sheetId="1" r:id="rId3"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": xml(`<Relationships><Relationship Id="rId3" Type="…/worksheet" Target="worksheets/feuille.xml"/></Relationships>`),
      "xl/sharedStrings.xml": xml(`<sst count="2" uniqueCount="2"><si><t>x</t></si><si><r><t>déform</t></r><r><rPr><b/></rPr><t xml:space="preserve">ation &amp; co</t></r></si></sst>`),
      "xl/worksheets/feuille.xml": xml(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
          `<row r="3"><c r="A3"><v>2.5</v></c><c r="C3" t="str"><f>A3*2</f><v>5</v></c><c r="D3" t="e"><v>#DIV/0!</v></c></row></sheetData></worksheet>`,
      ),
    });
    const [s] = readXlsx(bytes);
    expect(s!.name).toBe("Données");
    expect(s!.rows).toEqual([
      ["x", "déformation & co", null, null],
      [null, null, null, null],
      [2.5, null, "5", null],
    ]);
  });

  it("refuse un ancien .xls avec un message utile", () => {
    expect(() => readXlsx(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0]))).toThrow(/\.xls/);
  });
});

describe("source de données", () => {
  it("reconnaît classeur et texte, UTF-8 ou Windows-1252", () => {
    expect(readDataFile("essai.xlsx", readFileSync(join(fixtures, "graph-essai.xlsx"))).map((s) => s.name)).toEqual(["Essai 1", "Module & phase"]);
    const latin1 = Uint8Array.from([0x54, 0x65, 0x6d, 0x70, 0xe9, 0x72, 0x61, 0x74, 0x75, 0x72, 0x65, 0x3b, 0x45, 0x0a, 0x31, 0x3b, 0x32]);
    expect(decodeText(latin1)).toBe("Température;E\n1;2");
    expect(readDataFile("module.csv", latin1)[0]).toEqual({ name: "module", rows: [["Température", "E"], ["1", "2"]] });
    expect(() => readDataFile("vieux.xls", Uint8Array.from([0xd0, 0xcf]))).toThrow(".xls");
  });
});
