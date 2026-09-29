import { describe, expect, it } from "vitest";
import { valeurDeCouleur } from "../core/carte";
import { couleurEchelle, ECHELLES, gammeConnue, NOMS_ECHELLES } from "../core/echelles";
import { echelleConnueDe, projetVide } from "../core/projet";

describe("échelles de couleurs connues", () => {
  it("extrémités et milieu de jet", () => {
    expect(couleurEchelle("jet", 0)).toEqual([0, 0, 128]);
    expect(couleurEchelle("jet", 1)).toEqual([128, 0, 0]);
    const c = couleurEchelle("jet", 0.5); // vert-cyan-jaune, canal vert au maximum
    expect(c[1]).toBeGreaterThan(200);
    expect(couleurEchelle("viridis", 0)).toEqual([0x44, 0x01, 0x54]);
    expect(couleurEchelle("viridis", 1)).toEqual([0xfd, 0xe7, 0x25]);
  });

  it("chaque échelle est définie de 0 à 1, avec des positions croissantes", () => {
    for (const n of NOMS_ECHELLES) {
      const a = ECHELLES[n]!.ancres;
      expect(a[0]![0]).toBe(0);
      expect(a.at(-1)![0]).toBe(1);
      for (let i = 1; i < a.length; i++) expect(a[i]![0]).toBeGreaterThan(a[i - 1]![0]);
      expect(() => couleurEchelle(n, 0.37)).not.toThrow();
    }
    expect(() => couleurEchelle("inconnue", 0.5)).toThrow(/inconnue/);
  });

  it("retrouve la valeur d'une couleur : linéaire, inversée, logarithmique", () => {
    for (const n of NOMS_ECHELLES) {
      const g = gammeConnue(n, 0, 100, false, false);
      for (const t of [0.1, 0.3, 0.55, 0.9]) {
        const v = valeurDeCouleur(g, couleurEchelle(n, t), 5);
        // Une échelle peut avoir deux couleurs voisines (hot) : tolérance de 3 % de l'étendue.
        expect(Math.abs(v - 100 * t), `${n} t=${t}`).toBeLessThan(3.5);
      }
    }
    const inv = gammeConnue("viridis", 0, 100, false, true);
    expect(valeurDeCouleur(inv, couleurEchelle("viridis", 1), 5)).toBeCloseTo(0, 0);
    const log = gammeConnue("viridis", 1, 1000, true, false);
    expect(valeurDeCouleur(log, couleurEchelle("viridis", 0.5), 5, true)).toBeCloseTo(10 ** 1.5, -1);
    expect(() => gammeConnue("jet", 0, 10, true, false)).toThrow(/positives/);
  });

  it("le projet ne retient l'échelle que si les deux valeurs sont saisies", () => {
    const p = projetVide();
    expect(echelleConnueDe(p)).toBeNull();
    p.legende.echelle = "jet";
    expect(echelleConnueDe(p)).toBeNull();
    p.legende.v1 = 0;
    p.legende.v2 = 5;
    expect(echelleConnueDe(p)).toEqual({ nom: "jet", v1: 0, v2: 5, log: false, inverse: false });
  });
});
