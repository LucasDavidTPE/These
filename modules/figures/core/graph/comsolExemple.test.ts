import { describe, expect, it } from "vitest";
import { estComsol, geometrie, lireComsol } from "./comsol";
import { modesDisponibles } from "./comsolAtelier";
import { executerTrace, traceVide, type ModeTrace } from "./comsolEtude";
import { criteresDefaut } from "./comsolCriteres";
import { diagnostiquer } from "./comsolDiagnostic";
import { bassinExemple, jeuExemple, mesureExemple } from "./comsolExemple";
import { lireMesures } from "./comsolMesures";
import { pistes } from "./comsolPistes";
import { validateGraph } from "./model";

describe("jeu d'exemple", () => {
  const fichiers = jeuExemple();
  const exports = fichiers.map((f) => lireComsol(f.texte, f.nom));

  it("des exports COMSOL lisibles, de toutes les formes", () => {
    expect(fichiers.every((f) => estComsol(f.texte))).toBe(true);
    const genres = exports.map((e) => geometrie(e).genre);
    expect(genres.filter((g) => g === "coupe")).toHaveLength(8);
    expect(genres.filter((g) => g === "profil")).toHaveLength(7);
    expect(genres.filter((g) => g === "serie")).toHaveLength(1);
    expect(
      Object.values(modesDisponibles(exports)).every((x) => x === null),
    ).toBe(true);
  });

  it("chaque tuile trace quelque chose de valide, sans point d'attention", () => {
    const c = {
      exports,
      cadre: {
        longueur: "mm" as const,
        couches: true,
        source: "auto" as const,
      },
      noms: {},
      correspondances: [],
      interfaces: [
        { z: -0.08, texte: "BB/GB" },
        { z: -0.32, texte: "GB/GRH" },
      ],
      criteres: criteresDefaut(),
    };
    for (const mode of [
      "profils",
      "carte",
      "temps",
      "comparer",
      "synthese",
      "criteres",
      "bassin",
      "maillage",
      "sensibilite",
    ] as ModeTrace[]) {
      const r = executerTrace(traceVide(mode), c);
      expect(r, mode).not.toBeNull();
      expect(validateGraph(r!.doc).ok, mode).toBe(true);
    }
    expect(
      diagnostiquer(exports, { legende: (e) => e.nom, longueur: "mm" }).filter(
        (x) => x.niveau === "attention",
      ),
    ).toEqual([]);
    expect(
      pistes(exports, { legende: (e) => e.nom, longueur: "mm" }).length,
    ).toBeGreaterThanOrEqual(7);
    // ordres de grandeur d'une chaussée : εt de la GB en traction, εz du sol en compression
    const cr = executerTrace(traceVide("criteres"), c)!.tableau!;
    const el = cr.lignes.find((l) => l.fichier === "coupeXZ_R1_EL_het.txt")!;
    expect(
      el.cases.every((x) => "valeur" in x && x.valeur > 10 && x.valeur < 500),
    ).toBe(true);
  });

  it("mesure de jauge et bassin HWD à coller", () => {
    const [m] = lireMesures(mesureExemple());
    expect(m!.nom).toBe("Jauge T1 (µdef)");
    expect(m!.x).toHaveLength(41);
    const [b] = lireMesures(bassinExemple());
    expect(b!.x[0]).toBe(0);
    expect(b!.y[0]).toBeGreaterThan(500);
  });
});
