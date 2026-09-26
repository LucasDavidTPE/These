/**
 * Les installeurs qu'on sait produire à partir du même code (SPEC §3.1).
 *
 * Le produit est choisi à la compilation par la variable `THESE_PRODUIT` : Vite n'embarque
 * alors que les modules du produit, et Tauri reçoit la surcharge `src-tauri/produits/<id>.json`
 * (nom, identifiant Windows, titre de fenêtre).
 */

export const MODULES = ["accueil", "figures", "traitement", "campagnes", "etudes", "bibliotheque", "planning"] as const;
export type ModuleId = (typeof MODULES)[number];

export interface Produit {
  id: string;
  /** Nom affiché (fenêtre, installeur, menu Démarrer). */
  nom: string;
  /** Identifiant Windows : distinct pour chaque produit, pour qu'ils cohabitent sur un poste. */
  identifiant: string;
  modules: readonly ModuleId[];
  /** Vrai si le produit a besoin de l'espace OneDrive (écran de premier lancement). */
  espace: boolean;
}

export const PRODUITS: readonly Produit[] = [
  { id: "these", nom: "Thèse", identifiant: "fr.lucasdavid.these", modules: MODULES, espace: true },
  { id: "figurine", nom: "Figurine", identifiant: "fr.lucasdavid.figurine", modules: ["figures"], espace: false },
  { id: "traitement", nom: "Traitement 2S2P1D", identifiant: "fr.lucasdavid.traitement2s2p1d", modules: ["traitement"], espace: false },
];

export const PRODUIT_PAR_DEFAUT = "these";

/** Produit désigné par `THESE_PRODUIT` (vide = Thèse). Un nom inconnu est une erreur de compilation. */
export function produitDepuisEnv(valeur: string | undefined): Produit {
  const id = valeur?.trim() || PRODUIT_PAR_DEFAUT;
  const p = PRODUITS.find((x) => x.id === id);
  if (!p) throw new Error(`THESE_PRODUIT inconnu : « ${id} ». Produits : ${PRODUITS.map((x) => x.id).join(", ")}.`);
  return p;
}
