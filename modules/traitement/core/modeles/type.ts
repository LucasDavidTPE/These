/**
 * Forme d'un modèle rhéologique (registre de modeles/index.ts). Ajouter un modèle : écrire un
 * fichier voisin qui exporte par défaut un objet de cette forme, puis l'ajouter au registre.
 * L'interface construit ses curseurs, l'optimiseur choisit ses inconnues et les exports leurs
 * en-têtes à partir de cette déclaration.
 */

export interface Complexe {
  re: number;
  im: number;
  norme: number;
  /** degrés */
  phase: number;
}

export type Constantes = Record<string, number>;

export interface Parametre {
  cle: string;
  label: string;
  unite?: string;
  min: number;
  max: number;
  pas: number;
  /** Curseur en log10 (τ, fréquences). */
  log?: boolean;
  groupe: "module" | "poisson";
}

export interface ChaineGKV {
  E: number[];
  tau: number[];
  Einf: number;
  eta: number[];
  affine?: boolean;
}

export interface Modele {
  id: string;
  nom: string;
  resume: string;
  reference: string;
  parametres: Parametre[];
  defauts: Constantes;
  /** Respectées par l'optimiseur. */
  bornes: Record<string, [number, number]>;
  /** Clés calées sur |E*| et φ. */
  ajustables: string[];
  /** Clés calées sur ν*. */
  ajustablesPoisson: string[];
  module?(f: number, p: Constantes): Complexe;
  poisson?(f: number, p: Constantes): Complexe;
  /** Vrai si le modèle découle d'un autre au lieu d'être calé (GKV). */
  derive?: boolean;
  identifier?(source: Modele, p: Constantes, o?: { nElements?: number; fMin?: number; fMax?: number; affiner?: boolean }): ChaineGKV;
  moduleChaine?(f: number, chaine: ChaineGKV): Complexe;
}

/** Modèle continu, calé sur les points : module défini. */
export type ModeleCale = Modele & { module(f: number, p: Constantes): Complexe };
