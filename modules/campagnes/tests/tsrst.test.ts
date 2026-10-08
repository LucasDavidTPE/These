import { describe, expect, it } from "vitest";
import { lireCsv } from "@noyau/formats/wavematrix";
import { lireEprouvette, lireEssai } from "../core/modele";
import { readXlsx } from "@noyau/formats/xlsx";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { bilineaire, contrainteA, depouillerTsrst, feuillesTsrst, grouperTsrst, lignesTsrst, lireResultats, panneauComparaison, sectionDe, statistique, trier, voiesTemperature, type LigneTsrst } from "../core/tsrst";

/**
 * Export WaveMatrix synthétique : palier à +5 °C pendant 30 min, refroidissement à 10 °C/h ; σ(T) avec une
 * transition à −8 °C (0,03 MPa/°C au-dessus, 0,2 MPa/°C en dessous) ; rupture à −28 °C ; force en kN
 * négative (convention de la machine), éprouvette 50 × 50 mm.
 */
export function exportTsrst({ rupture = -28, transition = -8, section = 2500, signe = -1, casse = true } = {}): string {
  const lignes = ["﻿Temps total (s);Température(8800:Enceinte) (°C);Température(8800:Eprouvette) (°C);Force(8800 (0,1):Charge) (kN)"];
  const sigma = (T: number) => (T > transition ? 0.03 * (5 - T) : 0.03 * (5 - transition) + 0.2 * (transition - T));
  let rompu = false;
  for (let t = 0; t <= 6 * 3600; t += 10) {
    const h = t / 3600;
    const air = h < 0.5 ? 5 : 5 - 10 * (h - 0.5);
    const ep = air + 0.3 + 0.02 * Math.sin(t / 37);
    if (ep <= rupture) rompu = casse;
    if (!casse && ep < rupture) break;
    const s = rompu ? 0.02 : sigma(ep) + 0.005 * Math.sin(t / 53);
    const f = (signe * s * section) / 1000;
    lignes.push([t, air, ep, f].map((x) => String(Number(x.toFixed(4))).replace(".", ",")).join(";"));
  }
  return lignes.join("\n");
}

