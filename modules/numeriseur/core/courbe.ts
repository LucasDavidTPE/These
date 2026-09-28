/**
 * Relevé automatique d'une courbe sur l'image d'un graphique, à partir de sa couleur :
 * - `suivre` : une courbe continue (ligne), un point tous les `pas` pixels le long de l'axe des x ;
 * - `marqueurs` : des points isolés (symboles d'un nuage de points), un point par symbole.
 * Les points obtenus sont ensuite modifiables à la main.
 */
import { coordonneesAxes, depuisCoordonneesAxes, versDonnees, type Etalonnage } from "./etalonnage";
import { ecart, pixel, zoneDans, type ImageRGBA, type Pt, type RVB, type Zone } from "./image";

/** Pixels de la couleur cherchée (1) dans la zone, à `tolerance` près (ΔE). */
export function masque(img: ImageRGBA, couleur: RVB, tolerance: number, zone?: Zone | null): Uint8Array {
  const [x0, y0, x1, y1] = zoneDans(img, zone);
  const out = new Uint8Array(img.width * img.height);
  const deja = new Map<number, boolean>(); // une image a peu de couleurs distinctes
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const c = pixel(img, x, y);
      const cle = (c[0] << 16) | (c[1] << 8) | c[2];
      let ok = deja.get(cle);
      if (ok === undefined) deja.set(cle, (ok = ecart(c, couleur) <= tolerance));
      if (ok) out[y * img.width + x] = 1;
    }
  return out;
}

export interface OptionsSuivi {
  couleur: RVB;
  /** Écart de couleur admis (ΔE ; 15 convient à la plupart des images, plus pour un JPEG). */
  tolerance: number;
  /** Zone de recherche (pixels) ; toute l'image sinon. */
  zone?: Zone | null;
  /** Écart entre deux points, en pixels le long de l'axe des x. */
  pas: number;
}

/**
 * Suit une courbe y = f(x) : les pixels de la couleur sont rangés par tranches de `pas` pixels
 * le long de l'axe des x. Dans chaque tranche, les pixels se regroupent en paquets le long de y
 * (la courbe, et parfois une autre portion de courbe de même couleur ou du texte) : on garde le
 * paquet le plus proche du point précédent, ce qui suit la courbe à travers les croisements.
 * Renvoie les points (valeurs du graphique), dans l'ordre des x.
 */
export function suivre(img: ImageRGBA, e: Etalonnage, o: OptionsSuivi): Pt[] {
  const m = masque(img, o.couleur, o.tolerance, o.zone);
  const [x0, y0, x1, y1] = zoneDans(img, o.zone);
  const pas = Math.max(0.5, o.pas);
  const tranches = new Map<number, Pt[]>();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (!m[y * img.width + x]) continue;
      const [u, w] = coordonneesAxes(e, [x + 0.5, y + 0.5]);
      const k = Math.floor(u / pas);
      const t = tranches.get(k);
      if (t) t.push([u, w]);
      else tranches.set(k, [[u, w]]);
    }
  const points: Pt[] = [];
  let precedent: number | null = null;
  for (const k of [...tranches.keys()].sort((a, b) => a - b)) {
    const paquets = regrouper(tranches.get(k)!);
    const choisi =
      precedent === null
        ? paquets.reduce((a, b) => (b.length > a.length ? b : a))
        : paquets.reduce((a, b) => (Math.abs(moyenne(b, 1) - precedent!) < Math.abs(moyenne(a, 1) - precedent!) ? b : a));
    precedent = moyenne(choisi, 1);
    points.push(versDonnees(e, depuisCoordonneesAxes(e, [moyenne(choisi, 0), precedent])));
  }
  return points.sort((a, b) => a[0] - b[0]);
}

const moyenne = (p: Pt[], i: 0 | 1) => p.reduce((s, q) => s + q[i], 0) / p.length;

/** Paquets de pixels séparés de plus de 3 pixels selon w. */
function regrouper(pts: Pt[]): Pt[][] {
  const tries = [...pts].sort((a, b) => a[1] - b[1]);
  const out: Pt[][] = [[tries[0]!]];
  for (let i = 1; i < tries.length; i++) {
    if (tries[i]![1] - tries[i - 1]![1] > 3) out.push([]);
    out[out.length - 1]!.push(tries[i]!);
  }
  return out;
}

/**
 * Symboles d'un nuage de points : paquets de pixels contigus de la couleur, d'au moins
 * `tailleMin` pixels (ce qui écarte le bruit et l'anticrénelage). Un point par paquet, à son
 * centre. Des symboles qui se touchent comptent pour un seul point.
 */
export function marqueurs(img: ImageRGBA, e: Etalonnage, o: Omit<OptionsSuivi, "pas"> & { tailleMin?: number }): Pt[] {
  const m = masque(img, o.couleur, o.tolerance, o.zone);
  const W = img.width;
  const vu = new Uint8Array(m.length);
  const out: Pt[] = [];
  const pile: number[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || vu[i]) continue;
    let n = 0,
      sx = 0,
      sy = 0;
    pile.push(i);
    vu[i] = 1;
    while (pile.length) {
      const k = pile.pop()!;
      const x = k % W,
        y = (k - x) / W;
      n++;
      sx += x + 0.5;
      sy += y + 0.5;
      for (const v of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (v >= 0 && v < m.length && m[v] && !vu[v]) {
          vu[v] = 1;
          pile.push(v);
        }
      }
    }
    if (n >= (o.tailleMin ?? 6)) out.push(versDonnees(e, [sx / n, sy / n]));
  }
  return out.sort((a, b) => a[0] - b[0]);
}
