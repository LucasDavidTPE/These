import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutFigure, resolveAnchor } from "../layout";
import { validateParams } from "../params";
import { validateFigure } from "../validate";
import type { FigureDoc, Item } from "../types";
import { COMPONENT_LIST } from "./index";
import { profileFunction } from "./loads";

const golden = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "tests", "golden");

function place(item: Partial<Item>): ReturnType<typeof layoutFigure> {
  const r = validateFigure({ format: "figurine/1", canvas: { unit: "mm", width: 300, height: 200, grid: 1 }, theme: "these", items: [item] });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return layoutFigure(r.doc as FigureDoc);
}

describe("tous les composants", () => {
  for (const def of COMPONENT_LIST) {
    it(`${def.type} : valeurs par défaut valides, géométrie et ancres finies`, () => {
      const params = validateParams(def.params, {}, "p");
      expect(params.errors).toEqual([]);
      expect(def.check?.(params.value) ?? []).toEqual([]);
      const item: Partial<Item> =
        def.placement === "segment" ? { id: "x", type: def.type, from: [20, 100], to: [120, 100] } : { id: "x", type: def.type, at: [100, 100] };
      const l = place(item);
      expect(l.errors).toEqual([]);
      const p = l.placed[0]!;
      expect(p.primitives.length).toBeGreaterThan(0);
      const nums = JSON.stringify(p.primitives).match(/-?\d+(\.\d+)?(e-?\d+)?|null|NaN|Infinity/g) ?? [];
      expect(nums).not.toContain("NaN");
      expect(nums).not.toContain("Infinity");
      for (const [name, pt] of Object.entries(p.anchors)) {
        expect(Number.isFinite(pt[0]) && Number.isFinite(pt[1]), name).toBe(true);
      }
      expect(def.summary(p.item.params, p.ctx).length).toBeGreaterThan(0);
    });
  }

  it("chaque composant figure dans au moins une figure golden", () => {
    const used = new Set<string>();
    for (const f of readdirSync(golden).filter((f: string) => f.endsWith(".json"))) {
      for (const it of (JSON.parse(readFileSync(join(golden, f), "utf8")) as { items: Item[] }).items) used.add(it.type);
    }
    expect(COMPONENT_LIST.map((c) => c.type).filter((t) => !used.has(t))).toEqual([]);
  });

  it("chaque type est documenté dans docs/COMPOSANTS.md", () => {
    const doc = readFileSync(join(golden, "..", "..", "..", "..", "docs", "figurine", "COMPOSANTS.md"), "utf8");
    expect(COMPONENT_LIST.map((c) => c.type).filter((t) => !doc.includes(`\`${t}\``))).toEqual([]);
  });
});

describe("rhéologie", () => {
  it("KVG à 9 éléments : 9 blocs parallèles numérotés, ancres par élément", () => {
    const l = place({ id: "k", type: "kvg", from: [0, 50], to: [200, 50], params: { n: 9 } });
    const p = l.placed[0]!;
    const labels = p.primitives.filter((x) => x.kind === "text").map((x) => (x.kind === "text" ? x.text : ""));
    expect(labels).toEqual(["$E_0$", ...Array.from({ length: 9 }, (_, i) => [`$E_{${i + 1}}$`, `$\\eta_{${i + 1}}$`]).flat()]);
    expect(p.anchors["item[9].end"]![0]).toBeCloseTo(200, 9);
    expect(p.anchors["item[1].branch[1].start"]).toBeDefined();
  });

  it("2S2P1D : deux ressorts, deux paraboliques, un amortisseur", () => {
    const p = place({ id: "m", type: "model_2s2p1d", from: [0, 50], to: [80, 50] }).placed[0]!;
    expect(p.primitives.filter((x) => x.kind === "zigzag")).toHaveLength(2);
    // Paraboliques : pistons en courbe de Bézier.
    expect(p.primitives.filter((x) => x.kind === "path" && x.segs.some((s) => s.op === "C"))).toHaveLength(2);
    const texts = p.primitives.filter((x) => x.kind === "text").map((x) => (x.kind === "text" ? x.text : ""));
    expect(texts).toEqual(["$E_{00}$", "$E_0 - E_{00}$", "$k$", "$h$", "$\\eta$"]);
  });

  it("Maxwell généralisé sans ressort d'équilibre", () => {
    const p = place({ id: "g", type: "generalized_maxwell", from: [0, 50], to: [60, 50], params: { n: 2, with_equilibrium: false } }).placed[0]!;
    expect(p.primitives.filter((x) => x.kind === "zigzag")).toHaveLength(2);
  });
});

