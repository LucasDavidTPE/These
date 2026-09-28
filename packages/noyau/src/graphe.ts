/**
 * Graphique XY en SVG, sans DOM : échelles linéaires ou logarithmiques sur dix décades,
 * nuages de points et courbes superposés (mesures et modèle), survol du point le plus proche.
 * Repris du traceur sur canvas de la page 2S2P1D (statique/src/ui/graphiques.js) : mêmes
 * marges, mêmes graduations, même recherche du point survolé. Le même SVG sert à l'écran
 * (couleurs du thème, en variables CSS) et à l'export vers Figures (couleurs fixes).
 */
import { echapperXml } from "./texte";

/** [x, y, donnée attachée (le palier d'où vient le point)] */
export type Point = readonly [number, number, unknown?];

export interface Serie {
  points: readonly Point[];
  mode: "points" | "ligne";
  couleur: string;
  libelle?: string;
  /** Rayon des points. */
  taille?: number;
  /** Épaisseur des lignes. */
  epaisseur?: number;
  tirets?: readonly number[];
}

export interface SpecGraphe {
  series: readonly Serie[];
  xLog?: boolean;
  yLog?: boolean;
  xTitre?: string;
  yTitre?: string;
  /** Inclure y = 0 dans l'échelle. */
  zeroY?: boolean;
}

export interface Palette {
  fond: string;
  texte: string;
  discret: string;
  grille: string;
  trait: string;
}

/** Couleurs fixes (export PNG / SVG, Figures). */
export const PALETTE_CLAIRE: Palette = { fond: "#ffffff", texte: "#1d1d1b", discret: "#6a6a66", grille: "#e6e6e2", trait: "#9a9a94" };
/** Couleurs du thème de l'application (clair ou sombre), pour l'écran. */
export const PALETTE_THEME: Palette = { fond: "var(--surface)", texte: "var(--texte)", discret: "var(--discret)", grille: "var(--bordure)", trait: "var(--discret)" };

/* ------------------------------------------------------------------ nombres */

const EXPOSANTS: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "+": "" };

/** Nombre à la française : virgule décimale, « 5,00·10⁻⁵ » pour les très petits et très grands. */
export function nb(x: number | null | undefined, d?: number): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (d === undefined) d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  if (a !== 0 && (a < 1e-4 || a >= 1e7)) {
    const [mantisse, exposant] = x.toExponential(2).split("e");
    return (
      mantisse!.replace(".", ",") +
      "·10" +
      exposant!
        .split("")
        .map((c) => EXPOSANTS[c] ?? c)
        .join("")
    );
  }
  return x.toFixed(d).replace(".", ",");
}

/** Exposant lisible pour les axes logarithmiques : 10⁻³ plutôt que 1e-3. */
export function puissance(d: number): string {
  return (
    "10" +
    String(Math.round(d))
      .split("")
      .map((c) => EXPOSANTS[c] ?? c)
      .join("")
  );
}

/* --------------------------------------------------------------- graduations */

function graduationsLineaires(lo: number, hi: number, n: number): number[] {
  if (!(hi > lo)) return [lo];
  const brut = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(brut));
  const norm = brut / mag;
  const pas = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / pas) * pas; v <= hi + pas * 1e-9; v += pas) out.push(Math.abs(v) < pas * 1e-9 ? 0 : v);
  return out;
}

function graduationsLog(lo: number, hi: number, place: number): number[] {
  const d0 = Math.ceil(lo - 1e-9),
    d1 = Math.floor(hi + 1e-9);
  const pas = Math.max(1, Math.ceil((d1 - d0 + 1) / (place || 7)));
  const out: number[] = [];
  for (let d = d0; d <= d1; d++) if ((d - d0) % pas === 0) out.push(d);
  return out;
}

/* ---------------------------------------------------------------- disposition */

export interface Disposition {
  largeur: number;
  hauteur: number;
  vide: boolean;
  X0: number;
  Y0: number;
  L: number;
  H: number;
  haut: number;
  px(v: number): number;
  py(v: number): number;
  valide(p: Point): boolean;
  /** Graduations, en unités transformées (log10 pour un axe logarithmique). */
  gx: number[];
  gy: number[];
  etiquetteX(t: number): string;
  etiquetteY(t: number): string;
  /** Position d'une graduation (unités transformées) en pixels. */
  gxPx(t: number): number;
  gyPx(t: number): number;
}

/** Largeur approchée d'un texte de 10,5 px (pas de DOM pour mesurer). */
const largeurTexte = (s: string) => s.length * 6.1;

