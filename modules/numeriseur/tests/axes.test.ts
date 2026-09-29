import { describe, expect, it } from "vitest";
import { detecterAxes } from "../core/axes";
import type { ImageRGBA } from "../core/image";

function image(w: number, h: number, dessiner: (poser: (x: number, y: number, ep?: number) => void) => void): ImageRGBA {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const poser = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = 4 * (y * w + x);
    data[o] = data[o + 1] = data[o + 2] = 20;
  };
  dessiner((x, y) => poser(x, y));
  return { width: w, height: h, data };
}

describe("détection des axes", () => {
  it("trouve un cadre d'axes en L, trait de 3 pixels, avec des graduations", () => {
    const img = image(400, 300, (p) => {
      for (let x = 60; x <= 360; x++) for (let e = 0; e < 3; e++) p(x, 250 + e); // axe x
      for (let y = 30; y <= 252; y++) for (let e = 0; e < 3; e++) p(60 + e, y); // axe y
      for (let x = 100; x < 360; x += 50) for (let y = 253; y < 259; y++) p(x, y); // graduations
      for (let t = 0; t < 200; t++) p(70 + t, 240 - Math.floor(t * 0.5)); // une courbe (ne doit pas gêner)
    });
    const a = detecterAxes(img)!;
    expect(a).not.toBeNull();
    expect(a.x.p1[0]).toBeGreaterThanOrEqual(59);
    expect(a.x.p1[0]).toBeLessThanOrEqual(62);
    expect(a.x.p1[1]).toBe(251);
    expect(a.x.p2[0]).toBe(360);
    expect(a.y.p2[1]).toBe(30);
    expect(a.y.p1[1]).toBe(251);
  });

  it("préfère le trait le plus bas quand un cadre complet est dessiné", () => {
    const img = image(300, 200, (p) => {
      for (let x = 40; x <= 280; x++) {
        p(x, 20);
        p(x, 170);
      }
      for (let y = 20; y <= 170; y++) {
        p(40, y);
        p(280, y);
      }
    });
    const a = detecterAxes(img)!;
    expect(a.x.p1[1]).toBe(170);
    expect(a.y.p1[0]).toBe(40);
  });

  it("rien sur une image sans axes ni sur une image trop petite", () => {
    expect(detecterAxes(image(200, 150, () => undefined))).toBeNull();
    expect(detecterAxes(image(20, 20, () => undefined))).toBeNull();
  });
});

describe("détection des axes : transparence", () => {
  it("un fond transparent (RVB à 0, alpha 0) n'est pas pris pour des traits noirs", () => {
    const w = 300,
      h = 200;
    const data = new Uint8ClampedArray(w * h * 4); // tout à 0 : transparent
    const poser = (x: number, y: number) => {
      const o = 4 * (y * w + x);
      data[o] = data[o + 1] = data[o + 2] = 30;
      data[o + 3] = 255;
    };
    for (let y = 30; y < 170; y++) for (let x = 40; x < 270; x++) if (y === 169 || x === 40) poser(x, y);
    const a = detecterAxes({ width: w, height: h, data })!;
    expect(a).not.toBeNull();
    expect(a.x.p1[1]).toBe(169);
    expect(a.y.p1[0]).toBe(40);
  });
});