describe("chargements", () => {
  it("profil à 5 gaussiennes : maxima aux centres ±0,16 m", () => {
    const params = validateParams(
      COMPONENT_LIST.find((c) => c.type === "pressure_profile")!.params,
      { centers: [-0.16, -0.08, 0, 0.08, 0.16], amplitudes: [1.8, 1.7, 1.67, 1.7, 1.8], sigma: 0.0315 },
      "p",
    ).value;
    const f = profileFunction(params);
    const c = [-0.16, -0.08, 0, 0.08, 0.16];
    const A = [1.8, 1.7, 1.67, 1.7, 1.8];
    const expected = c.reduce((s, ci, i) => s + A[i]! * Math.exp(-((0.16 - ci) ** 2) / (2 * 0.0315 ** 2)), 0);
    expect(f(0.16)).toBeCloseTo(expected, 12);
    expect(f(0.16)).toBeGreaterThan(f(0.12));
    expect(f(0.3)).toBeLessThan(0.01);
    expect(f(-0.16)).toBeCloseTo(f(0.16), 9);
  });

  it("profil : erreurs de paramètres claires", () => {
    const def = COMPONENT_LIST.find((c) => c.type === "pressure_profile")!;
    const check = (raw: Record<string, unknown>) => def.check!(validateParams(def.params, raw, "p").value).map((e) => e.path);
    expect(check({ span: [0.2, -0.2] })).toEqual(["span"]);
    expect(check({ centers: [0, 1], amplitudes: [1] })).toEqual(["amplitudes"]);
    expect(check({ model: "function", expression: "y +" })).toEqual(["expression"]);
    expect(check({ model: "function", expression: "1/y" , span: [-1, 1] })).toEqual(["expression"]);
  });

  it("profil posé sur une chaussée : suit son ancre", () => {
    const r = validateFigure({
      format: "figurine/1",
      canvas: { unit: "mm", width: 140, height: 90, grid: 1 },
      theme: "these",
      items: [
        { id: "pav", type: "layer_stack", at: [10, 20], params: { width: 110 } },
        { id: "p", type: "pressure_profile", on: "pav.top", params: {} },
      ],
    });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const l = layoutFigure(r.doc);
    expect(resolveAnchor(l, "p.center")).toEqual({ point: [65, 20] });
    expect(resolveAnchor(l, "p.left")).toEqual({ point: [35, 20] });
  });

  it("force : pointe au point d'application par défaut, queue en traction", () => {
    const a = place({ id: "f", type: "force", at: [50, 50] }).placed[0]!;
    expect(a.anchors.tip).toEqual([50, 50]);
    expect(a.anchors.tail![1]).toBeCloseTo(38);
    const b = place({ id: "f", type: "force", at: [50, 50], params: { angle: 0, applied_at: "queue" } }).placed[0]!;
    expect(b.anchors.tail).toEqual([50, 50]);
    expect(b.anchors.tip![0]).toBeCloseTo(62);
  });

  it("bogie : une ancre par roue et par essieu", () => {
    const p = place({ id: "b", type: "bogie", at: [100, 100], params: { axles: 3, wheels: 2, axle_spacing: 20, wheel_spacing: 16 } }).placed[0]!;
    expect(Object.keys(p.anchors).filter((k) => k.startsWith("wheel["))).toHaveLength(6);
    expect(p.anchors["wheel[0]"]).toEqual([92, 80]);
    expect(p.anchors["axle[2]"]).toEqual([100, 120]);
    expect(p.primitives.filter((x) => x.kind === "rect")).toHaveLength(6);
  });

  it("roue en coupe : posée par son point de contact", () => {
    const p = place({ id: "r", type: "wheel_section", at: [50, 60] }).placed[0]!;
    expect(p.anchors.contact).toEqual([50, 60]);
    expect(p.anchors.top![1]).toBeLessThan(60 - 14);
  });
});

describe("structure", () => {
  it("appui glissant : trois rouleaux", () => {
    const p = place({ id: "a", type: "simple_support", at: [50, 50], params: { variant: "glissant" } }).placed[0]!;
    expect(p.primitives.filter((x) => x.kind === "circle")).toHaveLength(3);
  });

  it("encastrement : hachures du côté demandé", () => {
    const right = place({ id: "e", type: "fixed_support", from: [0, 50], to: [20, 50] }).placed[0]!;
    const left = place({ id: "e", type: "fixed_support", from: [0, 50], to: [20, 50], params: { side: "gauche" } }).placed[0]!;
    const lastY = (p: typeof right) => {
      const prim = p.primitives.at(-1)!;
      return prim.kind === "path" && prim.segs[1]!.op === "L" ? prim.segs[1]!.p[1] : NaN;
    };
    expect(lastY(right)).toBeGreaterThan(50);
    expect(lastY(left)).toBeLessThan(50);
  });
});
