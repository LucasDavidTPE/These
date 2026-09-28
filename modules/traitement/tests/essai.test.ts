/**
 * Le modèle de l'essai (core/essai.ts) : la logique de la page d'origine, sans le DOM.
 */
import { describe, expect, it } from "vitest";
import { readXlsx } from "@noyau/formats/xlsx";
import { ecrireClasseur } from "@noyau/formats/xlsx-ecriture";
import { CONSTANTES_DEMO, signalDemo } from "../core/demo";
import {
  appliquerProjet,
  basculerCycle,
  changerModele,
  changerTref,
  colonnesCycles,
  comparerModes,
  csv,
  ecartsCalage,
  essaiDemo,
  essaiDepuisLecture,
  lignesEcartees,
  nouvelEssai,
  projetJSON,
  proposerEcarts,
  resumeEssai,
  retenu,
  tableauCalcul,
  tableauData,
  tableauModele,
  toutRetablir,
  traiter,
} from "../core/essai";
import { vueEcartsCapteurs, vueSignal, vuesCalage, vuesComparaison, vuesSynthese } from "../core/vues";
import { feuillesEssai } from "../core/exports";
import { POINTS_MAX, vueEnGraphe } from "../core/figurine";

async function essaiSignal() {
  const table = signalDemo();
  const e = essaiDepuisLecture({ table, entetes: [], correspondance: { cycle: 0, temps: 1, position: 2, charge: 3, defM: 4, defA: 5, defB: 6, defC: 7, lion1: 8, lion2: 9, lion3: -1, lion4: -1, pt100: 10 }, uniteAxiale: "mm/mm", nom: "Essai1.csv" }, 0);
  await traiter(e);
  return e;
}

describe("essai de démonstration", () => {
  it("le calage retrouve les constantes qui ont servi à fabriquer les points", async () => {
    const e = await essaiDemo();
    expect(e.paliers).toHaveLength(1);
    const ec = ecartsCalage(e);
    expect(ec.n).toBe(64);
    expect(ec.module).toBeLessThan(2);
    expect(Math.abs(e.p.E0! - CONSTANTES_DEMO.E0) / CONSTANTES_DEMO.E0).toBeLessThan(0.05);
    expect(Math.abs(e.C1 - 25)).toBeLessThan(3);
  }, 30000);
});

describe("traitement d'un fichier", () => {
  it("un palier, des cycles, une synthèse", async () => {
    const e = await essaiSignal();
    expect(e.nom).toBe("Essai1");
    expect(e.paliers[0]!.libelle).toBe("15 °C · 0,003 Hz · cycles 1–3");
    expect(e.synthese[0]!.n).toBe(e.paliers[0]!.lignes.length);
    expect(colonnesCycles(e).map((c) => c[0])).not.toContain("ecR3");
    expect(resumeEssai(e, 1)[4]).toBe("mode Excel à l'identique");
  });

  it("écarter, proposer, tout remettre : la synthèse suit", async () => {
    const e = await essaiSignal();
    const [l0] = e.paliers[0]!.lignes;
    const avant = e.synthese[0]!.module;
    basculerCycle(e, l0!);
    toutRetablir(e);
    expect(e.synthese[0]!.module).toBe(avant);
    basculerCycle(e, l0!, "capteur décroché");
    expect(retenu(e, l0!)).toBe(false);
    expect(lignesEcartees(e)[0]!.motif).toBe("capteur décroché");
    toutRetablir(e);
    expect(proposerEcarts(e, 0, Infinity)).toBe(e.paliers[0]!.lignes.length);
    expect(tableauData(e)[1]!.slice(0, 2)).toEqual(["non", expect.stringContaining("indice de qualité")]);
  });

  it("les deux modes côte à côte", async () => {
    const m = comparerModes(await essaiSignal())!;
    expect(m.exact.length).toBeGreaterThan(0);
    expect(m.corrige[0]!.nPoints).toBe(m.corrige[0]!.nCycle);
  });
});

