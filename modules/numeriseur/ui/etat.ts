/** État de la page Numériseur : le projet, son image décodée, l'outil en cours, les calculs. */
import { create } from "zustand";
import type { Champ, Gamme } from "../core/carte";
import type { ImageRGBA, Pt } from "../core/image";
import type { Cellule } from "../core/maillage";
import { projetVide, type Projet } from "../core/projet";

/** Ce qu'un clic sur l'image fait. */
export type Outil = "x1" | "x2" | "y1" | "y2" | "pipette" | "ajouter" | "zone" | "leg1" | "leg2" | "coupe" | "centre";

export const CONSIGNE: Record<Outil, string> = {
  x1: "Cliquer un premier point connu de l'axe des x (X1).",
  x2: "Cliquer un second point connu de l'axe des x (X2), loin du premier.",
  y1: "Cliquer un premier point connu de l'axe des y (Y1).",
  y2: "Cliquer un second point connu de l'axe des y (Y2), loin du premier.",
  pipette: "Cliquer sur la courbe pour prendre sa couleur.",
  ajouter: "Cliquer pour ajouter des points à la série (Échap pour finir).",
  zone: "Tirer un rectangle autour de la zone utile.",
  leg1: "Cliquer le début de la légende de couleur (valeur « début »).",
  leg2: "Cliquer la fin de la légende de couleur (valeur « fin »).",
  coupe: "Cliquer le début puis la fin de la ligne de coupe.",
  centre: "Cliquer le centre du maillage polaire.",
};

export interface ImageChargee {
  rgba: ImageRGBA;
  /** Ce qu'on dessine à l'écran. */
  source: CanvasImageSource;
  octets: Uint8Array;
  /** Extension du fichier (png, jpg…). */
  ext: string;
}

export interface EtatNumeriseur {
  projet: Projet;
  nom: string;
  modifie: boolean;
  image: ImageChargee | null;
  outil: Outil | null;
  serie: number;
  /** Point choisi (série, indice), pour le supprimer ou le déplacer. */
  selection: { serie: number; point: number } | null;
  /** Début d'une coupe en cours de tracé. */
  coupeA: Pt | null;
  gamme: Gamme | null;
  champ: Champ | null;
  cellules: Cellule[] | null;
  message: { niveau: "info" | "attention" | "erreur"; texte: string } | null;
  maj(f: (p: Projet) => void): void;
  signaler(texte: string, niveau?: "info" | "attention" | "erreur"): void;
  choisirOutil(o: Outil | null): void;
}

const copie = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const useNumeriseur = create<EtatNumeriseur>()((set, get) => ({
  projet: projetVide(),
  nom: "",
  modifie: false,
  image: null,
  outil: null,
  serie: 0,
  selection: null,
  coupeA: null,
  gamme: null,
  champ: null,
  cellules: null,
  message: null,
  maj: (f) => {
    const p = copie(get().projet);
    f(p);
    set({ projet: p, modifie: true });
  },
  signaler: (texte, niveau = "info") => set({ message: { texte, niveau } }),
  choisirOutil: (o) => set({ outil: o, coupeA: null }),
}));
