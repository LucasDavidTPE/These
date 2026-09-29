/**
 * Détection des axes d'un graphique : les deux traits sombres les plus longs, l'un horizontal
 * (axe des x, le plus bas des traits longs), l'autre vertical (axe des y, le plus à gauche).
 * Renvoie leurs extrémités, où poser les points d'étalonnage ; les valeurs restent à saisir.
 */
import type { ImageRGBA, Pt } from "./image";

export interface AxesDetectes {
  x: { p1: Pt; p2: Pt };
  y: { p1: Pt; p2: Pt };
}

interface Trait {
  /** Ligne (ou colonne) centrale du trait. */
  pos: number;
  debut: number;
  fin: number;
  longueur: number;
}

/** Vrai pour un pixel plus sombre que le fond (luminance < `part` du fond, fond = valeur claire dominante). */
function masqueSombre(img: ImageRGBA, part: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Composé sur du blanc : un pixel transparent est du fond, pas du noir.
    const alpha = data[4 * i + 3]! / 255;
    lum[i] = (0.299 * data[4 * i]! + 0.587 * data[4 * i + 1]! + 0.114 * data[4 * i + 2]!) * alpha + 255 * (1 - alpha);
  }
  const echantillon = Array.from({ length: Math.min(w * h, 4000) }, (_, k) => lum[Math.floor((k * w * h) / Math.min(w * h, 4000))]!).sort((a, b) => a - b);
  const fond = echantillon[Math.floor(echantillon.length * 0.7)] ?? 255;
  const seuil = fond * part;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = lum[i]! < seuil ? 1 : 0;
  return m;
}

/** Pour chaque ligne (horizontal) ou colonne (vertical), la plus longue suite de pixels sombres. */
function plusLongs(m: Uint8Array, w: number, h: number, horizontal: boolean): Trait[] {
  const n = horizontal ? h : w;
  const L = horizontal ? w : h;
  const out: Trait[] = [];
  for (let a = 0; a < n; a++) {
    let meilleur: Trait = { pos: a, debut: 0, fin: 0, longueur: 0 };
    let debut = -1;
    for (let b = 0; b <= L; b++) {
      const sombre = b < L && m[horizontal ? a * w + b : b * w + a] === 1;
      if (sombre && debut < 0) debut = b;
      if (!sombre && debut >= 0) {
        if (b - debut > meilleur.longueur) meilleur = { pos: a, debut, fin: b - 1, longueur: b - debut };
        debut = -1;
      }
    }
    out.push(meilleur);
  }
  return out;
}

/** Regroupe les lignes voisines d'un même trait épais et garde son centre. */
function centres(traits: Trait[], minLongueur: number): Trait[] {
  const bons = traits.filter((t) => t.longueur >= minLongueur);
  const groupes: Trait[][] = [];
  for (const t of bons) {
    const g = groupes.at(-1);
    if (g && t.pos - g.at(-1)!.pos <= 1) g.push(t);
    else groupes.push([t]);
  }
  return groupes.map((g) => {
    const m = g[Math.floor(g.length / 2)]!;
    return { pos: m.pos, debut: Math.min(...g.map((t) => t.debut)), fin: Math.max(...g.map((t) => t.fin)), longueur: Math.max(...g.map((t) => t.longueur)) };
  });
}

/** Seuils de plus en plus tolérants : des traits fins ou lissés (anti-aliasing) sont gris, pas noirs. */
const PARTS = [0.4, 0.6, 0.78];

export function detecterAxes(img: ImageRGBA): AxesDetectes | null {
  if (img.width < 40 || img.height < 40) return null;
  for (const part of PARTS) {
    const a = detecterAvec(img, part);
    if (a) return a;
  }
  return null;
}

function detecterAvec(img: ImageRGBA, part: number): AxesDetectes | null {
  const { width: w, height: h } = img;
  const m = masqueSombre(img, part);
  const hs = plusLongs(m, w, h, true);
  const vs = plusLongs(m, w, h, false);
  const maxH = Math.max(...hs.map((t) => t.longueur));
  const maxV = Math.max(...vs.map((t) => t.longueur));
  if (maxH < 0.25 * w || maxV < 0.25 * h) return null;
  // Axe x : le trait horizontal long le plus bas ; axe y : le trait vertical long le plus à gauche.
  const traitsH = centres(hs, 0.8 * maxH);
  const traitsV = centres(vs, 0.8 * maxV);
  const ax = traitsH.at(-1)!;
  const ay = traitsV[0]!;
  return {
    x: { p1: [ay.pos, ax.pos], p2: [ax.fin, ax.pos] },
    y: { p1: [ay.pos, ax.pos], p2: [ay.pos, ay.debut] },
  };
}
