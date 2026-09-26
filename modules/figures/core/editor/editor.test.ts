import { describe, expect, it } from "vitest";
import { layoutFigure } from "../schema/layout";
import { validateFigure } from "../schema/validate";
import type { FigureDoc } from "../schema/types";
import { hitTest, itemBox, itemsInRect, nearestAnchor, snapPoint } from "./geometry";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history";
import {
  addItem,
  alignItems,
  copyItems,
  deleteItems,
  distributeItems,
  emptyFigure,
  moveItems,
  formatPoints,
  parsePlace,
  parsePoints,
  pasteItems,
  renameItem,
  reorderItems,
  setEndpoint,
} from "./ops";
import { pixelSize, setPngDpi } from "./raster";

function norm(d: FigureDoc): FigureDoc {
  const r = validateFigure(d);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.doc;
}

function sample(): FigureDoc {
  return norm({
    format: "figurine/1",
    canvas: { unit: "mm", width: 100, height: 60, grid: 1 },
    theme: "these",
    items: [
      { id: "a", type: "rectangle", at: [0, 0], params: { width: 10, height: 10 } },
      { id: "b", type: "rectangle", at: [40, 0], params: { width: 10, height: 10 } },
      { id: "k", type: "spring", from: "a.right", to: "b.left", params: {} },
      { id: "c", type: "rectangle", on: "b.bottom", params: { width: 4, height: 4 } },
    ],
  });
}

