import type { Contexte } from "@interface/contexte";
import { IconeTraitement } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { demander, oublier, type DemandeEssai } from "./ui/demande";
import { regenererFigure, type OrigineTraitement } from "./ui/figure";
import { TraitementPage } from "./ui/TraitementPage";
import { useTraitement } from "./ui/etat";
import { rouvrirDepouillement } from "./ui/chargement";
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
    /** Rouvre un dépouillement enregistré (par exemple rattaché à un essai de campagne) ; charge : { ctx, chemin }. */
    "traitement.rouvrir-depouillement": async (charge) => {
      const { ctx, chemin } = charge as { ctx: Contexte; chemin: string };
      oublier();
      useTraitement.setState({ campagne: null });
      ctx.naviguer("traitement");
      await rouvrirDepouillement(ctx, chemin);
    },
    /** Refait un graphique (courbe maîtresse…) depuis le fichier de l'essai et son dépouillement enregistré. */
    "traitement.regenerer-figure": async (charge) => {
      const { ctx, origine } = charge as { ctx: Contexte; origine: OrigineTraitement };
      return regenererFigure(ctx, origine);
    },
    /**
     * Constantes 2S2P1D (ou Huet-Sayegh) calées des essais ouverts, avec la loi WLF : pour une
     * couche viscoélastique de ChaussSpec.
     */
    "traitement.calages": () =>
      useTraitement
        .getState()
        .essais.filter((e) => e.modeleId === "2s2p1d" || e.modeleId === "huet-sayegh")
        .map((e) => ({
          nom: `${e.nom}${e.demo ? " (démonstration)" : ""} — ${e.modeleId === "2s2p1d" ? "2S2P1D" : "Huet-Sayegh"}, T_ref ${e.Tref} °C`,
          E00: e.p.E00,
          E0: e.p.E0,
          k: e.p.k,
          h: e.p.h,
          delta: e.p.delta,
          tauE: e.p.tauE,
          beta: e.modeleId === "2s2p1d" ? e.p.beta : Infinity,
          Tref: e.Tref,
          C1: e.C1,
          C2: e.C2,
          nu00: e.p.nu00,
          nu0: e.p.nu0,
        })),
  },
};

export default traitement;
