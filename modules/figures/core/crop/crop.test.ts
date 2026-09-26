import { describe, expect, it } from "vitest";
import { setPngDpi } from "../editor/raster";
import {
  autoTrim,
  clampRect,
  cropImage,
  dragHandle,
  fitRatio,
  marginsFromRect,
  outputSize,
  readPngDpi,
  rectFromMargins,
  resample,
  rotate90,
  type Image,
} from "./crop";

/** Image synthétique W × H : fond (r,g,b,a), rectangle intérieur rouge opaque. */
function synth(W: number, H: number, bg: [number, number, number, number], inner: { x: number; y: number; w: number; h: number }): Image {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inside = x >= inner.x && x < inner.x + inner.w && y >= inner.y && y < inner.y + inner.h;
      rgba.set(inside ? [200, 0, 0, 255] : bg, i);
    }
  }
  return { width: W, height: H, rgba };
}

const px = (img: Image, x: number, y: number) => [...img.rgba.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe("rectangle de recadrage", () => {
  it("reste dans l'image, entier, au moins 1 px", () => {
    expect(clampRect({ x: -5, y: 2.4, w: 200, h: -10 }, 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 2 });
    expect(clampRect({ x: 99, y: 49, w: 0, h: 0 }, 100, 50)).toEqual({ x: 99, y: 49, w: 1, h: 1 });
  });

  it("ratio imposé autour du centre, dans l'image", () => {
    expect(fitRatio({ x: 0, y: 0, w: 100, h: 50 }, 1, 100, 50)).toEqual({ x: 25, y: 0, w: 50, h: 50 });
    const r = fitRatio({ x: 0, y: 0, w: 160, h: 100 }, 16 / 9, 160, 100);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 1);
  });

  it("poignées libres et déplacement borné", () => {
    const r = { x: 10, y: 10, w: 20, h: 20 };
    expect(dragHandle(r, "se", 5, 3, null, 100, 100)).toEqual({ x: 10, y: 10, w: 25, h: 23 });
    expect(dragHandle(r, "nw", -50, 0, null, 100, 100)).toEqual({ x: 0, y: 10, w: 30, h: 20 });
    expect(dragHandle(r, "move", 200, -200, null, 100, 100)).toEqual({ x: 80, y: 0, w: 20, h: 20 });
  });

  it("poignée de coin avec ratio : coin opposé fixe", () => {
    const r = dragHandle({ x: 10, y: 10, w: 40, h: 30 }, "se", 20, 0, 4 / 3, 200, 200);
    expect(r.x).toBe(10);
    expect(r.y).toBe(10);
    expect(r.w / r.h).toBeCloseTo(4 / 3, 1);
    expect(r.w).toBe(60);
  });
});

describe("marges en mm", () => {
  it("aller-retour à 300 dpi", () => {
    // 1 pouce = 300 px ; 25,4 mm = 300 px.
    const r = rectFromMargins(3000, 2000, { top: 25.4, right: 0, bottom: 25.4, left: 50.8 }, 300);
    expect(r).toEqual({ x: 600, y: 300, w: 2400, h: 1400 });
    expect(marginsFromRect(3000, 2000, r, 300)).toEqual({ top: 25.4, right: 0, bottom: 25.4, left: 50.8 });
  });
});

describe("rognage automatique", () => {
  it("bords transparents", () => {
    const img = synth(20, 10, [0, 0, 0, 0], { x: 3, y: 2, w: 5, h: 4 });
    expect(autoTrim(img, "transparent")).toEqual({ x: 3, y: 2, w: 5, h: 4 });
  });

  it("bords blancs (légèrement bruités)", () => {
    const img = synth(20, 10, [252, 253, 250, 255], { x: 10, y: 0, w: 10, h: 3 });
    expect(autoTrim(img, "blanc")).toEqual({ x: 10, y: 0, w: 10, h: 3 });
  });

  it("image vide : tout est gardé", () => {
    expect(autoTrim(synth(4, 4, [255, 255, 255, 255], { x: 0, y: 0, w: 0, h: 0 }), "blanc")).toEqual({ x: 0, y: 0, w: 4, h: 4 });
  });
});

describe("rotation et découpe", () => {
  const img = synth(3, 2, [0, 0, 255, 255], { x: 0, y: 0, w: 1, h: 1 }); // coin haut gauche rouge

  it("quart de tour horaire : le coin haut gauche passe en haut à droite", () => {
    const r = rotate90(img, 1);
    expect([r.width, r.height]).toEqual([2, 3]);
    expect(px(r, 1, 0)).toEqual([200, 0, 0, 255]);
    expect(px(rotate90(img, 2), 2, 1)).toEqual([200, 0, 0, 255]);
    expect(px(rotate90(img, 3), 0, 2)).toEqual([200, 0, 0, 255]);
    expect(rotate90(rotate90(img, 1), 3).rgba).toEqual(img.rgba);
  });

  it("découpe", () => {
    const c = cropImage(img, { x: 0, y: 0, w: 2, h: 1 });
    expect([c.width, c.height]).toEqual([2, 1]);
    expect(px(c, 0, 0)).toEqual([200, 0, 0, 255]);
    expect(px(c, 1, 0)).toEqual([0, 0, 255, 255]);
  });
});

describe("redimensionnement", () => {
  it("moyenne de surface, sans frange sur la transparence", () => {
    // 2 × 1 : un pixel rouge opaque, un pixel transparent noir → 1 × 1 rouge à moitié transparent.
    const img: Image = { width: 2, height: 1, rgba: Uint8ClampedArray.from([255, 0, 0, 255, 0, 0, 0, 0]) };
    expect([...resample(img, 1, 1).rgba]).toEqual([255, 0, 0, 128]);
  });

  it("agrandissement", () => {
    const img = synth(2, 2, [0, 0, 255, 255], { x: 0, y: 0, w: 1, h: 2 });
    const big = resample(img, 4, 4);
    expect(px(big, 0, 0)).toEqual([200, 0, 0, 255]);
    expect(px(big, 3, 3)).toEqual([0, 0, 255, 255]);
  });

  it("taille de sortie en mm", () => {
    expect(outputSize({ w: 400, h: 200 }, { widthMm: 50.8 }, 300)).toEqual({ width: 600, height: 300 });
    expect(outputSize({ w: 400, h: 200 }, { heightMm: 25.4 }, 300)).toEqual({ width: 600, height: 300 });
    expect(outputSize({ w: 400, h: 200 }, {}, 300)).toEqual({ width: 400, height: 200 });
  });
});

describe("résolution d'un PNG", () => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const png = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  it("lit le pHYs écrit par l'export", () => {
    expect(readPngDpi(png)).toBeNull();
    expect(readPngDpi(setPngDpi(png, 300))).toBeCloseTo(300, 0);
    expect(readPngDpi(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});
