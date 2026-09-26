/**
 * Recadrage (SPEC §9) : rectangle libre ou à ratio fixe, marges en mm, rognage automatique
 * des bords transparents ou blancs, rotation par pas de 90°, redimensionnement en mm à une
 * résolution donnée. Images en RGBA brut (Uint8ClampedArray), coordonnées en pixels.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Image {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

/** Ratios proposés (largeur / hauteur) ; null = libre. */
export const RATIOS: readonly { label: string; value: number | null }[] = [
  { label: "Libre", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "3:2", value: 3 / 2 },
];

const MIN = 1;

export function fullRect(img: { width: number; height: number }): Rect {
  return { x: 0, y: 0, w: img.width, h: img.height };
}

/** Rectangle entier, à l'intérieur de l'image, d'au moins 1 × 1 pixel. */
export function clampRect(r: Rect, W: number, H: number): Rect {
  let x0 = Math.round(Math.min(r.x, r.x + r.w));
  let y0 = Math.round(Math.min(r.y, r.y + r.h));
  let x1 = Math.round(Math.max(r.x, r.x + r.w));
  let y1 = Math.round(Math.max(r.y, r.y + r.h));
  x0 = Math.max(0, Math.min(W - MIN, x0));
  y0 = Math.max(0, Math.min(H - MIN, y0));
  x1 = Math.max(x0 + MIN, Math.min(W, x1));
  y1 = Math.max(y0 + MIN, Math.min(H, y1));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Applique un ratio en gardant le centre ; le rectangle rétrécit pour tenir dans l'image. */
export function fitRatio(r: Rect, ratio: number | null, W: number, H: number): Rect {
  if (!ratio) return clampRect(r, W, H);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  let w = r.w;
  let h = w / ratio;
  if (h > r.h) {
    h = r.h;
    w = h * ratio;
  }
  // Dans l'image.
  if (w > W) {
    w = W;
    h = w / ratio;
  }
  if (h > H) {
    h = H;
    w = h * ratio;
  }
  const x = Math.min(Math.max(0, cx - w / 2), W - w);
  const y = Math.min(Math.max(0, cy - h / 2), H - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.max(MIN, Math.round(w)), h: Math.max(MIN, Math.round(h)) };
}

/**
 * Déplacement d'une poignée de `dx, dy` pixels. Avec un ratio, les poignées de coin
 * gardent le coin opposé fixe ; les poignées de côté ajustent l'autre dimension autour du centre.
 */
export function dragHandle(r: Rect, handle: Handle, dx: number, dy: number, ratio: number | null, W: number, H: number): Rect {
  if (handle === "move") {
    const x = Math.min(Math.max(0, r.x + dx), W - r.w);
    const y = Math.min(Math.max(0, r.y + dy), H - r.h);
    return { ...r, x: Math.round(x), y: Math.round(y) };
  }
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.w;
  let y1 = r.y + r.h;
  if (handle.includes("w")) x0 += dx;
  if (handle.includes("e")) x1 += dx;
  if (handle.includes("n")) y0 += dy;
  if (handle.includes("s")) y1 += dy;
  x0 = Math.max(0, Math.min(x0, x1 - MIN));
  y0 = Math.max(0, Math.min(y0, y1 - MIN));
  x1 = Math.min(W, Math.max(x1, x0 + MIN));
  y1 = Math.min(H, Math.max(y1, y0 + MIN));
  if (!ratio) return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, W, H);

  let w = x1 - x0;
  let h = y1 - y0;
  const corner = handle.length === 2;
  if (corner) {
    // Le plus grand déplacement relatif décide ; le coin opposé reste fixe.
    if (w / ratio > h) h = w / ratio;
    else w = h * ratio;
    const ax = handle.includes("w") ? r.x + r.w : r.x;
    const ay = handle.includes("n") ? r.y + r.h : r.y;
    const maxW = handle.includes("w") ? ax : W - ax;
    const maxH = handle.includes("n") ? ay : H - ay;
    if (w > maxW) {
      w = maxW;
      h = w / ratio;
    }
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    x0 = handle.includes("w") ? ax - w : ax;
    y0 = handle.includes("n") ? ay - h : ay;
    return { x: Math.round(x0), y: Math.round(y0), w: Math.max(MIN, Math.round(w)), h: Math.max(MIN, Math.round(h)) };
  }
  // Côté : l'autre dimension suit, centrée.
  if (handle === "e" || handle === "w") h = w / ratio;
  else w = h * ratio;
  const cx = handle === "e" || handle === "w" ? x0 + (x1 - x0) / 2 : r.x + r.w / 2;
  const cy = handle === "n" || handle === "s" ? y0 + (y1 - y0) / 2 : r.y + r.h / 2;
  return fitRatio({ x: cx - w / 2, y: cy - h / 2, w, h }, ratio, W, H);
}

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const mmToPx = (mm: number, dpi: number) => (mm / 25.4) * dpi;
export const pxToMm = (px: number, dpi: number) => (px / dpi) * 25.4;

/** Rectangle obtenu en retirant des marges (en mm, à la résolution `dpi`) de l'image entière. */
export function rectFromMargins(W: number, H: number, m: Margins, dpi: number): Rect {
  const px = (v: number) => mmToPx(v, dpi);
  return clampRect({ x: px(m.left), y: px(m.top), w: W - px(m.left) - px(m.right), h: H - px(m.top) - px(m.bottom) }, W, H);
}

