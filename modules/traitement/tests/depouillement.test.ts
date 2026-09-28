import { describe, expect, it } from "vitest";
import { cheminDepouillement, lireDepouillement } from "../core/depouillement";

describe("dépouillements enregistrés", () => {
  it("nom de fichier lisible, lecture tolérante", () => {
    expect(cheminDepouillement("Module complexe B2C4", "e1")).toBe("traitement/module-complexe-b2c4-e1.json");
    expect(lireDepouillement({ source: "recherche:a.csv", projet: { version: 2 } }).nom).toBe("essai");
    expect(() => lireDepouillement({ projet: {} })).toThrow("source");
  });
});
