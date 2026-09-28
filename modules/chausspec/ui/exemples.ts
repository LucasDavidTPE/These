/** Cas d'exemple (ceux de chausspec v0.4, plus une plaque HWD). */
import type { CaseJSON } from "../core/io";
import { loadMapCsv } from "../core/io";
import carteCSV from "./carte_exemple.csv?raw";

const BBGB = { type: "2S2P1D" as const, E00: 65, E0: 30000, k: 0.25, h: 0.787, delta: 1.58, tau_ref: 1.22, beta: "inf" as const, T_ref: 9.3, nu: 0.35 };

export const STRUCTURE_PEP: CaseJSON["structure"] = {
  bottom: "rigid_smooth",
  layers: [
    { name: "BB+GB", h: 0.32, material: BBGB },
    { name: "GRH", h: 0.6, material: { type: "elastic", E: 150, nu: 0.35 } },
    { name: "Subgrade 1", h: 1.0, material: { type: "elastic", E: 75, nu: 0.35 } },
    { name: "Subgrade 2", h: 1.0, material: { type: "elastic", E: 150, nu: 0.35 } },
    { name: "Substratum", h: 2.0, material: { type: "elastic", E: 30000, nu: 0.35 } },
  ],
};

const roue = (x0: number, y0: number) => ({ x0, y0, footprint: { type: "rect" as const, lx: 0.56, ly: 0.4, force: 370000 } });

export const EXEMPLES: { id: string; nom: string; note: string; cas: () => CaseJSON }[] = [
  {
    id: "tfe",
    nom: "Train A340 sur la structure PEP (TFE)",
    note: "4 roues de 370 kN, BB-GB en 2S2P1D, charge roulante à 0,66 m/s",
    cas: () => ({
      _commentaire: "Train A340 (4 roues de 370 kN) sur la structure PEP, BB-GB en 2S2P1D (TFE, Tab. 6), charge roulante à 0,66 m/s. x = longitudinal, y = transversal, z vers le bas. Unités SI (MPa pour les modules).",
      structure: STRUCTURE_PEP,
      loading: { wheels: [roue(0, -0.7), roue(0, 0.7), roue(-1.98, -0.7), roue(-1.98, 0.7)] },
      regime: { type: "moving", speed: 0.66 },
      grid: { L: [32, 32], N: [512, 1024], window: [-5, 3, -2, 2] },
      outputs: { depths: [0.0, 0.32], components: ["uz", "exx", "eyy", "ezz", "exy", "exz", "eyz"], gauges: [{ comp: "eyy", z: 0.32, x: 0, y: 0.7 }] },
    }),
  },
  {
    id: "carte",
    nom: "Carte de pression mesurée",
    note: "Roue isolée de 100 kN, carte CSV incluse, statique, structure souple",
    cas: () => {
      const c = loadMapCsv(carteCSV);
      return {
        _commentaire: "Carte de pression (format du prototype STAC) : x, y des pixels en m, valeurs en MPa (unit = 1e6).",
        structure: {
          bottom: "halfspace",
          layers: [
            { name: "BB", h: 0.1, material: { type: "elastic", E: 7000, nu: 0.35 } },
            { name: "GNT", h: 0.3, material: { type: "elastic", E: 300, nu: 0.35 } },
            { name: "Sol", material: { type: "elastic", E: 50, nu: 0.35 } },
          ],
        },
        loading: { wheels: [{ x0: 0, y0: 0, footprint: { type: "map", x: c.x, y: c.y, P: c.P, unit: 1e6, force: 100000 } }] },
        regime: { type: "static" },
        grid: { L: [16, 16], N: [512, 512], window: [-1, 1, -1, 1] },
        outputs: { depths: [0.0, 0.1], components: ["uz", "exx", "eyy", "ezz", "exy", "exz", "eyz"] },
      };
    },
  },
  {
    id: "hwd",
    nom: "Plaque HWD, régime harmonique",
    note: "Plaque de 0,45 m, 150 kN à 10 Hz sur la structure PEP (amplitudes complexes)",
    cas: () => ({
      structure: STRUCTURE_PEP,
      loading: { wheels: [{ x0: 0, y0: 0, footprint: { type: "circle", R: 0.225, force: 150000 } }] },
      regime: { type: "harmonic", freq: 10 },
      grid: { L: [16, 16], N: [256, 256], window: [-2, 2, -2, 2] },
      outputs: { depths: [0.0, 0.32], components: ["uz", "eyy"] },
    }),
  },
];
