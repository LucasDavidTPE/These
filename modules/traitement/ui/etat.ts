/**
 * État de la page Traitement : les essais chargés (objets du cœur, modifiés en place comme
 * dans la page d'origine) et ce que l'écran montre. `tour` augmente à chaque modification :
 * les composants s'y abonnent pour se redessiner.
 */
import { create } from "zustand";
import type { CleVoie } from "../core/donnees";
import type { Essai } from "../core/essai";
import type { Langue } from "../core/vues";
import type { DemandeEssai } from "./demande";

export type Statistique = "" | "_max" | "_min" | "_et";

export interface EtatTraitement {
  essais: Essai[];
  actif: number;
  etape: number;
  stat: Statistique;
  palier: number;
  cycle: number;
  voie: CleVoie;
  tour: number;
  occupe: { texte: string; part: number } | null;
  message: { texte: string; niveau: "info" | "attention" | "erreur" } | null;
  /** Ligne sous le dépôt de fichier (« Essai1.csv — 252 048 lignes… »). */
  infoFichier: string;
  infoDetection: string;
  /** Essai ouvert depuis une campagne (et d'où il vient), pour l'enregistrer avec elle. */
  campagne: { essaiId: string; demande: DemandeEssai } | null;
  /** « Enregistré à 10:42 » : dernier enregistrement automatique dans l'espace. */
  enregistre: string | null;
  /** Langue des titres d'axes et des légendes (figures pour un article en anglais). */
  langue: Langue;
  /** Modifie l'état (essais compris) puis redessine. */
  maj(f: (s: EtatTraitement) => void): void;
  /** Tâche longue avec voile de progression ; l'erreur devient un message. */
  tache(texte: string, f: (progres: (part: number) => void) => Promise<void> | void): Promise<void>;
  signaler(texte: string, niveau?: "info" | "attention" | "erreur"): void;
}

/** Laisse le navigateur dessiner le voile avant un calcul long. */
export const souffler = () => new Promise<void>((ok) => setTimeout(ok, 0));

let minuterie: ReturnType<typeof setTimeout> | undefined;

export const useTraitement = create<EtatTraitement>()((set, get) => ({
  essais: [],
  actif: 0,
  etape: 0,
  stat: "",
  palier: 0,
  cycle: 0,
  voie: "mc",
  tour: 0,
  occupe: null,
  message: null,
  infoFichier: "",
  infoDetection: "",
  campagne: null,
  enregistre: null,
  langue: "fr",
  maj: (f) => {
    const s = get();
    f(s);
    set({ ...s, tour: s.tour + 1 });
  },
  tache: async (texte, f) => {
    set({ occupe: { texte, part: 0 } });
    await souffler();
    try {
      await f((part) => set({ occupe: { texte, part } }));
    } catch (e) {
      get().signaler(e instanceof Error ? e.message : String(e), "erreur");
    } finally {
      set((s) => ({ occupe: null, tour: s.tour + 1 }));
    }
  },
  signaler: (texte, niveau = "info") => {
    set({ message: { texte, niveau } });
    clearTimeout(minuterie);
    if (niveau !== "erreur") minuterie = setTimeout(() => set({ message: null }), 4000);
  },
}));

export const essaiActif = (s: EtatTraitement): Essai | undefined => s.essais[s.actif];
