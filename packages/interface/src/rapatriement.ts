/**
 * Rapatriement dans l'espace (SPEC §4.1) de ce qui vivait ailleurs : le dossier des PDF de la
 * bibliographie (ancienne racine « biblio-pdf ») et la bibliothèque de figures. On copie sans
 * rien écraser, on vérifie que tout est arrivé, puis ce poste oublie l'ancien emplacement.
 * L'ancien dossier n'est jamais supprimé : l'utilisateur le fait lui-même, une fois rassuré.
 */
import { fichiersManquants } from "@noyau/espace/donnees";
import { DANS_L_ESPACE, type DansLEspace } from "@noyau/poste/racines";
import type { ReglagesPoste } from "@noyau/poste/reglages";
import { absolu } from "@noyau/stockage";
import type { Contexte } from "./contexte";

export const LIBELLE_DANS_L_ESPACE: Record<DansLEspace, string> = {
  "biblio-pdf": "les PDF de la bibliographie",
  figures: "la bibliothèque de figures",
};

/** Phrases accordées (« les PDF … sont », « la bibliothèque … est »). */
export const PHRASES_DANS_L_ESPACE: Record<DansLEspace, { sujet: string; vit: string; est: string; pronom: string }> = {
  "biblio-pdf": { sujet: "Les PDF de la bibliographie", vit: "vivent", est: "sont", pronom: "ils sont" },
  figures: { sujet: "La bibliothèque de figures", vit: "vit", est: "est", pronom: "elle est" },
};

function sansAncien(r: ReglagesPoste, quoi: DansLEspace): ReglagesPoste {
  if (quoi === "figures") return { ...r, figures: null };
  const racines = { ...r.racines };
  delete racines["biblio-pdf"];
  return { ...r, racines };
}

/** Copie l'ancien dossier dans l'espace ; renvoie le bilan à afficher. */
export async function rapatrier(ctx: Pick<Contexte, "espace" | "plateforme" | "reglages" | "enregistrerReglages">, quoi: DansLEspace): Promise<string> {
  if (!ctx.espace) throw new Error("Aucun espace Thèse ouvert.");
  const ancien = quoi === "figures" ? ctx.reglages.figures : ctx.reglages.racines["biblio-pdf"];
  if (!ancien) return "Rien à rapatrier.";
  const cible = absolu(ctx.espace.racine, DANS_L_ESPACE[quoi]);
  if (!(await ctx.plateforme.dossierExiste(ancien))) {
    // Déjà rapatrié depuis l'autre PC et l'ancien dossier supprimé, ou disque absent : on l'oublie.
    await ctx.enregistrerReglages(sansAncien(ctx.reglages, quoi));
    return `${ancien} n'existe pas sur ce poste : l'ancien emplacement est oublié, l'espace fait foi.`;
  }
  const r = await ctx.plateforme.copierDossier(ancien, cible, { sansEcraser: true });
  const manquants = await fichiersManquants(ctx.plateforme.fichiers(ancien), ctx.plateforme.fichiers(cible));
  if (manquants.length) throw new Error(`Copie incomplète : ${manquants.length} fichier(s) absent(s) de l'espace (${manquants.slice(0, 3).join(", ")}…). L'ancien emplacement est gardé ; réessayez.`);
  await ctx.enregistrerReglages(sansAncien(ctx.reglages, quoi));
  const mo = (r.octets / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  const ph = PHRASES_DANS_L_ESPACE[quoi];
  return `${ph.sujet} ${ph.est} dans l'espace : ${r.copies} fichier(s) copié(s) (${mo} Mo), ${r.aJour} déjà présent(s), tout est vérifié. Vous pouvez supprimer ${ancien} quand vous voulez.`;
}
