import { describe, expect, it } from "vitest";
import { assembler, deplacer, ecrireCarteMd, estIdCarte, lireCarteMd, lireIndex, nouvelId, type CarteFournie } from "./cartes";

const FOURNIES: CarteFournie[] = [
  { id: "a", titre: "A", texte: "texte A", sources: ["BIB-065"] },
  { id: "b", titre: "B", texte: "texte B" },
];

describe("cartes", () => {
  it("fichier Markdown : titre en première ligne, aller-retour", () => {
    expect(lireCarteMd("\n# Mon titre\n\nCorps\n- puce\n")).toEqual({ titre: "Mon titre", texte: "Corps\n- puce" });
    expect(lireCarteMd("pas de titre")).toEqual({ titre: "", texte: "pas de titre" });
    expect(lireCarteMd(ecrireCarteMd(" T ", " x "))).toEqual({ titre: "T", texte: "x" });
    expect(ecrireCarteMd("", "x")).toBe("# Sans titre\n\nx\n");
  });

  it("assemble fournies, modifiées, créées ; ordre de l'index d'abord ; masquées à part", () => {
    const fichiers = new Map([
      ["b", { titre: "B réécrite", texte: "mon texte" }],
      ["c-2", { titre: "Perso 2", texte: "…" }],
      ["c-1", { titre: "Perso 1", texte: "…" }],
    ]);
    const r = assembler(FOURNIES, fichiers, lireIndex({ ordre: ["c-2", "a"], masquees: ["b"] }));
    expect(r.visibles.map((c) => [c.id, c.origine])).toEqual([
      ["c-2", "perso"],
      ["a", "fournie"],
      ["c-1", "perso"],
    ]);
    expect(r.masquees).toMatchObject([{ id: "b", titre: "B réécrite", texte: "mon texte", origine: "modifiee" }]);
    expect(r.visibles[1]!.sources).toEqual(["BIB-065"]);
  });

  it("déplacer, identifiants, index abîmé", () => {
    expect(deplacer(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(deplacer(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(nouvelId(1_700_000_000_000)).toMatch(/^c-[0-9a-z]+$/);
    expect(estIdCarte(nouvelId(Date.now()))).toBe(true);
    expect(estIdCarte("../x")).toBe(false);
    expect(lireIndex("n'importe quoi")).toEqual({ ordre: [], masquees: [] });
  });
});
