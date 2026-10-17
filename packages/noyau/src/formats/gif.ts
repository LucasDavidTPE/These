/**
 * GIF animé (GIF89a), sans dépendance : images RVBA de même taille → une palette commune de 256 couleurs
 * (coupe médiane sur les couleurs regroupées sur 5 bits par composante), compression LZW, lecture en boucle.
 * Pensé pour des figures (aplats de couleurs, texte noir sur blanc), pas pour des photographies.
 */

export interface ImageRvba {
  largeur: number;
  hauteur: number;
  /** Pixels R, V, B, A (4 octets par pixel), ligne par ligne. */
  pixels: Uint8Array | Uint8ClampedArray;
}

/** Palette commune (768 octets) et indexation des pixels de chaque image. */
export function quantifier(images: readonly ImageRvba[]): {
  palette: Uint8Array;
  indices: Uint8Array[];
} {
  // histogramme sur 5 bits par composante (32 768 cases), avec la couleur moyenne de chaque case
  const n = new Float64Array(32768);
  const sr = new Float64Array(32768);
  const sg = new Float64Array(32768);
  const sb = new Float64Array(32768);
  const cle = (p: Uint8Array | Uint8ClampedArray, i: number) =>
    ((p[i]! >> 3) << 10) | ((p[i + 1]! >> 3) << 5) | (p[i + 2]! >> 3);
  for (const im of images) {
    const p = aplatir(im.pixels);
    for (let i = 0; i < p.length; i += 4) {
      const k = cle(p, i);
      n[k]!++;
      sr[k]! += p[i]!;
      sg[k]! += p[i + 1]!;
      sb[k]! += p[i + 2]!;
    }
  }
  // coupe médiane : la boîte la plus étendue (pondérée par le nombre de pixels) est coupée en deux, jusqu'à 256
  type Case = { r: number; g: number; b: number; n: number };
  const cases: Case[] = [];
  for (let k = 0; k < 32768; k++)
    if (n[k]! > 0)
      cases.push({
        r: sr[k]! / n[k]!,
        g: sg[k]! / n[k]!,
        b: sb[k]! / n[k]!,
        n: n[k]!,
      });
  let boites: Case[][] = cases.length ? [cases] : [];
  const etendue = (bx: Case[]) => {
    let best: { c: "r" | "g" | "b"; e: number } = { c: "r", e: -1 };
    for (const c of ["r", "g", "b"] as const) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const x of bx) {
        lo = Math.min(lo, x[c]);
        hi = Math.max(hi, x[c]);
      }
      if (hi - lo > best.e) best = { c, e: hi - lo };
    }
    return best;
  };
  while (boites.length < 256) {
    let i = -1;
    let score = 0;
    boites.forEach((bx, j) => {
      if (bx.length < 2) return;
      const s = etendue(bx).e * Math.sqrt(bx.reduce((t, x) => t + x.n, 0));
      if (s > score) {
        score = s;
        i = j;
      }
    });
    if (i < 0) break;
    const bx = boites[i]!;
    const { c } = etendue(bx);
    bx.sort((a, b) => a[c] - b[c]);
    const total = bx.reduce((t, x) => t + x.n, 0);
    let cumul = 0;
    let m = 1;
    for (; m < bx.length - 1; m++) {
      cumul += bx[m - 1]!.n;
      if (cumul >= total / 2) break;
    }
    boites = [
      ...boites.slice(0, i),
      bx.slice(0, m),
      bx.slice(m),
      ...boites.slice(i + 1),
    ];
  }
  const palette = new Uint8Array(768);
  boites.forEach((bx, j) => {
    const t = bx.reduce((s, x) => s + x.n, 0);
    palette[3 * j] = Math.round(bx.reduce((s, x) => s + x.r * x.n, 0) / t);
    palette[3 * j + 1] = Math.round(bx.reduce((s, x) => s + x.g * x.n, 0) / t);
    palette[3 * j + 2] = Math.round(bx.reduce((s, x) => s + x.b * x.n, 0) / t);
  });
  const retenues = boites;
  // chaque case vers la couleur de palette la plus proche (calculée une fois par case)
  const vers = new Int16Array(32768).fill(-1);
  const proche = (k: number) => {
    // couleur moyenne de la case (sa vraie couleur), vers la plus proche de la palette
    const r = sr[k]! / n[k]!;
    const g = sg[k]! / n[k]!;
    const b = sb[k]! / n[k]!;
    let m = 0;
    let d = Infinity;
    for (let j = 0; j < retenues.length; j++) {
      const e =
        (palette[3 * j]! - r) ** 2 +
        (palette[3 * j + 1]! - g) ** 2 +
        (palette[3 * j + 2]! - b) ** 2;
      if (e < d) {
        d = e;
        m = j;
      }
    }
    return m;
  };
  const indices = images.map((im) => {
    const p = aplatir(im.pixels);
    const out = new Uint8Array(im.largeur * im.hauteur);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      const k = cle(p, i);
      if (vers[k]! < 0) vers[k] = proche(k);
      out[j] = vers[k]!;
    }
    return out;
  });
  return { palette, indices };
}

