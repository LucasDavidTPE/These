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