describe("historique", () => {
  it("annule et rétablit, oublie l'avenir après une nouvelle action", () => {
    let h = createHistory(1);
    h = commit(h, 2);
    h = commit(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    h = commit(h, 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(1);
    expect(canUndo(createHistory(0))).toBe(false);
    expect(commit(h, h.present)).toBe(h);
  });
});

describe("géométrie de l'éditeur", () => {
  it("boîte d'un élément, test de clic préférant le plus petit", () => {
    const d = norm({ ...sample(), items: [...sample().items, { id: "big", type: "rectangle", at: [-5, -5], params: { width: 80, height: 40 } }] });
    const l = layoutFigure(d);
    expect(itemBox(l.placed[0]!)).toEqual({ x: 0, y: 0, w: 10, h: 10 });
    expect(hitTest(l, [5, 5])).toBe("a");
    expect(hitTest(l, [60, 30])).toBe("big");
    expect(hitTest(l, [200, 200])).toBeNull();
  });

  it("sélection par rectangle", () => {
    const l = layoutFigure(sample());
    expect(itemsInRect(l, { x: -1, y: -1, w: 12, h: 12 })).toEqual(["a"]);
    expect(itemsInRect(l, { x: 60, y: 60, w: -70, h: -70 }).sort()).toEqual(["a", "b", "c", "k"]);
  });

  it("aimantation à la grille et aux ancres", () => {
    expect(snapPoint([1.26, 2.74], 0.5)).toEqual([1.5, 2.5]);
    expect(snapPoint([1.26, 2.74], 0)).toEqual([1.26, 2.74]);
    const l = layoutFigure(sample());
    expect(nearestAnchor(l, [10.4, 5.3], 1)).toMatchObject({ ref: "a.right" });
    expect(nearestAnchor(l, [10.4, 5.3], 1, new Set(["a", "k"]))).toBeNull();
  });
});

describe("opérations", () => {
  it("ajoute un élément avec un identifiant lisible et des paramètres par défaut", () => {
    const { doc, id } = addItem(emptyFigure(), "spring", [10.3, 20.7]);
    expect(id).toBe("k1");
    expect(doc.items[0]).toMatchObject({ id: "k1", from: [10, 21], to: [30, 21], params: { coils: 4 } });
    const again = addItem(doc, "spring", [0, 0]);
    expect(again.id).toBe("k2");
    expect(addItem(emptyFigure(), "layer_stack", [5, 5]).doc.items[0]).toMatchObject({ id: "pav1", at: [5, 5] });
  });

  it("déplacer un support entraîne ce qui s'y rattache ; déplacer un élément posé le détache", () => {
    const d = sample();
    const moved = moveItems(d, ["b"], [10, 0]);
    expect(moved.items[1]!.at).toEqual([50, 0]);
    expect(moved.items[2]).toMatchObject({ from: "a.right", to: "b.left" });
    expect(layoutFigure(norm(moved)).placed[2]!.ctx.length).toBe(40);
    const detached = moveItems(d, ["c"], [0, 5]);
    expect(detached.items[3]).toMatchObject({ at: [45, 15] });
    expect(detached.items[3]!.on).toBeUndefined();
  });

  it("supprimer un support fige les éléments qui y étaient liés", () => {
    const d = deleteItems(sample(), ["b"]);
    expect(d.items.map((i) => i.id)).toEqual(["a", "k", "c"]);
    expect(d.items[1]).toMatchObject({ from: "a.right", to: [40, 5] });
    expect(d.items[2]).toMatchObject({ at: [45, 10] });
    expect(layoutFigure(norm(d)).errors).toEqual([]);
  });

  it("renommer met à jour les références", () => {
    const d = renameItem(sample(), "b", "mur");
    expect(d.items[2]).toMatchObject({ to: "mur.left" });
    expect(d.items[3]).toMatchObject({ on: "mur.bottom" });
    expect(() => renameItem(sample(), "b", "a")).toThrow("déjà utilisé");
    expect(() => renameItem(sample(), "b", "2x")).toThrow("invalide");
  });

  it("copier-coller : nouveaux identifiants, références internes suivies, externes gardées", () => {
    const d = sample();
    const clip = copyItems(d, ["b", "c"]);
    const { doc, ids } = pasteItems(d, clip, [0, 20]);
    expect(ids).toEqual(["b1", "c1"]);
    expect(doc.items.at(-2)).toMatchObject({ id: "b1", at: [40, 20] });
    expect(doc.items.at(-1)).toMatchObject({ id: "c1", on: "b1.bottom" });
    expect(layoutFigure(norm(doc)).errors).toEqual([]);
    // Copie d'un ressort seul : ses références vers a et b sont conservées.
    const k = pasteItems(d, copyItems(d, ["k"]), [0, 0]);
    expect(k.doc.items.at(-1)).toMatchObject({ id: "k1", from: "a.right", to: "b.left" });
  });

  it("extrémité liée à une ancre", () => {
    const d = setEndpoint(sample(), "k", "to", [70, 5]);
    expect(d.items[2]).toMatchObject({ to: [70, 5] });
  });

  it("ordre des calques", () => {
    const ids = (d: FigureDoc) => d.items.map((i) => i.id).join("");
    expect(ids(reorderItems(sample(), ["a"], "front"))).toBe("bkca");
    expect(ids(reorderItems(sample(), ["c"], "back"))).toBe("cabk");
    expect(ids(reorderItems(sample(), ["a"], "forward"))).toBe("bakc");
    expect(ids(reorderItems(sample(), ["k"], "backward"))).toBe("akbc");
  });

  it("alignement et répartition", () => {
    const d = norm({
      ...emptyFigure(),
      items: [
        { id: "a", type: "rectangle", at: [0, 0], params: { width: 10, height: 10 } },
        { id: "b", type: "rectangle", at: [30, 7], params: { width: 10, height: 4 } },
        { id: "c", type: "rectangle", at: [90, 3], params: { width: 10, height: 10 } },
      ],
    });
    const top = alignItems(d, ["a", "b", "c"], "top");
    expect(top.items.map((i) => i.at![1])).toEqual([0, 0, 0]);
    const mid = alignItems(d, ["a", "b"], "vcenter");
    expect(mid.items[1]!.at![1]).toBeCloseTo(3.5);
    const dist = distributeItems(d, ["a", "b", "c"], "h");
    expect(dist.items[1]!.at![0]).toBeCloseTo(45);
  });
});

describe("saisie d'une position", () => {
  it("points et ancres", () => {
    expect(parsePlace("12 ; 30")).toEqual([12, 30]);
    expect(parsePlace("12,5 ; -3")).toEqual([12.5, -3]);
    expect(parsePlace("pav.layer[0].top")).toBe("pav.layer[0].top");
    expect(parsePlace("  ")).toBeNull();
  });

  it("listes de points", () => {
    expect(parsePoints("0 0 ; 10,5 -5 ; 20 0")).toEqual([[0, 0], [10.5, -5], [20, 0]]);
    expect(parsePoints("0 0 ; 10")).toBeNull();
    expect(formatPoints([[0, 0], [10.5, -5]])).toBe("0 0 ; 10,5 -5");
  });
});

describe("export PNG", () => {
  it("taille en pixels selon la résolution", () => {
    expect(pixelSize(140, 90, 300)).toEqual({ width: 1654, height: 1063 });
    expect(pixelSize(25.4, 25.4, 600)).toEqual({ width: 600, height: 600 });
  });

  it("inscrit la résolution dans le PNG (bloc pHYs)", () => {
    // Plus petit PNG valide (1 × 1, transparent).
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const out = setPngDpi(png, 300);
    const text = String.fromCharCode(...out);
    expect(text.indexOf("pHYs")).toBeGreaterThan(text.indexOf("IHDR"));
    const at = text.indexOf("pHYs") + 4;
    expect(new DataView(out.buffer, at, 4).getUint32(0)).toBe(11811);
    // Idempotent : un seul pHYs après deux passages.
    expect(String.fromCharCode(...setPngDpi(out, 600)).split("pHYs").length).toBe(2);
  });
});