/** Pixels sur fond blanc (la transparence n'est pas gardée). */
function aplatir(
  p: Uint8Array | Uint8ClampedArray,
): Uint8Array | Uint8ClampedArray {
  let opaque = true;
  for (let i = 3; i < p.length; i += 4)
    if (p[i] !== 255) {
      opaque = false;
      break;
    }
  if (opaque) return p;
  const q = new Uint8Array(p.length);
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3]! / 255;
    q[i] = Math.round(p[i]! * a + 255 * (1 - a));
    q[i + 1] = Math.round(p[i + 1]! * a + 255 * (1 - a));
    q[i + 2] = Math.round(p[i + 2]! * a + 255 * (1 - a));
    q[i + 3] = 255;
  }
  return q;
}

/** Compression LZW des indices (taille de code de départ 8 bits), en sous-blocs de 255 octets au plus. */
export function lzw(indices: Uint8Array, tailleMin = 8): Uint8Array {
  const clear = 1 << tailleMin;
  const fin = clear + 1;
  const octets: number[] = [];
  let tampon = 0;
  let nbits = 0;
  let taille = tailleMin + 1;
  let suivant = fin + 1;
  let table = new Map<number, number>();
  const ecrire = (code: number) => {
    tampon |= code << nbits;
    nbits += taille;
    while (nbits >= 8) {
      octets.push(tampon & 255);
      tampon >>>= 8;
      nbits -= 8;
    }
  };
  ecrire(clear);
  if (!indices.length) {
    ecrire(fin);
    if (nbits > 0) octets.push(tampon & 255);
    return sousBlocs(octets);
  }
  let prefixe = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const c = (prefixe << 8) | k;
    const code = table.get(c);
    if (code !== undefined) {
      prefixe = code;
      continue;
    }
    ecrire(prefixe);
    if (suivant === 4096) {
      ecrire(clear);
      table = new Map();
      taille = tailleMin + 1;
      suivant = fin + 1;
    } else {
      if (suivant >= 1 << taille) taille++;
      table.set(c, suivant++);
    }
    prefixe = k;
  }
  ecrire(prefixe);
  ecrire(fin);
  if (nbits > 0) octets.push(tampon & 255);
  return sousBlocs(octets);
}

function sousBlocs(octets: number[]): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < octets.length; i += 255) {
    const bloc = octets.slice(i, i + 255);
    out.push(bloc.length, ...bloc);
  }
  out.push(0);
  return Uint8Array.from(out);
}

/** GIF animé : images de même taille, `delai` en centièmes de seconde, lecture en boucle. */
export function gifAnime(
  images: readonly ImageRvba[],
  o: { delai: number; boucle?: boolean },
): Uint8Array {
  if (!images.length) throw new Error("Aucune image.");
  const { largeur: L, hauteur: H } = images[0]!;
  if (images.some((im) => im.largeur !== L || im.hauteur !== H))
    throw new Error("Les images n'ont pas toutes la même taille.");
  const { palette, indices } = quantifier(images);
  const u16 = (v: number) => [v & 255, (v >> 8) & 255];
  const parts: (number[] | Uint8Array)[] = [];
  parts.push([..."GIF89a"].map((c) => c.charCodeAt(0)));
  parts.push([...u16(L), ...u16(H), 0xf7, 0, 0]);
  parts.push(palette);
  if (o.boucle !== false)
    parts.push(
      [0x21, 0xff, 0x0b, ..."NETSCAPE2.0"].map((c) =>
        typeof c === "string" ? c.charCodeAt(0) : c,
      ),
      [0x03, 0x01, 0, 0, 0],
    );
  for (const ix of indices) {
    parts.push([
      0x21,
      0xf9,
      0x04,
      0x04,
      ...u16(Math.max(0, Math.round(o.delai))),
      0,
      0,
    ]);
    parts.push([0x2c, 0, 0, 0, 0, ...u16(L), ...u16(H), 0]);
    parts.push([8], lzw(ix, 8));
  }
  parts.push([0x3b]);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}
