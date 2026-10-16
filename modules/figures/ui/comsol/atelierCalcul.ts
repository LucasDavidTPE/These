/** Résultat d'un tracé de l'atelier COMSOL et envoi vers la page Graphes. */
import type { GraphDoc } from "../../core/graph";
import { useGraph } from "../graph/useGraph";
import { useNavigation } from "../navigation";

export type Resultat = { doc: GraphDoc; titre: string } | { erreur: string } | null;

/** Calcule un tracé ; une erreur (fichier incompatible, formule…) devient un message, pas une exception. */
export function calculer(f: () => { doc: GraphDoc; titre: string } | null): Resultat {
  try {
    return f();
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Envoie le graphe dans la page Graphes (nouvelle figure), après confirmation si un graphe non enregistré y est ouvert. */
export function envoyerVersGraphes(doc: GraphDoc, titre: string) {
  const g = useGraph.getState();
  if ((g.doc.series.length || g.doc.carte) && !g.folder && !window.confirm("Le graphe ouvert dans Graphes n'est pas enregistré. Le remplacer ?")) return;
  g.tracerComsol(doc, titre);
  useNavigation.getState().goTo("graphs");
}

