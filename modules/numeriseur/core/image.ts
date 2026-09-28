/**
 * Image en mémoire (RGBA, 8 bits par canal, lignes de haut en bas) et couleurs : distance entre
 * couleurs dans l'espace CIELAB, plus proche de la perception que la distance RVB.
 */

export type Pt = [number, number];
export type RVB = [number, number, number];

export interface ImageRGBA {
  width: number;
  height: number;
  /** width × height × 4 octets (R, V, B, alpha). */
  data: Uint8ClampedArray | Uint8Array;
}

/** Rectangle en pixels : [x0, y0, x1, y1] (x1, y1 exclus). */
export type Zone = [number, number, number, number];

export function pixel(img: ImageRGBA, x: number, y: number): RVB {
  const o = 4 * (y * img.width + x);
  return [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
}

/** Zone ramenée dans l'image, coins remis dans l'ordre ; toute l'image si absente. */
export function zoneDans(img: ImageRGBA, zone?: Zone | null): Zone {
  if (!zone) return [0, 0, img.width, img.height];
  const [a, b, c, d] = zone;
  const x0 = Math.max(0, Math.floor(Math.min(a, c))),
    x1 = Math.min(img.width, Math.ceil(Math.max(a, c)));
  const y0 = Math.max(0, Math.floor(Math.min(b, d))),
    y1 = Math.min(img.height, Math.ceil(Math.max(b, d)));
  return [x0, y0, Math.max(x0, x1), Math.max(y0, y1)];
}

export const hex = (c: RVB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

export function depuisHex(h: string): RVB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h.trim());
  if (!m) throw new Error(`Couleur « ${h} » : #rrvvbb attendu.`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

/** RVB (sRGB, 0–255) → CIELAB (D65). */
export function versLab([r, g, b]: RVB): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Distance entre deux couleurs (ΔE CIE76) : ~2 à peine visible, ~10 nettement différentes. */
export function ecart(a: RVB, b: RVB): number {
  const [l1, a1, b1] = versLab(a);
  const [l2, a2, b2] = versLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/**
 * Vrai si c est un mélange de o avec un gris (blanc du fond, grille, noir des axes) : c'est ce
 * que produit l'anticrénelage au bord d'un trait. Retirer la composante grise de chacune
 * (c − moyenne, o − moyenne) : c est un mélange si ce qui reste de c est proportionnel à ce qui
 * reste de o.
 */
function melangeAvecGris(c: RVB, o: RVB): boolean {
  const mc = (c[0] + c[1] + c[2]) / 3,
    mo = (o[0] + o[1] + o[2]) / 3;
  const d = c.map((v) => v - mc),
    e = o.map((v) => v - mo);
  const e2 = e[0]! ** 2 + e[1]! ** 2 + e[2]! ** 2;
  if (e2 === 0) return false;
  const a = (d[0]! * e[0]! + d[1]! * e[1]! + d[2]! * e[2]!) / e2;
  const residu = Math.hypot(d[0]! - a * e[0]!, d[1]! - a * e[1]!, d[2]! - a * e[2]!);
  return a > 0.1 && a < 1.15 && residu < 14;
}

/**
 * Couleurs les plus présentes d'une zone, hors blanc, noir et gris (le fond, les axes, le
 * texte) : ce sont en général les courbes. Couleurs regroupées par pas de 16 niveaux.
 */
export function couleursDominantes(img: ImageRGBA, zone?: Zone | null, n = 8): { couleur: RVB; part: number }[] {
  const [x0, y0, x1, y1] = zoneDans(img, zone);
  const comptes = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const [r, g, b] = pixel(img, x, y);
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      if (max - min < 40) continue; // gris, blanc, noir
      const cle = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const c = comptes.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 };
      c.n++;
      c.r += r;
      c.g += g;
      c.b += b;
      comptes.set(cle, c);
      total++;
    }
  const tries = [...comptes.values()].sort((a, b) => b.n - a.n);
  const out: { couleur: RVB; part: number }[] = [];
  for (const c of tries) {
    const couleur: RVB = [c.r / c.n, c.g / c.n, c.b / c.n];
    // une teinte déjà retenue, ou son mélange avec un gris (anticrénelage des traits, JPEG),
    // n'est pas une nouvelle courbe
    const proche = out.find((o) => ecart(o.couleur, couleur) < 12 || melangeAvecGris(couleur, o.couleur));
    if (proche) proche.part += c.n / total;
    else out.push({ couleur, part: c.n / total });
    if (out.length >= n) break;
  }
  return out.map((o) => ({ couleur: o.couleur.map(Math.round) as RVB, part: o.part }));
}