describe("projet", () => {
  it("aller-retour : tri des cycles, modèle, a_T et matrice retrouvés", async () => {
    const e = await essaiSignal();
    basculerCycle(e, e.paliers[0]!.lignes[1]!, "à la main");
    changerModele(e, "huet-sayegh");
    e.p.E0 = 33333;
    const texte = projetJSON([e]);
    const f = await essaiSignal();
    await appliquerProjet([f], JSON.parse(texte));
    expect(f.modeleId).toBe("huet-sayegh");
    expect(f.p.E0).toBe(33333);
    expect([...f.exclus]).toEqual([...e.exclus]);
    expect(f.synthese[0]!.ecartes).toBe(1);
    expect(JSON.parse(texte).version).toBe(2);
  });

  it("changer de température de référence ramène les a_T sur elle", async () => {
    const e = await essaiDemo();
    changerTref(e, 25);
    expect(e.aT[25]).toBeCloseTo(1, 12);
  }, 30000);
});

describe("exports", () => {
  it("CSV pour Excel français, classeur Data / Calcul / Modele", async () => {
    const e = await essaiSignal();
    expect(csv([["a", 1.5, NaN, 'x"y']])).toBe('﻿"a";1,5;;"x""y"');
    expect(tableauCalcul(e)[2]).toEqual(["moyenne"]);
    expect(tableauModele(e)[0]).toEqual(["Modèle", "2S2P1D"]);
    const f = readXlsx(ecrireClasseur(feuillesEssai(e)));
    expect(f.map((x) => x.name)).toEqual(["Data", "Calcul", "Modele"]);
    expect(f[0]!.rows[0]!.slice(0, 3)).toEqual(["Retenu", "Motif de mise à l'écart", "T (°C)"]);
    expect(f[0]!.rows.length).toBe(e.paliers[0]!.lignes.length + 1);
  });
});

describe("vues", () => {
  it("chaque graphique a des points", async () => {
    const e = await essaiDemo();
    expect(vueSignal(e, 0, 0, "mc")!.spec.series[0]!.points.length).toBeGreaterThan(100);
    expect(vueEcartsCapteurs(e, 0)!.legende).toHaveLength(5);
    expect(vuesSynthese(e).module.legende).toHaveLength(1);
    const c = vuesCalage(e);
    expect(c.maitreE.legende).toHaveLength(8);
    expect(c.aT.spec.series[1]!.points.length).toBeGreaterThan(10);
    expect(vuesComparaison([e, nouvelEssai("vide")]).module.legende).toEqual([["démonstration", e.couleur]]);
  }, 30000);
});

describe("graphes pour Figures et langue des axes", () => {
  it("titres d'axes en français ou en anglais", async () => {
    const e = await essaiDemo();
    expect(vueSignal(e, 0, 0, "mc", "en")!.spec.yTitre).toBe("centred signal");
    expect(vueEcartsCapteurs(e, 0, "en")!.spec.yTitre).toBe("deviation (%)");
    expect(vueEcartsCapteurs(e, 0)!.spec.yTitre).toBe("écart (%)");
    expect(vuesCalage(e, "en").aT.spec.series[0]!.libelle).toBe("measured");
  }, 30000);

  it("une vue devient un graph.json : échelles, titres, séries, légende", async () => {
    const e = await essaiDemo();
    const g = vueEnGraphe(vuesCalage(e).maitreE);
    expect(g.format).toBe("figurine-graph/1");
    expect(g.x).toEqual({ label: "f·a_T (Hz)", log: true });
    expect(g.y).toEqual({ label: "|E*| (MPa)", log: true });
    expect(g.series.length).toBe(9);
    expect(g.series.at(-1)!.type).toBe("line");
    expect(g.series.at(-1)!.name).toMatch(/^modèle /);
    expect(g.series.every((s) => s.legend && s.x.length === s.y.length && s.x.every((v) => v > 0))).toBe(true);
    expect(g.legend).toBe("south east");
    // couleurs de l'écran gardées (isothermes, modèle)
    expect(g.series.every((s) => /^#[0-9a-f]{6}$/.test(s.color ?? ""))).toBe(true);
    expect(g.series.at(-1)!.color).toBe("#0b5f5c");
  }, 30000);

  it("ligne + points du même capteur : une série « linepoints », longues séries allégées", async () => {
    const e = await essaiDemo();
    const g = vueEnGraphe(vueEcartsCapteurs(e, 0)!);
    expect(g.series.every((s) => s.type === "linepoints")).toBe(true);
    expect(g.series).toHaveLength(5);
    const long = vueEnGraphe({ spec: { series: [{ points: Array.from({ length: 9001 }, (_, i) => [i, i] as const), mode: "ligne", couleur: "#000" }] }, format: () => "" });
    expect(long.series[0]!.x.length).toBeLessThanOrEqual(POINTS_MAX);
    expect(long.legend).toBe("none");
  });
});
