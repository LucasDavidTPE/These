/**
 * Opérations sur le masque de détourage (SPEC §8) : seuil, retouches au pinceau,
 * lissage des bords, composition finale. Tableaux d'octets bruts, une valeur par pixel,
 * pour rester rapide sur des images de quelques mégapixels.
 */

/** Retouche au pinceau pour un pixel. */
export const BRUSH_NONE = 0;
export const BRUSH_KEEP = 1;
export const BRUSH_REMOVE = 2;
export type BrushValue = typeof BRUSH_KEEP | typeof BRUSH_REMOVE | typeof BRUSH_NONE;

export interface MaskSettings {
  /** Seuil 0–255 : au-dessus, le pixel est gardé. */
  threshold: number;
  /** Demi-largeur de la transition douce autour du seuil (0 = coupe franche). */
  softness: number;
  /** Rayon du lissage des bords en pixels (0 = aucun). */
  smoothing: number;
}

export const DEFAULT_MASK_SETTINGS: MaskSettings = { threshold: 128, softness: 64, smoothing: 0 };

/** Masque doux du modèle → alpha, par une rampe linéaire autour du seuil. */
export function alphaFromMask(mask: Uint8Array, s: Pick<MaskSettings, "threshold" | "softness">): Uint8Array {
  const out = new Uint8Array(mask.length);
  const lo = s.threshold - s.softness;
  const hi = s.threshold + s.softness;
  // Table de correspondance : 256 valeurs possibles.
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = hi <= lo ? (v >= s.threshold ? 255 : 0) : Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 255);
  }
  for (let i = 0; i < mask.length; i++) out[i] = lut[mask[i]!]!;
  return out;
}

/** Applique les retouches du pinceau (garder = opaque, retirer = transparent). */
export function applyBrush(alpha: Uint8Array, brush: Uint8Array): Uint8Array {
  const out = new Uint8Array(alpha);
  for (let i = 0; i < out.length; i++) {
    const b = brush[i];
    if (b === BRUSH_KEEP) out[i] = 255;
    else if (b === BRUSH_REMOVE) out[i] = 0;
  }
  return out;
}

/** Flou en boîte séparable (deux passes), pour adoucir les bords. */
export function smoothAlpha(alpha: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return new Uint8Array(alpha);
  const tmp = new Uint8Array(alpha.length);
  const out = new Uint8Array(alpha.length);
  const pass = (src: Uint8Array, dst: Uint8Array, len: number, lines: number, step: number, lineStep: number) => {
    for (let l = 0; l < lines; l++) {
      const base = l * lineStep;
      let sum = 0;
      // Bords : on répète le pixel extrême.
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * step]!;
      for (let i = 0; i < len; i++) {
        dst[base + i * step] = Math.round(sum / (2 * r + 1));
        const add = Math.min(len - 1, i + r + 1);
        const sub = Math.max(0, i - r);
        sum += src[base + add * step]! - src[base + sub * step]!;
      }
    }
  };
  pass(alpha, tmp, width, height, 1, width);
  pass(tmp, out, height, width, width, 1);
  return out;
}

/** Alpha final = min(alpha d'origine, alpha du détourage). */
export function composeRgba(rgba: Uint8ClampedArray, alpha: Uint8Array): Uint8ClampedArray {
  if (rgba.length !== alpha.length * 4) throw new RangeError("Tailles d'image et de masque différentes.");
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = Math.min(rgba[i * 4 + 3]!, alpha[i]!);
  return out;
}

/** Chaîne complète : seuil → pinceau → lissage. */
export function computeAlpha(mask: Uint8Array, brush: Uint8Array, width: number, height: number, s: MaskSettings): Uint8Array {
  return smoothAlpha(applyBrush(alphaFromMask(mask, s), brush), width, height, s.smoothing);
}

/**
 * Peint un trait de pinceau rond de (x0, y0) à (x1, y1) dans le calque de retouche.
 * Coordonnées en pixels de l'image. Renvoie le nombre de pixels modifiés.
 */
export function paintStroke(
  brush: Uint8Array,
  width: number,
  height: number,
  from: [number, number],
  to: [number, number],
  radius: number,
  value: BrushValue,
): number {
  const r = Math.max(0.5, radius);
  const r2 = r * r;
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - r));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + r));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - r));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + r));
  let changed = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Distance du centre du pixel au segment.
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
      const cx = x0 + t * dx - px;
      const cy = y0 + t * dy - py;
      if (cx * cx + cy * cy <= r2) {
        const i = y * width + x;
        if (brush[i] !== value) {
          brush[i] = value;
          changed++;
        }
      }
    }
  }
  return changed;
}

/** Décode la réponse binaire de `cutout_segment` : largeur, hauteur, durée, masque. */
export function parseSegmentResponse(buf: ArrayBuffer): { width: number; height: number; ms: number; mask: Uint8Array } {
  if (buf.byteLength < 12) throw new Error("Réponse de détourage invalide.");
  const view = new DataView(buf);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const ms = view.getUint32(8, true);
  const mask = new Uint8Array(buf, 12);
  if (mask.length !== width * height) throw new Error("Masque de détourage de taille inattendue.");
  return { width, height, ms, mask };
}
