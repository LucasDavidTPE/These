/**
 * Ce que la coquille met à disposition des modules : la plateforme, l'espace ouvert, les
 * réglages du poste, le registre et la navigation.
 */
import { createContext, useContext } from "react";
import type { ReglagesPoste } from "@noyau/poste/reglages";
import type { Produit, ModuleId } from "@noyau/produits";
import type { Registre } from "@noyau/registre";
import type { Fichiers, Probleme } from "@noyau/stockage";
import type { Manifeste } from "./manifeste";
import type { Plateforme } from "./plateforme";

export type Destination = ModuleId | "reglages" | "diagnostic";

export interface ProblemeSitue {
  /** Module qui l'a signalé, ou « espace » / « poste ». */
  source: string;
  probleme: Probleme;
}

export interface Contexte {
  produit: Produit;
  version: string;
  poste: string;
  plateforme: Plateforme;
  reglages: ReglagesPoste;
  /** L'espace ouvert (produits qui en ont un). */
  espace: { racine: string; fichiers: Fichiers } | null;
  registre: Registre<Manifeste>;
  /** Augmente à chaque modification de fichiers dans l'espace : les vues s'y abonnent pour se recharger. */
  revision: number;
  /** Tout ce qui est « À régler », tous modules confondus. */
  problemes: ProblemeSitue[];
  /** Relance la recherche des problèmes (après une résolution, par exemple). */
  rafraichir(): void;
  naviguer(vers: Destination): void;
  enregistrerReglages(r: ReglagesPoste): Promise<void>;
}

export const ContexteReact = createContext<Contexte | null>(null);

export function useContexte(): Contexte {
  const c = useContext(ContexteReact);
  if (!c) throw new Error("useContexte() appelé hors de la coquille.");
  return c;
}
