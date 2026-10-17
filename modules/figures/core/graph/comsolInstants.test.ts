import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { geometrie, grilleCoupe, lireComsol, lireTitres } from "./comsol";
import {
  noeudProche,
  parametresDesExports,
  parametresVariables,
  signalAuPoint,
  sonder,
  titreEtape,
  valeurCarte,
  vueEtape,
} from "./comsolInstants";

const lire = (n: string) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    n,
  );
// exx = f(t)·(100 x − 50 z), ezz = f(t)·(−(136 − 10 x) − 200 (z + 0,32)), f(9) = 0,5, f(10) = 1, f(11) = −0,8
const f = { 9: 0.5, 10: 1, 11: -0.8 } as const;
const exx = (t: keyof typeof f, x: number, z: number) =>
  f[t] * (100 * x - 50 * z);

describe("exports à plusieurs instants", () => {
  it("en-têtes « @ t=9 » et « @ 2: Temps=10 s, lc=3 » lus", () => {
    expect(
      lireTitres("1e6*solid.eZZ (1) @ t=9 1e6*solid.eZZ (1) @ t=10", 2).map(
        (c) => [c.solution, c.parametres],
      ),
    ).toEqual([
      ["", { t: "9" }],
      ["", { t: "10" }],
    ]);
    expect(
      lireTitres("1e6*solid.eZZ (1) @ 2: Temps=10 s, lc=3", 1)[0],
    ).toMatchObject({ solution: "2", parametres: { Temps: "10 s", lc: "3" } });
  });

  it("paramètre qui varie, vue à un instant, enveloppes", () => {
    const e = lire("grille_XZ_VE_instants.txt");
    expect(e.colonnes).toHaveLength(6);
    const [p] = parametresVariables(e);
    expect(p).toEqual({
      nom: "t",
      unite: "",
      valeurs: [9, 10, 11].map((n) => ({ texte: String(n), nombre: n })),
    });
    expect(parametresVariables(lire("grille_XZ_EL_het.txt"))).toEqual([]);
    // par défaut : le premier instant ; une colonne par grandeur, la géométrie ne change pas
    const v9 = vueEtape(e, null);
    expect(v9.colonnes.map((c) => c.parametres.t)).toEqual(["9", "9"]);
    expect(geometrie(v9).genre).toBe("coupe");
    const v11 = vueEtape(e, { t: { valeur: "11" } });
    expect(v11.valeurs[3]![2]).toBeCloseTo(exx(11, 0.9, -0.32), 9);
    // enveloppes point par point : max, min, |max| avec son signe
    const env = (enveloppe: "max" | "min" | "abs") =>
      vueEtape(e, { t: { enveloppe } }).valeurs[3]![2]!;
    expect(env("max")).toBeCloseTo(exx(10, 0.9, -0.32), 9);
    expect(env("min")).toBeCloseTo(exx(11, 0.9, -0.32), 9);
    expect(env("abs")).toBeCloseTo(exx(10, 0.9, -0.32), 9);
    const ezzAbs = vueEtape(e, { t: { enveloppe: "abs" } }).valeurs[4]![0]!; // ezz(10) = −129, ezz(11) = 103,2
    expect(ezzAbs).toBeCloseTo(-129, 9);
    expect(
      vueEtape(e, { t: { enveloppe: "max" } }).colonnes[0]!.parametres.t,
    ).toBe("enveloppe (max)");
    expect(titreEtape({ t: { valeur: "10" } }, [p!])).toBe("t = 10");
    expect(titreEtape({ t: { enveloppe: "abs" } }, [p!])).toBe("|max| sur t");
    // l'export sans instants passe tel quel ; les paramètres de plusieurs exports se réunissent
    const el = lire("grille_XZ_EL_het.txt");
    expect(vueEtape(el, { t: { valeur: "10" } })).toBe(el);
    expect(parametresDesExports([el, e]).map((x) => x.nom)).toEqual(["t"]);
  });

  it("signal au cours du temps en un point (interpolé dans la maille d'une coupe, sinon nœud le plus proche)", () => {
    const e = lire("grille_XZ_VE_instants.txt");
    expect(noeudProche(e, [0.88, null, -0.3])).toBe(2);
    const s = signalAuPoint(e, [0.88, null, -0.3], {
      parametre: "t",
      nom: "signal.txt",
      legende: "VE, x = 0,88 m",
    });
    expect(s).toMatchObject({
      nature: "table",
      coordonnees: ["t"],
      lignes: 3,
      legende: "VE, x = 0,88 m",
    });
    expect([...s.valeurs[0]!]).toEqual([9, 10, 11]);
    // exx linéaire en x et z : l'interpolation bilinéaire le retrouve exactement
    expect([...s.valeurs[1]!].map((v) => Number(v.toFixed(6)))).toEqual(
      [9, 10, 11].map((t) => Number(exx(t as 9, 0.88, -0.3).toFixed(6))),
    );
    expect(s.colonnes[0]!.parametres).toEqual({ Point: "(0.88, 6.5, -0.3)" });
    expect(() =>
      signalAuPoint(e, [2, null, 0], { parametre: "t", nom: "x", legende: "" }),
    ).toThrow(/hors de la grille/);
    expect(() =>
      signalAuPoint(lire("grille_XZ_EL_het.txt"), [0, 0, 0], {
        parametre: "t",
        nom: "x",
        legende: "",
      }),
    ).toThrow(/plusieurs valeurs/);
  });

  it("sonde : valeur interpolée sur la carte, null hors de la grille", () => {
    const e = vueEtape(lire("grille_XZ_VE_instants.txt"), {
      t: { valeur: "10" },
    });
    const g = grilleCoupe(e, "1e6*solid.eXX", "mm");
    // exx est linéaire en x et z : l'interpolation bilinéaire le retrouve exactement
    expect(valeurCarte(g, 850, -100)).toBeCloseTo(100 * 0.85 - 50 * -0.1, 9);
    expect(valeurCarte(g, 900, 0)).toBeCloseTo(90, 9);
    expect(valeurCarte(g, 950, 0)).toBeNull();
    const el = lire("grille_XZ_EL_het.txt");
    expect(
      sonder([e, el], "1e6*solid.eXX", "mm", 750, -320).map((x) =>
        Number(x.valeur!.toFixed(6)),
      ),
    ).toEqual([91, 91]);
  });
});
