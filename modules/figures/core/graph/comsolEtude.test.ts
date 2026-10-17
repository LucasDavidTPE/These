import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lireComsol } from "./comsol";
import {
  carteDeSelection,
  construireDerives,
  construireExport,
  executerTrace,
  identifiant,
  lireEtude,
  lireTrace,
  normaliser,
  rafraichirDonnees,
  traceVide,
  type Cadre,
  type ContexteTrace,
  type FichierEtude,
  type ModeTrace,
  type TraceCriteres,
  type TraceTemps,
} from "./comsolEtude";
import { validateGraph } from "./model";

const texte = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");
const lire = (n: string) => lireComsol(texte(n), n);
const cadre: Cadre = { longueur: "mm", couches: true, source: "auto" };
const ctx = (exports = [lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_het.txt"), lire("table_temps_VE.txt"), lire("table_temps_EL_seule.txt"), lire("verticale_max_std_el_lc3_het.txt"), lire("verticale_max_std_ve_lc3_het.txt")]): ContexteTrace => ({
  exports,
  cadre,
  noms: {},
  correspondances: [{ de: "VE", vers: "Viscoélastique" }],
  interfaces: [{ z: -0.08, texte: "BB/GB" }],
});

describe("recettes de l'atelier (exécution pure)", () => {
  it("chaque mode s'exécute avec ses valeurs par défaut, et le graphe est valide", () => {
    const c = ctx();
    for (const mode of ["profils", "carte", "temps", "comparer", "synthese"] as ModeTrace[]) {
      const r = executerTrace(traceVide(mode), c);
      expect(r, mode).not.toBeNull();
      expect(validateGraph(r!.doc).ok, mode).toBe(true);
    }
    expect(executerTrace(traceVide("coupe-profils"), c)).toBeNull(); // aucune ligne placée
    const r = executerTrace({ ...traceVide("coupe-profils"), valeurs: [750, 848] } as never, c)!;
    expect(r.doc.series.map((s) => s.name)).toEqual(["a. $x$ = 750 mm", "b. $x$ = 848 mm"]);
    expect(r.doc.reperes?.[0]).toMatchObject({ texte: "BB/GB" });
    const carte = carteDeSelection({ ...traceVide("coupe-profils"), valeurs: [750] } as never, c)!;
    expect(carte.reperes!.at(-1)).toEqual({ axe: "x", valeur: 750, texte: "a", trait: "solid" });
  });

  it("normaliser complète les choix et remplace ceux devenus impossibles", () => {
    const c = ctx();
    expect(normaliser(traceVide("carte"), c.exports)).toMatchObject({ plan: "grille_XZ_EL_het.txt", expression: "1e6*solid.eZZ" });
    expect(normaliser({ ...traceVide("carte"), plan: "disparu.txt", expression: "inconnue" } as never, c.exports)).toMatchObject({ plan: "grille_XZ_EL_het.txt", expression: "1e6*solid.eZZ" });
    expect(normaliser(traceVide("comparer"), c.exports)).toMatchObject({ a: "grille_XZ_EL_het.txt", b: "grille_XZ_VE_het.txt", expression: "1e6*solid.eZZ" });
    const s = normaliser(traceVide("synthese"), c.exports);
    expect(s).toMatchObject({ expressions: ["1e6*solid.eZZ"], barres: { expression: "1e6*solid.eZZ", categorie: 3, groupe: 2 } });
    expect((s as { fichiers: string[] }).fichiers).not.toContain("table_temps_VE.txt");
  });

  it("temps : référence prise sur un autre fichier ; comparer : le fichier calculé est rendu", () => {
    const c = ctx();
    const t = executerTrace({ ...traceVide("temps"), fichiers: ["table_temps_VE.txt"], reference: { genre: "fichier", fichier: "table_temps_EL_seule.txt", texte: "Élastique" } } as never, c)!;
    expect(t.doc.reperes?.[0]).toMatchObject({ axe: "y", texte: "Élastique" });
    expect(t.doc.reperes![0]!.valeur).toBeCloseTo(-100, 6);
    const r = executerTrace({ ...traceVide("comparer"), a: "grille_XZ_VE_het.txt", b: "grille_XZ_EL_het.txt" } as never, c)!;
    expect(r.calcule?.nom).toContain("/");
    expect(r.doc.carte!.v[0]![0]).toBeCloseTo(1.5, 9);
    expect(() => executerTrace({ ...traceVide("comparer"), a: "grille_XZ_VE_het.txt", b: "grille_XZ_VE_het.txt" } as never, c)).toThrow(/même fichier/);
  });
});