describe("TSRST : dépouillement", () => {
  it("voies de température : celle de l'éprouvette d'abord", () => {
    expect(voiesTemperature(lireCsv(exportTsrst()))).toEqual(["Température(8800:Eprouvette) (°C)", "Température(8800:Enceinte) (°C)"]);
  });

  it("rupture, transition, pente, contraintes à T fixées, courbe archivée", () => {
    const r = depouillerTsrst(lireCsv(exportTsrst()), { section: 2500, fichier: "Essai1.steps.tracking.csv", aujourdhui: "2026-10-08" });
    expect(r.rompu).toBe(true);
    expect(r.voieTemperature).toBe("Température(8800:Eprouvette) (°C)");
    expect(r.rupture.temperature).toBeCloseTo(-28, 0);
    expect(r.rupture.contrainte).toBeCloseTo(0.39 + 0.2 * 20, 1);
    expect(r.depart).toBeCloseTo(5.3, 0);
    expect(r.transition).not.toBeNull();
    expect(r.transition!.temperature).toBeGreaterThan(-9.5);
    expect(r.transition!.temperature).toBeLessThan(-6.5);
    expect(r.transition!.pente).toBeCloseTo(0.2, 2);
    expect(r.transition!.penteAvant).toBeCloseTo(0.03, 2);
    expect(r.aT.map((x) => x.temperature)).toEqual([-10, -20, -30]);
    expect(r.aT[0]!.contrainte).toBeCloseTo(0.39 + 0.4, 1);
    expect(r.aT[1]!.contrainte).toBeCloseTo(0.39 + 2.4, 1);
    expect(r.aT[2]!.contrainte).toBeNull(); // sous la rupture
    expect(r.courbe.temperature.length).toBeLessThanOrEqual(301);
    expect(r.courbe.temperature[0]!).toBeGreaterThan(r.courbe.temperature.at(-1)!);
    expect(r.courbe.contrainte.at(-1)).toBe(r.rupture.contrainte);
    // aller-retour JSON, et relevé après coup à une autre température
    const relu = lireResultats(JSON.parse(JSON.stringify(r)));
    expect(relu).toEqual(r);
    expect(contrainteA(relu, -15)).toBeCloseTo(0.39 + 1.4, 1);
    expect(contrainteA(relu, 10)).toBeNull();
  });

  it("section deux fois plus grande : même force → contrainte divisée par deux", () => {
    const s = lireCsv(exportTsrst());
    const a = depouillerTsrst(s, { section: 2500 });
    const b = depouillerTsrst(s, { section: 5000 });
    expect(b.rupture.contrainte).toBeCloseTo(a.rupture.contrainte / 2, 3);
    expect(b.rupture.temperature).toBe(a.rupture.temperature);
  });

  it("sans section ni contrainte : erreur claire ; sans rupture : avertissement", () => {
    expect(() => depouillerTsrst(lireCsv(exportTsrst()), { section: null })).toThrow("Section de l'éprouvette inconnue");
    const r = depouillerTsrst(lireCsv(exportTsrst({ casse: false })), { section: 2500 });
    expect(r.rompu).toBe(false);
    expect(r.avertissements.join(" ")).toContain("Pas de rupture nette");
  });

  it("voie de température imposée", () => {
    const r = depouillerTsrst(lireCsv(exportTsrst()), { section: 2500, voieTemperature: "Température(8800:Enceinte) (°C)" });
    expect(r.voieTemperature).toBe("Température(8800:Enceinte) (°C)");
    expect(r.rupture.temperature).toBeCloseTo(-28.3, 0);
  });

  it("ajustement bilinéaire : retrouve le coude d'une ligne brisée", () => {
    const x = Array.from({ length: 60 }, (_, i) => -30 + i * 0.5);
    const y = x.map((v) => (v > -12 ? 1 + 0.05 * (v + 12) : 1 + 0.3 * (v + 12)));
    const f = bilineaire(x, y)!;
    expect(f.c).toBeCloseTo(-12, 0);
    expect(f.b1).toBeCloseTo(0.05, 3);
    expect(f.b2).toBeCloseTo(0.3, 3);
    expect(f.sse).toBeLessThan(1e-9);
  });
});

