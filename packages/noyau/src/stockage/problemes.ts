/**
 * Ce qui demande une décision de l'utilisateur : la liste « À régler » de l'Accueil (SPEC §5).
 */
import { joindre } from "./chemins";
import type { CopieConflit } from "./conflits";
import type { FormatId } from "./ids";

export type Probleme =
  /** Deux versions du même fichier (OneDrive ou copie de l'Explorateur). */
  | {
      type: "conflit";
      dossier: string;
      conflit: CopieConflit;
      /** Présent pour une collection : permet « garder les deux » (la copie prend l'ID suivant). */
      format?: FormatId;
    }
  /** Écriture interrompue : un `.tmp` est resté. La version précédente est intacte. */
  | { type: "temporaire"; chemin: string }
  /** Fichier présent mais inexploitable (JSON abîmé, champ manquant…). */
  | { type: "illisible"; chemin: string; detail: string }
  /** Une racine de données déclarée n'existe pas sur ce poste. */
  | { type: "racine-absente"; racine: string; chemin: string };

export interface Description {
  titre: string;
  detail: string;
}

export function decrire(p: Probleme): Description {
  switch (p.type) {
    case "conflit":
      return {
        titre: `Deux versions de ${joindre(p.dossier, p.conflit.original)}`,
        detail: `Une copie « ${p.conflit.copie} » (${p.conflit.etiquette}) a été créée, sans doute par OneDrive après une modification sur les deux PC. Choisissez la version à garder ; l'autre sera rangée, pas supprimée.`,
      };
    case "temporaire":
      return {
        titre: `Écriture interrompue : ${p.chemin}`,
        detail: "Un enregistrement a été coupé (plantage, PC éteint). La version précédente est intacte ; le fichier temporaire peut être supprimé.",
      };
    case "illisible":
      return { titre: `Fichier illisible : ${p.chemin}`, detail: p.detail };
    case "racine-absente":
      return {
        titre: `Dossier « ${p.racine} » introuvable sur ce poste`,
        detail: `${p.chemin} n'existe pas ici. Ce qui en dépend est grisé ; corrigez le chemin dans les réglages du poste s'il a changé.`,
      };
  }
}

/** Clé stable d'un problème, pour les listes React et pour mémoriser « ignoré ». */
export function cleProbleme(p: Probleme): string {
  switch (p.type) {
    case "conflit":
      return `conflit:${joindre(p.dossier, p.conflit.copie)}`;
    case "temporaire":
    case "illisible":
      return `${p.type}:${p.chemin}`;
    case "racine-absente":
      return `racine:${p.racine}`;
  }
}
