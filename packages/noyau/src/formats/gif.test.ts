import { describe, expect, it } from "vitest";
import { gifAnime, lzw, quantifier, type ImageRvba } from "./gif";

/** Décodeur GIF minimal (spécification GIF89a), écrit indépendamment de l'encodeur, pour les tests. */
function decoder(g: Uint8Array) {
  let p = 0;
  const u8 = () => g[p++]!;
  const u16 = () => u8() | (u8() << 8);
  const entete = String.fromCharCode(...g.slice(0, 6));
  p = 6;
  const L = u16();
  const H = u16();
  const paquet = u8();
  p += 2;
  const taillePalette = paquet & 0x80 ? 2 << (paquet & 7) : 0;
  const palette = g.slice(p, p + 3 * taillePalette);
  p += 3 * taillePalette;
  const images: { indices: Uint8Array; delai: number }[] = [];
  let boucle = false;
  let delai = 0;
  const blocs = () => {
    const out: number[] = [];
    for (let n = u8(); n; n = u8()) for (let i = 0; i < n; i++) out.push(u8());
    return out;
  };
  for (;;) {
    const b = u8();
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = u8();
      const donnees = blocs();
      if (label === 0xf9) delai = donnees[1]! | (donnees[2]! << 8);
      if (
        label === 0xff &&
        String.fromCharCode(...donnees.slice(0, 11)) === "NETSCAPE2.0"
      )
        boucle = true;
      continue;
    }
    if (b !== 0x2c) throw new Error(`bloc inconnu ${b}`);
    p += 8;
    u8();
    const min = u8();
    const d = blocs();
    // LZW
    const clear = 1 << min;
    const fin = clear + 1;
    let taille = min + 1;
    let dict: number[][] = [];
    const reset = () => {
      dict = Array.from({ length: clear + 2 }, (_, i) =>
        i < clear ? [i] : [],
      );
      taille = min + 1;
    };
    reset();
    const out: number[] = [];
    let bit = 0;
    const lire = () => {
      let v = 0;
      for (let i = 0; i < taille; i++, bit++)
        v |= ((d[bit >> 3]! >> (bit & 7)) & 1) << i;
      return v;
    };
    let ancien: number[] | null = null;
    for (;;) {
      const c = lire();
      if (c === clear) {
        reset();
        ancien = null;
        continue;
      }
      if (c === fin) break;
      let entree: number[];
      if (c < dict.length) entree = dict[c]!;
      else if (c === dict.length && ancien) entree = [...ancien, ancien[0]!];
      else throw new Error(`code ${c} invalide`);
      out.push(...entree);
      if (ancien && dict.length < 4096) {
        dict.push([...ancien, entree[0]!]);
        if (dict.length === 1 << taille && taille < 12) taille++;
      }
      ancien = entree;
    }
    images.push({ indices: Uint8Array.from(out), delai });
  }
  return { entete, L, H, palette, images, boucle };
}

const image = (
  L: number,
  H: number,
  f: (x: number, y: number) => [number, number, number],
): ImageRvba => {
  const pixels = new Uint8Array(L * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const [r, g, b] = f(x, y);
      pixels.set([r, g, b, 255], 4 * (y * L + x));
    }
  return { largeur: L, hauteur: H, pixels };
};

describe("GIF animé", () => {
  it("LZW : aller-retour, y compris au-delà de 4096 codes (remise à zéro de la table)", () => {
    let graine = 7;
    const hasard = () =>
      (graine = (graine * 1103515245 + 12345) & 0x7fffffff) % 256;
    for (const ix of [
      Uint8Array.from([1, 1, 1, 1, 2, 2, 1]),
      Uint8Array.from({ length: 60000 }, hasard),
      new Uint8Array(100000).fill(3),
    ]) {
      const d = lzw(ix);
      // en-tête GIF minimal autour du flux pour le décodeur de test
      const gif = Uint8Array.from([
        ...[..."GIF89a"].map((c) => c.charCodeAt(0)),
        ix.length & 255,
        ix.length >> 8,
        1,
        0,
        0,
        0,
        0,
        0x2c,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        8,
        ...d,
        0x3b,
      ]);
      expect(decoder(gif).images[0]!.indices).toEqual(ix);
    }
  });

  it("images → palette commune, couleurs retrouvées, délai et boucle", () => {
    const a = image(40, 30, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]));
    const b = image(40, 30, (_x, y) => (y < 15 ? [255, 255, 255] : [0, 0, 0]));
    const gif = gifAnime([a, b], { delai: 50 });
    const d = decoder(gif);
    expect(d.entete).toBe("GIF89a");
    expect([d.L, d.H, d.images.length, d.boucle]).toEqual([40, 30, 2, true]);
    expect(d.images.map((x) => x.delai)).toEqual([50, 50]);
    const couleur = (im: number, x: number, y: number) => {
      const k = d.images[im]!.indices[y * 40 + x]!;
      return [d.palette[3 * k], d.palette[3 * k + 1], d.palette[3 * k + 2]];
    };
    expect(couleur(0, 5, 5)).toEqual([255, 0, 0]);
    expect(couleur(0, 30, 5)).toEqual([0, 0, 255]);
    expect(couleur(1, 5, 5)).toEqual([255, 255, 255]);
    expect(couleur(1, 5, 25)).toEqual([0, 0, 0]);
  });

  it("plus de 256 couleurs : chaque pixel va à une couleur proche ; transparence posée sur blanc", () => {
    const deg = image(64, 64, (x, y) => [x * 4, y * 4, 128]);
    const { palette, indices } = quantifier([deg]);
    let pire = 0;
    for (let i = 0; i < 64 * 64; i++) {
      const k = indices[0]![i]!;
      const x = i % 64;
      const y = Math.floor(i / 64);
      pire = Math.max(
        pire,
        Math.abs(palette[3 * k]! - x * 4),
        Math.abs(palette[3 * k + 1]! - y * 4),
      );
    }
    expect(pire).toBeLessThan(40);
    const transparent: ImageRvba = {
      largeur: 1,
      hauteur: 1,
      pixels: Uint8Array.from([0, 0, 0, 0]),
    };
    const q = quantifier([transparent]);
    expect([...q.palette.slice(0, 3)]).toEqual([255, 255, 255]);
    expect(() =>
      gifAnime([a1(), image(2, 2, () => [0, 0, 0])], { delai: 1 }),
    ).toThrow(/même taille/);
  });
});

const a1 = () => image(1, 1, () => [0, 0, 0]);
