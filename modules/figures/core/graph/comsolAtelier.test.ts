import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { arrondirClic, comparables, decrireExport, modesDisponibles, versAperçu, versDonnees } from "./comsolAtelier";
import { changerRepere } from "./comsolCalcul";
import { graphLayout } from "./layout";
import { grapheCarte } from "./comsol";

const lire = (n: string) => lireComsol(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"), n);

describe("atelier COMSOL : ce que l'interface dit des fichiers", () => {
  it("décrit chaque fichier en clair, longueurs dans l'unité de tracé", () => {
    expect(decrireExport(lire("verticale_max_std_el_lc3_het.txt"), "mm")).toMatchObject({
      forme: "ligne",
      titre: "Ligne verticale (le long de z)",
      detail: "z de −319,9 à −0,01 mm, 21 points",
      etude: "Temps=10 s, lc=3, VE=0, mod_f=0",
    });
    const plan = decrireExport(lire("grille_XZ_EL_het.txt"), "mm");
    expect(plan).toMatchObject({ forme: "plan", titre: "Plan x–z (coupe)", detail: "x de 700 à 900 mm ; z de −320 à 0 mm ; grille 3 × 3", axes: ["x", "z"], grandeurs: ["εxx", "εzz", "uz"] });
    expect(plan.avertissement).toBeUndefined();
    expect(decrireExport(lire("table_temps_VE.txt"), "mm")).toMatchObject({ forme: "serie", detail: "41 instants, de 0 à 20 s, au point (0.848, 6.5, -0.08)" });
    const transpose = { ...lire("grille_XZ_EL_het.txt"), forcer: [2, 0] };
    expect(decrireExport(transpose, "m").axes).toEqual(["z", "x"]);
  });

  it("dit quels tracés sont possibles, et sinon pourquoi", () => {
    expect(modesDisponibles([])).toMatchObject({ profils: "Ouvrez d'abord des fichiers.", comparer: "Il faut au moins deux fichiers de même grille." });
    const m = modesDisponibles([lire("grille_XZ_EL_het.txt"), lire("table_temps_VE.txt")]);
    expect(m).toMatchObject({ carte: null, "coupe-profils": null, temps: null, comparer: null, synthese: null });
    expect(m.profils).toMatch(/Aucune ligne/);
  });

  it("dit quels fichiers se comparent point à point", () => {
    const el = lire("grille_XZ_EL_het.txt");
    expect(comparables(el, lire("grille_XZ_VE_het.txt"))).toBeNull();
    expect(comparables(el, el)).toMatch(/même fichier/);
    expect(comparables(el, lire("grille_XZ_VE_circ_decalee.txt"))).toMatch(/Grilles différentes/);
  });

  it("clic sur l'aperçu → valeurs des données, axes inversés compris", () => {
    const e = changerRepere(lire("grille_XZ_EL_het.txt"), 2, { facteur: -1, origine: 0 });
    const doc = grapheCarte(e, "1e6*solid.eZZ", "mm");
    expect(doc.y.inverse).toBe(true);
    const l = graphLayout(doc);
    const mx = versAperçu(doc, l, "x", 800);
    const my = versAperçu(doc, l, "y", 100);
    const p = versDonnees(doc, l, mx, my);
    expect(p.x).toBeCloseTo(800, 9);
    expect(p.y).toBeCloseTo(100, 9);
    expect(p.dedans).toBe(true);
    // profondeur vers le bas : 100 mm est sous 0 mm
    expect(my).toBeGreaterThan(versAperçu(doc, l, "y", 0));
    expect(versDonnees(doc, l, 0, 0).dedans).toBe(false);
    expect(arrondirClic(847.63, 200)).toBe(848);
    expect(arrondirClic(0.84763, 0.2)).toBe(0.848);
  });
});

describe("profils d'un fichier déjà en profondeur positive", () => {
  it("ne retourne pas z une seconde fois, axe vers le bas", async () => {
    const { grapheProfils } = await import("./comsol");
    const { profilsInterpoles } = await import("./comsolCalcul");
    const e = changerRepere(lire("grille_XZ_EL_het.txt"), 2, { facteur: -1, origine: 0 });
    const [p] = profilsInterpoles(e, 0, [0.8]);
    for (const profondeur of [false, true]) {
      const g = grapheProfils([p!], { expressions: ["1e6*solid.eZZ"], longueur: "mm", profondeur, interfaces: [{ z: -0.08, texte: "BB/GB" }] });
      expect(g.y).toMatchObject({ label: "Profondeur (mm)", inverse: true, min: 0, max: 320 });
      expect(Math.max(...g.series[0]!.y)).toBe(320);
      expect(g.reperes![0]!.valeur).toBe(80);
    }
  });
});
