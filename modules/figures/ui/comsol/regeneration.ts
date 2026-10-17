/**
 * Régénération d'une figure tracée depuis une recette d'étude COMSOL : relecture des fichiers (sur ce PC, par
 * leur référence OneDrive), exécution de la recette, nouvelles données dans la figure en gardant ses retouches.
 */
import {
  appliquerFichier,
  construireDerives,
  executerTrace,
  fichierEtude,
  lireComsol,
  lireEtude,
  rafraichirDonnees,
  type ExportComsol,
  type GraphDoc,
} from "../../core/graph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { useLibrary } from "../library/useLibrary";
import { lireDuDisque, useAtelier, type EnvAtelier } from "./useAtelier";

export interface Regeneration {
  doc: GraphDoc;
  /** Fichiers relus, et ceux qui manquent (la figure garde alors les données correspondantes absentes). */
  relus: string[];
  avertissements: string[];
}

export async function regenerer(doc: GraphDoc, env: EnvAtelier = useAtelier.getState().env): Promise<Regeneration> {
  const o = doc.origine;
  if (!o) throw new Error("Ce graphe n'a pas été tracé depuis une étude COMSOL.");
  const { backend, root } = useLibrary.getState();
  if (!backend || !root) throw new Error("Ouvrez d'abord la bibliothèque de figures.");
  let etude;
  try {
    etude = lireEtude(JSON.parse(await backend.fs(root).readText(fichierEtude(o.etude))));
  } catch {
    throw new Error(`L'étude « ${o.etude} » est introuvable dans la bibliothèque (_comsol/etudes).`);
  }
  const recette = etude.recettes.find((r) => r.id === o.recette);
  if (!recette) throw new Error(`La recette « ${o.recette} » a été retirée de l'étude « ${etude.titre} ».`);
  await useReglagesComsol.getState().charger();
  const reg = useReglagesComsol.getState().reglages;
  const base: ExportComsol[] = [];
  const relus: string[] = [];
  const avertissements: string[] = [];
  for (const f of etude.fichiers) {
    try {
      const { texte } = await lireDuDisque(f, env);
      base.push(appliquerFichier(lireComsol(texte, f.nom), f));
      relus.push(f.nom);
    } catch (e) {
      avertissements.push(`${f.nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const d = construireDerives(base, etude.derives);
  avertissements.push(...d.erreurs);
  const noms = Object.fromEntries(etude.fichiers.filter((f) => f.legende).map((f) => [f.nom, f.legende!]));
  const neuf = executerTrace(recette.trace, { exports: d.exports, cadre: recette.cadre, noms, correspondances: reg.correspondances, interfaces: reg.interfaces, criteres: reg.criteres });
  if (!neuf) throw new Error(`La recette « ${recette.nom} » ne trace plus rien : fichiers manquants ?\n${avertissements.join("\n")}`);
  return { doc: { ...rafraichirDonnees(doc, neuf.doc, { annotationsCalculees: recette.trace.mode === "temps" || (recette.trace.mode === "carte" && recette.trace.epingles.length > 0), reperesCalcules: recette.trace.mode === "temps" }), origine: o }, relus, avertissements };
}
