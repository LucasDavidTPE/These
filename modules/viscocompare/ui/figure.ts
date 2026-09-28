/** Un cas de comparaison en figure (Figures), refaite à l'identique depuis les fichiers. */
import { courbesSvg, VUE_ENTIERE, type Vue } from "@noyau/courbes";
import { svgTexteEnPng } from "@interface/image";
import type { Contexte } from "@interface/contexte";
import { panneauxCas, type Cas } from "../core/comparaison";
import { chargerEtude } from "../core/dossier";
import type { Conventions } from "../core/lecture";

export const X_LIBELLE = "position (m)";

export interface OrigineCas {
  module: "viscocompare";
  /** Sous-dossier de la racine « viscocompare » (vide : la racine elle-même). */
  etude: string;
  vitesse: number;
  conventions: Conventions;
  vue: Vue;
}

export function titreCas(etude: string, vitesse: number): string {
  return `COMSOL / Viscoroute${etude ? ` — ${etude}` : ""} — V = ${vitesse}`;
}

export async function renduCas(c: Cas, etude: string, vue: Vue = VUE_ENTIERE): Promise<{ svg: string; png: Uint8Array }> {
  const svg = courbesSvg(panneauxCas(c), { titre: titreCas(etude, c.vitesse), xLibelle: X_LIBELLE, vue });
  return { svg, png: await svgTexteEnPng(svg) };
}

/** Action « viscocompare.regenerer-figure ». */
export async function regenererCas(ctx: Contexte, o: OrigineCas): Promise<{ svg: string; png: Uint8Array }> {
  const racine = ctx.reglages.racines.viscocompare;
  if (!racine || !(await ctx.plateforme.dossierExiste(racine))) throw new Error("Le dossier des comparaisons (racine « viscocompare ») est absent de ce poste.");
  const e = await chargerEtude(ctx.plateforme.fichiers(racine), o.etude, o.conventions);
  const c = e.cas.find((x) => x.vitesse === o.vitesse);
  if (!c) throw new Error(`Plus de cas V = ${o.vitesse} dans « ${o.etude || racine} ».`);
  return renduCas(c, o.etude, o.vue);
}
