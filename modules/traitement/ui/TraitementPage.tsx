import { PageAVenir } from "@interface/composants";
import { useContexte } from "@interface/contexte";

export function TraitementPage() {
  const ctx = useContexte();
  return (
    <PageAVenir
      titre="Traitement 2S2P1D"
      resume="Dépouillement de module complexe et calage 2S2P1D, Huet-Sayegh, KVG"
      phase="P2"
      prevu={[
        "Lecture MTS / Instron et WaveMatrix, régression cycle par cycle, tri des cycles",
        "Calage 2S2P1D, Huet-Sayegh et KVG, WLF, comparaison de plusieurs éprouvettes",
        "Conformité à la chaîne Excel vérifiée par les mêmes tests qu'aujourd'hui",
        "Ouverture directe d'un essai depuis Campagnes",
      ]}
      enAttendant={<p>Le site actuel reste en ligne : <button type="button" className="lien" onClick={() => void ctx.plateforme.ouvrirLien("https://lucasdavid47.github.io/2S2P1D-traitement/")}>lucasdavid47.github.io/2S2P1D-traitement</button>.</p>}
    />
  );
}
