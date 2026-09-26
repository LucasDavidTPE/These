import type { Contexte } from "@interface/contexte";
import { IconeTraitement } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { demander, type DemandeEssai } from "./ui/demande";
import { TraitementPage } from "./ui/TraitementPage";
import "./ui/traitement.css";

const traitement: Manifeste = {
  id: "traitement",
  titre: "Traitement 2S2P1D",
  resume: "Dépouillement de module complexe et calage 2S2P1D, Huet-Sayegh, KVG",
  Icone: IconeTraitement,
  Page: TraitementPage,
  actions: {
    /** Ouvre un essai (d'une campagne) dans le traitement, avec son dépouillement enregistré. */
    "traitement.ouvrir-essai": (charge) => {
      const { ctx, ...d } = charge as DemandeEssai & { ctx: Contexte };
      demander(d);
      ctx.naviguer("traitement");
    },
  },
};

export default traitement;
