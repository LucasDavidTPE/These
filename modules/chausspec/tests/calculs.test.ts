/**
 * Conformité au code Python d'origine (chausspec v0.4) de toute la chaîne : lois, transformées
 * des empreintes, solveur grille (statique, roulant 2S2P1D, harmonique KVG, efforts
 * tangentiels, carte de pression, empreinte De Beer filtrée) et solveur axisymétrique.
 * Référence : tests/reference/calculs.json, produite par le Python (voir README du module).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resoudreAxisym } from "../core/axisym";
import { carte, creneau, demiEllipse, disque, pairesGaussiennes, ramenerA, rectangle, separable, tabule, force } from "../core/chargements";
import { casDe, lireCarteCSV, sortiesDe, type CasJSON } from "../core/cas";
import { cleChamp, resoudreGrille } from "../core/grille";
import { deuxS2P1D, elastique, kvg, maxwellGeneralise } from "../core/materiaux";
import { Structure } from "../core/structure";

type Cx = [number, number][];
const ref = JSON.parse(readFileSync(new URL("./reference/calculs.json", import.meta.url), "utf8")) as {
  lois: { omega: number[]; "2s2p1d": { E: Cx; nu: Cx }; kvg: { E: Cx }; maxwell: { E: Cx } };
  empreintes: { k1: number[]; k2: number[]; ft: Record<string, Cx>; force: Record<string, number> };
  grilles: Record<string, { cas: CasJSON; x: number[]; y: number[]; champs: Record<string, Cx>; noeuds: [number, number] }>;
  axisym: { statique: Record<string, Cx>; harmonique: Record<string, Cx> };
};
const csv = readFileSync(new URL("./reference/carte_exemple.csv", import.meta.url), "utf8");

/** Écart maximal rapporté à la plus grande valeur de référence (ou à une échelle donnée). */
function ecart(obtenu: [number, number][], attendu: Cx, echelle = 0): number {
  const m = Math.max(echelle, ...attendu.map((v) => Math.hypot(...v)), 1e-300);
  return Math.max(...attendu.map((v, i) => Math.hypot(obtenu[i]![0] - v[0], obtenu[i]![1] - v[1]))) / m;
}

describe("lois de comportement", () => {
  it("2S2P1D (WLF, β fini, ν complexe), KVG, Maxwell généralisé", () => {
    const w = ref.lois.omega;
    const m1 = deuxS2P1D({ E00: 65, E0: 30000, k: 0.25, h: 0.787, delta: 1.58, tau_ref: 1.22, beta: 300, T_ref: 9.3, C1: 30, C2: 210, T: 20, nu00: 0.2, nu0: 0.45 });
    const m2 = kvg(3.0e4, [2.96e5, 1.35e5, 2.58e4, 1.16e3], [2.06e-5, 3.44e-3, 5.74e-1, 95.7], 0.3);
    const m3 = maxwellGeneralise(80, [15000, 9000, 5000], [1e-4, 1e-2, 1.0], 0.4);
    const val = (f: (w: number) => { re: number; im: number }) => w.map((x) => [f(x).re, f(x).im] as [number, number]);
    expect(ecart(val(m1.young), ref.lois["2s2p1d"].E)).toBeLessThan(1e-13);
    expect(ecart(val(m1.poisson), ref.lois["2s2p1d"].nu)).toBeLessThan(1e-13);
    expect(ecart(val(m2.young), ref.lois.kvg.E)).toBeLessThan(1e-13);
    expect(ecart(val(m3.young), ref.lois.maxwell.E)).toBeLessThan(1e-13);
  });
});

