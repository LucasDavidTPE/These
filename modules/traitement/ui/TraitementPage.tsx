/**
 * Module Traitement 2S2P1D. La page de dépouillement existante (lucasdavid47/2S2P1D-traitement)
 * est reprise telle quelle, sans réseau, dans `modules/traitement/statique/` : mêmes calculs,
 * mêmes tests de conformité à la chaîne Excel. Ses exports passent par la boîte
 * « Enregistrer sous » de Windows. L'interface sera réécrite dans celle de l'application
 * quand Campagnes (P5) lui fournira directement les essais.
 */
import { useEffect } from "react";
import { useContexte } from "@interface/contexte";

declare global {
  interface Window {
    /** Appelé par la page intégrée (main.js, fonction `enregistrer`). */
    theseEnregistrer?: (nom: string, blob: Blob) => Promise<boolean>;
  }
}

export function TraitementPage() {
  const { plateforme } = useContexte();

  useEffect(() => {
    window.theseEnregistrer = async (nom, blob) => plateforme.enregistrerSous(nom, new Uint8Array(await blob.arrayBuffer()));
    return () => {
      delete window.theseEnregistrer;
    };
  }, [plateforme]);

  return <iframe className="traitement-page" title="Traitement 2S2P1D" src="/statique/traitement/index.html" />;
}
