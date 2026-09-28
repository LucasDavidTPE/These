/**
 * Champs dérivés des composantes calculées (n'existe pas dans le code Python, qui ne donne que ε1) :
 * déformations et contraintes principales, cisaillement maximal, von Mises, dilatation, et
 * combinaisons linéaires quelconques de composantes. Calculés point par point sur la partie réelle.
 */
import { eigvalsh3, type GridResult } from "./grid";
import { ALL, STRAIN, STRESS } from "./spectral";

export type Derive = "e1" | "e2" | "e3" | "evol" | "s1" | "s2" | "s3" | "tmax" | "svm";

export const DERIVES: Record<Derive, { libelle: string; besoin: readonly string[]; classe: "e" | "s" }> = {
  e1: { libelle: "ε1 (déformation principale max)", besoin: STRAIN, classe: "e" },
  e2: { libelle: "ε2 (déformation principale intermédiaire)", besoin: STRAIN, classe: "e" },
  e3: { libelle: "ε3 (déformation principale min)", besoin: STRAIN, classe: "e" },
  evol: { libelle: "εv = εxx + εyy + εzz (dilatation)", besoin: ["exx", "eyy", "ezz"], classe: "e" },
  s1: { libelle: "σ1 (contrainte principale max)", besoin: STRESS, classe: "s" },
  s2: { libelle: "σ2 (contrainte principale intermédiaire)", besoin: STRESS, classe: "s" },
  s3: { libelle: "σ3 (contrainte principale min)", besoin: STRESS, classe: "s" },
  tmax: { libelle: "τmax = (σ1 − σ3) / 2 (cisaillement maximal)", besoin: STRESS, classe: "s" },
  svm: { libelle: "σ von Mises", besoin: STRESS, classe: "s" },
};

export const estDerive = (c: string): c is Derive => c in DERIVES;

/** Les champs dérivés possibles avec les composantes présentes. */
export function derivesPossibles(presentes: ReadonlySet<string>): Derive[] {
  return (Object.keys(DERIVES) as Derive[]).filter((d) => DERIVES[d].besoin.every((c) => presentes.has(c)));
}

const reel = (res: GridResult, comps: readonly string[], z: number) => comps.map((c) => res.get(c, z).re);

/** Valeurs propres triées décroissantes (ε1 ≥ ε2 ≥ ε3), comme on numérote les contraintes principales. */
function principales(res: GridResult, comps: readonly string[], z: number): [Float64Array, Float64Array, Float64Array] {
  const [xx, yy, zz, xy, xz, yz] = reel(res, comps, z);
  const n = xx!.length;
  const out: [Float64Array, Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let i = 0; i < n; i++) {
    const l = eigvalsh3(xx![i]!, yy![i]!, zz![i]!, xy![i]!, xz![i]!, yz![i]!);
    out[0][i] = l[2];
    out[1][i] = l[1];
    out[2][i] = l[0];
  }
  return out;
}

export function calculerDerive(res: GridResult, d: Derive, z: number): Float64Array {
  if (res.meta.complex) throw new Error("Champs complexes (régime harmonique) : les champs dérivés ne sont pas définis.");
  switch (d) {
    case "e1":
    case "e2":
    case "e3":
      return principales(res, STRAIN, z)[Number(d[1]) - 1]!;
    case "s1":
    case "s2":
    case "s3":
      return principales(res, STRESS, z)[Number(d[1]) - 1]!;
    case "tmax": {
      const [a, , c] = principales(res, STRESS, z);
      return a.map((v, i) => (v - c[i]!) / 2);
    }
    case "evol": {
      const [a, b, c] = reel(res, ["exx", "eyy", "ezz"], z);
      return a!.map((v, i) => v + b![i]! + c![i]!);
    }
    case "svm": {
      const [xx, yy, zz, xy, xz, yz] = reel(res, STRESS, z);
      return xx!.map((_, i) => Math.sqrt(0.5 * ((xx![i]! - yy![i]!) ** 2 + (yy![i]! - zz![i]!) ** 2 + (zz![i]! - xx![i]!) ** 2) + 3 * (xy![i]! ** 2 + xz![i]! ** 2 + yz![i]! ** 2)));
    }
  }
}

export interface Terme {
  comp: string;
  coef: number;
}

export type Combinaison = { ok: true; termes: Terme[] } | { ok: false; message: string };

/**
 * « 0,5·exx − eyy + 2 sxy » → termes. Séparateurs : + et −, coefficient devant (« 2 sxy », « 2*sxy »,
 * « 0.5·exx »), virgule ou point décimal. Seules les composantes de `disponibles` sont admises.
 */
export function analyserCombinaison(texte: string, disponibles: ReadonlySet<string>): Combinaison {
  const s = texte.replace(/[·×]/g, "*").replace(/−/g, "-").replace(/,/g, ".").replace(/\s+/g, "");
  if (!s) return { ok: false, message: "Écrivez une combinaison, par exemple exx - eyy." };
  const morceaux = s.match(/[+-]?[^+-]+/g);
  if (!morceaux || morceaux.join("") !== s) return { ok: false, message: "Expression illisible." };
  const termes: Terme[] = [];
  for (const m of morceaux) {
    const r = /^([+-]?)(?:(\d*\.?\d+(?:e[+-]?\d+)?)\*?)?([a-z]+)$/i.exec(m);
    if (!r) return { ok: false, message: `Terme illisible : « ${m} ».` };
    const comp = r[3]!;
    if (!(ALL as readonly string[]).includes(comp)) return { ok: false, message: `Composante inconnue : « ${comp} » (uz, exx, sxy…).` };
    if (!disponibles.has(comp)) return { ok: false, message: `« ${comp} » n'a pas été calculée dans ce cas.` };
    termes.push({ comp, coef: (r[1] === "-" ? -1 : 1) * (r[2] === undefined ? 1 : Number(r[2])) });
  }
  return { ok: true, termes };
}

export function combiner(res: GridResult, termes: readonly Terme[], z: number): Float64Array {
  const n = res.get(termes[0]!.comp, z).re.length;
  const out = new Float64Array(n);
  for (const t of termes) {
    const f = res.get(t.comp, z).re;
    for (let i = 0; i < n; i++) out[i] = out[i]! + t.coef * f[i]!;
  }
  return out;
}

/** Nature physique d'une combinaison : « e », « s », « u », ou null si elle mélange des grandeurs. */
export function classeCombinaison(termes: readonly Terme[]): "e" | "s" | "u" | null {
  const cl = new Set(termes.map((t) => t.comp.charAt(0)));
  return cl.size === 1 ? (([...cl][0] as "e" | "s" | "u") ?? null) : null;
}
