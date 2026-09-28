import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";
import { ecrireXlsx } from "./xlsx-ecriture";

describe("ecrireXlsx", () => {
  it("relu à l'identique ; cellules vides pour NaN / null ; déterministe", () => {
    const lignes = [
      [0, 1.5, -2e-7],
      [0.25, NaN, 3],
      [0.5, null, 4],
    ];
    const octets = ecrireXlsx("Essai1 : suivi/brut", ["Temps (h)", "Force (kN)", "Déformation <A> & \"B\""], lignes);
    const [f] = readXlsx(octets);
    expect(f!.name).toBe("Essai1 _ suivi_brut");
    expect(f!.rows[0]).toEqual(["Temps (h)", "Force (kN)", "Déformation <A> & \"B\""]);
    expect(f!.rows[1]).toEqual([0, 1.5, -2e-7]);
    expect(f!.rows[2]?.[0]).toBe(0.25);
    expect(f!.rows[2]?.[1] ?? null).toBeNull();
    expect(f!.rows[3]?.[2]).toBe(4);
    expect(ecrireXlsx("Essai1 : suivi/brut", ["Temps (h)", "Force (kN)", "Déformation <A> & \"B\""], lignes)).toEqual(octets);
  });
});

describe("ecrireClasseur", () => {
  it("plusieurs feuilles, textes et nombres, noms uniques", async () => {
    const { ecrireClasseur } = await import("./xlsx-ecriture");
    const octets = ecrireClasseur([
      { nom: "COMSOL", entetes: ["arc_length", "UX"], lignes: [[0, 1.5], [1, null]] },
      { nom: "UX", entetes: ["Source", "x", "Valeur"], lignes: [["COMSOL", 0, 1.5], ["Viscoroute", 0, 1.4]] },
      { nom: "ux", entetes: ["a"], lignes: [] },
    ]);
    const f = readXlsx(octets);
    expect(f.map((x) => x.name)).toEqual(["COMSOL", "UX", "ux (2)"]);
    expect(f[1]!.rows[2]).toEqual(["Viscoroute", 0, 1.4]);
  });
});