export function disposer(spec: SpecGraphe, largeur: number, hauteur: number): Disposition {
  const marge = { g: 56, d: 28, h: 12, b: 32 };
  const valide = (p: Point) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!spec.xLog || p[0] > 0) && (!spec.yLog || p[1] > 0);
  const tous: Point[] = [];
  for (const s of spec.series) for (const p of s.points) if (valide(p)) tous.push(p);

  const tx = (v: number) => (spec.xLog ? Math.log10(v) : v);
  const ty = (v: number) => (spec.yLog ? Math.log10(v) : v);
  let x1 = Infinity,
    x2 = -Infinity,
    y1 = Infinity,
    y2 = -Infinity;
  for (const p of tous) {
    const a = tx(p[0]),
      b = ty(p[1]);
    if (a < x1) x1 = a;
    if (a > x2) x2 = a;
    if (b < y1) y1 = b;
    if (b > y2) y2 = b;
  }
  if (spec.zeroY) {
    y1 = Math.min(y1, 0);
    y2 = Math.max(y2, 0);
  }
  const mx = (x2 - x1) * 0.05 || 0.5,
    my = (y2 - y1) * 0.08 || 0.5;
  x1 -= mx;
  x2 += mx;
  y1 -= my;
  y2 += my;

  // Décimales d'après le pas des graduations (un pas de 0,5 affiche « 1,5 », pas « 2 »).
  const decimales = (g: number[]) => {
    const pas = g.length > 1 ? Math.abs(g[1]! - g[0]!) : 1;
    return pas >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(pas) - 1e-9));
  };
  const etiquette = (log: boolean | undefined, g: () => number[]) => (t: number) => (log ? puissance(t) : nb(t, Math.max(decimales(g()), Math.abs(t) < 1 && t !== 0 && decimales(g()) === 0 ? 2 : 0)));
  const Hbrut = hauteur - marge.h - marge.b;
  let gxListe: number[] = [];
  const gy = tous.length ? (spec.yLog ? graduationsLog(y1, y2, Math.max(3, Math.floor(Hbrut / 26))) : graduationsLineaires(y1, y2, 5)) : [];
  const etiquetteX = etiquette(spec.xLog, () => gxListe),
    etiquetteY = etiquette(spec.yLog, () => gy);
  // La marge de gauche suit la largeur réelle des étiquettes : « 5,00·10⁻⁵ » ne tient pas dans la place de « 40 ».
  marge.g = Math.min(largeur * 0.4, Math.max(38, Math.ceil(Math.max(0, ...gy.map((t) => largeurTexte(etiquetteY(t))))) + 24));
  const X0 = marge.g,
    Y0 = hauteur - marge.b,
    L = largeur - marge.g - marge.d,
    H = hauteur - marge.h - marge.b;
  const gx = tous.length ? (spec.xLog ? graduationsLog(x1, x2, Math.max(3, Math.floor(L / 46))) : graduationsLineaires(x1, x2, 5)) : [];
  gxListe = gx;

  return {
    largeur,
    hauteur,
    vide: !tous.length,
    X0,
    Y0,
    L,
    H,
    haut: marge.h,
    px: (v) => X0 + ((tx(v) - x1) / (x2 - x1)) * L,
    py: (v) => Y0 - ((ty(v) - y1) / (y2 - y1)) * H,
    valide,
    gx,
    gy,
    etiquetteX,
    etiquetteY,
    gxPx: (t) => X0 + ((t - x1) / (x2 - x1)) * L,
    gyPx: (t) => Y0 - ((t - y1) / (y2 - y1)) * H,
  };
}

/** Point de mesure le plus proche du pointeur (à moins de 40 px), lignes exclues. */
export function plusProche(spec: SpecGraphe, d: Disposition, mx: number, my: number): { serie: Serie; point: Point } | null {
  let best: { dist: number; serie: Serie; point: Point } | null = null;
  for (const s of spec.series) {
    if (s.mode === "ligne") continue;
    for (const p of s.points) {
      if (!d.valide(p)) continue;
      const dist = (d.px(p[0]) - mx) ** 2 + (d.py(p[1]) - my) ** 2;
      if (!best || dist < best.dist) best = { dist, serie: s, point: p };
    }
  }
  return best && best.dist < 40 * 40 ? { serie: best.serie, point: best.point } : null;
}

const r1 = (v: number) => String(Math.round(v * 10) / 10);
const POLICE = "font-family=\"'Segoe UI', Arial, sans-serif\"";

export interface OptionsSvg {
  largeur: number;
  hauteur: number;
  palette?: Palette;
  /** Titre au-dessus du graphique (export). */
  titre?: string;
  /** Légende sous le graphique : [libellé, couleur]. */
  legende?: readonly (readonly [string, string])[];
  /** Identifiant du cadre de découpe, unique dans la page quand plusieurs graphiques s'y côtoient. */
  id?: string;
}

