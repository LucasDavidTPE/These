/**
 * ViscoCompare : même lecture et mêmes conversions que `main.py` (LucasDavidTPE/ViscoCompare),
 * vérifiées sur des fichiers construits à la main dont on connaît le résultat.
 */
import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "@noyau/stockage";
import { readXlsx } from "@noyau/formats/xlsx";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { ecarts, feuillesCas, nomCas, panneauxCas } from "../core/comparaison";
import { chargerEtude, trouverEtudes } from "../core/dossier";
import { convertirViscoroute, grandeurDuFichier, interpoler, lireCsvComsol, lireJsonViscoroute, profilEnX0, vitesseComsol, vitesseViscoroute } from "../core/lecture";

const CSV = [
  'arc_length,"Champ_de_déplacement,_composante_X","Champ_de_déplacement,_composante_Z",Tenseur_def_xx',
  "0,1e-6,-2e-6,1e-5",
  "5,2e-6,-4e-6,2e-5",
  "10,1e-6,-2e-6,1e-5",
].join("\n");

/** Grille Viscoroute : x = -1, 0, 1 ; y décroissant (le script le remet dans l'ordre). */
const json = (f: (y: number, x: number) => number) =>
  `{"1":"titre","4":"-1 0 1",${[1, 0, -1]
    .map((y, i) => `"${5 + i}":"${y} ${[-1, 0, 1].map((x) => f(y, x)).join(" ")}"`)
    .join(",")}}`;

describe("lecture", () => {
  it("vitesses et grandeurs d'après les noms", () => {
    expect(vitesseComsol("Profil V=0.1.csv")).toBe(0.1);
    expect(vitesseComsol("profil v = 2.csv")).toBe(2);
    expect(vitesseComsol("profil.csv")).toBeNull();
    expect(vitesseViscoroute("Vitesse_0.1")).toBe(0.1);
    expect(grandeurDuFichier("res_eps_xx.json")).toBe("EPS_XX");
    expect(grandeurDuFichier("UZ.json")).toBe("UZ");
    expect(grandeurDuFichier("sigma.json")).toBeNull();
  });

  it("CSV COMSOL : colonnes renommées, déplacements en µm, arc_length décalé de −5", () => {
    const t = lireCsvComsol(CSV);
    expect(t.colonnes).toEqual(["arc_length", "UX", "UZ", "EPS_XX"]);
    expect(t.valeurs.arc_length).toEqual([-5, 0, 5]);
    expect(t.valeurs.UX![1]).toBeCloseTo(2);
    expect(t.valeurs.UZ![1]).toBeCloseTo(-4);
    expect(t.valeurs.EPS_XX![1]).toBeCloseTo(2e-5); // non converti côté COMSOL, comme le script
    expect(() => lireCsvComsol("x,y\n1,2")).toThrow("arc_length");
  });

  it("JSON Viscoroute : grille remise dans l'ordre, profil en x = 0, conversions", () => {
    const g = lireJsonViscoroute(json((y, x) => 10 * y + x));
    expect(g.x).toEqual([-1, 0, 1]);
    expect(g.y).toEqual([-1, 0, 1]);
    const p = profilEnX0(g);
    expect(p.v).toEqual([-10, 0, 10]);
    expect(convertirViscoroute("UZ", [1e-6])[0]).toBeCloseTo(-1);
    expect(convertirViscoroute("EPS_XX", [1e-6])[0]).toBeCloseTo(1);
    expect(() => lireJsonViscoroute('{"5":"1 2"}')).toThrow("clé 4");
  });

  it("interpolation : comme np.interp (bornes étendues, NaN écartés)", () => {
    expect(interpoler([-1, 0, 0.5, 3], [0, 1, 2], [0, 10, NaN])).toEqual([0, 0, 5, 10]);
    expect(interpoler([0, 1], [0, 1], [NaN, 1]).every(Number.isNaN)).toBe(true);
  });
});

describe("étude complète", () => {
  async function dossier() {
    const fs = new FichiersMemoire();
    await fs.ensureDir("Structure A/COMSOL");
    await fs.writeTextAtomic("Structure A/COMSOL/Profil V=0.1.csv", CSV);
    await fs.writeTextAtomic("Structure A/COMSOL/Profil V=5.csv", CSV);
    await fs.writeTextAtomic("Structure A/COMSOL/notes.csv", CSV);
    await fs.ensureDir("Structure A/VISCOROUTE/Vitesse_0.1");
    await fs.writeTextAtomic("Structure A/VISCOROUTE/Vitesse_0.1/UZ.json", json((y) => 3e-6 * (1 - Math.abs(y))));
    await fs.writeTextAtomic("Structure A/VISCOROUTE/Vitesse_0.1/EPS_XX.json", json((y) => 1e-5 * (1 + y)));
    await fs.writeTextAtomic("Structure A/VISCOROUTE/Vitesse_0.1/UX_0P0.json", '{"5":"1"}');
    await fs.ensureDir("Divers");
    return fs;
  }

  it("trouve l'étude, assemble les vitesses communes, liste ce qui est écarté", async () => {
    const fs = await dossier();
    expect(await trouverEtudes(fs)).toEqual(["Structure A"]);
    const e = await chargerEtude(fs, "Structure A");
    expect(e.vitessesComsol).toEqual([0.1, 5]);
    expect(e.vitessesViscoroute).toEqual([0.1]);
    expect(e.cas.map((c) => c.nom)).toEqual(["0_10"]);
    expect(e.ecartes.map((x) => x.chemin)).toEqual(["Structure A/COMSOL/notes.csv", "Structure A/VISCOROUTE/Vitesse_0.1/UX_0P0.json"]);
    const c = e.cas[0]!;
    expect(c.grandeurs).toEqual(["UZ", "EPS_XX"]);
    // Référence y : EPS_XX (premier dans l'ordre alphabétique), UZ interpolé dessus.
    expect(c.viscoroute.colonnes).toEqual(["y", "EPS_XX", "UZ"]);
    expect(c.viscoroute.valeurs.UZ![1]).toBeCloseTo(-3);
    expect(panneauxCas(c).map((p) => p.titre)).toEqual(["Déplacement UZ", "Déformation EPS_XX"]);
  });

  it("écarts sur l'extremum et classeur du cas", async () => {
    const c = (await chargerEtude(await dossier(), "Structure A")).cas[0]!;
    const [uz] = ecarts(c);
    expect(uz!.comsol).toEqual({ valeur: -4, position: 0 });
    expect(uz!.viscoroute!.valeur).toBeCloseTo(-3);
    expect(uz!.viscoroute!.position).toBe(0);
    expect(uz!.ecartPourcent).toBeCloseTo(-33.33, 1);
    const f = readXlsx(ecrireClasseur(feuillesCas(c)));
    expect(f.map((x) => x.name)).toEqual(["COMSOL", "VISCOROUTE", "UZ", "EPS_XX", "Ecarts"]);
    expect(f[2]!.rows[0]).toEqual(["Source", "x/arc_length", "Valeur"]);
    expect(f[2]!.rows[4]?.[0]).toBe("Viscoroute");
    expect(nomCas(1)).toBe("1_00");
  });
});
