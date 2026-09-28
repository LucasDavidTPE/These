/**
 * Assemblage des cas (une vitesse = un cas) et ce qu'on en tire : panneaux de courbes
 * COMSOL / Viscoroute par grandeur, écarts sur l'extremum, et le classeur Excel du script
 * (feuilles COMSOL, VISCOROUTE, une par grandeur). Pur et déterministe.
 */
import type { Panneau } from "@noyau/courbes";
import type { Feuille } from "@noyau/formats/xlsx-ecriture";
import { GRANDEURS, interpoler, type Grandeur, type Tableau } from "./lecture";

export interface ProfilViscoroute {
  y: number[];
  v: number[];
}

export interface Cas {
  vitesse: number;
  /** « 0_10 » : nom du cas dans le script (deux décimales, point remplacé). */
  nom: string;
  comsol: Tableau;
  /** Profils Viscoroute ramenés sur le y de la première grandeur (ordre alphabétique). */
  viscoroute: Tableau;
  /** Grandeurs présentes des deux côtés, dans l'ordre de GRANDEURS. */
  grandeurs: Grandeur[];
}

export const nomCas = (v: number) => v.toFixed(2).replace(".", "_");

/** Le tableau Viscoroute d'un cas : y de référence, puis chaque grandeur interpolée dessus. */
export function tableauViscoroute(profils: ReadonlyMap<Grandeur, ProfilViscoroute>): Tableau {
  const cles = [...profils.keys()].sort();
  const ref = profils.get(cles[0]!)!;
  const valeurs: Record<string, number[]> = { y: [...ref.y] };
  for (const g of cles) {
    const p = profils.get(g)!;
    valeurs[g] = interpoler(ref.y, p.y, p.v);
  }
  return { colonnes: ["y", ...cles], valeurs };
}

/** Les vitesses présentes des deux côtés, triées. */
export function assembler(comsol: ReadonlyMap<number, Tableau>, viscoroute: ReadonlyMap<number, ReadonlyMap<Grandeur, ProfilViscoroute>>): Cas[] {
  return [...comsol.keys()]
    .filter((v) => viscoroute.has(v) && viscoroute.get(v)!.size > 0)
    .sort((a, b) => a - b)
    .map((vitesse) => {
      const c = comsol.get(vitesse)!;
      const vr = tableauViscoroute(viscoroute.get(vitesse)!);
      return { vitesse, nom: nomCas(vitesse), comsol: c, viscoroute: vr, grandeurs: GRANDEURS.filter((g) => c.valeurs[g] && vr.valeurs[g]) };
    });
}

export const UNITES: Record<Grandeur, [titre: string, unite: string]> = {
  UX: ["Déplacement UX", "µm"],
  UZ: ["Déplacement UZ", "µm"],
  EPS_XX: ["Déformation EPS_XX", "µdef"],
  EPS_YY: ["Déformation EPS_YY", "µdef"],
  EPS_ZZ: ["Déformation EPS_ZZ", "µdef"],
};

/** Un panneau par grandeur, COMSOL et Viscoroute superposés (feuille « Comparaison » du script). */
export function panneauxCas(c: Cas): Panneau[] {
  return c.grandeurs.map((g) => ({
    titre: UNITES[g][0],
    unite: UNITES[g][1],
    traces: [
      { nom: "COMSOL", x: c.comsol.valeurs.arc_length!, y: c.comsol.valeurs[g]! },
      { nom: "Viscoroute", x: c.viscoroute.valeurs.y!, y: c.viscoroute.valeurs[g]! },
    ],
  }));
}

/** Valeur d'amplitude maximale (signe conservé) et sa position. */
function extremum(x: readonly number[], v: readonly number[]): { valeur: number; position: number } | null {
  let i = -1;
  v.forEach((y, j) => {
    if (Number.isFinite(y) && (i < 0 || Math.abs(y) > Math.abs(v[i]!))) i = j;
  });
  return i < 0 ? null : { valeur: v[i]!, position: x[i]! };
}

export interface Ecart {
  grandeur: Grandeur;
  comsol: { valeur: number; position: number } | null;
  viscoroute: { valeur: number; position: number } | null;
  /** (COMSOL − Viscoroute) / |Viscoroute|, en %. */
  ecartPourcent: number | null;
}

/** Écart sur l'extremum de chaque grandeur (ajout : le script ne comparait qu'à l'œil). */
export function ecarts(c: Cas): Ecart[] {
  return c.grandeurs.map((g) => {
    const a = extremum(c.comsol.valeurs.arc_length!, c.comsol.valeurs[g]!);
    const b = extremum(c.viscoroute.valeurs.y!, c.viscoroute.valeurs[g]!);
    return { grandeur: g, comsol: a, viscoroute: b, ecartPourcent: a && b && b.valeur !== 0 ? (100 * (a.valeur - b.valeur)) / Math.abs(b.valeur) : null };
  });
}

const lignesTableau = (t: Tableau) => t.valeurs[t.colonnes[0]!]!.map((_, i) => t.colonnes.map((k) => t.valeurs[k]![i] ?? null));

/** Le classeur de create_excel_for_case (sans les graphiques Excel), plus une feuille de synthèse. */
export function feuillesCas(c: Cas): Feuille[] {
  return [
    { nom: "COMSOL", entetes: c.comsol.colonnes, lignes: lignesTableau(c.comsol) },
    { nom: "VISCOROUTE", entetes: c.viscoroute.colonnes, lignes: lignesTableau(c.viscoroute) },
    ...c.grandeurs.map((g) => ({
      nom: g,
      entetes: ["Source", "x/arc_length", "Valeur"],
      lignes: [
        ...c.comsol.valeurs.arc_length!.map((x, i) => ["COMSOL", x, c.comsol.valeurs[g]![i] ?? null]),
        ...c.viscoroute.valeurs.y!.map((y, i) => ["Viscoroute", y, c.viscoroute.valeurs[g]![i] ?? null]),
      ],
    })),
    {
      nom: "Ecarts",
      entetes: ["Grandeur", "Extremum COMSOL", "Position COMSOL", "Extremum Viscoroute", "Position Viscoroute", "Écart (%)"],
      lignes: ecarts(c).map((e) => [e.grandeur, e.comsol?.valeur ?? null, e.comsol?.position ?? null, e.viscoroute?.valeur ?? null, e.viscoroute?.position ?? null, e.ecartPourcent]),
    },
  ];
}
