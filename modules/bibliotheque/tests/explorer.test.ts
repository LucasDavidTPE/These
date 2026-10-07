import { describe, expect, it } from "vitest";
import { appliquerNettoyage, cleLache, compagnes, couverture, facettes, filtrer, proposerNettoyage, separerParenthese, voisins } from "../core/explorer";
import { decouperTexte, reglagesLectureVides, type ObjetRef } from "../core/lecture";
import { lireReference } from "../core/modele";

const ref = (id: string, lecture: Record<string, string[]>, statut = "Lu"): ObjetRef => ({
  id,
  valeur: lireReference({ titre: id, statut, lecture: Object.fromEntries(Object.entries(lecture).map(([c, e]) => [c, { etiquettes: e }])) }),
});
const reglages = reglagesLectureVides();
const refs = [
  ref("BIB-001", { loi: ["Viscoélastique"], methode: ["MEF 3D"], chargement: ["mobile"] }),
  ref("BIB-002", { loi: ["Viscoélastique"], methode: ["Semi-analytique"], chargement: ["mobile"] }),
  ref("BIB-003", { loi: ["Élastique"], methode: ["Burmister"] }),
  ref("BIB-004", { loi: ["Viscoélastique"], methode: ["MEF 3D"] }, "Écarté"),
];

describe("facettes croisées", () => {
  it("filtre par étiquettes (ET) et compte dans la sélection", () => {
    const sel = filtrer(refs, [{ critere: "loi", cle: "viscoelastique" }]);
    expect(sel.map((r) => r.id)).toEqual(["BIB-001", "BIB-002", "BIB-004"]);
    expect(filtrer(refs, [{ critere: "loi", cle: "viscoelastique" }, { critere: "methode", cle: "mef 3d" }]).map((r) => r.id)).toEqual(["BIB-001", "BIB-004"]);
    const f = facettes(refs, sel, reglages).find((x) => x.critere === "methode")!;
    expect(f.renseignes).toBe(3);
    expect(f.etiquettes.map((e) => [e.etiquette, e.total, e.dansSelection])).toEqual([
      ["MEF 3D", 2, 2],
      ["Burmister", 1, 0],
      ["Semi-analytique", 1, 1],
    ]);
    expect(couverture(refs[2]!, reglages).filter(Boolean)).toHaveLength(2);
  });

  it("voisins (articles écartés exclus) et étiquettes compagnes", () => {
    expect(voisins(refs, "BIB-001").map((v) => [v.id, v.communes.length])).toEqual([["BIB-002", 2]]);
    expect(voisins(refs, "BIB-999")).toEqual([]);
    expect(compagnes(refs, "loi", "viscoelastique").slice(0, 2)).toEqual([
      { critere: "methode", etiquette: "MEF 3D", n: 2 },
      { critere: "chargement", etiquette: "mobile", n: 2 },
    ]);
  });
});

describe("vocabulaire propre", () => {
  it("parenthèses : tête et précision ; découpage d'un ancien champ sans casser les parenthèses", () => {
    expect(separerParenthese("Viscoélastique (2S2P1D, linéaire)")).toEqual({ tete: "Viscoélastique", precision: "2S2P1D, linéaire" });
    expect(separerParenthese("MEF 3D")).toBeNull();
    expect(decouperTexte("Viscoélastique (2S2P1D, linéaire), MEF 3D ; mobile")).toEqual({
      etiquettes: ["Viscoélastique", "MEF 3D", "mobile"],
      note: "Viscoélastique : 2S2P1D, linéaire",
    });
  });

  it("clé lâche : pluriels, tirets, casse, accents", () => {
    expect(cleLache("Éléments finis")).toBe(cleLache("element-fini"));
    expect(cleLache("MEF 3D")).toBe(cleLache("mef  3d"));
    expect(cleLache("Pneus")).toBe(cleLache("pneu"));
  });

  it("propose séparations et fusions, applique sans perdre la précision", () => {
    const sales = [
      ref("BIB-001", { loi: ["Viscoélastique (2S2P1D)"], methode: ["Éléments finis"] }),
      ref("BIB-002", { loi: ["viscoélastique"], methode: ["élément fini"] }),
      ref("BIB-003", { loi: ["Viscoélastique"], methode: ["Elements finis"] }),
      ref("BIB-004", { methode: ["Une méthode décrite par une phrase beaucoup trop longue pour une étiquette"] }),
    ];
    const p = proposerNettoyage(sales, reglages);
    expect(p.separations).toEqual([{ critere: "loi", etiquette: "Viscoélastique (2S2P1D)", tete: "Viscoélastique", precision: "2S2P1D", ids: ["BIB-001"] }]);
    expect(p.fusions.map((f) => [f.critere, f.cible, f.sources])).toEqual([
      ["methode", "Éléments finis", ["élément fini"]],
    ]);
    expect(p.longues.map((l) => l.ids)).toEqual([["BIB-004"]]);
    const m = appliquerNettoyage(sales, p.separations, p.fusions);
    expect(m.map((x) => [x.id, x.valeur.lecture.loi?.etiquettes, x.valeur.lecture.loi?.note, x.valeur.lecture.methode?.etiquettes])).toEqual([
      ["BIB-001", ["Viscoélastique"], "2S2P1D", ["Éléments finis"]],
      ["BIB-002", ["viscoélastique"], "", ["Éléments finis"]],
    ]);
  });
});
