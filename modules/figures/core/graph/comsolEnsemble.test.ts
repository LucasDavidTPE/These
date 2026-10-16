import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { ajouterColonne } from "./comsolCalcul";
import { colonnesProposees, vueEnsemble } from "./comsolEnsemble";
import { validateGraph } from "./model";

const lire = (n: string, nom = n) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    nom,
  );

describe("vue d'ensemble", () => {
  it("petites cartes en matrice, même échelle de couleurs, pic de chaque cas", () => {
    const es = [
      lire("grille_XZ_EL_het.txt", "c_EL_het.txt"),
      lire("grille_XZ_VE_het.txt", "c_VE_het.txt"),
      lire("grille_XZ_EL_het.txt", "c_EL_rect.txt"),
    ];
    const v = vueEnsemble(es, "coupe", "1e6*solid.eZZ", {
      longueur: "mm",
      legende: (e) => e.nom,
    });
    expect(v.matrice).toEqual({
      lignes: ["EL", "VE"],
      colonnes: ["het", "rect"],
      cases: [
        ["c_EL_het.txt", "c_EL_rect.txt"],
        ["c_VE_het.txt", null],
      ],
    });
    const docs = [...v.cases.values()].map((c) => c.doc);
    expect(
      new Set(docs.map((d) => `${d.carte!.min}|${d.carte!.max}`)).size,
    ).toBe(1);
    expect(docs.every((d) => validateGraph(d).ok)).toBe(true);
    expect(v.cases.get("c_VE_het.txt")!.pic!.y).toBe(-289.5);
  });

  it("petits profils : mêmes axes partout", () => {
    const es = [
      lire("verticale_max_std_el_lc3_het.txt"),
      lire("verticale_max_std_ve_lc3_het.txt"),
    ];
    const v = vueEnsemble(es, "profil", es[0]!.colonnes[0]!.expression, {
      longueur: "mm",
      legende: (e) => e.nom,
    });
    const [a, b] = [...v.cases.values()].map((c) => c.doc);
    expect([a!.x.min, a!.x.max]).toEqual([b!.x.min, b!.x.max]);
    expect(a!.legend).toBe("none");
  });
});

describe("grandeurs dérivées proposées", () => {
  it("principales dans le plan, cisaillement maximal, |εzz| ; formules justes", () => {
    const e = lire("grille_XZ_EL_het.txt");
    // ajoute exz pour avoir le tenseur plan complet : exz = 10 partout
    const avecExz = ajouterColonne(e, {
      formule: "10 + 0*exx",
      nom: "exz",
      unite: "µdef",
    });
    const p = colonnesProposees(avecExz);
    expect(p.map((x) => x.nom)).toEqual(
      expect.arrayContaining(["ε1 (x-z)", "ε3 (x-z)", "γmax (x-z)", "|εzz|"]),
    );
    const e1 = p.find((x) => x.nom === "ε1 (x-z)")!;
    const r = ajouterColonne(avecExz, {
      formule: e1.formule,
      nom: e1.nom,
      unite: e1.unite,
    });
    // premier point : exx = 86, ezz = −129, exz = 10
    const attendu = 0.5 * (86 - 129) + Math.sqrt((0.5 * (86 + 129)) ** 2 + 100);
    expect(r.valeurs.at(-1)![0]).toBeCloseTo(attendu, 9);
    expect(e1.unite).toBe("µdef");
    expect(
      colonnesProposees(lire("table_temps_VE.txt")).every((x) => x.formule),
    ).toBe(true);
  });
});
