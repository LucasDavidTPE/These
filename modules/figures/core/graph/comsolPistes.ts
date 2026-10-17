/**
 * Pistes : d'après les fichiers ouverts, ce que l'atelier peut en faire, dit en clair (« 12 coupes, EL / VE ×
 * het / rect / circ → vue d'ensemble ») — pour ne pas avoir à connaître toutes les tuiles. Chaque piste mène à
 * une tuile ou à une action de l'atelier.
 */
import { geometrie, type ExportComsol, type UniteLongueur } from "./comsol";
import type { ModeAtelier } from "./comsolAtelier";
import { diagnostiquer } from "./comsolDiagnostic";
import { avecCote, avecSurface, sourcesSensibilite } from "./comsolEtude";
import { parametresDesExports } from "./comsolInstants";
import { motsVariables } from "./comsolLot";
import { pairesMaillage } from "./comsolMaillage";

export type ActionPiste =
  | { genre: "mode"; mode: ModeAtelier }
  | { genre: "ensemble" }
  | { genre: "verifier" }
  | { genre: "rapport" };

export interface Piste {
  texte: string;
  action: ActionPiste;
  libelle: string;
}

export function pistes(
  exports: readonly ExportComsol[],
  o: { legende: (e: ExportComsol) => string; longueur: UniteLongueur },
): Piste[] {
  if (!exports.length) return [];
  const out: Piste[] = [];
  const genres = exports.map((e) => geometrie(e));
  const plans = exports.filter(
    (_, i) => genres[i]!.genre === "coupe" && genres[i]!.reguliere,
  );
  const lignes = exports.filter((_, i) => genres[i]!.genre === "profil");
  const tables = exports.filter((e) => e.nature === "table");
  const attention = diagnostiquer(exports, o).filter(
    (x) => x.niveau === "attention",
  ).length;
  if (attention)
    out.push({
      texte: `${attention} point${attention > 1 ? "s" : ""} d'attention dans les fichiers (unités, légendes…)`,
      action: { genre: "verifier" },
      libelle: "Vérifier",
    });
  const plan = (es: readonly ExportComsol[]) => {
    const v = motsVariables(es.map((e) => e.nom));
    return v.length
      ? ` (${v
          .slice(0, 2)
          .map((x) => x.valeurs.slice(0, 4).join(" / "))
          .join(" × ")})`
      : "";
  };
  if (plans.length >= 2)
    out.push({
      texte: `${plans.length} coupes${plan(plans)} : toutes d'un coup, à la même échelle`,
      action: { genre: "ensemble" },
      libelle: "Vue d'ensemble",
    });
  else if (lignes.length >= 2)
    out.push({
      texte: `${lignes.length} lignes${plan(lignes)} : tous les profils d'un coup`,
      action: { genre: "ensemble" },
      libelle: "Vue d'ensemble",
    });
  const instants = parametresDesExports(exports);
  if (instants.length)
    out.push({
      texte: `Fichiers à plusieurs valeurs de ${instants.map((p) => p.nom).join(", ")} : curseur, enveloppe, animation`,
      action: { genre: "mode", mode: plans.length ? "carte" : "profils" },
      libelle: plans.length ? "Carte d'une coupe" : "Profils",
    });
  const paires = pairesMaillage(exports);
  if (paires.length)
    out.push({
      texte: `${paires.length} paire${paires.length > 1 ? "s" : ""} maillage grossier / fin (${paires
        .map((p) => o.legende(exports.find((e) => e.nom === p.fin)!))
        .slice(0, 2)
        .join(", ")}${paires.length > 2 ? "…" : ""})`,
      action: { genre: "mode", mode: "maillage" },
      libelle: "Convergence du maillage",
    });
  if (avecSurface(exports).length)
    out.push({
      texte:
        "Déflexion w en surface : bassin, D0, SCI, rayon de courbure, écart à un essai HWD",
      action: { genre: "mode", mode: "bassin" },
      libelle: "Bassin de déflexion",
    });
  if (avecCote(exports).length)
    out.push({
      texte:
        "Coupes ou profils verticaux : εt à la base des couches liées, εz sur le sol, cycles admissibles",
      action: { genre: "mode", mode: "criteres" },
      libelle: "Critères",
    });
  const s = sourcesSensibilite(exports);
  if (s.fichiers.length)
    out.push({
      texte: `Paramètre ${s.fichiers.map((p) => p.nom).join(", ")} différent d'un fichier à l'autre : pic en fonction du paramètre`,
      action: { genre: "mode", mode: "sensibilite" },
      libelle: "Sensibilité",
    });
  if (tables.length)
    out.push({
      texte: `${tables.length} signal${tables.length > 1 ? "aux" : ""} au cours du temps : pic, décalage, mesures de jauges`,
      action: { genre: "mode", mode: "temps" },
      libelle: "Signal dans le temps",
    });
  if (exports.length >= 3)
    out.push({
      texte:
        "Premier jet LaTeX de la partie résultats (tableaux, phrases chiffrées)",
      action: { genre: "rapport" },
      libelle: "Rapport LaTeX",
    });
  return out;
}
