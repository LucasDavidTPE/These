/**
 * Graphiques du traitement dans Figures. Une figure tirée d'un essai ouvert depuis une
 * campagne garde son origine (fichier de l'essai et dépouillement enregistré) : « Régénérer »
 * dans la bibliothèque relit le fichier, rejoue le dépouillement et refait le graphique.
 */
import { grapheSvg } from "@noyau/graphe";
import { svgTexteEnPng } from "@interface/image";
import type { Contexte } from "@interface/contexte";
import { appliquerProjet, essaiDepuisLecture, type Essai } from "../core/essai";
import { fichierDepuisOctets, lireFichier } from "../core/io/lecture";
import { vueEnGraphe, type GrapheFigurine } from "../core/figurine";
import { vuesCalage, vuesSynthese, type Langue, type Vue } from "../core/vues";
import { lireExport, type DemandeEssai } from "./demande";
import { essaiActif, useTraitement } from "./etat";
import type { FigureDemandee } from "./Graphe";

export type IdGraphe = "cole" | "black" | "maitreE" | "maitreP" | "aT" | "nu" | "prony" | "isothermesE" | "isothermesP";

export interface OrigineTraitement {
  module: "traitement";
  demande: DemandeEssai;
  graphe: IdGraphe;
  titre: string;
  /** Langue des titres d'axes (absente : français, figures d'avant la 0.2.7). */
  langue?: Langue;
}

function vueDe(e: Essai, g: IdGraphe, langue: Langue): Vue {
  if (g === "isothermesE") return vuesSynthese(e, langue).module;
  if (g === "isothermesP") return vuesSynthese(e, langue).phase;
  const v = vuesCalage(e, langue)[g];
  if (!v) throw new Error("La série de Prony n'est plus demandée pour cet essai : rouvrez-le dans le traitement.");
  return v;
}

/** Pour les étapes : ce qu'il faut à « → Figures » (titre, source, origine si l'essai vient d'une campagne). */
export function useFigure(): (titre: string, graphe: IdGraphe) => FigureDemandee | undefined {
  const s = useTraitement();
  const e = essaiActif(s);
  return (titre, graphe) => {
    if (!e) return undefined;
    const t = `${e.nom} — ${titre}`;
    const c = s.campagne?.essaiId === e.id ? s.campagne.demande : null;
    return {
      titre: t,
      source: c ? `Traitement 2S2P1D : ${c.titre}` : `Traitement 2S2P1D : ${e.nom}`,
      tags: ["2S2P1D", e.nom],
      origine: c ? ({ module: "traitement", demande: c, graphe, titre: t, langue: s.langue } satisfies OrigineTraitement) : undefined,
    };
  };
}

/** Action « traitement.regenerer-figure ». */
export async function regenererFigure(ctx: Contexte, o: OrigineTraitement): Promise<{ svg: string; png: Uint8Array; graphe: GrapheFigurine }> {
  if (!ctx.espace) throw new Error("Aucun espace Thèse ouvert.");
  const d = o.demande;
  const octets = await lireExport(ctx, d);
  let projet: string;
  try {
    projet = await ctx.espace.fichiers.readText(d.projet);
  } catch {
    throw new Error("Le dépouillement de cet essai n'est plus enregistré avec lui : rouvrez-le dans le traitement et enregistrez-le.");
  }
  const e = essaiDepuisLecture(await lireFichier(fichierDepuisOctets(d.fichier, octets)), 0);
  await appliquerProjet([e], JSON.parse(projet) as Parameters<typeof appliquerProjet>[1]);
  const vue = vueDe(e, o.graphe, o.langue ?? "fr");
  const svg = grapheSvg(vue.spec, { largeur: 760, hauteur: 420, titre: o.titre, legende: vue.legende, id: "figure" });
  // Le PNG sert aux figures « image » d'avant la 0.2.7 ; un graphe modifiable reprend `graphe`.
  return { svg, png: await svgTexteEnPng(svg), graphe: vueEnGraphe(vue) };
}
