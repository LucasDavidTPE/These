import { IconeViscoCompare } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { regenererCas, type OrigineCas } from "./ui/figure";
import { ViscoComparePage } from "./ui/ViscoComparePage";

const viscocompare: Manifeste = {
  id: "viscocompare",
  titre: "ViscoCompare",
  resume: "Profils COMSOL et Viscoroute comparés, vitesse par vitesse",
  Icone: IconeViscoCompare,
  Page: ViscoComparePage,
  etat: async (ctx) => (ctx.reglages.racines.viscocompare ? `Dossier : ${ctx.reglages.racines.viscocompare.split(/[\\/]/).filter(Boolean).pop()}` : "Dossier à choisir"),
  actions: {
    /** Refait une figure de comparaison depuis les fichiers COMSOL et Viscoroute ; charge : { ctx, origine }. */
    "viscocompare.regenerer-figure": async (charge) => {
      const { ctx, origine } = charge as { ctx: Contexte; origine: OrigineCas };
      return regenererCas(ctx, origine);
    },
  },
};

export default viscocompare;
