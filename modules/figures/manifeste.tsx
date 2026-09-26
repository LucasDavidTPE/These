import { IconeFigures } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { isoAvecDecalage } from "@noyau/dates";
import { enregistrerImage, type DemandeImage } from "./core/action";
import { figuresRecentes } from "./core/recentes";
import { useNavigation } from "./ui/navigation";
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
    /** Pour l'Accueil : les dernières figures modifiées, avec leur vignette (octets). */
    "figures.recentes": async (charge) => {
      const ctx = charge as Contexte;
      const racine = ctx.reglages.figures;
      if (!racine) return [];
      const fs = ctx.plateforme.fichiers(racine);
      return Promise.all(
        (await figuresRecentes(fs, 6)).map(async (f) => ({
          ...f,
          image: f.vignette ? await fs.readBytes(`${f.dossier}/${f.vignette}`).catch(() => null) : null,
          type: f.vignette?.endsWith(".svg") ? "image/svg+xml" : "image/png",
        })),
      );
    },
    /** Ouvre une figure dans la bibliothèque ; charge : { ctx, dossier }. */
    "figures.ouvrir": async (charge) => {
      const { ctx, dossier } = charge as { ctx: Contexte; dossier: string };
      useNavigation.getState().ouvrir(dossier);
      ctx.naviguer("figures");
    },
  },
  etat: async (ctx) => (ctx.reglages.figures ? `Bibliothèque : ${ctx.reglages.figures.split(/[\\/]/).filter(Boolean).pop()}` : "Bibliothèque à choisir"),
};

export default figures;
