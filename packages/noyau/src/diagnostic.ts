/**
 * Diagnostic du poste (SPEC §5) : ce qui est en place ici, et ce qui manque. Remplace le
 * « diagnostic global » du hub. Pur : l'interface fournit les constats (existence des
 * dossiers, état de l'espace), on en tire des contrôles lisibles.
 */
import type { EtatEspace } from "./espace/espace";

export type Niveau = "ok" | "attention" | "erreur" | "info";

export interface Controle {
  titre: string;
  niveau: Niveau;
  detail: string;
}

export interface Constats {
  produit: string;
  version: string;
  poste: string;
  /** null si le produit n'utilise pas d'espace. */
  espace: { chemin: string | null; etat: EtatEspace | null } | null;
  racines: { nom: string; chemin: string; existe: boolean }[];
  /** Nombre de problèmes « À régler ». */
  aRegler: number;
}

export function diagnostiquer(c: Constats): Controle[] {
  const out: Controle[] = [{ titre: "Application", niveau: "info", detail: `${c.produit} ${c.version}, sur le poste ${c.poste}` }];

  if (c.espace) {
    const { chemin, etat } = c.espace;
    if (!chemin) out.push({ titre: "Espace Thèse", niveau: "erreur", detail: "Aucun espace choisi sur ce poste." });
    else if (!etat) out.push({ titre: "Espace Thèse", niveau: "erreur", detail: `${chemin} : état inconnu.` });
    else
      switch (etat.etat) {
        case "ok":
          out.push({
            titre: "Espace Thèse",
            niveau: "ok",
            detail: `${chemin}${etat.info.creePar ? ` (créé sur ${etat.info.creePar})` : ""}`,
          });
          break;
        case "vide":
        case "autre-contenu":
          out.push({ titre: "Espace Thèse", niveau: "erreur", detail: `${chemin} ne contient pas d'espace (espace.json absent).` });
          break;
        case "trop-recent":
          out.push({
            titre: "Espace Thèse",
            niveau: "erreur",
            detail: `${chemin} a été créé par une version plus récente de l'application (format ${etat.format}) : mettez-la à jour sur ce poste.`,
          });
          break;
        case "illisible":
          out.push({ titre: "Espace Thèse", niveau: "erreur", detail: `${chemin} : espace.json illisible (${etat.detail}).` });
          break;
      }
  }

  if (c.racines.length === 0 && c.espace) {
    out.push({ titre: "Racines de données", niveau: "attention", detail: "Aucune racine déclarée : les données brutes (essais, PDF) ne seront pas accessibles." });
  }
  for (const r of c.racines) {
    out.push({
      titre: `Racine « ${r.nom} »`,
      niveau: r.existe ? "ok" : "attention",
      detail: r.existe ? r.chemin : `${r.chemin} introuvable sur ce poste : ce qui en dépend est grisé.`,
    });
  }

  if (c.espace) {
    out.push({
      titre: "À régler",
      niveau: c.aRegler === 0 ? "ok" : "attention",
      detail: c.aRegler === 0 ? "Rien à régler." : `${c.aRegler} point${c.aRegler > 1 ? "s" : ""} à régler (voir l'Accueil).`,
    });
  }
  return out;
}

/** Le niveau le plus grave d'une liste : sert à colorer le bouton « Diagnostic ». */
export function niveauGlobal(controles: Controle[]): Niveau {
  if (controles.some((c) => c.niveau === "erreur")) return "erreur";
  if (controles.some((c) => c.niveau === "attention")) return "attention";
  return "ok";
}
