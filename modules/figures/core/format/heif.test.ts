import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isHeif } from "./heif";

const ftyp = (marque: string, ...compat: string[]) => {
  const txt = [marque, "\0\0\0\0", ...compat].join("");
  const n = 8 + txt.length;
  return new Uint8Array([0, 0, 0, n, ..."ftyp".split("").map((c) => c.charCodeAt(0)), ...txt.split("").map((c) => c.charCodeAt(0))]);
};

describe("reconnaissance des photos HEIC", () => {
  it("photo HEIC réelle (encodée par libheif)", () => {
    expect(isHeif(new Uint8Array(readFileSync(new URL("../../tests/fixtures/photo.heic", import.meta.url))))).toBe(true);
  });
  it("marques HEIF principales ou compatibles ; pas l'AVIF, ni le PNG, ni le MP4", () => {
    expect(isHeif(ftyp("heic", "mif1"))).toBe(true);
    expect(isHeif(ftyp("mif1", "heic"))).toBe(true);
    expect(isHeif(ftyp("isom", "mp41"))).toBe(false);
    expect(isHeif(ftyp("avif", "mif1", "miaf"))).toBe(false);
    expect(isHeif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]))).toBe(false);
  });
});
