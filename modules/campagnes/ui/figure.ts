/**
 * Courbes d'un essai en figure (SPEC §6, §8.3) : rendues depuis l'export WaveMatrix avec
 * les voies et la plage choisies à l'écran, puis refaites à l'identique depuis les données
 * quand on demande « Régénérer » dans la bibliothèque de figures.
 */
import { courbesSvg, type Vue } from "@noyau/courbes";
import { lireCsv } from "@noyau/formats/wavematrix";
import { resoudre } from "@noyau/poste/racines";
import { svgTexteEnPng } from "@interface/image";
import type { Contexte } from "@interface/contexte";
import { panneaux } from "../core/courbes";
import { SUFFIXE_SUIVI } from "../core/decouverte";
import { chargerCampagnes } from "./donnees";

/** Ce qu'une figure retient pour être refaite (`meta.json`, champ `origine`). */
export interface OrigineCourbes {
  module: "campagnes";
  campagne: string;
  essai: string;
  vue: Vue;
}

export function titreFigure(titreCampagne: string, essai: string): string {
  return `${titreCampagne} — ${essai}`;
}

/** SVG et PNG des courbes d'un essai, à partir de ses panneaux. */
export async function renduCourbes(p: ReturnType<typeof panneaux>, titre: string, vue: Vue): Promise<{ svg: string; png: Uint8Array }> {
  const svg = courbesSvg(p, { titre, xLibelle: "temps (h)", vue });
  return { svg, png: await svgTexteEnPng(svg) };
}

/** Relit les données brutes de l'essai et refait la figure (action « campagnes.regenerer-figure »). */
export async function regenererCourbes(ctx: Contexte, o: OrigineCourbes): Promise<{ svg: string; png: Uint8Array }> {
  if (!ctx.espace) throw new Error("Aucun espace Thèse ouvert.");
  const c = (await chargerCampagnes(ctx.espace.fichiers)).campagnes.find((x) => x.slug === o.campagne);
  if (!c) throw new Error(`Campagne introuvable dans l'espace : ${o.campagne}.`);
  if (!c.campagne.donnees) throw new Error(`La campagne « ${c.campagne.titre} » n'a pas de dossier de données.`);
  const d = resoudre(c.campagne.donnees, ctx.reglages.racines);
  if (!d.ok || !(await ctx.plateforme.dossierExiste(d.chemin))) throw new Error(`Données brutes absentes de ce poste (${c.campagne.donnees}) : régénérez depuis le PC qui les a.`);
  const fs = ctx.plateforme.fichiers(d.chemin);
  const fichier = (await fs.listDir(o.essai)).find((f) => f.name.endsWith(SUFFIXE_SUIVI));
  if (!fichier) throw new Error(`Pas d'export ${SUFFIXE_SUIVI} dans ${o.essai}.`);
  const serie = lireCsv(new TextDecoder().decode(await fs.readBytes(`${o.essai}/${fichier.name}`)));
  return renduCourbes(panneaux(serie), titreFigure(c.campagne.titre, o.essai), o.vue);
}
