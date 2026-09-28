import { describe, expect, it } from "vitest";
import { cheminDepouillement, lireDepouillement, localiserSource, sourceDepuisChemin } from "../core/depouillement";

const racines = { recherche: "C:\\Users\\DAVID\\Desktop\\Recherche" };

describe("dépouillements enregistrés", () => {
  it("la source est une référence de racine quand c'est possible", () => {
    expect(sourceDepuisChemin("C:\\Users\\DAVID\\Desktop\\Recherche\\B2C4\\Essai1.csv", racines)).toBe("recherche:B2C4/Essai1.csv");
    expect(sourceDepuisChemin("D:\\clé\\Essai2.csv", racines)).toBe("D:\\clé\\Essai2.csv");
  });

  it("et se retrouve sur le poste : dossier + fichier", () => {
    expect(localiserSource("recherche:B2C4/Essai1.csv", racines)).toEqual({ ok: true, dossier: "C:\\Users\\DAVID\\Desktop\\Recherche\\B2C4", fichier: "Essai1.csv" });
    expect(localiserSource("D:\\clé\\Essai2.csv", racines)).toEqual({ ok: true, dossier: "D:\\clé", fichier: "Essai2.csv" });
    expect(localiserSource("essais:x/y.csv", racines)).toMatchObject({ ok: false });
  });

  it("nom de fichier lisible, lecture tolérante", () => {
    expect(cheminDepouillement("Module complexe B2C4", "e1")).toBe("traitement/module-complexe-b2c4-e1.json");
    expect(lireDepouillement({ source: "recherche:a.csv", projet: { version: 2 } }).nom).toBe("essai");
    expect(() => lireDepouillement({ projet: {} })).toThrow("source");
  });
});