describe("études : fichiers rejoués, dérivés, lecture tolérante", () => {
  it("relit un fichier avec sa lecture corrigée et ses transformations, dans l'ordre", () => {
    const f: FichierEtude = {
      nom: "grille_XZ_EL_het.txt",
      source: "onedrive:COMSOL/grille_XZ_EL_het.txt",
      absolu: null,
      transformations: [
        { genre: "repere", k: 2, facteur: -1, origine: 0 },
        { genre: "colonne", formule: "abs(ezz)", nom: "|εzz|", unite: "µdef" },
      ],
    };
    const e = construireExport(texte("grille_XZ_EL_het.txt"), f);
    expect(e.valeurs[2]![0]).toBeCloseTo(0.32, 12);
    expect(e.colonnes.at(-1)!.expression).toBe("|εzz|");
    expect(e.valeurs.at(-1)![0]).toBe(129);
    const { exports, erreurs } = construireDerives([e, lire("grille_XZ_VE_het.txt")], [{ nom: "VE / EL", genre: "operation", a: "grille_XZ_VE_het.txt", b: "grille_XZ_EL_het.txt", op: "rapport", legendeA: "VE", legendeB: "EL" }]);
    // repère différent → grilles différentes : signalé, pas d'exception
    expect(exports).toHaveLength(2);
    expect(erreurs[0]).toMatch(/VE \/ EL : Grilles différentes/);
  });

  it("lecture tolérante : champs abîmés ignorés, valeurs par défaut", () => {
    const e = lireEtude({
      id: "article-empreintes",
      titre: "Article",
      cadre: { longueur: "cm", couches: false, source: "nom" },
      fichiers: [{ nom: "a.txt", source: "onedrive:a.txt", transformations: [{ genre: "repere", k: 2, facteur: -1, origine: 0 }, { genre: "?" }] }, { pasdenom: 1 }],
      derives: [{ nom: "r", a: "a.txt", b: "b.txt", op: "ecart" }],
      recettes: [{ id: "r1", nom: "Carte", trace: { mode: "carte", plan: "a.txt", isolignes: [1, "x", 2] }, cadre: {} }, { id: "r2", trace: { mode: "inconnu" } }],
    });
    expect(e.cadre).toEqual({ longueur: "cm", couches: false, source: "nom" });
    expect(e.fichiers).toEqual([{ nom: "a.txt", source: "onedrive:a.txt", absolu: null, transformations: [{ genre: "repere", k: 2, facteur: -1, origine: 0 }] }]);
    expect(e.derives[0]).toMatchObject({ op: "ecart", legendeA: "a.txt" });
    expect(e.recettes).toHaveLength(1);
    expect(e.recettes[0]!.trace).toMatchObject({ mode: "carte", plan: "a.txt", isolignes: [1, 2], palette: "auto" });
    expect(lireTrace({ mode: "temps", reference: { genre: "valeur", valeur: -100, texte: "EL" } })).toMatchObject({ reference: { genre: "valeur", valeur: -100 } });
    expect(identifiant("Article : empreintes (VE/EL)", new Set(["article-empreintes-ve-el"]))).toBe("article-empreintes-ve-el-2");
  });
});

describe("régénération d'une figure", () => {
  it("nouvelles données, retouches gardées", () => {
    const c = ctx();
    const ancien = executerTrace(traceVide("carte"), c)!.doc;
    const retouche = { ...ancien, width: 140, x: { ...ancien.x, label: "Largeur (mm)" }, carte: { ...ancien.carte!, palette: "turbo" as const, isolignes: [-150] } };
    const autre = ctx([lire("grille_XZ_VE_het.txt")]);
    const neuf = executerTrace(traceVide("carte"), autre)!.doc;
    const r = rafraichirDonnees(retouche, neuf);
    expect(r.width).toBe(140);
    expect(r.x.label).toBe("Largeur (mm)");
    expect(r.carte!.palette).toBe("turbo");
    expect(r.carte!.isolignes).toEqual([-150]);
    expect(r.carte!.v[0]![0]).toBeCloseTo(-193.5, 9);
    const p = executerTrace(traceVide("profils"), c)!.doc;
    const renomme = { ...p, series: p.series.map((s, i) => ({ ...s, name: `Cas ${i}`, color: "#ff0000" })) };
    const p2 = rafraichirDonnees(renomme, { ...p, series: p.series.map((s) => ({ ...s, x: s.x.map((v) => v * 2) })) });
    expect(p2.series[0]).toMatchObject({ name: "Cas 0", color: "#ff0000" });
    expect(p2.series[0]!.x[0]).toBe(p.series[0]!.x[0]! * 2);
  });
});

