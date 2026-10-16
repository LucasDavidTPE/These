import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { changerRepere, profilsInterpoles } from "./comsolCalcul";
import {
  criteresDefaut,
  criteresLatex,
  critereDimensionnant,
  cyclesAdmissibles,
  deformationAdmissible,
  evaluer,
  grapheCriteres,
  lireCriteres,
  tableauCriteres,
  versMicrodef,
  type Critere,
} from "./comsolCriteres";
import { validateGraph } from "./model";
import { graphLayout } from "./layout";

const lire = (n: string) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    n,
  );
const et: Critere = {
  id: "et",
  nom: "εt base GB",
  genre: "traction",
  z: -0.16,
  cote: "dessus",
  decalage: 0,
  variables: ["exx", "eyy"],
  loi: { genre: "fatigue", epsilon6: 100, b: -0.2, k: 1 },
};
const ez: Critere = {
  id: "ez",
  nom: "εz sol",
  genre: "compression",
  z: -0.32,
  cote: "dessous",
  decalage: 0,
  variables: ["ezz"],
  loi: { genre: "sol", A: 0.012, exposant: 0.222 },
};

describe("lois de dimensionnement", () => {
  it("fatigue et sol : cycles admissibles et déformation admissible sont réciproques", () => {
    expect(cyclesAdmissibles(100, et.loi)).toBeCloseTo(1e6, 6);
    expect(cyclesAdmissibles(98, et.loi)! / 1e6).toBeCloseTo(0.98 ** -5, 9);
    for (const loi of [et.loi, ez.loi]) {
      const n = cyclesAdmissibles(150, loi)!;
      expect(deformationAdmissible(n, loi)).toBeCloseTo(150, 6);
    }
    expect(cyclesAdmissibles(-5, et.loi)).toBeNull();
    expect(
      cyclesAdmissibles(10, { genre: "fatigue", epsilon6: 100, b: 0.2, k: 1 }),
    ).toBeNull();
    expect(versMicrodef("µdef")).toBe(1);
    expect(versMicrodef("-")).toBe(1e6);
    expect(versMicrodef("‰")).toBe(1e3);
    expect(versMicrodef("MPa")).toBeNull();
  });
});