describe("transformées des empreintes", () => {
  const c = lireCarteCSV(csv);
  const fps = {
    rect: rectangle(0.9e6, 0.56, 0.4),
    circle: disque(0.7e6, 0.15),
    debeer: ramenerA(separable(demiEllipse(0.277), pairesGaussiennes([1.32, 0.8, 0.822], [0.14846, 0.08804, 0.02864], [0.02824, 0.01695, 0.01741])), 370e3),
    tab: separable(tabule([-0.2, -0.1, 0.0, 0.12, 0.2], [0, 1, 2, 1.5, 0]), creneau(0.15), 1e6),
    map: ramenerA(carte(c.x, c.y, c.P.map((l) => l.map((v) => v * 1e6))), 1e5),
  };
  for (const [nom, e] of Object.entries(fps)) {
    it(nom, () => {
      const { k1, k2 } = ref.empreintes;
      const v = k1.map((a, i) => {
        const r = e.ft(a, k2[i]!);
        return [r.re, r.im] as [number, number];
      });
      // Bessel J1 : approximation à ~1e-8 (disque, demi-ellipse)
      expect(ecart(v, ref.empreintes.ft[nom]!)).toBeLessThan(nom === "circle" || nom === "debeer" ? 1e-7 : 1e-12);
      expect(Math.abs(force(e) / ref.empreintes.force[nom]! - 1)).toBeLessThan(1e-9);
      // transformée sur grille = transformée point par point
      if (e.ftGrille) {
        const g = e.ftGrille(Float64Array.from(k1), Float64Array.from(k2));
        const p = e.ft(k1[3]!, k2[2]!);
        expect(Math.hypot(g[2 * (2 * k1.length + 3)]! - p.re, g[2 * (2 * k1.length + 3) + 1]! - p.im)).toBeLessThan(1e-9 * Math.max(1, Math.hypot(p.re, p.im)));
      }
    });
  }
});

describe("solveur grille : conformité au Python", () => {
  for (const [nom, R] of Object.entries(ref.grilles)) {
    it(nom, () => {
      const { structure, chargement, regime } = casDe(R.cas, () => csv);
      const s = sortiesDe(R.cas);
      const r = resoudreGrille(structure, chargement, regime, { profondeurs: s.profondeurs, comps: s.comps, L: s.L, N: s.N, fenetre: s.fenetre, filtre: s.filtre });
      expect(Array.from(r.x)).toEqual(R.x.map((v) => expect.closeTo(v, 12)));
      expect([...r.meta.noeudsBande]).toEqual(R.noeuds);
      // échelle d'une famille (u, e, s) : un champ nul par nature (εxz en surface sous charge
      // normale) ne vaut que du bruit numérique, qu'on compare à l'échelle de la famille
      const famille = (c: string) => Math.max(...Object.entries(R.champs).filter(([k]) => k[0] === c[0]).flatMap(([, v]) => v.map((x) => Math.hypot(...x))));
      for (const [cle, attendu] of Object.entries(R.champs)) {
        const [comp, z] = cle.split("@");
        const ch = r.champs.get(cleChamp(comp!, Number(z)))!;
        const obtenu = Array.from(ch.re, (v, i) => [v, ch.im ? ch.im[i]! : 0] as [number, number]);
        const e = ecart(obtenu, attendu, 1e-6 * famille(comp!));
        expect(e, `${nom} ${cle}`).toBeLessThan(nom === "harmonique" || nom === "debeer" ? 1e-7 : 1e-9);
      }
    }, 60000);
  }
});

describe("solveur axisymétrique", () => {
  it("statique et harmonique", () => {
    const st = new Structure(
      [
        { materiau: elastique(6000, 0.35), epaisseur: 0.15 },
        { materiau: elastique(200, 0.35), epaisseur: 0.4 },
        { materiau: elastique(50, 0.4), epaisseur: 1 },
      ],
      "halfspace",
    );
    const a = resoudreAxisym(st, 0.7e6, 0.15, [0, 0.25, 0.6], [0.05, 0.15, 0.4]);
    for (const [k, v] of Object.entries(ref.axisym.statique)) {
      const got = a[k as keyof typeof a].re.flat().map((x, i) => [x, a[k as keyof typeof a].im.flat()[i]!] as [number, number]);
      expect(ecart(got, v), k).toBeLessThan(1e-7);
    }
    const st2 = new Structure(
      [
        { materiau: kvg(3.0e4, [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2], [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900]), epaisseur: 0.2 },
        { materiau: elastique(100, 0.4), epaisseur: 1 },
      ],
      "rigid_smooth",
    );
    const h = resoudreAxisym(st2, 0.7e6, 0.15, [0, 0.3], [0, 0.2], { type: "harmonic", freq: 5 });
    for (const [k, v] of Object.entries(ref.axisym.harmonique)) {
      const got = h[k as keyof typeof h].re.flat().map((x, i) => [x, h[k as keyof typeof h].im.flat()[i]!] as [number, number]);
      expect(ecart(got, v), k).toBeLessThan(1e-7);
    }
  });
});
