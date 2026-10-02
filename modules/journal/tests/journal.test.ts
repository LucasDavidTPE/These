import { describe, expect, it } from "vitest";
import { ajouterTache, basculer, decaler, nouvelleNote, precedent, taches, titreJour } from "../core/journal";

const NOTE = "# lundi\n\n## À faire\n- [ ] relire chap. 2\n- [x] envoyer mail\n\n## Notes\nRAS\n- [ ] autre tâche";

describe("journal", () => {
  it("lit et coche les tâches, sans toucher au reste", () => {
    expect(taches(NOTE).map((t) => [t.ligne, t.fait, t.texte])).toEqual([
      [3, false, "relire chap. 2"],
      [4, true, "envoyer mail"],
      [8, false, "autre tâche"],
    ]);
    const b = basculer(NOTE, 3);
    expect(taches(b)[0]!.fait).toBe(true);
    expect(basculer(b, 3)).toBe(NOTE);
    expect(basculer(NOTE, 1)).toBe(NOTE);
  });

  it("ajoute une tâche à la fin de « À faire », ou crée la section", () => {
    expect(ajouterTache(NOTE, "  caler 2S2P1D ").split("\n").slice(3, 7)).toEqual(["- [ ] relire chap. 2", "- [x] envoyer mail", "- [ ] caler 2S2P1D", ""]);
    expect(ajouterTache("# x\n\ntexte", "t")).toBe("# x\n\ntexte\n\n## À faire\n- [ ] t\n");
    expect(ajouterTache(NOTE, "  ")).toBe(NOTE);
  });

  it("nouvelle note : titre du jour et tâches non faites reportées", () => {
    const n = nouvelleNote("2026-09-29", NOTE);
    expect(n.startsWith("# mardi 29 septembre 2026\n")).toBe(true);
    expect(taches(n).map((t) => t.texte)).toEqual(["relire chap. 2", "autre tâche"]);
    expect(taches(nouvelleNote("2026-09-29", null))).toEqual([]);
  });

  it("dates : décalage, jour précédent existant, titre", () => {
    expect(decaler("2026-09-30", 1)).toBe("2026-10-01");
    expect(decaler("2026-03-01", -1)).toBe("2026-02-28");
    expect(precedent(["2026-09-25", "2026-09-28", "2026-09-29"], "2026-09-29")).toBe("2026-09-28");
    expect(precedent(["2026-09-30"], "2026-09-29")).toBeNull();
    expect(titreJour("2026-10-05")).toBe("lundi 5 octobre 2026");
  });
});