describe("TSRST : fiche, tableau, groupes", () => {
  it("fiche d'éprouvette : relue tolérante, section calculée", () => {
    expect(lireEssai({}).fiche).toEqual(lireEprouvette({}));
    expect(sectionDe(lireEprouvette({ forme: "prisme", largeur: 50, epaisseur: 50 }))).toBe(2500);
    expect(sectionDe(lireEprouvette({ forme: "cylindre", diametre: 50 }))).toBeCloseTo(1963.5, 1);
    expect(sectionDe(lireEprouvette({ forme: "prisme", largeur: 50, epaisseur: 50, section: 2400 }))).toBe(2400);
    expect(sectionDe(lireEprouvette({ forme: "prisme", largeur: 50 }))).toBeNull();
    expect(lireEssai({ validite: "n'importe", forme: "rond" }).validite).toBe("");
  });

  const res = (Tr: number, Sr: number, Tt: number | null) =>
    lireResultats({ rupture: { temperature: Tr, contrainte: Sr }, transition: Tt === null ? null : { temperature: Tt, pente: 0.2 }, aT: [{ temperature: -20, contrainte: Sr / 2 }], courbe: { temperature: [0, Tr], contrainte: [0, Sr] } });
  const ligne = (essai: string, materiau: string, r: ReturnType<typeof res> | null, validite = ""): LigneTsrst => ({
    slug: "c",
    campagne: "Campagne",
    essai,
    eprouvette: "",
    materiau,
    vieillissement: "",
    vides: null,
    section: null,
    date: "",
    validite,
    motif: "",
    resultats: r,
  });

  it("tri : nombres, texte, valeurs manquantes à la fin dans les deux sens", () => {
    const l = [ligne("Essai2", "B", res(-25, 4, -8)), ligne("Essai10", "A", res(-30, 5, null)), ligne("Essai1", "A", null)];
    expect(trier(l, "Trupture", 1).map((x) => x.essai)).toEqual(["Essai10", "Essai2", "Essai1"]);
    expect(trier(l, "Trupture", -1).map((x) => x.essai)).toEqual(["Essai2", "Essai10", "Essai1"]);
    expect(trier(l, "Ttransition", 1).map((x) => x.essai)).toEqual(["Essai2", "Essai10", "Essai1"]);
    expect(trier(l, "essai", 1).map((x) => x.essai)).toEqual(["Essai1", "Essai2", "Essai10"]);
    expect(trier(l, "aT:-20", -1).map((x) => x.essai)).toEqual(["Essai10", "Essai2", "Essai1"]);
  });

  it("groupes par matériau : moyenne et écart-type, écartés et non dépouillés exclus", () => {
    const l = [ligne("1", "A", res(-30, 4, -8)), ligne("2", "A", res(-28, 5, -10)), ligne("3", "A", res(-10, 1, null), "ecarte"), ligne("4", "B", res(-25, 3, -6)), ligne("5", "B", null)];
    const g = grouperTsrst(l, (x) => x.materiau, [-20]);
    expect(g.map((x) => [x.cle, x.essais])).toEqual([
      ["A", 2],
      ["B", 1],
    ]);
    expect(g[0]!.Trupture).toEqual({ n: 2, moyenne: -29, ecartType: 1.41 });
    expect(g[0]!.Ttransition.moyenne).toBe(-9);
    expect(g[0]!.aT[0]!.stat.moyenne).toBe(2.25);
    expect(g[1]!.Srupture).toEqual({ n: 1, moyenne: 3, ecartType: null });
    expect(statistique([])).toEqual({ n: 0, moyenne: null, ecartType: null });
  });

  it("lignes depuis les campagnes, comparaison σ(T), classeur d'archive relu", () => {
    const r = depouillerTsrst(lireCsv(exportTsrst()), { section: 2500 });
    const essai = (o: object) => ({ ...lireEssai(o), debut: "2026-06-22 10:00:00" });
    const lignes = lignesTsrst([
      { slug: "a", titre: "TSRST A", type: "tsrst", materiau: "BB 35/50", essais: { Essai1: essai({ eprouvette: "P1", fiche: { forme: "prisme", largeur: 50, epaisseur: 50 } }), Essai2: essai({}) }, tsrst: { Essai1: r } },
      { slug: "cm", titre: "Module", type: "module-complexe", materiau: "", essais: { Essai1: essai({}) }, tsrst: {} },
    ]);
    expect(lignes.map((l) => [l.campagne, l.essai, l.materiau, l.section, l.date, !!l.resultats])).toEqual([
      ["TSRST A", "Essai1", "BB 35/50", 2500, "2026-06-22", true],
      ["TSRST A", "Essai2", "BB 35/50", null, "2026-06-22", false],
    ]);
    const p = panneauComparaison(lignes);
    expect(p.traces.map((t) => t.nom)).toEqual(["Essai1 (P1)"]);
    expect(p.traces[0]!.x[0]!).toBeLessThan(p.traces[0]!.x.at(-1)!);
    const g = grouperTsrst(lignes, (l) => l.materiau, [-10, -20]);
    const cl = readXlsx(ecrireClasseur(feuillesTsrst(lignes, [-10, -20], g, "Matériau")));
    expect(cl.map((f) => f.name)).toEqual(["Essais TSRST", "Synthèse", "Courbes σ(T)"]);
    expect(cl[0]!.rows[0]!.slice(0, 3)).toEqual(["Campagne", "Essai", "Éprouvette"]);
    expect(cl[0]!.rows[1]![10]).toBeCloseTo(-28, 0);
    expect(cl[1]!.rows[1]![0]).toBe("BB 35/50");
    expect(cl[2]!.rows[0]).toEqual(["Essai1 (P1) T (°C)", "σ (MPa)"]);
    expect(cl[2]!.rows.length - 1).toBe(r.courbe.temperature.length);
  });
});

