/** « Ce que l'on modélise » : réseau du modèle, disposition, schéma pour Figures, essai animé. */
import { describe, expect, it } from "vitest";
import { changerModele, essaiDemo } from "../core/essai";
import { disposer, elements, texNombre, etatSinus, instantSinus, reponse, reseauModele, schemaFigures, temporel } from "../core/illustration";
import { MODELES } from "../core/modeles";

describe("schéma du modèle", () => {
  it("2S2P1D : deux ressorts, deux paraboliques, un amortisseur, constantes en valeurs", async () => {
    const e = await essaiDemo();
    const els = elements(reseauModele(e));
    expect(els.map((x) => x.kind).sort()).toEqual(["amortisseur", "parabolique", "parabolique", "ressort", "ressort"]);
    expect(els.find((x) => x.nom === "E₀₀")!.valeur).toMatch(/MPa$/);
    expect(els.find((x) => x.nom === "k")!.cles).toContain("delta");
  }, 30000);

  it("chaque modèle a un réseau disposé sans chevauchement et un schéma Figures", async () => {
    const e = await essaiDemo();
    for (const m of MODELES) {
      changerModele(e, m.id);
      const r = reseauModele(e);
      const d = disposer(r);
      expect(d.organes.length, m.id).toBe(elements(r).length);
      for (const o of d.organes) {
        expect(o.x0).toBeGreaterThanOrEqual(0);
        expect(o.x1).toBeLessThanOrEqual(d.largeur);
      }
      const s = schemaFigures(e, true);
      expect(s, m.id).not.toBeNull();
      expect(JSON.stringify(s!.schema)).not.toContain("NaN");
      // pas d'exposants Unicode dans les étiquettes TikZ
      expect(JSON.stringify(s!.schema)).not.toMatch(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/);
    }
    changerModele(e, "gkv");
    // 25 corps : le dessin en montre quatre et « … »
    expect(elements(reseauModele(e)).some((x) => x.kind === "suite")).toBe(true);
  }, 30000);
});

it("nombres LaTeX", () => {
  expect(texNombre(41250)).toBe("41250");
  expect(texNombre(0.598, 3)).toBe("0{,}598");
  expect(texNombre(1949676)).toBe("1{,}95 \\cdot 10^{6}");
});

describe("essai animé", () => {
  it("sinusoïdal : σ en avance de φ sur ε, énergie dissipée, ν du modèle", async () => {
    const e = await essaiDemo();
    const s = etatSinus(e, e.Tref, 10, 50e-6);
    expect(s.module.phase).toBeGreaterThan(0);
    expect(s.nu.modele).toBe(true);
    // maximum de σ atteint un quart de cycle moins φ avant celui de ε
    const theta = Math.PI / 2 - (s.module.phase * Math.PI) / 180;
    expect(instantSinus(s, theta).sigma).toBeCloseTo(1, 12);
    expect(instantSinus(s, Math.PI / 2).eax).toBe(1);
    expect(s.energie).toBeCloseTo(Math.PI * s.sigma0 * 50e-6 * Math.sin((s.module.phase * Math.PI) / 180) * 1000, 12);
    // plus froid : plus raide
    expect(etatSinus(e, e.Tref - 20, 10, 50e-6).module.norme).toBeGreaterThan(s.module.norme);
  }, 30000);

  it("fluage croissant, relaxation décroissante ; plus froid, plus lent", async () => {
    const e = await essaiDemo();
    const f = temporel(e, e.Tref, "fluage")!;
    const r = temporel(e, e.Tref, "relaxation")!;
    expect(reponse(f, 1)).toBeGreaterThan(reponse(f, 1e-3));
    expect(reponse(r, 1)).toBeLessThan(reponse(r, 1e-3));
    const froid = temporel(e, e.Tref - 20, "relaxation")!;
    expect(reponse(froid, 1)).toBeGreaterThan(reponse(r, 1));
  }, 30000);
});
