/** Palette, unités d'affichage et image d'une carte de champ (écran et Figures). */

/** RdBu_r (ColorBrewer) : bleu (négatif) → blanc → rouge (positif). */
export const RDBU = ["#053061", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"];
const rvb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const PAL = RDBU.map(rvb);

export function couleur(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t)) * (PAL.length - 1);
  const i = Math.min(PAL.length - 2, Math.floor(u)),
    f = u - i;
  const a = PAL[i]!,
    b = PAL[i + 1]!;
  return [0, 1, 2].map((k) => Math.round(a[k]! + (b[k]! - a[k]!) * f)) as [number, number, number];
}

/** Unité d'affichage d'une composante : µdef, mm, MPa (comme io._plots). */
export function unite(comp: string): { k: number; u: string } {
  return comp.startsWith("e") ? { k: 1e6, u: "µdef" } : comp.startsWith("u") ? { k: 1e3, u: "mm" } : { k: 1e-6, u: "MPa" };
}

export const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(2) : v.toPrecision(3)).replace(".", ",");

/** Image de la carte (PNG, une valeur par pixel), pour l'écran et pour Figures. */
export function dessiner(canvas: HTMLCanvasElement, f: Float64Array, nx: number, ny: number, vmax: number): void {
  canvas.width = nx;
  canvas.height = ny;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(nx, ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      // y croissant vers le haut de l'image
      const v = f[j * nx + i]!;
      const [r, g, b] = couleur(vmax > 0 ? 0.5 + v / (2 * vmax) : 0.5);
      const o = 4 * ((ny - 1 - j) * nx + i);
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