export function marginsFromRect(W: number, H: number, r: Rect, dpi: number): Margins {
  const mm = (v: number) => Math.round(pxToMm(v, dpi) * 100) / 100;
  return { top: mm(r.y), left: mm(r.x), right: mm(W - r.x - r.w), bottom: mm(H - r.y - r.h) };
}

/**
 * Rognage automatique : plus petit rectangle contenant les pixels « utiles ». Mode
 * `transparent` : alpha > tolérance ; mode `blanc` : pixel opaque et non presque blanc.
 * Renvoie l'image entière si tout est vide.
 */
export function autoTrim(img: Image, mode: "transparent" | "blanc", tolerance = 8): Rect {
  const { width: W, height: H, rgba } = img;
  const useful = (i: number) => {
    const a = rgba[i + 3]!;
    if (mode === "transparent") return a > tolerance;
    if (a <= tolerance) return false;
    return 255 - rgba[i]! > tolerance || 255 - rgba[i + 1]! > tolerance || 255 - rgba[i + 2]! > tolerance;
  };
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (useful((y * W + x) * 4)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  return x1 < 0 ? fullRect(img) : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Rotation par pas de 90° dans le sens horaire (quarts = 0 à 3). */
export function rotate90(img: Image, quarters: number): Image {
  const q = ((Math.round(quarters) % 4) + 4) % 4;
  if (q === 0) return { ...img, rgba: new Uint8ClampedArray(img.rgba) };
  const { width: W, height: H, rgba } = img;
  const nw = q % 2 === 0 ? W : H;
  const nh = q % 2 === 0 ? H : W;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let nx: number;
      let ny: number;
      if (q === 1) [nx, ny] = [H - 1 - y, x];
      else if (q === 2) [nx, ny] = [W - 1 - x, H - 1 - y];
      else [nx, ny] = [y, W - 1 - x];
      const s = (y * W + x) * 4;
      const d = (ny * nw + nx) * 4;
      out[d] = rgba[s]!;
      out[d + 1] = rgba[s + 1]!;
      out[d + 2] = rgba[s + 2]!;
      out[d + 3] = rgba[s + 3]!;
    }
  }
  return { width: nw, height: nh, rgba: out };
}

export function cropImage(img: Image, r: Rect): Image {
  const c = clampRect(r, img.width, img.height);
  const out = new Uint8ClampedArray(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) {
    const s = ((c.y + y) * img.width + c.x) * 4;
    out.set(img.rgba.subarray(s, s + c.w * 4), y * c.w * 4);
  }
  return { width: c.w, height: c.h, rgba: out };
}

/**
 * Rééchantillonnage par moyenne de surface (bonne qualité en réduction, correct en
 * agrandissement). Les couleurs sont pondérées par l'alpha pour éviter les franges.
 */
export function resample(img: Image, width: number, height: number): Image {
  const W = img.width;
  const H = img.height;
  if (width === W && height === H) return { ...img, rgba: new Uint8ClampedArray(img.rgba) };
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = W / width;
  const sy = H / height;
  for (let oy = 0; oy < height; oy++) {
    const y0 = oy * sy;
    const y1 = y0 + sy;
    for (let ox = 0; ox < width; ox++) {
      const x0 = ox * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(H, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(W, Math.ceil(x1)); x++) {
          const wgt = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          if (wgt <= 0) continue;
          const i = (y * W + x) * 4;
          const al = img.rgba[i + 3]! * wgt;
          r += img.rgba[i]! * al;
          g += img.rgba[i + 1]! * al;
          b += img.rgba[i + 2]! * al;
          a += al;
          area += wgt;
        }
      }
      const o = (oy * width + ox) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = area > 0 ? Math.round(a / area) : 0;
    }
  }
  return { width, height, rgba: out };
}

/**
 * Taille de sortie en pixels pour une largeur et/ou une hauteur en mm à `dpi` ; la
 * dimension non donnée suit le ratio de la sélection.
 */
export function outputSize(sel: { w: number; h: number }, target: { widthMm?: number; heightMm?: number }, dpi: number): { width: number; height: number } {
  const ratio = sel.w / sel.h;
  let wpx: number;
  let hpx: number;
  if (target.widthMm && target.heightMm) {
    wpx = mmToPx(target.widthMm, dpi);
    hpx = mmToPx(target.heightMm, dpi);
  } else if (target.widthMm) {
    wpx = mmToPx(target.widthMm, dpi);
    hpx = wpx / ratio;
  } else if (target.heightMm) {
    hpx = mmToPx(target.heightMm, dpi);
    wpx = hpx * ratio;
  } else {
    return { width: sel.w, height: sel.h };
  }
  return { width: Math.max(1, Math.round(wpx)), height: Math.max(1, Math.round(hpx)) };
}

/** Résolution inscrite dans un PNG (bloc pHYs, en mètres) ; null si absente. */
export function readPngDpi(png: Uint8Array): number | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (png.length < 8 || !sig.every((b, i) => png[i] === b)) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 12 <= png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4]!, png[pos + 5]!, png[pos + 6]!, png[pos + 7]!);
    if (type === "pHYs" && len >= 9) {
      const ppx = dv.getUint32(pos + 8);
      const unit = png[pos + 16];
      return unit === 1 ? Math.round(ppx * 0.0254 * 100) / 100 : null;
    }
    if (type === "IDAT") return null;
    pos += 12 + len;
  }
  return null;
}

/** Paramètres d'un recadrage, conservés dans meta.json (`crop`) pour pouvoir le refaire. */
export interface CropSpec {
  rotation: number;
  rect: Rect;
  output: { width: number; height: number; dpi: number };
}