describe("exports à plusieurs instants dans les recettes", () => {
  const inst = () => ctx([lire("grille_XZ_EL_het.txt"), lire("grille_XZ_VE_instants.txt")]);

  it("carte à un instant, en enveloppe ; titre avec l'instant ; points épinglés annotés", () => {
    const c = inst();
    const base = { ...(traceVide("carte") as Extract<ReturnType<typeof traceVide>, { mode: "carte" }>), plan: "grille_XZ_VE_instants.txt", expression: "1e6*solid.eXX" };
    const r10 = executerTrace({ ...base, etape: { t: { valeur: "10" } } }, c)!;
    expect(r10.titre).toMatch(/\(t = 10\)$/);
    expect(r10.doc.carte!.v[0]![2]).toBeCloseTo(106, 6);
    const r11 = executerTrace({ ...base, etape: { t: { valeur: "11" } } }, c)!;
    expect(r11.doc.carte!.v[0]![2]).toBeCloseTo(-84.8, 6);
    const env = executerTrace({ ...base, etape: { t: { enveloppe: "abs" } } }, c)!;
    expect(env.doc.carte!.v[0]![2]).toBeCloseTo(106, 6);
    expect(env.titre).toMatch(/\|max\| sur t/);
    const ep = executerTrace({ ...base, etape: { t: { valeur: "10" } }, epingles: [{ x: 850, y: -100 }, { x: 5000, y: 0 }] }, c)!;
    expect(ep.doc.annotations).toEqual([{ x: 850, y: -100, texte: "90 µdef", position: "south west" }]); // texte vers l'intérieur de la carte
    expect(validateGraph(ep.doc).ok).toBe(true);
  });

  it("critères sur l'enveloppe ; signal en un point gardé comme dérivé, relu avec l'étude", () => {
    const c = inst();
    const cr = { id: "et", nom: "εt", genre: "traction" as const, z: -0.32, cote: "dessus" as const, decalage: 0, variables: ["exx"], loi: { genre: "fatigue" as const, epsilon6: 100, b: -0.2, k: 1 } };
    const r = executerTrace({ ...(traceVide("criteres") as TraceCriteres), fichiers: ["grille_XZ_VE_instants.txt"], etape: { t: { enveloppe: "max" } } }, { ...c, criteres: [cr] })!;
    expect(r.tableau!.lignes[0]!.cases[0]).toMatchObject({ valeur: 106 });
    const d = construireDerives(c.exports, [{ nom: "signal.txt", genre: "signal", fichier: "grille_XZ_VE_instants.txt", point: [0.9, null, -0.32], parametre: "t", etape: null, legende: "VE, x = 0,9 m" }]);
    expect(d.erreurs).toEqual([]);
    const s = d.exports.at(-1)!;
    expect(s.nature).toBe("table");
    const temps = executerTrace({ ...(traceVide("temps") as TraceTemps), fichiers: ["signal.txt"] }, { ...c, exports: d.exports })!;
    expect(temps.doc.series[0]!.y.map((v) => Number(v.toFixed(3)))).toEqual([53, 106, -84.8]);
    const e = lireEtude({ derives: [{ nom: "signal.txt", genre: "signal", fichier: "a.txt", point: [0.9, "x", -0.32], parametre: "t", etape: { t: { enveloppe: "abs" }, faux: 3 }, legende: "L" }] });
    expect(e.derives).toEqual([{ nom: "signal.txt", genre: "signal", fichier: "a.txt", point: [0.9, null, -0.32], parametre: "t", etape: { t: { enveloppe: "abs" } }, legende: "L" }]);
    expect(lireTrace({ mode: "carte", etape: { t: { valeur: "10" } }, epingles: [{ x: 1, y: 2 }, { x: "a" }] })).toMatchObject({ etape: { t: { valeur: "10" } }, epingles: [{ x: 1, y: 2 }] });
    expect(lireTrace({ mode: "carte" })).not.toHaveProperty("etape");
  });
});
