/**
 * La page de dépouillement d'origine (statique/, reprise de 2S2P1D-traitement), gardée en
 * secours tant que l'interface React n'est pas validée sous Windows. Ses exports passent par
 * « Enregistrer sous ».
 */
import { useEffect } from "react";
import { useContexte } from "@interface/contexte";

declare global {
  interface Window {
    /** Appelé par la page intégrée (main.js, fonction `enregistrer`). */
    theseEnregistrer?: (nom: string, blob: Blob) => Promise<boolean>;
  }
}

export function AnciennePage({ fermer }: { fermer(): void }) {
  const { plateforme } = useContexte();
  useEffect(() => {
    window.theseEnregistrer = async (nom, blob) => plateforme.enregistrerSous(nom, new Uint8Array(await blob.arrayBuffer()));
    return () => {
      delete window.theseEnregistrer;
    };
  }, [plateforme]);
  return (
    <div className="traitement">
      <div className="traitement-barre">
        <strong>Ancienne page</strong>
        <span className="discret">La page de dépouillement d'origine, sans lien avec les campagnes. Signalez ce qui manque à la nouvelle.</span>
        <button type="button" className="principal" onClick={fermer}>
          ← Nouvelle page
        </button>
      </div>
      <iframe className="traitement-page" title="Traitement 2S2P1D (ancienne page)" src="/statique/traitement/index.html" />
    </div>
  );
}
