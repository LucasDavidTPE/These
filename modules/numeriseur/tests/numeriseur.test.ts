/**
 * Numériseur : étalonnage (axes inclinés, échelles log), relevé de courbes et de symboles,
 * lecture d'une carte de couleurs par sa légende, coupes et maillages. Les images sont
 * dessinées ici, avec des valeurs connues.
 */
import { describe, expect, it } from "vitest";
import { couverture, coupe, lireCarte, lireLegende, valeurEn, type Legende } from "../core/carte";
import { marqueurs, suivre } from "../core/courbe";
import { defauts, versDonnees, versPixel, type Etalonnage } from "../core/etalonnage";
import { chargementDisques, csvMatrice, matrice } from "../core/exports";
import { couleursDominantes, type ImageRGBA, type Pt, type RVB } from "../core/image";
import { formes, moyennes, resultante, type Rectangle } from "../core/maillage";

function image(w: number, h: number): ImageRGBA {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(255) };
}
function poser(img: ImageRGBA, x: number, y: number, c: RVB) {
  const [i, j] = [Math.round(x), Math.round(y)];
  if (i < 0 || j < 0 || i >= img.width || j >= img.height) return;
  const o = 4 * (j * img.width + i);
  [img.data[o], img.data[o + 1], img.data[o + 2]] = c;
}
/** Trait épais (disque de rayon r le long de la courbe). */
function tracer(img: ImageRGBA, pts: Pt[], c: RVB, r = 1) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [a, b] = [pts[k]!, pts[k + 1]!];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2) + 1;
    for (let s = 0; s <= n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n,
        y = a[1] + ((b[1] - a[1]) * s) / n;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) poser(img, x + dx, y + dy, c);
    }
  }
}

// Graphique : x de 0 à 10 sur les pixels 50 → 350, y de 0 à 100 sur les pixels 250 → 50.
const E: Etalonnage = { x: { p1: [50, 250], p2: [350, 250], v1: 0, v2: 10, log: false }, y: { p1: [50, 250], p2: [50, 50], v1: 0, v2: 100, log: false } };

describe("étalonnage", () => {
  it("aller-retour et points connus", () => {
    expect(versDonnees(E, [200, 150])).toEqual([5, 50]);
    const p = versPixel(E, [2.5, 80]);
    expect(p[0]).toBeCloseTo(125);
    expect(p[1]).toBeCloseTo(90);
    expect(defauts(E)).toEqual([]);
  });

  it("image tournée de 10° et axes obliques", () => {
    const a = (10 * Math.PI) / 180;
    const R = ([x, y]: Pt): Pt => [100 + Math.cos(a) * x - Math.sin(a) * y, 400 + Math.sin(a) * x + Math.cos(a) * y];
    // axe des y légèrement oblique (repère non orthogonal)
    const ex: Pt = [300, 0],
      ey: Pt = [20, -200];
    const e: Etalonnage = { x: { p1: R([0, 0]), p2: R(ex), v1: 0, v2: 3, log: false }, y: { p1: R([0, 0]), p2: R(ey), v1: -1, v2: 1, log: false } };
    const d: Pt = [1.2, 0.3];
    // point du graphique : 0 + 1.2/3 le long de ex, (0.3 + 1)/2 le long de ey
    const p = R([(1.2 / 3) * ex[0] + (1.3 / 2) * ey[0], (1.2 / 3) * ex[1] + (1.3 / 2) * ey[1]]);
    const got = versDonnees(e, p);
    expect(got[0]).toBeCloseTo(d[0], 10);
    expect(got[1]).toBeCloseTo(d[1], 10);
    const back = versPixel(e, d);
    expect(back[0]).toBeCloseTo(p[0], 8);
    expect(back[1]).toBeCloseTo(p[1], 8);
  });

  it("échelles logarithmiques et axes distincts (X1 ≠ Y1)", () => {
    const e: Etalonnage = { x: { p1: [100, 300], p2: [400, 300], v1: 0.1, v2: 1000, log: true }, y: { p1: [60, 280], p2: [60, 80], v1: 1, v2: 100, log: true } };
    const d = versDonnees(e, [250, 180]);
    expect(d[0]).toBeCloseTo(10 ** (-1 + 0.5 * 4), 8);
    expect(d[1]).toBeCloseTo(10 ** (0 + 0.5 * 2), 8);
    const p = versPixel(e, [1, 3]);
    expect(versDonnees(e, p)[0]).toBeCloseTo(1, 10);
    expect(versDonnees(e, p)[1]).toBeCloseTo(3, 10);
  });

  it("défauts signalés", () => {
    expect(defauts({ ...E, x: { ...E.x, p2: [50.5, 250] } })[0]).toMatch(/confondus/);
    expect(defauts({ ...E, y: { ...E.y, v1: 0, log: true } }).join()).toMatch(/positives/);
    expect(defauts({ ...E, y: { ...E.y, p2: [350, 250] } }).join()).toMatch(/parallèles/);
  });
});

