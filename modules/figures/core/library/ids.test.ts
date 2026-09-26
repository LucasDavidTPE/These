import { describe, expect, it } from "vitest";
import {
  figureFolderName,
  formatFigureId,
  nextFigureId,
  parseFigureId,
  parseFolderName,
  slugify,
} from "./ids";

describe("parseFigureId / formatFigureId", () => {
  it("fait l'aller-retour", () => {
    expect(parseFigureId("FIG-0007")).toBe(7);
    expect(formatFigureId(7)).toBe("FIG-0007");
    expect(formatFigureId(12345)).toBe("FIG-12345");
    expect(parseFigureId("FIG-12345")).toBe(12345);
  });

  it("refuse les formes invalides", () => {
    for (const bad of ["FIG-7", "fig-0007", "FIG-0000", "FIG-00a7", "FIG-0007 ", "BIB-0007", ""]) {
      expect(parseFigureId(bad)).toBeNull();
    }
    expect(() => formatFigureId(0)).toThrow(RangeError);
    expect(() => formatFigureId(1.5)).toThrow(RangeError);
  });
});

describe("nextFigureId", () => {
  it("vaut FIG-0001 pour une bibliothèque vide", () => {
    expect(nextFigureId([])).toBe("FIG-0001");
  });

  it("prend max + 1, même avec des trous", () => {
    expect(nextFigureId(["FIG-0002", "FIG-0010", "FIG-0003"])).toBe("FIG-0011");
  });

  it("ignore les ID illisibles", () => {
    expect(nextFigureId(["FIG-0004", "brouillon", "FIG-99"])).toBe("FIG-0005");
  });

  it("dépasse 9999 sans casser", () => {
    expect(nextFigureId(["FIG-9999"])).toBe("FIG-10000");
  });
});

describe("slugify", () => {
  it("retire accents, ponctuation et majuscules", () => {
    expect(slugify("Structure de chaussée souple sous bogie A340")).toBe("structure-de-chaussee-souple-sous-bogie");
    expect(slugify("Module E* — 2S2P1D (15 °C)")).toBe("module-e-2s2p1d-15-c");
    expect(slugify("Cœur de l'œuvre")).toBe("coeur-de-l-oeuvre");
  });

  it("limite la longueur en coupant sur un mot", () => {
    const s = slugify("un titre vraiment très long qui dépasse largement la limite fixée");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s).toBe("un-titre-vraiment-tres-long-qui-depasse");
  });

  it("peut être vide", () => {
    expect(slugify("  —  ")).toBe("");
  });
});

describe("figureFolderName / parseFolderName", () => {
  it("compose et décompose", () => {
    const name = figureFolderName("FIG-0007", "Structure A340");
    expect(name).toBe("FIG-0007_structure-a340");
    expect(parseFolderName(name)).toEqual({ id: "FIG-0007", slug: "structure-a340" });
  });

  it("accepte un titre sans slug", () => {
    expect(figureFolderName("FIG-0008", "???")).toBe("FIG-0008");
    expect(parseFolderName("FIG-0008")).toEqual({ id: "FIG-0008", slug: "" });
  });

  it("rejette les dossiers étrangers", () => {
    expect(parseFolderName("Mes images")).toBeNull();
    expect(parseFolderName("FIG-12_x")).toBeNull();
    expect(parseFolderName(".git")).toBeNull();
  });
});
