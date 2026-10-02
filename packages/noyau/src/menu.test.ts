import { describe, expect, it } from "vitest";
import { sectionsDu, SECTIONS } from "./menu";
import { MODULES } from "./produits";

describe("menu en sections", () => {
  it("chaque module du produit Thèse a sa section, une seule", () => {
    const places = SECTIONS.flatMap((s) => s.modules);
    expect([...places].sort()).toEqual([...MODULES].sort());
  });

  it("garde l'ordre, retire les sections vides, range l'inconnu dans « Autres »", () => {
    expect(sectionsDu(["figures", "traitement"])).toEqual([
      { titre: "Essais", modules: ["traitement"] },
      { titre: "Outils", modules: ["figures"] },
    ]);
    expect(sectionsDu(["accueil", "nouveau"]).map((s) => s.titre)).toEqual(["Accueil", "Autres"]);
  });
});
