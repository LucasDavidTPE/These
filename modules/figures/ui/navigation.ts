import { create } from "zustand";

export type PageId = "library" | "cutout" | "schema" | "crop" | "graphs" | "about";

export interface PageDef {
  id: PageId;
  label: string;
  description: string;
}

/** Ordre de la barre latérale (SPEC §2, modules M1 à M5). */
export const PAGES: readonly PageDef[] = [
  { id: "library", label: "Bibliothèque", description: "Toutes les figures, recherche, tags et métadonnées." },
  { id: "cutout", label: "Détourage", description: "Coller une image, supprimer le fond en local, copier ou enregistrer." },
  { id: "schema", label: "Schéma", description: "Composants de mécanique des chaussées, export TikZ et SVG." },
  { id: "crop", label: "Recadrage", description: "Recadrage libre, ratio fixe, marges en millimètres." },
  { id: "graphs", label: "Graphes", description: "Import Excel ou CSV, export pgfplots et SVG." },
];

interface NavigationState {
  page: PageId;
  goTo: (page: PageId) => void;
  /** Figure demandée par un autre module (Accueil), sélectionnée dès que l'index la contient. */
  aOuvrir: string | null;
  ouvrir: (dossier: string) => void;
}

export const useNavigation = create<NavigationState>()((set) => ({
  page: "library",
  goTo: (page) => set({ page }),
  aOuvrir: null,
  ouvrir: (dossier) => set({ page: "library", aOuvrir: dossier }),
}));