/** Le graphique en SVG autonome (styles en ligne). Déterministe. */
export function grapheSvg(spec: SpecGraphe, o: OptionsSvg): string {
  const pal = o.palette ?? PALETTE_CLAIRE;
  const hTitre = o.titre ? 26 : 0;
  const hLegende = o.legende?.length ? 22 : 0;
  const d = disposer(spec, o.largeur, o.hauteur);
  const H = o.hauteur + hTitre + hLegende;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${o.largeur}" height="${H}" viewBox="0 0 ${o.largeur} ${H}">`, `<rect width="100%" height="100%" fill="${pal.fond}"/>`];
  if (o.titre) out.push(`<text x="10" y="18" ${POLICE} font-size="14" font-weight="600" fill="${pal.texte}">${echapperXml(o.titre)}</text>`);
  out.push(`<g transform="translate(0 ${hTitre})">`);
  if (d.vide) {
    out.push(`<text x="${o.largeur / 2}" y="${o.hauteur / 2}" text-anchor="middle" ${POLICE} font-size="12" fill="${pal.discret}">aucune donnée</text>`);
  } else {
    for (const t of d.gx) {
      const X = r1(d.gxPx(t));
      out.push(`<line x1="${X}" x2="${X}" y1="${d.haut}" y2="${r1(d.Y0)}" stroke="${pal.grille}" stroke-width="1"/>`);
      out.push(`<text x="${X}" y="${r1(d.Y0 + 16)}" text-anchor="middle" ${POLICE} font-size="10.5" fill="${pal.discret}">${echapperXml(d.etiquetteX(t))}</text>`);
    }
    for (const t of d.gy) {
      const Y = r1(d.gyPx(t));
      out.push(`<line x1="${r1(d.X0)}" x2="${r1(d.X0 + d.L)}" y1="${Y}" y2="${Y}" stroke="${pal.grille}" stroke-width="1"/>`);
      out.push(`<text x="${r1(d.X0 - 6)}" y="${r1(d.gyPx(t) + 3.5)}" text-anchor="end" ${POLICE} font-size="10.5" fill="${pal.discret}">${echapperXml(d.etiquetteY(t))}</text>`);
    }
    out.push(`<path d="M${r1(d.X0)} ${d.haut} L${r1(d.X0)} ${r1(d.Y0)} L${r1(d.X0 + d.L)} ${r1(d.Y0)}" fill="none" stroke="${pal.trait}" stroke-width="1"/>`);
    if (spec.xTitre) out.push(`<text x="${r1(d.X0 + d.L)}" y="${r1(d.Y0 - 5)}" text-anchor="end" ${POLICE} font-size="11" fill="${pal.texte}">${echapperXml(spec.xTitre)}</text>`);
    if (spec.yTitre) out.push(`<text transform="translate(12 ${d.haut + 2}) rotate(-90)" text-anchor="end" dominant-baseline="hanging" ${POLICE} font-size="11" fill="${pal.texte}">${echapperXml(spec.yTitre)}</text>`);
    const zone = `zone-${o.id ?? "g"}`;
    out.push(`<clipPath id="${zone}"><rect x="${r1(d.X0)}" y="${d.haut - 2}" width="${r1(d.L)}" height="${r1(d.H + 4)}"/></clipPath><g clip-path="url(#${zone})">`);
    for (const s of spec.series) {
      const pts = s.points.filter(d.valide);
      if (!pts.length) continue;
      if (s.mode === "ligne") {
        const chemin = pts.map((p, i) => `${i ? "L" : "M"}${d.px(p[0]).toFixed(1)} ${d.py(p[1]).toFixed(1)}`).join(" ");
        out.push(`<path d="${chemin}" fill="none" stroke="${s.couleur}" stroke-width="${s.epaisseur ?? 1.8}"${s.tirets?.length ? ` stroke-dasharray="${s.tirets.join(" ")}"` : ""}/>`);
      } else {
        const r = s.taille ?? 2.6;
        for (const p of pts) out.push(`<circle cx="${d.px(p[0]).toFixed(1)}" cy="${d.py(p[1]).toFixed(1)}" r="${r}" fill="${s.couleur}"/>`);
      }
    }
    out.push("</g>");
  }
  out.push("</g>");
  if (o.legende?.length) {
    let x = 10;
    const y = hTitre + o.hauteur + 14;
    for (const [nom, couleur] of o.legende) {
      out.push(`<rect x="${r1(x)}" y="${y - 8}" width="10" height="10" rx="2" fill="${couleur}"/>`);
      out.push(`<text x="${r1(x + 14)}" y="${y}" ${POLICE} font-size="11" fill="${pal.texte}">${echapperXml(nom)}</text>`);
      x += 30 + nom.length * 6.2;
    }
  }
  out.push("</svg>");
  return out.join("\n") + "\n";
}

/* ---------------------------------------------------------------- couleurs */

/** Rampe froide → chaude : elle porte la température, pas la décoration. */
const RAMPE = ["#27408f", "#2f7fb5", "#3f9e8e", "#79a53f", "#c09a1f", "#c96a25", "#b03a2b"];

const versRVB = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function couleurTemperature(i: number, n: number): string {
  if (n < 2) return RAMPE[3]!;
  const t = (i / (n - 1)) * (RAMPE.length - 1);
  const a = Math.min(RAMPE.length - 2, Math.floor(t));
  const A = versRVB(RAMPE[a]!),
    B = versRVB(RAMPE[a + 1]!);
  return `rgb(${A.map((v, k) => Math.round(v + (B[k]! - v) * (t - a))).join(",")})`;
}
