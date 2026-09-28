/**
 * Conformité du noyau spectral au code Python d'origine (chausspec v0.4, StiffnessKernel) :
 * mêmes λ, μ injectés, amplitudes P-SV (charges normale et tangentielle) et SH comparées à
 * chaque cote. Référence produite par tests/reference/generer.md.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { elastique } from "../core/materiaux";
import { Noyau, nouvellesAmplitudes } from "../core/noyau";
import { Structure, type Fond, type Interface } from "../core/structure";

interface Cas {
  bottom: Fond;
  interfaces: Interface[];
  h: number[];
  lam: [number, number][][];
  mu: [number, number][][];
  depths: { z: number; side: "above" | "below"; layer: number; n: [number, number][][]; t: [number, number][][]; sh: [number, number][][] }[];
}
const ref = JSON.parse(readFileSync(new URL("./reference/noyau.json", import.meta.url), "utf8")) as { xi: number[]; cas: Cas[] };

describe("noyau spectral : conformité au Python", () => {
  for (const cas of ref.cas) {
    it(`${cas.bottom}, interfaces ${cas.interfaces.join("/")}`, () => {
      const st = new Structure(
        cas.h.map((h) => ({ materiau: elastique(1), epaisseur: h })),
        cas.bottom,
        cas.interfaces,
      );
      const K = new Noyau(st, true);
      const amp = nouvellesAmplitudes();
      let pire = 0;
      ref.xi.forEach((xi, m) => {
        const lam = new Float64Array(cas.lam.flatMap((l) => l[m]!));
        const mu = new Float64Array(cas.mu.flatMap((l) => l[m]!));
        K.resoudre(xi, lam, mu);
        // échelle : amplitude maximale en surface pour ce nombre d'onde
        const echelle = (k: "n" | "t" | "sh") => Math.max(...cas.depths[0]![k].map((v) => Math.hypot(...v[m]!)), 1e-300);
        const e = { n: echelle("n"), t: echelle("t"), sh: echelle("sh") };
        for (const d of cas.depths) {
          K.amplitudes(d.z, d.side, amp);
          expect(amp.couche).toBe(d.layer);
          for (const k of ["n", "t", "sh"] as const) {
            d[k].forEach((v, i) => {
              const err = Math.hypot(amp[k][2 * i]! - v[m]![0], amp[k][2 * i + 1]! - v[m]![1]) / e[k];
              pire = Math.max(pire, err);
            });
          }
        }
      });
      expect(pire).toBeLessThan(1e-9);
    });
  }
});