describe("évaluation sur les exports", () => {
  it("coupe : traction maxi sur la ligne de l'interface, compression maxi juste en dessous", () => {
    const e = lire("grille_XZ_EL_het.txt");
    const a = evaluer(e, et, { longueur: "mm", trafic: 1e6 });
    expect(a).toMatchObject({
      variable: "exx",
      position: { X: 900, Z: -160 },
      zEvalue: -160,
    });
    if (!("valeur" in a)) throw new Error();
    expect(a.valeur).toBeCloseTo(98, 9); // exx = 100 x − 50 z en x = 0,9 ; eyy absente
    expect(a.cycles! / 1e6).toBeCloseTo(0.98 ** -5, 9);
    expect(a.dommage).toBeCloseTo(1 / 0.98 ** -5, 9);
    expect(a.admissible).toBeCloseTo(100, 9);
    const b = evaluer(e, ez, { longueur: "mm" });
    if (!("valeur" in b)) throw new Error(JSON.stringify(b));
    expect(b.valeur).toBeCloseTo(129, 9); // compression |ezz| = 136 − 10 x, maxi en x = 0,7
    expect(b.position.X).toBe(700);
    // décalage dans la couche du dessus : ligne interpolée à z = −0,15
    const c = evaluer(e, { ...et, decalage: 0.01 }, { longueur: "mm" });
    expect("valeur" in c && c.valeur).toBeCloseTo(97.5, 9);
    expect(evaluer(e, { ...et, z: -1 }, { longueur: "mm" })).toEqual({
      raison: "cote hors de la coupe",
    });
    expect(
      evaluer(e, { ...et, variables: ["sxx"] }, { longueur: "mm" }),
    ).toEqual({ raison: "variables sxx absentes" });
  });

  it("repère en profondeur positive et profil vertical", () => {
    const p = changerRepere(lire("grille_XZ_EL_het.txt"), 2, {
      facteur: -1,
      origine: 0,
    });
    const a = evaluer(p, { ...et, decalage: 0.01 }, { longueur: "mm" });
    expect("valeur" in a && a.valeur).toBeCloseTo(97.5, 9);
    expect("valeur" in a && a.zEvalue).toBeCloseTo(150, 9);
    const [v] = profilsInterpoles(lire("grille_XZ_EL_het.txt"), 0, [0.8]);
    const b = evaluer(v!, et, { longueur: "mm" });
    expect("valeur" in b && b.valeur).toBeCloseTo(88, 9);
    expect(evaluer(lire("table_temps_VE.txt"), et, { longueur: "mm" })).toEqual(
      { raison: "pas de coordonnée z" },
    );
  });

  it("export arrêté juste avant l'interface : bord du fichier pris du bon côté seulement", () => {
    const v = lire("verticale_max_std_el_lc3_het.txt"); // de z = −0,3199 à la surface
    const a = evaluer(v, { ...et, z: -0.32 }, { longueur: "m" });
    if (!("valeur" in a)) throw new Error(JSON.stringify(a));
    expect(a.zEvalue).toBeCloseTo(-0.3199, 9);
    expect(a.valeur).toBeCloseTo(184.3346488046297, 9); // eyy du premier point
    expect(evaluer(v, { ...ez, z: -0.32 }, { longueur: "m" })).toEqual({
      raison: "cote hors du profil",
    });
    expect(evaluer(v, { ...et, z: -0.34 }, { longueur: "m" })).toEqual({
      raison: "cote hors du profil",
    });
  });

  it("tableau, critère dimensionnant, barres (log) et LaTeX", () => {
    const es = [lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_het.txt")];
    const t = tableauCriteres(es, [et, ez], {
      longueur: "mm",
      legende: (e) => (e.nom.includes("VE") ? "VE" : "EL"),
    });
    expect(t.lignes.map((l) => l.legende)).toEqual(["EL", "VE"]);
    expect(critereDimensionnant(t.lignes[1]!, t.criteres)?.critere.id).toBe(
      "et",
    );
    const g = grapheCriteres(t, { affichage: "cycles" });
    expect(validateGraph(g).ok).toBe(true);
    expect(g.y.log).toBe(true);
    expect(g.x.categories).toEqual(["EL", "VE"]);
    expect(graphLayout(g).ys.log).toBe(true);
    const r = grapheCriteres(t, {
      affichage: "relatif",
      reference: "grille_XZ_EL_het.txt",
    });
    expect(r.series[0]!.y[0]).toBe(100);
    expect(r.series[0]!.y[1]).toBeCloseTo(100 * 1.5 ** -5, 3);
    const tex = criteresLatex(t, { virgule: true });
    expect(tex).toContain("\\multicolumn{2}{c}{εt base GB}");
    expect(tex).toContain("\\cmidrule(lr){2-3} \\cmidrule(lr){4-5}");
    expect(tex).toMatch(/EL & \$98\$ & \$1\{,\}11 \\times 10\^\{6\}\$/);
  });

  it("critères lus avec tolérance, défauts proposés", () => {
    expect(criteresDefaut().map((c) => c.id)).toEqual([
      "et-bb",
      "et-gb",
      "ez-grh",
    ]);
    expect(lireCriteres(undefined)).toHaveLength(3);
    expect(
      lireCriteres([{ z: -0.1, loi: { genre: "sol" } }, { nom: "sans z" }]),
    ).toEqual([
      {
        id: "critere-1",
        nom: "Critère 1",
        genre: "traction",
        z: -0.1,
        cote: "dessus",
        decalage: 0,
        variables: [],
        loi: { genre: "sol", A: 0.012, exposant: 0.222 },
      },
    ]);
  });
});
