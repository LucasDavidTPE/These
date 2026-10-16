import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import { diagnostiquer } from "./comsolDiagnostic";
import {
  executerTrace,
  lireTrace,
  traceVide,
  type TraceProfils,
  type TraceTemps,
} from "./comsolEtude";
import { comparerMesure, interpolerCourbe, lireMesures } from "./comsolMesures";
import { validateGraph } from "./model";

const lire = (n: string, nom = n) =>
  lireComsol(
    readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"),
    nom,
  );
const ctx = (exports: ReturnType<typeof lire>[]) => ({
  exports,
  cadre: { longueur: "mm" as const, couches: false, source: "auto" as const },
  noms: {},
  correspondances: [],
  interfaces: [],
});

describe("mesures collées", () => {
  it("colonnes depuis Excel (tabulations, virgule décimale), blancs, CSV anglais ; noms d'en-tête ; facteur et signe", () => {
    expect(lireMesures("t\tJauge 1\tJauge 2\n0\t1,5\t2\n0,1\t3\t4\n")).toEqual([
      { nom: "Jauge 1", x: [0, 0.1], y: [1.5, 3] },
      { nom: "Jauge 2", x: [0, 0.1], y: [2, 4] },
    ]);
    expect(
      lireMesures("0 10\n1 20", { facteur: 1e6, signe: -1, nom: "J3" }),
    ).toEqual([{ nom: "J3", x: [0, 1], y: [-1e7, -2e7] }]);
    expect(lireMesures("0.5,12.5\n1.5,13")).toEqual([
      { nom: "Mesure", x: [0.5, 1.5], y: [12.5, 13] },
    ]);
    expect(lireMesures("rien d'utile")).toEqual([]);
  });

  it("écart au calcul : RMS, pic, recalage des pics dans le temps", () => {
    const calc = { x: [0, 1, 2, 3, 4], y: [0, 10, 100, 10, 0] };
    expect(interpolerCourbe(calc.x, calc.y, 1.5)).toBe(55);
    const m = { nom: "J", x: [1, 2, 3, 4, 5], y: [0, 10, 90, 10, 0] }; // en retard d'une seconde, 10 % plus faible
    const brut = comparerMesure(calc, m)!;
    expect(brut.decalage).toBe(0);
    expect(brut.ecartPic).toBeCloseTo((100 * (100 - 90)) / 90, 9);
    const recale = comparerMesure(calc, m, { aligner: true })!;
    expect(recale.decalage).toBe(-1);
    expect(recale.rms).toBeCloseTo(Math.sqrt(100 / 5), 9); // seul le pic diffère (10)
    expect(recale.rms).toBeLessThan(brut.rms);
  });

  it("recettes : mesures tracées en noir et comparées (signal, profil vertical)", () => {
    const c = ctx([
      lire("table_temps_VE.txt"),
      lire("verticale_max_std_el_lc3_het.txt"),
    ]);
    const t: TraceTemps = {
      ...(traceVide("temps") as TraceTemps),
      mesures: [{ nom: "Jauge", x: [9, 10, 11], y: [-100, -150, -100] }],
      aligner: true,
    };
    const r = executerTrace(t, c)!;
    expect(validateGraph(r.doc).ok).toBe(true);
    expect(r.doc.series.at(-1)).toMatchObject({
      name: "Jauge",
      type: "points",
      color: "#000000",
      mark: "o",
    });
    expect(r.ecartsMesures!.length).toBeGreaterThan(0);
    expect(r.ecartsMesures![0]!.mesure).toBe("Jauge");
    const p: TraceProfils = {
      ...(traceVide("profils") as TraceProfils),
      mesures: [{ nom: "Profil mesuré", x: [100, 200], y: [-150, -120] }],
    };
    const rp = executerTrace(p, c)!;
    // profil vertical : la coordonnée (profondeur) en ordonnée
    expect(rp.doc.series.at(-1)).toMatchObject({
      name: "Profil mesuré",
      x: [-150, -120],
      y: [100, 200],
    });
    expect(
      lireTrace({
        mode: "temps",
        mesures: [{ nom: "J", x: [1, 2], y: [3, 4] }, { x: [1] }],
        aligner: true,
      }),
    ).toMatchObject({
      mesures: [{ nom: "J", x: [1, 2], y: [3, 4] }],
      aligner: true,
    });
  });
});

describe("vérification des fichiers", () => {
  it("unités différentes, légendes en double, cas manquants, pic au bord", () => {
    const a = lire("grille_XZ_EL_het.txt", "coupe_EL_het.txt");
    const b = lire("grille_XZ_VE_het.txt", "coupe_VE_het.txt");
    const c2 = lire("grille_XZ_EL_het.txt", "coupe_EL_rect.txt");
    // même grandeur sans le facteur 1e6 : unité « - » au lieu de µdef
    const d = lireComsol(
      readFileSync(
        new URL("./fixtures/grille_XZ_EL_het.txt", import.meta.url),
        "utf8",
      ).replace(/1e6\*solid\.eZZ/g, "solid.eZZ"),
      "coupe_XX_yy.txt",
    );
    const constats = diagnostiquer([a, b, c2, d], {
      legende: (e) =>
        e === d
          ? "EL het"
          : e.nom.replace(/^coupe_|\.txt$/g, "").replace("_", " "),
      longueur: "mm",
    });
    const textes = constats.map((x) => x.texte).join("\n");
    expect(textes).toMatch(
      /εzz n'a pas la même unité partout : µdef \(coupe_EL_het, coupe_VE_het, coupe_EL_rect\) ; - \(coupe_XX_yy\)/,
    );
    expect(textes).toMatch(
      /coupe_EL_het et coupe_XX_yy ont la même légende « EL het »/,
    );
    expect(textes).toMatch(
      /coupe_EL_het : pic au bord de la zone exportée pour εxx \(x = 900, z = −320 mm\), εzz \(x = 700 mm\)/,
    );
    const plan = diagnostiquer([a, b, c2], {
      legende: (e) => e.nom,
      longueur: "mm",
    }).map((x) => x.texte);
    expect(plan.join("\n")).toMatch(
      /Coupes : 2 × 2 cas d'après les noms, il manque VE × rect\./,
    );
  });
});
