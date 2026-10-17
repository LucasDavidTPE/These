import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import {
  executerTrace,
  lireTrace,
  sourcesSensibilite,
  traceVide,
  type TraceSensibilite,
} from "./comsolEtude";
import { feuilleSensibilite, feuillesGraphe } from "./comsolExcel";
import {
  parametresFichiers,
  sensibiliteFichiers,
  sensibiliteInterne,
  sensibiliteLatex,
  statistique,
} from "./comsolSensibilite";
import { validateGraph } from "./model";

const texte = (n: string) =>
  readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const lire = (n: string, nom = n) => lireComsol(texte(n), nom);
// mêmes données, en-tête « lc=k » : 3 fichiers d'un balayage fait fichier par fichier
const avecLc = (k: number, f: number, ve = 0) =>
  lireComsol(
    texte("grille_XZ_EL_het.txt")
      .replace(/@ 1: lc=3, VE=0/g, `@ 1: lc=${k}, VE=${ve}`)
      .split("\n")
      .map((l) =>
        l.startsWith("%") || !l.trim()
          ? l
          : l.replace(
              /^(\S+\s+\S+\s+\S+\s+)(\S+)/,
              (_, a: string, v: string) => a + String(Number(v) * f),
            ),
      )
      .join("\n"),
    `coupe_lc${k}_VE${ve}.txt`,
  );
const ctx = (exports: ReturnType<typeof lire>[]) => ({
  exports,
  cadre: { longueur: "mm" as const, couches: false, source: "auto" as const },
  noms: {},
  correspondances: [],
  interfaces: [],
});

describe("sensibilité à un paramètre", () => {
  it("extremum (avec sa position) ou valeur en un point", () => {
    const e = lire("grille_XZ_EL_het.txt");
    expect(
      statistique(e, "1e6*solid.eXX", { stat: "max", longueur: "mm" }),
    ).toEqual({ y: 106, position: { X: 900, Y: 6500, Z: -320 } });
    expect(
      statistique(e, "1e6*solid.eZZ", { stat: "abs", longueur: "mm" })!.y,
    ).toBe(-193);
    expect(
      statistique(e, "1e6*solid.eXX", {
        stat: "abs",
        point: { x: 850, y: -100 },
        longueur: "mm",
      })!.y,
    ).toBeCloseTo(90, 9);
  });

  it("balayage dans un fichier (instants) et paramètre d'en-tête d'un fichier à l'autre", () => {
    const inst = lire("grille_XZ_VE_instants.txt");
    const [s] = sensibiliteInterne([inst], "t", "1e6*solid.eXX", {
      stat: "max",
      longueur: "mm",
      legende: () => "VE",
    });
    expect(s!.points.map((p) => [p.x, Number(p.y.toFixed(3))])).toEqual([
      [9, 53],
      [10, 106],
      [11, -56], // f(11) = −0,8 : le maximum est le moins négatif, en x = 0,7, z = 0
    ]);
    const fs = [
      avecLc(1, 1),
      avecLc(2, 1.2),
      avecLc(3, 1.5),
      avecLc(1, 2, 1),
      avecLc(2, 2.2, 1),
    ];
    expect(parametresFichiers(fs)).toEqual([
      { nom: "lc", unite: "" },
      { nom: "VE", unite: "" },
    ]);
    const series = sensibiliteFichiers(fs, "lc", "1e6*solid.eXX", {
      stat: "max",
      longueur: "mm",
    });
    expect(series.map((x) => x.nom)).toEqual(["VE=0", "VE=1"]);
    expect(series[0]!.points.map((p) => [p.x, Number(p.y.toFixed(3))])).toEqual(
      [
        [1, 106],
        [2, 127.2],
        [3, 159],
      ],
    );
    expect(sourcesSensibilite(fs).fichiers.map((p) => p.nom)).toEqual([
      "lc",
      "VE",
    ]);
    const tex = sensibiliteLatex(series, {
      parametre: "lc",
      unite: "",
      libelle: { grandeur: "$\\varepsilon_{xx}$", unite: "µdef", court: "εxx" },
      virgule: true,
    });
    expect(tex).toContain("lc & VE=0 & VE=1 \\\\");
    expect(tex).toContain("$3$ & $159$ & -- \\\\");
    expect(
      feuilleSensibilite(series, "lc").lignes[1]!.map((v) =>
        Number((v as number).toFixed(6)),
      ),
    ).toEqual([2, 127.2, 233.2]);
  });

  it("recette : graphe valide, titre, relecture ; feuilles Excel du graphe", () => {
    const c = ctx([
      lire("grille_XZ_VE_instants.txt"),
      lire("grille_XZ_EL_het.txt"),
    ]);
    const t = {
      ...(traceVide("sensibilite") as TraceSensibilite),
      expression: "1e6*solid.eXX",
      statistique: "max" as const,
    };
    const r = executerTrace(t, c)!;
    expect(r.titre).toBe("Sensibilité de εxx à t — VE instants");
    expect(validateGraph(r.doc).ok).toBe(true);
    expect(r.doc.series[0]!.type).toBe("linepoints");
    expect(
      lireTrace({
        mode: "sensibilite",
        source: "fichiers",
        parametre: "lc",
        point: { x: 1, y: 2 },
        statistique: "min",
      }),
    ).toMatchObject({
      source: "fichiers",
      parametre: "lc",
      point: { x: 1, y: 2 },
      statistique: "min",
    });
    const [f] = feuillesGraphe(r.doc);
    expect(f!.nom).toBe("Courbes");
    expect(f!.lignes).toHaveLength(3);
    const carte = executerTrace(
      {
        ...(traceVide("carte") as Extract<
          ReturnType<typeof traceVide>,
          { mode: "carte" }
        >),
        plan: "grille_XZ_EL_het.txt",
        expression: "1e6*solid.eXX",
      },
      c,
    )!;
    const [fc] = feuillesGraphe(carte.doc);
    expect(fc!.nom).toBe("Carte");
    expect(fc!.entetes.slice(1)).toEqual(["700", "800", "900"]);
    expect(fc!.lignes[0]).toEqual([-320, 86, 96, 106]);
  });
});
