import { IconeFigures } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { isoAvecDecalage } from "@noyau/dates";
import { enregistrerImage, type DemandeImage } from "./core/action";
import { FiguresPage } from "./ui/FiguresPage";

const figures: Manifeste = {
  id: "figures",
  titre: "Figures",
  resume: "Bibliothèque de figures, détourage, schémas TikZ, recadrage, graphes",
  Icone: IconeFigures,
  Page: FiguresPage,
  actions: {
    /** Une image d'un autre module devient une figure de la bibliothèque ; renvoie son dossier. */
    "figures.enregistrer-image": async (charge) => {
      const { ctx, ...demande } = charge as DemandeImage & { ctx: Contexte };
      const racine = ctx.reglages.figures;
      if (!racine) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      return enregistrerImage(ctx.plateforme.fichiers(racine), demande, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
  },
  etat: async (ctx) => (ctx.reglages.figures ? `Bibliothèque : ${ctx.reglages.figures.split(/[\\/]/).filter(Boolean).pop()}` : "Bibliothèque à choisir"),
};

export default figures;
