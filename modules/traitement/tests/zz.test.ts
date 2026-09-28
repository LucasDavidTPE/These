import { it } from "vitest";
import { signalDemo } from "../core/demo";
import { calerTout, essaiDepuisLecture, pointsCalage, traiter, ecartsCalage } from "../core/essai";
import { vuesCalage } from "../core/vues";
const log = (...a: unknown[]) => process.stderr.write("\n" + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
it("x", async () => {
  const table = signalDemo();
  const e = essaiDepuisLecture({ table, entetes: [], correspondance: { cycle: 0, temps: 1, position: 2, charge: 3, defM: 4, defA: 5, defB: 6, defC: 7, lion1: 8, lion2: 9, lion3: -1, lion4: -1, pt100: 10 }, uniteAxiale: "mm/mm", nom: "Essai1.csv" } as never, 0);
  await traiter(e);
  const pts = pointsCalage(e);
  log("n", pts.length, pts.slice(0, 3).map((p) => [p.T, p.f, p.module, p.phi]));
  log("aT", e.aT, "Tref", e.Tref, "p", e.p);
  let v = vuesCalage(e);
  log("maitreE series", v.maitreE.spec.series.map((s) => [s.libelle, s.points.length, s.points.filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).length]));
  calerTout(e);
  log("apres p", e.p, "aT", e.aT, ecartsCalage(e));
  v = vuesCalage(e);
  log("maitreE series", v.maitreE.spec.series.map((s) => [s.libelle, s.points.length, s.points.filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).length]));
}, 60000);
