import { describe, expect, it } from "vitest";
import { generateCaption } from "./caption";
import { newMeta, type FigureMeta } from "./meta";
import { planRenumber } from "./renumber";
import type { FigureEntry } from "./scan";
import { EMPTY_FILTER, filterAndSort, lacksSourceOrLicense, matchesFilter, normalizeText, thumbnailFile } from "./search";

function entry(id: string, patch: Partial<FigureMeta> = {}, files: string[] = ["meta.json"]): FigureEntry {
  const meta = { ...newMeta({ id, title: `Figure ${id}`, kind: "schema", now: "2026-09-01T10:00:00Z", host: "PC" }), ...patch } as FigureMeta;
  return { folder: `${id}_x`, id, meta, files, conflicts: [], leftovers: [], lock: null };
}

describe("normalizeText", () => {
  it("ignore casse et accents", () => {
    expect(normalizeText("  Chaussée  SOUPLE — Œuvre ")).toBe("chaussee souple — oeuvre");
  });
});

describe("matchesFilter", () => {
  const a = entry("FIG-0001", {
    title: "Structure de chaussée souple",
    tags: ["MAIREINFRA", "bogie"],
    source: { type: "article", author: "De Beer et al.", year: 1997, bib: "BIB-042" },
    license: "CC-BY",
  });

  it("cherche dans titre, tags, source et ID, sans accents", () => {
    for (const q of ["chaussee", "CHAUSSÉE souple", "mairein", "beer 1997", "BIB-042", "fig-0001"]) {
      expect(matchesFilter(a, { ...EMPTY_FILTER, query: q }), q).toBe(true);
    }
    expect(matchesFilter(a, { ...EMPTY_FILTER, query: "chaussée rigide" })).toBe(false);
  });

  it("filtre par type", () => {
    expect(matchesFilter(a, { ...EMPTY_FILTER, kinds: ["schema"] })).toBe(true);
    expect(matchesFilter(a, { ...EMPTY_FILTER, kinds: ["image", "graph"] })).toBe(false);
  });

  it("filtre « sans source ou sans licence »", () => {
    expect(lacksSourceOrLicense(a)).toBe(false);
    expect(lacksSourceOrLicense(entry("FIG-0002"))).toBe(true);
    expect(lacksSourceOrLicense(entry("FIG-0003", { source: { type: "web", url: "https://x.org" } }))).toBe(true);
    expect(lacksSourceOrLicense(entry("FIG-0004", { source: { type: "web" }, license: "Inconnue" }))).toBe(true);
    expect(lacksSourceOrLicense(entry("FIG-0005", { source: { type: "own" } }))).toBe(false);
    expect(lacksSourceOrLicense({ ...entry("FIG-0006"), meta: null })).toBe(true);
  });
});

describe("filterAndSort", () => {
  const list = [
    entry("FIG-0002", { title: "Béton", modified: "2026-09-03T10:00:00+02:00" }),
    entry("FIG-0010", { title: "alpha", modified: "2026-09-03T09:00:00Z" }),
    entry("FIG-0001", { title: "Zèbre", modified: "2026-09-01T10:00:00Z" }),
  ];

  it("trie par ID numérique, titre ou date", () => {
    expect(filterAndSort(list, EMPTY_FILTER, "id").map((e) => e.id)).toEqual(["FIG-0001", "FIG-0002", "FIG-0010"]);
    expect(filterAndSort(list, EMPTY_FILTER, "title").map((e) => e.id)).toEqual(["FIG-0010", "FIG-0002", "FIG-0001"]);
    // 10:00+02:00 = 08:00Z, donc FIG-0010 (09:00Z) est la plus récente.
    expect(filterAndSort(list, EMPTY_FILTER, "modified").map((e) => e.id)).toEqual(["FIG-0010", "FIG-0002", "FIG-0001"]);
  });
});

describe("thumbnailFile", () => {
  it("préfère export.png, puis export.svg, puis original.png", () => {
    expect(thumbnailFile(entry("FIG-0001", {}, ["original.png", "export.svg", "export.png"]))).toBe("export.png");
    expect(thumbnailFile(entry("FIG-0001", {}, ["original.png", "export.svg"]))).toBe("export.svg");
    expect(thumbnailFile(entry("FIG-0001", {}, ["original.png"]))).toBe("original.png");
    expect(thumbnailFile(entry("FIG-0001", {}, ["meta.json"]))).toBeNull();
  });
});

describe("generateCaption", () => {
  it("auteur et année", () => {
    expect(generateCaption({ type: "article", author: "De Beer et al.", year: 1997 })).toBe("Adapté de De Beer et al. (1997).");
    expect(generateCaption({ type: "article", author: "Huang" })).toBe("Adapté de Huang.");
  });

  it("à défaut, le site web", () => {
    expect(generateCaption({ type: "web", url: "https://www.Example.org/a/b.png" })).toBe("Adapté de example.org.");
  });

  it("rien pour une figure personnelle ou sans information", () => {
    expect(generateCaption({ type: "own", author: "Moi" })).toBe("");
    expect(generateCaption({ type: "web" })).toBe("");
    expect(generateCaption(undefined)).toBe("");
  });
});

describe("planRenumber", () => {
  it("renomme le dossier et réécrit l'ID", () => {
    const meta = newMeta({ id: "FIG-0005", title: "Maison", kind: "image", now: "2026-09-01T10:00:00Z", host: "PC-MAISON" });
    const ops = planRenumber("FIG-0005_maison", meta, "FIG-0006", "2026-09-02T10:00:00Z", "PC-TRAVAIL");
    expect(ops[0]).toEqual({ op: "rename", from: "FIG-0005_maison", to: "FIG-0006_maison" });
    expect(ops[1]!.op).toBe("write");
    if (ops[1]!.op === "write") {
      expect(JSON.parse(ops[1]!.content)).toMatchObject({ id: "FIG-0006", last_host: "PC-TRAVAIL", created: "2026-09-01T10:00:00Z" });
      expect(ops[1]!.path).toBe("FIG-0006_maison/meta.json");
    }
  });
});
