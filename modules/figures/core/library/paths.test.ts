import { describe, expect, it } from "vitest";
import { isSafeRelativePath, joinPath } from "./paths";

describe("isSafeRelativePath", () => {
  it("accepte les chemins relatifs, espaces et accents compris", () => {
    for (const ok of ["meta.json", "FIG-0001_a/meta.json", "Dossier é/Fichier à.png", "a\\b"]) {
      expect(isSafeRelativePath(ok)).toBe(true);
    }
  });

  it("refuse absolus, lecteurs, remontées et vides", () => {
    for (const bad of ["", "/etc/passwd", "\\\\serveur\\partage", "C:\\Users\\Lucas", "c:x", "../x", "a/../../b", "a//b", "a/./b", "a/"]) {
      expect(isSafeRelativePath(bad)).toBe(false);
    }
  });
});

describe("joinPath", () => {
  it("joint avec / et ignore la racine vide", () => {
    expect(joinPath("", "FIG-0001", "meta.json")).toBe("FIG-0001/meta.json");
  });
});
