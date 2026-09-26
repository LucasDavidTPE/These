/**
 * Ce qu'un module déclare à la coquille (SPEC §3) : son identité, sa page, ce qu'il signale
 * à l'Accueil et les actions qu'il offre aux autres modules.
 */
import type { ComponentType } from "react";
import type { ModuleId } from "@noyau/produits";
import type { Gestionnaire } from "@noyau/registre";
import type { Probleme } from "@noyau/stockage";
import type { Contexte } from "./contexte";

export interface Manifeste {
  id: ModuleId;
  titre: string;
  /** Une ligne : à quoi sert le module. */
  resume: string;
  Icone: ComponentType<{ taille?: number }>;
  Page: ComponentType;
  /** Phase de la feuille de route où le module arrive, tant qu'il n'est pas prêt (« P1 »). */
  aVenir?: string;
  /** État en une ligne pour la carte de l'Accueil (« 179 références, 12 lues »). */
  etat?(ctx: Contexte): Promise<string | null>;
  /** Ce que le module a trouvé à régler dans ses fichiers. */
  problemes?(ctx: Contexte): Promise<Probleme[]>;
  /** Actions offertes aux autres modules, par nom complet (« figures.enregistrer »). */
  actions?: Record<string, Gestionnaire>;
}
