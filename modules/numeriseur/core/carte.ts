/**
 * Carte de couleurs (heatmap) : la légende de couleur de l'image donne la correspondance
 * couleur → valeur ; chaque pixel de la carte reçoit alors une valeur. On en tire des coupes
 * le long de lignes et des moyennes sur un maillage (voir maillage.ts).
 */
import type { Etalonnage } from "./etalonnage";
import { versPixel } from "./etalonnage";
import { pixel, versLab, zoneDans, type ImageRGBA, type Pt, type RVB, type Zone } from "./image";

/** Légende de couleur : deux points de la barre (pixels) et les valeurs qu'ils représentent. */
export interface Legende {
  p1: Pt;
  p2: Pt;
  v1: number;
  v2: number;
  log: boolean;
}

/** Couleurs lues le long de la légende (CIELAB) et valeurs correspondantes. */
export interface Gamme {
  lab: [number, number, number][];
  rvb: RVB[];
  valeurs: number[];
}

/**
 * Lit la légende : n couleurs régulièrement espacées de p1 à p2, chacune moyennée sur une
 * petite bande perpendiculaire (±1 pixel) pour lisser le bruit de l'image.
 */
export function lireLegende(img: ImageRGBA, leg: Legende, n = 200): Gamme {
  if (leg.log && (leg.v1 <= 0 || leg.v2 <= 0)) throw new Error("Légende logarithmique : les valeurs doivent être positives.");
  const [dx, dy] = [leg.p2[0] - leg.p1[0], leg.p2[1] - leg.p1[1]];
  const L = Math.hypot(dx, dy);
  if (L < 3) throw new Error("Légende : placer ses deux extrémités, à distance l'une de l'autre.");
  const [nx, ny] = [-dy / L, dx / L];
  const gamme: Gamme = { lab: [], rvb: [], valeurs: [] };
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const s: [number, number, number] = [0, 0, 0];
    let k = 0;
    for (const d of [-1, 0, 1]) {
      const x = Math.round(leg.p1[0] + f * dx + d * nx - 0.5),
        y = Math.round(leg.p1[1] + f * dy + d * ny - 0.5);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const c = pixel(img, x, y);
      s[0] += c[0];
      s[1] += c[1];
      s[2] += c[2];
      k++;
    }
    if (!k) continue;
    const c: RVB = [s[0] / k, s[1] / k, s[2] / k];
    gamme.rvb.push(c);
    gamme.lab.push(versLab(c));
    gamme.valeurs.push(leg.log ? 10 ** (Math.log10(leg.v1) + f * (Math.log10(leg.v2) - Math.log10(leg.v1))) : leg.v1 + f * (leg.v2 - leg.v1));
  }
  if (gamme.valeurs.length < 2) throw new Error("Légende hors de l'image.");
  return gamme;
}

/**
 * Valeur d'une couleur : on cherche le segment de la gamme (entre deux couleurs lues voisines)
 * le plus proche dans l'espace CIELAB et on interpole. NaN si la couleur est à plus de
 * `tolerance` (ΔE) de la gamme : fond, texte, traits, hors de la carte.
 */
export function valeurDeCouleur(g: Gamme, c: RVB, tolerance: number, log = false): number {
  const p = versLab(c);
  let meilleur = Infinity,
    valeur = NaN;
  for (let i = 0; i + 1 < g.lab.length; i++) {
    const a = g.lab[i]!,
      b = g.lab[i + 1]!;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 > 0 ? Math.min(1, Math.max(0, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / l2)) : 0;
    const d = Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!);
    if (d < meilleur) {
      meilleur = d;
      const [va, vb] = [g.valeurs[i]!, g.valeurs[i + 1]!];
      valeur = log ? 10 ** (Math.log10(va) + t * (Math.log10(vb) - Math.log10(va))) : va + t * (vb - va);
    }
  }
  return meilleur <= tolerance ? valeur : NaN;
}

/** Valeur de chaque pixel de la zone (NaN ailleurs et là où la couleur n'est pas dans la gamme). */
export interface Champ {
  width: number;
  height: number;
  valeurs: Float32Array;
  zone: Zone;
}

export function lireCarte(img: ImageRGBA, g: Gamme, tolerance: number, zone?: Zone | null, log = false): Champ {
  const z = zoneDans(img, zone);
  const valeurs = new Float32Array(img.width * img.height).fill(NaN);
  const deja = new Map<number, number>();
  for (let y = z[1]; y < z[3]; y++)
    for (let x = z[0]; x < z[2]; x++) {
      const c = pixel(img, x, y);
      const cle = (c[0] << 16) | (c[1] << 8) | c[2];
      let v = deja.get(cle);
      if (v === undefined) deja.set(cle, (v = valeurDeCouleur(g, c, tolerance, log)));
      valeurs[y * img.width + x] = v;
    }
  return { width: img.width, height: img.height, valeurs, zone: z };
}

/** Part des pixels de la zone qui ont reçu une valeur (contrôle de la tolérance). */
export function couverture(ch: Champ): number {
  const [x0, y0, x1, y1] = ch.zone;
  let n = 0,
    ok = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      n++;
      if (!Number.isNaN(ch.valeurs[y * ch.width + x]!)) ok++;
    }
  return n ? ok / n : 0;
}

/** Valeur au pixel (continu) p : moyenne pondérée des 4 pixels voisins qui ont une valeur. */
export function valeurAuPixel(ch: Champ, [px, py]: Pt): number {
  const fx = px - 0.5,
    fy = py - 0.5;
  const i = Math.floor(fx),
    j = Math.floor(fy);
  let s = 0,
    w = 0;
  for (const [ii, jj, poids] of [
    [i, j, (1 - (fx - i)) * (1 - (fy - j))],
    [i + 1, j, (fx - i) * (1 - (fy - j))],
    [i, j + 1, (1 - (fx - i)) * (fy - j)],
    [i + 1, j + 1, (fx - i) * (fy - j)],
  ] as const) {
    if (ii < 0 || jj < 0 || ii >= ch.width || jj >= ch.height || poids <= 0) continue;
    const v = ch.valeurs[jj * ch.width + ii]!;
    if (Number.isNaN(v)) continue;
    s += poids * v;
    w += poids;
  }
  return w > 0 ? s / w : NaN;
}

/** Valeur au point (x, y) du graphique. */
export const valeurEn = (ch: Champ, e: Etalonnage, d: Pt): number => valeurAuPixel(ch, versPixel(e, d));

export interface Coupe {
  /** Abscisse curviligne depuis A, en unités du graphique (x et y supposés de même unité). */
  s: number[];
  x: number[];
  y: number[];
  v: number[];
}

/** Coupe de A à B (valeurs du graphique), n points régulièrement espacés. */
export function coupe(ch: Champ, e: Etalonnage, a: Pt, b: Pt, n = 200): Coupe {
  const out: Coupe = { s: [], x: [], y: [], v: [] };
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const d: Pt = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
    out.s.push(f * L);
    out.x.push(d[0]);
    out.y.push(d[1]);
    out.v.push(valeurEn(ch, e, d));
  }
  return out;
}