describe("relevé de courbes", () => {
  const rouge: RVB = [214, 39, 40],
    bleu: RVB = [31, 119, 180];
  const img = image(400, 300);
  // axes noirs
  tracer(img, [[50, 250], [350, 250]], [0, 0, 0], 0);
  tracer(img, [[50, 250], [50, 50]], [0, 0, 0], 0);
  const f = (x: number) => x * x;
  tracer(img, Array.from({ length: 101 }, (_, i) => versPixel(E, [i / 10, f(i / 10)])), rouge, 1);
  // une droite bleue qui croise la parabole
  tracer(img, [versPixel(E, [0, 60]), versPixel(E, [10, 20])], bleu, 1);
  // symboles bleus : carrés 5 × 5
  const symboles: Pt[] = [[1, 90], [3, 85], [5, 95], [8, 88]];
  for (const s of symboles) {
    const [px, py] = versPixel(E, s);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) poser(img, px + dx, py + dy, bleu);
  }

  it("couleurs dominantes : les deux courbes, pas le noir ni le blanc", () => {
    const c = couleursDominantes(img);
    expect(c.length).toBeGreaterThanOrEqual(2);
    const noms = c.slice(0, 2).map((k) => (k.couleur[0] > 150 ? "rouge" : "bleu"));
    expect(noms.sort()).toEqual(["bleu", "rouge"]);
  });

  it("suit la parabole à travers le croisement", () => {
    const pts = suivre(img, E, { couleur: rouge, tolerance: 15, pas: 5 });
    expect(pts.length).toBeGreaterThan(50);
    for (const [x, y] of pts) expect(Math.abs(y - f(x))).toBeLessThan(1.5); // 1,5 % de l'étendue en y
    expect(pts[0]![0]).toBeLessThan(0.3);
    expect(pts.at(-1)![0]).toBeGreaterThan(9.7);
  });

  it("zone de recherche : seulement la moitié gauche", () => {
    const pts = suivre(img, E, { couleur: rouge, tolerance: 15, pas: 5, zone: [0, 0, 200, 300] });
    expect(Math.max(...pts.map((p) => p[0]))).toBeLessThan(5.1);
  });

  it("symboles : un point par carré, à son centre", () => {
    // la droite bleue gêne : on se limite à la bande haute (y > 80), au-dessus d'elle
    const zone: [number, number, number, number] = [0, 0, 400, versPixel(E, [0, 80])[1]];
    const pts = marqueurs(img, E, { couleur: bleu, tolerance: 15, zone });
    expect(pts.length).toBe(symboles.length);
    pts.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(symboles[i]![0], 1);
      expect(Math.abs(p[1] - symboles[i]![1])).toBeLessThan(0.6);
    });
  });
});

