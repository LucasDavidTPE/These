/** Jeu d'exemple de l'atelier COMSOL : chargement dans l'atelier (fichiers synthétiques au format COMSOL). */
import { jeuExemple } from "../../core/graph";
import { useAtelier } from "./useAtelier";

/** Charge le jeu d'exemple (fichiers synthétiques au format COMSOL) dans l'atelier. */
export function chargerExemple() {
  const enc = new TextEncoder();
  useAtelier
    .getState()
    .ajouter(
      jeuExemple().map((f) => ({ name: f.nom, bytes: enc.encode(f.texte) })),
    );
  useAtelier
    .getState()
    .set({
      visite: true,
      avis: {
        niveau: "info",
        texte:
          "Jeu d'exemple chargé (fichiers synthétiques, pas un vrai calcul) : suivez la visite guidée, ou essayez librement les tuiles.",
      },
    });
}
