/**
 * Modèles élémentaires (Maxwell, Kelvin-Voigt, Zener, Burgers) et séries de Prony
 * (Maxwell et Kelvin-Voigt généralisés) : limites physiques, calage, exports.
 */
import { describe, expect, it } from "vitest";
import { calerModule } from "../core/calage";
import { calerTout, changerModele, changerTref, ecartsCalage, essaiDemo, evaluer, pointsCalage, projetJSON, serieProny } from "../core/essai";
import { modele, parametresInitiaux, type ModeleCale } from "../core/modeles";
import { nnls } from "../core/nnls";
import { calerProny, ecartsProny, exportAbaqus, exportComsol, fonctionTemps, grilleTau, moduleProny, tableauProny, type SerieProny } from "../core/prony";

const proche = (a: number, b: number, rel = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("moindres carrés positifs (Lawson-Hanson)", () => {
  it("retrouve une solution positive exacte", () => {
    const x = [2, 0, 0.5, 3];
    const A = Array.from({ length: 12 }, (_, i) => [1, Math.sin(i), Math.cos(i / 2), i / 10]);
    const b = A.map((l) => l.reduce((s, a, j) => s + a * x[j]!, 0));
    const r = nnls(A, b);
    r.x.forEach((v, j) => expect(v).toBeCloseTo(x[j]!, 8));
    expect(r.residu).toBeLessThan(1e-16);
  });

  it("met à zéro ce qui voudrait être négatif", () => {
    // b = 1·a0 − 1·a1 : la meilleure solution positive annule x1
    const A = [
      [1, 1],
      [1, 2],
      [1, 3],
    ];
    const r = nnls(
      A,
      A.map((l) => l[0]! - l[1]!),
    );
    expect(r.x[1]).toBe(0);
    expect(r.x[0]).toBeGreaterThanOrEqual(0);
  });
});

describe("modèles élémentaires", () => {
  const f0 = 1e-9,
    fInf = 1e9;
  it("Maxwell : liquide, E0 à haute fréquence", () => {
    const m = modele("maxwell") as ModeleCale;
    const p = { EM: 30000, tauM: 0.01 };
    expect(m.module(f0, p).norme).toBeLessThan(1e-3);
    proche(m.module(fInf, p).norme, 30000, 1e-6);
    // à ωτ = 1 : phase 45°
    proche(m.module(1 / (2 * Math.PI * 0.01), p).phase, 45, 1e-12);
  });

  it("Kelvin-Voigt : E00 à basse fréquence, phase qui tend vers 90°", () => {
    const m = modele("kelvin-voigt") as ModeleCale;
    const p = { EKV: 5000, tauKV: 0.01 };
    proche(m.module(f0, p).norme, 5000, 1e-6);
    expect(m.module(fInf, p).phase).toBeGreaterThan(89.9);
  });

  it("Zener : de E00 à E0, un seul pic de phase", () => {
    const m = modele("zener") as ModeleCale;
    const p = { EZ00: 100, EZ0: 30000, tauZ: 0.01 };
    proche(m.module(f0, p).norme, 100, 1e-6);
    proche(m.module(fInf, p).norme, 30000, 1e-6);
  });

  it("Burgers : E0 instantané, écoulement à basse fréquence ; sans ses amortisseurs c'est deux ressorts en série", () => {
    const m = modele("burgers") as ModeleCale;
    const p = { EB1: 30000, tauB1: 10, EB2: 5000, tauB2: 0.01 };
    proche(m.module(fInf, p).norme, 30000, 1e-6);
    expect(m.module(f0, p).norme).toBeLessThan(1);
    // η1 infini, τ2 nul : 1/E = 1/E0 + 1/E2
    proche(m.module(1, { EB1: 30000, tauB1: 1e30, EB2: 5000, tauB2: 1e-30 }).norme, 1 / (1 / 30000 + 1 / 5000), 1e-9);
  });

  it("le calage retrouve les constantes d'un Zener", () => {
    const m = modele("zener") as ModeleCale;
    const vrai = { EZ00: 150, EZ0: 25000, tauZ: 0.02 };
    const points = [0.01, 0.1, 1, 3, 10, 30, 100].map((f) => {
      const c = m.module(f, vrai);
      return { T: 15, f, module: c.norme, phi: c.phase };
    });
    const r = calerModule(m, points, { 15: 1 }, { EZ00: 100, EZ0: 30000, tauZ: 0.01 });
    expect(Math.abs(r.parametres.EZ0! / 25000 - 1)).toBeLessThan(1e-3);
    expect(Math.abs(r.parametres.tauZ! / 0.02 - 1)).toBeLessThan(1e-3);
  });

  it("changer de modèle garde les constantes des autres (le GKV se construit sur le 2S2P1D)", async () => {
    const e = await essaiDemo();
    const E0 = e.p.E0!;
    changerModele(e, "gkv");
    expect(e.p.E0).toBe(E0);
    expect(Number.isFinite(evaluer(e, 1).norme)).toBe(true);
    expect(ecartsCalage(e).module).toBeLessThan(5);
    changerModele(e, "2s2p1d");
    expect(e.p.E0).toBe(E0);
    expect(parametresInitiaux(modele("zener"), { EZ0: 1234 }).EZ0).toBe(1234);
  }, 30000);

  it("caler un modèle élémentaire ne perd ni une isotherme ni le calage 2S2P1D", async () => {
    const e = await essaiDemo();
    const avant = { ...e.p };
    for (const id of ["maxwell", "kelvin-voigt", "zener", "burgers"]) {
      changerModele(e, id);
      calerTout(e);
      expect(Object.values(e.aT).every((a) => Number.isFinite(a) && a > 0), id).toBe(true);
    }
    changerModele(e, "2s2p1d");
    for (const cle of Object.keys(avant)) expect(e.p[cle], cle).toBe(avant[cle]);
    calerTout(e);
    expect(ecartsCalage(e).n).toBe(64);
    expect(ecartsCalage(e).module).toBeLessThan(1.5);
  }, 30000);

  it("changer de Tref translate tous les temps caractéristiques, ceux de Burgers compris", async () => {
    const e = await essaiDemo();
    changerModele(e, "burgers");
    const [t1, t2, t3] = [e.p.tauB1!, e.p.tauB2!, e.p.tauE!];
    const T = Object.keys(e.aT).map(Number).find((t) => t !== e.Tref)!;
    const k = e.aT[T]!;
    changerTref(e, T);
    proche(e.p.tauB1!, t1 * k, 1e-12);
    proche(e.p.tauB2!, t2 * k, 1e-12);
    proche(e.p.tauE!, t3 * k, 1e-12);
  }, 30000);
});

describe("séries de Prony", () => {
  const vraie: SerieProny = { type: "maxwell", Einf: 80, E0: 0, E: [15000, 9000, 5000, 1500, 300], tau: [1e-5, 1e-4, 1e-3, 1e-2, 1e-1] };
  vraie.E0 = vraie.Einf + vraie.E.reduce((a, v) => a + v, 0);

  it("E(t) et J(t) : valeurs aux limites", () => {
    proche(fonctionTemps(vraie, 0), vraie.E0);
    proche(fonctionTemps(vraie, 1e6), vraie.Einf);
    const kv: SerieProny = { type: "kelvin", E0: 30000, Einf: 0, E: [10000, 2000], tau: [1e-3, 1] };
    proche(fonctionTemps(kv, 0), 1 / 30000);
    proche(fonctionTemps(kv, 1e9), 1 / 30000 + 1 / 10000 + 1 / 2000);
    // à fréquence nulle, E* d'une chaîne de Kelvin-Voigt vaut 1/J(∞)
    proche(moduleProny(1e-12, kv).norme, 1 / (1 / 30000 + 1 / 10000 + 1 / 2000), 1e-6);
  });

  it("Maxwell généralisé : recalé sur ses propres valeurs, il se retrouve", () => {
    const points = Array.from({ length: 60 }, (_, i) => {
      const f = 10 ** (-3 + (8 * i) / 59);
      const m = moduleProny(f, vraie);
      return { f, re: m.re, im: m.im };
    });
    const s = calerProny(points, "maxwell", vraie.tau)!;
    s.E.forEach((E, i) => expect(Math.abs(E / vraie.E[i]! - 1)).toBeLessThan(1e-6));
    proche(s.Einf, 80, 1e-4);
  });

  it("sur la démonstration : Maxwell et Kelvin-Voigt généralisés collent aux mesures et au 2S2P1D", async () => {
    const e = await essaiDemo();
    const mesures = pointsCalage(e).map((p) => ({ f: p.f * e.aT[p.T]!, module: p.module, phi: p.phi }));
    for (const type of ["maxwell", "kelvin"] as const) {
      for (const source of ["mesures", "modele"] as const) {
        const s = serieProny(e, { type, source, parDecade: 1, nu: 0.35 })!;
        expect(s.E.length).toBeGreaterThan(4);
        expect(s.E.every((E) => E > 0) && s.E0 > s.Einf).toBe(true);
        const ec = ecartsProny(s, mesures);
        expect(ec.module, `${type} / ${source}`).toBeLessThan(3);
        expect(ec.phase, `${type} / ${source}`).toBeLessThan(1.5);
      }
    }
    // deux branches par décade : au moins aussi bien qu'une
    const un = ecartsProny(serieProny(e, { type: "maxwell", source: "modele", parDecade: 1, nu: 0.35 })!, mesures);
    const deux = ecartsProny(serieProny(e, { type: "maxwell", source: "modele", parDecade: 2, nu: 0.35 })!, mesures);
    expect(deux.module).toBeLessThanOrEqual(un.module + 0.05);
  }, 30000);

  it("grille des τ : une décade de marge de chaque côté", () => {
    const g = grilleTau(1e-3, 1e3, 1);
    expect(g[0]).toBeLessThan(1 / (2 * Math.PI * 1e3) / 5);
    expect(g.at(-1)).toBeGreaterThan(1 / (2 * Math.PI * 1e-3) * 5);
    expect(grilleTau(1e-3, 1e3, 2).length).toBeGreaterThan(g.length * 1.8);
  });

  it("exports Abaqus, COMSOL et tableau", () => {
    const c = { nom: "B2C4", nu: 0.35, Tref: 15, C1: 25, C2: 180 };
    const a = exportAbaqus(vraie, c);
    expect(a).toContain("*ELASTIC, MODULI=INSTANTANEOUS");
    expect(a).toContain("*VISCOELASTIC, TIME=PRONY");
    expect(a).toContain("*TRS, DEFINITION=WLF\n15, 25, 180");
    const lignes = a.split("\n").filter((l) => /^\d/.test(l) && l.split(",").length === 3 && !l.startsWith("15,"));
    expect(lignes).toHaveLength(5);
    const somme = lignes.reduce((s, l) => s + Number(l.split(",")[0]), 0);
    expect(somme).toBeLessThan(1);
    proche(somme, 1 - vraie.Einf / vraie.E0, 1e-7);
    const co = exportComsol(vraie, c).split("\n").filter((l) => l && !l.startsWith("%"));
    expect(co).toHaveLength(5);
    proche(Number(co[0]!.split("\t")[0]), (15000e6 / 2.7), 1e-8);
    expect(() => exportAbaqus({ ...vraie, type: "kelvin" }, c)).toThrow(/relaxation/);
    expect(tableauProny(vraie)[2]).toEqual(["i", "τi (s)", "Ei (MPa)", "gi = Ei/E0"]);
  });

  it("les réglages s'enregistrent avec le projet, et seulement s'il y en a", async () => {
    const e = await essaiDemo();
    expect(projetJSON([e])).not.toContain("prony");
    e.prony = { type: "maxwell", source: "mesures", parDecade: 1, nu: 0.35 };
    expect(JSON.parse(projetJSON([e])).essais[0].prony).toEqual(e.prony);
  }, 30000);
});

describe("calage conjoint : aucune isotherme ne s'échappe", () => {
  it("parti de a_T très faux, chaque isotherme garde un a_T fini et ses points restent comptés", async () => {
    const e = await essaiDemo();
    // état laissé par un modèle élémentaire calé avec l'ancien « Caler tout » : a_T déformés
    for (const [i, T] of Object.keys(e.aT).map(Number).entries()) if (T !== e.Tref) e.aT[T] = 10 ** ((i % 2 ? 1 : -1) * 12);
    e.p = { ...e.p, E0: 3000, tauE: 1e-6 };
    calerTout(e);
    expect(Object.values(e.aT).every((a) => Number.isFinite(a) && a > 0 && Math.abs(Math.log10(a)) <= 30)).toBe(true);
    expect(ecartsCalage(e).n).toBe(64);
  }, 30000);
});
