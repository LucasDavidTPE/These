import { IconeFigures } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { isoAvecDecalage } from "@noyau/dates";
import { enregistrerGraphe, enregistrerImage, type DemandeGraphe, type DemandeImage } from "./core/action";
import { exportGraphSvg } from "./core/graph";
import { svgToPng } from "./ui/editor/raster";
import { figuresRecentes } from "./core/recentes";
import { detacher, figuresDe, rattacher, type Cible } from "./core/rattachement";
import { scanLibrary } from "./core/library";
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
    /** Un graphe modifiable dans Figures (données, titres d'axes, légende, export pgfplots) ; renvoie son dossier. */
    "figures.enregistrer-graphe": async (charge) => {
      const { ctx, ...demande } = charge as DemandeGraphe & { ctx: Contexte };
      const racine = ctx.reglages.figures;
      if (!racine) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      return enregistrerGraphe(ctx.plateforme.fichiers(racine), demande, (doc) => svgToPng(exportGraphSvg(doc), doc.width, doc.height, 300), isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    /** Les figures d'une campagne ou d'une étude (origine ou rattachement), avec leur vignette ; charge : { ctx, cible }. */
    "figures.liste": async (charge) => {
      const { ctx, cible } = charge as { ctx: Contexte; cible: Cible };
      const racine = ctx.reglages.figures;
      if (!racine) return [];
      const fs = ctx.plateforme.fichiers(racine);
      return Promise.all(
        (await figuresDe(fs, cible)).map(async (f) => ({
          ...f,
          image: f.vignette ? await fs.readBytes(`${f.dossier}/${f.vignette}`).catch(() => null) : null,
          type: f.vignette?.endsWith(".svg") ? "image/svg+xml" : "image/png",
        })),
      );
    },
    /** Toutes les figures (identifiant, titre, dossier), pour en choisir une à rattacher. */
    "figures.catalogue": async (charge) => {
      const ctx = charge as Contexte;
      const racine = ctx.reglages.figures;
      if (!racine) return [];
      const { figures } = await scanLibrary(ctx.plateforme.fichiers(racine));
      return figures.flatMap((f) => (f.meta ? [{ dossier: f.folder, id: f.id, titre: f.meta.title }] : []));
    },
    /** Rattache (ou détache) une figure à une campagne ou une étude ; charge : { ctx, dossier, cible }. */
    "figures.rattacher": async (charge) => {
      const { ctx, dossier, cible } = charge as { ctx: Contexte; dossier: string; cible: Cible };
      if (!ctx.reglages.figures) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      await rattacher(ctx.plateforme.fichiers(ctx.reglages.figures), dossier, cible, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    "figures.detacher": async (charge) => {
      const { ctx, dossier, cible } = charge as { ctx: Contexte; dossier: string; cible: Cible };
      if (!ctx.reglages.figures) return;
      await detacher(ctx.plateforme.fichiers(ctx.reglages.figures), dossier, cible, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
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
