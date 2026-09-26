import { describe, expect, it } from "vitest";
import {
  BRUSH_KEEP,
  BRUSH_NONE,
  BRUSH_REMOVE,
  alphaFromMask,
  applyBrush,
  composeRgba,
  computeAlpha,
  paintStroke,
  parseSegmentResponse,
  smoothAlpha,
} from "./mask";

/** Masque synthétique : dégradé horizontal 0 → 255 sur 256 × 1. */
const ramp = Uint8Array.from({ length: 256 }, (_, i) => i);

describe("alphaFromMask", () => {
  it("coupe franche sans douceur", () => {
    const a = alphaFromMask(ramp, { threshold: 128, softness: 0 });
    expect(a[127]).toBe(0);
    expect(a[128]).toBe(255);
  });

  it("rampe linéaire autour du seuil", () => {
    const a = alphaFromMask(ramp, { threshold: 128, softness: 64 });
    expect(a[64]).toBe(0);
    expect(a[128]).toBe(128);
    expect(a[192]).toBe(255);
    expect(a[100]).toBeGreaterThan(a[90]!);
  });

  it("un seuil plus haut retire davantage", () => {
    const low = alphaFromMask(ramp, { threshold: 60, softness: 10 }).reduce((s, v) => s + v, 0);
    const high = alphaFromMask(ramp, { threshold: 200, softness: 10 }).reduce((s, v) => s + v, 0);
    expect(high).toBeLessThan(low);
  });
});

describe("pinceau", () => {
  it("garder et retirer priment sur le masque", () => {
    const alpha = Uint8Array.from([0, 255, 100, 50]);
    const brush = Uint8Array.from([BRUSH_KEEP, BRUSH_REMOVE, BRUSH_NONE, BRUSH_KEEP]);
    expect([...applyBrush(alpha, brush)]).toEqual([255, 0, 100, 255]);
  });

  it("peint un disque puis un trait", () => {
    const w = 20;
    const h = 10;
    const brush = new Uint8Array(w * h);
    const n = paintStroke(brush, w, h, [5, 5], [5, 5], 2, BRUSH_KEEP);
    expect(n).toBeGreaterThan(8);
    expect(brush[5 * w + 5]).toBe(BRUSH_KEEP);
    expect(brush[0]).toBe(BRUSH_NONE);
    paintStroke(brush, w, h, [2, 8], [18, 8], 1, BRUSH_REMOVE);
    expect(brush[8 * w + 10]).toBe(BRUSH_REMOVE);
    expect(brush[8 * w + 17]).toBe(BRUSH_REMOVE);
  });

  it("ignore ce qui déborde de l'image", () => {
    const brush = new Uint8Array(4);
    expect(() => paintStroke(brush, 2, 2, [-10, -10], [30, 30], 3, BRUSH_REMOVE)).not.toThrow();
    expect([...brush]).toEqual([2, 2, 2, 2]);
  });

  it("ne compte pas les pixels déjà peints", () => {
    const brush = new Uint8Array(100);
    paintStroke(brush, 10, 10, [5, 5], [5, 5], 2, BRUSH_KEEP);
    expect(paintStroke(brush, 10, 10, [5, 5], [5, 5], 2, BRUSH_KEEP)).toBe(0);
  });
});

describe("smoothAlpha", () => {
  it("adoucit un bord net et conserve les zones uniformes", () => {
    // 9 × 3 : moitié gauche transparente, moitié droite opaque.
    const w = 9;
    const a = Uint8Array.from({ length: w * 3 }, (_, i) => (i % w >= 4 ? 255 : 0));
    const s = smoothAlpha(a, w, 3, 1);
    expect(s[0]).toBe(0);
    expect(s[8]).toBe(255);
    expect(s[3]).toBe(85);
    expect(s[4]).toBe(170);
  });

  it("rayon nul = copie", () => {
    const a = Uint8Array.from([1, 2, 3]);
    const s = smoothAlpha(a, 3, 1, 0);
    expect([...s]).toEqual([1, 2, 3]);
    expect(s).not.toBe(a);
  });
});

describe("composition", () => {
  it("garde la transparence d'origine", () => {
    const rgba = Uint8ClampedArray.from([10, 20, 30, 255, 40, 50, 60, 100]);
    const out = composeRgba(rgba, Uint8Array.from([128, 255]));
    expect([...out]).toEqual([10, 20, 30, 128, 40, 50, 60, 100]);
  });

  it("refuse des tailles différentes", () => {
    expect(() => composeRgba(new Uint8ClampedArray(8), new Uint8Array(3))).toThrow(RangeError);
  });

  it("chaîne complète sur une image synthétique : un disque", () => {
    const w = 32;
    const h = 32;
    const mask = Uint8Array.from({ length: w * h }, (_, i) => {
      const x = (i % w) - 16;
      const y = Math.floor(i / w) - 16;
      return x * x + y * y < 100 ? 240 : 10;
    });
    const brush = new Uint8Array(w * h);
    paintStroke(brush, w, h, [16, 16], [16, 16], 2, BRUSH_REMOVE); // trou au centre
    const alpha = computeAlpha(mask, brush, w, h, { threshold: 128, softness: 0, smoothing: 0 });
    expect(alpha[16 * w + 16]).toBe(0);
    expect(alpha[16 * w + 22]).toBe(255);
    expect(alpha[0]).toBe(0);
  });
});

describe("parseSegmentResponse", () => {
  it("lit l'en-tête et le masque", () => {
    const buf = new ArrayBuffer(12 + 6);
    const v = new DataView(buf);
    v.setUint32(0, 3, true);
    v.setUint32(4, 2, true);
    v.setUint32(8, 1234, true);
    new Uint8Array(buf, 12).set([1, 2, 3, 4, 5, 6]);
    const r = parseSegmentResponse(buf);
    expect(r).toMatchObject({ width: 3, height: 2, ms: 1234 });
    expect([...r.mask]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("refuse une réponse incohérente", () => {
    expect(() => parseSegmentResponse(new ArrayBuffer(4))).toThrow();
    const buf = new ArrayBuffer(14);
    new DataView(buf).setUint32(0, 5, true);
    expect(() => parseSegmentResponse(buf)).toThrow();
  });
});