describe("carte de couleurs", () => {
  // gamme bleu → cyan → vert → jaune → rouge, valeur 0 à 1
  const nœuds: RVB[] = [[0, 0, 255], [0, 255, 255], [0, 255, 0], [255, 255, 0], [255, 0, 0]];
  const gammeDe = (t: number): RVB => {
    const u = Math.min(1, Math.max(0, t)) * (nœuds.length - 1);
    const i = Math.min(nœuds.length - 2, Math.floor(u)),
      f = u - i;
    return [0, 1, 2].map((k) => Math.round(nœuds[i]![k]! + (nœuds[i + 1]![k]! - nœuds[i]![k]!) * f)) as RVB;
  };
  // carte : x de 0 à 10 (px 50 → 350), y de 0 à 100 (px 250 → 50) ; valeur = pression en MPa
  // p(x, y) = 0,2 + 0,6 · exp(-((x-5)² + ((y-50)/10)²)/8), bornée à [0, 1]
  const p = (x: number, y: number) => 0.2 + 0.6 * Math.exp(-((x - 5) ** 2 + ((y - 50) / 10) ** 2) / 8);
  const img = image(420, 300);
  for (let j = 50; j < 250; j++)
    for (let i = 50; i < 350; i++) {
      const [x, y] = versDonnees(E, [i + 0.5, j + 0.5]);
      poser(img, i, j, gammeDe(p(x, y)));
    }
  // légende verticale à droite : 0 en bas (y = 250), 1 en haut (y = 50)
  for (let j = 50; j <= 250; j++) for (let i = 380; i < 392; i++) poser(img, i, j, gammeDe((250 - j) / 200));
  const leg: Legende = { p1: [386, 250.5], p2: [386, 50.5], v1: 0, v2: 1, log: false };
  const gamme = lireLegende(img, leg);
  const champ = lireCarte(img, gamme, 10, [50, 50, 350, 250]);

  it("toute la carte est lue, à la quantification près", () => {
    expect(couverture(champ)).toBe(1);
    let pire = 0;
    for (const x of [1, 2.5, 5, 7.3, 9]) for (const y of [10, 35, 50, 62, 90]) pire = Math.max(pire, Math.abs(valeurEn(champ, E, [x, y]) - p(x, y)));
    expect(pire).toBeLessThan(0.01);
  });

  it("le fond et le texte n'ont pas de valeur", () => {
    const c = lireCarte(img, gamme, 10);
    expect(Number.isNaN(c.valeurs[10 * img.width + 10]!)).toBe(true); // blanc
  });

  it("coupe horizontale au centre", () => {
    const c = coupe(champ, E, [0.5, 50], [9.5, 50], 91);
    expect(c.s.at(-1)).toBeCloseTo(9, 10);
    c.x.forEach((x, i) => expect(Math.abs(c.v[i]! - p(x, 50))).toBeLessThan(0.01));
  });

  it("maillage rectangulaire : moyennes des cellules, matrice au format ChaussSpec", () => {
    const m: Rectangle = { type: "rectangle", x0: 0, x1: 10, nx: 5, y0: 0, y1: 100, ny: 4 };
    const c = moyennes(champ, E, m);
    expect(c).toHaveLength(20);
    // moyenne exacte de p sur chaque cellule (quadrature fine)
    for (const k of c) {
      let s = 0;
      const N = 40;
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) s += p(k.centre[0] - 1 + (2 * (a + 0.5)) / N, k.centre[1] - 12.5 + (25 * (b + 0.5)) / N);
      expect(Math.abs(k.valeur - s / (N * N))).toBeLessThan(0.01);
      expect(k.aire).toBeCloseTo(50);
    }
    const { x, y, P } = matrice(c, m);
    expect(x).toEqual([1, 3, 5, 7, 9]);
    expect(y).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(P[1]![2]).toBe(c[7]!.valeur);
    const csv = csvMatrice(c, m).split("\n");
    expect(csv[0]).toBe("nan;1;3;5;7;9");
    expect(csv[1]!.startsWith("12.5;")).toBe(true);
    // résultante ≈ intégrale de p sur la carte
    let I = 0;
    for (let a = 0; a < 200; a++) for (let b = 0; b < 200; b++) I += p((10 * (a + 0.5)) / 200, (100 * (b + 0.5)) / 200) * (10 / 200) * (100 / 200);
    expect(resultante(c) / I).toBeCloseTo(1, 2);
  });

  it("disques en trame hexagonale : centres, moyennes, charges circulaires ChaussSpec", () => {
    const m = { type: "disques" as const, x0: 2, x1: 8, y0: 30, y1: 70, R: 1, pas: 2, trame: "hexagonale" as const };
    const f = formes(m);
    // rangées espacées de 2·√3/2, décalées d'un demi-pas une sur deux
    expect(f[0]!.centre).toEqual([2, 30]);
    const deuxieme = f.find((k) => k.centre[1] > 30)!;
    expect(deuxieme.centre[0]).toBeCloseTo(3);
    expect(deuxieme.centre[1]).toBeCloseTo(30 + Math.sqrt(3));
    const c = moyennes(champ, E, m);
    // le disque le plus chargé est au centre de la bosse (5, 50)
    const max = c.reduce((a, b) => (b.valeur > a.valeur ? b : a));
    expect(Math.abs(max.centre[0] - 5)).toBeLessThanOrEqual(1);
    expect(Math.abs(max.centre[1] - 50)).toBeLessThan(2);
    expect(max.valeur).toBeGreaterThan(0.75);
    // moyenne d'un disque = moyenne de p sur le disque
    const k = c[5]!;
    let s = 0,
      nb = 0;
    for (let a = -50; a <= 50; a++)
      for (let b = -50; b <= 50; b++) {
        if (a * a + b * b > 2500) continue;
        s += p(k.centre[0] + a / 50, k.centre[1] + b / 50);
        nb++;
      }
    expect(Math.abs(k.valeur - s / nb)).toBeLessThan(0.01);
    const roues = chargementDisques(c, 1, { longueur: 1e-3, pression: 1e6 }, 0.3);
    expect(roues.length).toBeGreaterThan(0);
    expect(roues.every((r) => (r.footprint.p as number) > 0.3e6 && r.footprint.R === 1e-3)).toBe(true);
  });

  it("maillage polaire : anneaux × secteurs", () => {
    const m = { type: "polaire" as const, xc: 5, yc: 50, rayons: [0, 1, 2, 3], secteurs: 4 };
    const c = moyennes(champ, E, m);
    expect(c).toHaveLength(12);
    expect(c[0]!.aire).toBeCloseTo(Math.PI / 4);
    // valeur décroissante du centre vers l'extérieur
    expect(c[0]!.valeur).toBeGreaterThan(c[4]!.valeur);
    expect(c[4]!.valeur).toBeGreaterThan(c[8]!.valeur);
  });
});
