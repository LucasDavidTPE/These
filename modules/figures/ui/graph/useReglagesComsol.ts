/**
 * Réglages COMSOL partagés par toute la bibliothèque (`_comsol/reglages.json`) : correspondances de légende
 * (« lc=1 » → « Rectangulaire ») et interfaces de couches (z = −0,08 m « BB/GB »…). Lus à l'ouverture du panneau,
 * enregistrés à chaque modification ; valeurs par défaut tant que le fichier n'existe pas.
 */
import { create } from "zustand";
import { joinPath } from "../../core/library";
import { FICHIER_REGLAGES_COMSOL, lireReglagesComsol, reglagesComsolDefaut, type ReglagesComsol } from "../../core/graph";
import { useLibrary } from "../library/useLibrary";

interface EtatReglages {
  reglages: ReglagesComsol;
  /** Bibliothèque d'où viennent les réglages (rechargés si elle change). */
  racine: string | null;
  erreur: string;
  charger(): Promise<void>;
  enregistrer(r: ReglagesComsol): Promise<void>;
}

export const useReglagesComsol = create<EtatReglages>((set, get) => ({
  reglages: reglagesComsolDefaut(),
  racine: null,
  erreur: "",
  charger: async () => {
    const { backend, root } = useLibrary.getState();
    if (!backend || !root || get().racine === root) return;
    try {
      const texte = await backend.fs(root).readText(FICHIER_REGLAGES_COMSOL);
      set({ reglages: lireReglagesComsol(JSON.parse(texte)), racine: root, erreur: "" });
    } catch {
      // pas encore de fichier : valeurs par défaut
      set({ reglages: reglagesComsolDefaut(), racine: root, erreur: "" });
    }
  },
  enregistrer: async (r) => {
    set({ reglages: r });
    const { backend, root } = useLibrary.getState();
    if (!backend || !root) return set({ erreur: "Bibliothèque non ouverte : réglages gardés pour cette session seulement." });
    try {
      const fs = backend.fs(root);
      await fs.createDir(FICHIER_REGLAGES_COMSOL.split("/")[0]!).catch(() => undefined);
      await fs.writeTextAtomic(joinPath(...(FICHIER_REGLAGES_COMSOL.split("/") as [string, string])), JSON.stringify(r, null, 2) + "\n");
      set({ erreur: "" });
    } catch (e) {
      set({ erreur: `Réglages non enregistrés : ${e instanceof Error ? e.message : String(e)}` });
    }
  },
}));
