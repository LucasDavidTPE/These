/**
 * Registre des modèles rhéologiques. Ajouter un modèle : écrire un fichier voisin qui
 * exporte par défaut un objet de forme `Modele` (type.ts), puis l'ajouter à la liste.
 */
import m2s2p1d from "./2s2p1d";
import gkv from "./gkv";
import huetSayegh from "./huet-sayegh";
import type { Constantes, Modele } from "./type";

export type { ChaineGKV, Complexe, Constantes, Modele, ModeleCale, Parametre } from "./type";

export const MODELES: readonly Modele[] = [m2s2p1d, huetSayegh, gkv];

export function modele(id: string): Modele {
  return MODELES.find((m) => m.id === id) || MODELES[0]!;
}

/** Constantes de départ d'un modèle, éventuellement reprises d'un autre. */
export function parametresInitiaux(m: Modele, precedents: Partial<Constantes> = {}): Constantes {
  const p = { ...m.defauts };
  for (const cle of Object.keys(p)) {
    if (Number.isFinite(precedents[cle])) p[cle] = precedents[cle]!;
  }
  return p;
}
