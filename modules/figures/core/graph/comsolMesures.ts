/**
 * Mesures superposées au calcul : un signal de jauge, de capteur de déplacement, un profil mesuré… collé depuis
 * Excel ou un fichier texte, tracé avec les courbes COMSOL et comparé à chacune : écart quadratique moyen, écart
 * sur le pic, et (pour un signal) recalage des pics dans le temps.
 */

export interface MesureCollee {
  nom: string;
  /** Abscisse (temps, ou coordonnée dans l'unité de tracé) et valeurs, dans l'unité de la grandeur calculée. */
  x: number[];
  y: number[];
}

/** Découpe une ligne : tabulation ou « ; » (virgule décimale permise), sinon blancs, sinon virgules (CSV anglais). */
function cellules(ligne: string): string[] {
  const l = ligne.trim();
  if (/[\t;]/.test(l))
    return l.split(/\s*[\t;]\s*/).map((c) => c.replace(",", "."));
  if (/\s/.test(l)) return l.split(/\s+/).map((c) => c.replace(",", "."));
  return l.split(",");
}

/**
 * Colonnes collées : la première est l'abscisse, chacune des suivantes une mesure. Une première ligne de texte
 * donne les noms ; les lignes illisibles sont sautées. `facteur` et `signe` convertissent les valeurs (µε → µdef,
 * compression comptée positive…).
 */
export function lireMesures(
  texte: string,
  o: { facteur?: number; signe?: 1 | -1; nom?: string } = {},
): MesureCollee[] {
  const k = (o.facteur ?? 1) * (o.signe ?? 1);
  let noms: string[] | null = null;
  const colonnes: number[][] = [];
  let ligne = 0;
  for (const brute of texte.split(/\r?\n/)) {
    if (!brute.trim()) continue;
    const c = cellules(brute);
    const n = c.map((x) =>
      x.trim() === "" ? NaN : Number(x.replace("−", "-")),
    );
    if (
      n.length < 2 ||
      !Number.isFinite(n[0]!) ||
      n.slice(1).every((x) => !Number.isFinite(x))
    ) {
      if (!colonnes.length && !noms) noms = c.map((x) => x.trim());
      continue;
    }
    n.forEach((v, j) => ((colonnes[j] ??= [])[ligne] = v));
    ligne++;
  }
  if (!colonnes.length) return [];
  const x = colonnes[0]!;
  return colonnes.slice(1).flatMap((ys, j) => {
    const pts = x
      .map((xv, i) => [xv, ys[i]] as const)
      .filter(
        (p): p is readonly [number, number] =>
          p[1] !== undefined && Number.isFinite(p[1]),
      );
    if (!pts.length) return [];
    const nom =
      noms?.[j + 1] ||
      (colonnes.length > 2
        ? `${o.nom ?? "Mesure"} ${j + 1}`
        : (o.nom ?? "Mesure"));
    return [
      {
        nom,
        x: pts.map((p) => p[0]),
        y: pts.map((p) => Number((p[1] * k).toPrecision(12))),
      },
    ];
  });
}

export interface EcartMesure {
  /** Points comparés (mesures dans l'étendue du calcul). */
  n: number;
  /** Écart quadratique moyen, et rapporté au pic mesuré (%). */
  rms: number;
  rmsRelatif: number;
  picCalcul: number;
  picMesure: number;
  /** (|pic calculé| − |pic mesuré|) / |pic mesuré|, en %. */
  ecartPic: number;
  /** Décalage appliqué aux abscisses mesurées pour aligner les pics (0 sans recalage). */
  decalage: number;
}

const picDe = (x: readonly number[], y: readonly number[]) => {
  let i = -1;
  y.forEach(
    (v, k) =>
      Number.isFinite(v) && (i < 0 || Math.abs(v) > Math.abs(y[i]!)) && (i = k),
  );
  return i < 0 ? null : { x: x[i]!, y: y[i]! };
};

/** Le calcul interpolé linéairement en x (abscisses croissantes ou non) ; null hors de son étendue. */
export function interpolerCourbe(
  cx: readonly number[],
  cy: readonly number[],
  x: number,
): number | null {
  const pts = cx
    .map((a, i) => [a, cy[i]!] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  pts.sort((a, b) => a[0] - b[0]);
  if (!pts.length || x < pts[0]![0] - 1e-12 || x > pts.at(-1)![0] + 1e-12)
    return null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    if (x <= x1 + 1e-12)
      return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts.at(-1)![1];
}

/** Écart d'une courbe calculée à une mesure ; `aligner` : la mesure est décalée en x pour que les pics coïncident. */
export function comparerMesure(
  calcul: { x: readonly number[]; y: readonly number[] },
  m: MesureCollee,
  o: { aligner?: boolean } = {},
): EcartMesure | null {
  const pc = picDe(calcul.x, calcul.y);
  const pm = picDe(m.x, m.y);
  if (!pc || !pm) return null;
  const decalage = o.aligner ? pc.x - pm.x : 0;
  let s = 0;
  let n = 0;
  m.x.forEach((x, i) => {
    const c = interpolerCourbe(calcul.x, calcul.y, x + decalage);
    if (c === null || !Number.isFinite(m.y[i]!)) return;
    s += (c - m.y[i]!) ** 2;
    n++;
  });
  if (!n) return null;
  const rms = Math.sqrt(s / n);
  return {
    n,
    rms,
    rmsRelatif: pm.y ? (100 * rms) / Math.abs(pm.y) : NaN,
    picCalcul: pc.y,
    picMesure: pm.y,
    ecartPic: pm.y
      ? (100 * (Math.abs(pc.y) - Math.abs(pm.y))) / Math.abs(pm.y)
      : NaN,
    decalage,
  };
}

/** Lire une mesure enregistrée dans une recette. */
export function lireMesuresRecette(v: unknown): MesureCollee[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) => {
    if (typeof m !== "object" || m === null) return [];
    const r = m as Record<string, unknown>;
    const x = Array.isArray(r.x)
      ? r.x.filter((a): a is number => typeof a === "number")
      : [];
    const y = Array.isArray(r.y)
      ? r.y.filter((a): a is number => typeof a === "number")
      : [];
    return x.length && x.length === y.length
      ? [{ nom: typeof r.nom === "string" ? r.nom : "Mesure", x, y }]
      : [];
  });
}
