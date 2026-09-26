import { describe, expect, it } from "vitest";
import { FIGURE_FILES, LIBRARY_FILE, detectConflictCopy, isLeftoverTemp, planConflictResolution } from "./conflicts";

describe("detectConflictCopy", () => {
  it("reconnaît les copies OneDrive avec le nom du poste", () => {
    expect(detectConflictCopy("figure-PC-MAISON.json", FIGURE_FILES)).toEqual({
      original: "figure.json",
      copy: "figure-PC-MAISON.json",
      tag: "PC-MAISON",
    });
    expect(detectConflictCopy("meta-DESKTOP-4F2K9QZ-1.json", FIGURE_FILES)?.tag).toBe("DESKTOP-4F2K9QZ-1");
    expect(detectConflictCopy("export-LAPTOP.png", FIGURE_FILES)?.original).toBe("export.png");
    expect(detectConflictCopy("original-PC.png", FIGURE_FILES)?.original).toBe("original.png");
    expect(detectConflictCopy("graph-PC-MAISON.json", FIGURE_FILES)?.original).toBe("graph.json");
    expect(detectConflictCopy("figurine-library-PC-TRAVAIL.json", [LIBRARY_FILE])?.original).toBe(LIBRARY_FILE);
  });

  it("reconnaît les copies de l'Explorateur", () => {
    expect(detectConflictCopy("meta (2).json", FIGURE_FILES)?.tag).toBe("(2)");
    expect(detectConflictCopy("meta - Copie.json", FIGURE_FILES)?.tag).toBe("Copie");
    expect(detectConflictCopy("meta - Copie (3).json", FIGURE_FILES)?.tag).toBe("Copie (3)");
    expect(detectConflictCopy("export - Copy.svg", FIGURE_FILES)?.tag).toBe("Copy");
  });

  it("tolère une extension en majuscules", () => {
    expect(detectConflictCopy("export-PC.PNG", FIGURE_FILES)?.original).toBe("export.png");
  });

  it("ignore les fichiers canoniques et les étrangers", () => {
    for (const name of [...FIGURE_FILES, "notes.txt", "figure.json.tmp", "metadata.json", "meta-.json", "export-PC.pdf", "exporter-PC.tex"]) {
      expect(detectConflictCopy(name, FIGURE_FILES)).toBeNull();
    }
  });
});

describe("isLeftoverTemp", () => {
  it("repère les fichiers temporaires", () => {
    expect(isLeftoverTemp("meta.json.tmp")).toBe(true);
    expect(isLeftoverTemp("meta.json")).toBe(false);
  });
});

describe("planConflictResolution", () => {
  const conflict = { original: "meta.json", copy: "meta-PC-MAISON.json", tag: "PC-MAISON" };

  it("garder l'original : la copie part dans .conflits", () => {
    expect(planConflictResolution("FIG-0001_a", conflict, "original", "2026-09-25T17:02:00", false)).toEqual([
      { op: "mkdir", path: "FIG-0001_a/.conflits" },
      { op: "rename", from: "FIG-0001_a/meta-PC-MAISON.json", to: "FIG-0001_a/.conflits/2026-09-25T17-02-00_meta-PC-MAISON.json" },
    ]);
  });

  it("garder la copie : l'original est archivé puis remplacé", () => {
    expect(planConflictResolution("FIG-0001_a", conflict, "copy", "S", true)).toEqual([
      { op: "rename", from: "FIG-0001_a/meta.json", to: "FIG-0001_a/.conflits/S_meta.json" },
      { op: "rename", from: "FIG-0001_a/meta-PC-MAISON.json", to: "FIG-0001_a/meta.json" },
    ]);
  });
});
