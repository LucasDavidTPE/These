import { IconeFigures } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { isoAvecDecalage } from "@noyau/dates";
import { svgTexteEnPng } from "@interface/image";
import { enregistrerGraphe, enregistrerImage, enregistrerSchema, type DemandeGraphe, type DemandeImage, type DemandeSchema } from "./core/action";
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
  indexer: async (ctx) => {
    if (!ctx.dossierFigures) return [];
    const { figures } = await scanLibrary(ctx.plateforme.fichiers(ctx.dossierFigures));
    return figures.flatMap((f) => (f.meta ? [{ id: f.id, module: "figures", genre: "Figure", titre: f.meta.title, detail: f.id, mots: f.meta.tags.join(" "), ouvrir: { action: "figures.ouvrir", charge: { dossier: f.folder } } }] : []));
  },
  actions: {
    /** Une image d'un autre module devient une figure de la bibliothèque ; renvoie son dossier. */
    "figures.enregistrer-image": async (charge) => {
      const { ctx, ...demande } = charge as DemandeImage & { ctx: Contexte };
      const racine = ctx.dossierFigures;
      if (!racine) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      return enregistrerImage(ctx.plateforme.fichiers(racine), demande, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    /** Pour l'Accueil : les dernières figures modifiées, avec leur vignette (octets). */
    "figures.recentes": async (charge) => {
      const ctx = charge as Contexte;
      const racine = ctx.dossierFigures;
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
      const racine = ctx.dossierFigures;
      if (!racine) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      return enregistrerGraphe(ctx.plateforme.fichiers(racine), demande, (doc) => svgToPng(exportGraphSvg(doc), doc.width, doc.height, 300), isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    /** Un schéma modifiable (figure.json, TikZ) ; renvoie son dossier. */
    "figures.enregistrer-schema": async (charge) => {
      const { ctx, ...demande } = charge as DemandeSchema & { ctx: Contexte };
      const racine = ctx.dossierFigures;
      if (!racine) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      return enregistrerSchema(ctx.plateforme.fichiers(racine), demande, (svg, doc) => svgToPng(svg, doc.canvas.width, doc.canvas.height, 300), isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    /** Les figures d'une campagne ou d'une étude (origine ou rattachement), avec leur vignette ; charge : { ctx, cible }. */
    "figures.liste": async (charge) => {
      const { ctx, cible } = charge as { ctx: Contexte; cible: Cible };
      const racine = ctx.dossierFigures;
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
    /**
     * L'image d'une figure, pour l'insérer dans un document (présentation…) ; charge : { ctx, id }.
     * Renvoie null si la figure n'existe pas ou n'a pas d'image ; un SVG est rendu en PNG.
     */
    "figures.image": async (charge) => {
      const { ctx, id } = charge as { ctx: Contexte; id: string };
      if (!ctx.dossierFigures) return null;
      const fs = ctx.plateforme.fichiers(ctx.dossierFigures);
      const { figures } = await scanLibrary(fs);
      const f = figures.find((x) => x.id === id);
      if (!f) return null;
      const fichier = ["export.png", "original.png", "export.svg"].find((n) => f.files.includes(n));
      if (!fichier) return null;
      const octets = await fs.readBytes(`${f.folder}/${fichier}`);
      if (fichier.endsWith(".svg")) {
        // Les SVG de la bibliothèque sont dimensionnés en mm : le rendu du navigateur veut des pixels.
        const svg = new TextDecoder().decode(octets).replace(/(<svg[^>]*\s(?:width|height)=")([\d.]+)mm"/g, (_m, a: string, v: string) => `${a}${Math.round(Number(v) * 3.78)}"`);
        return { octets: await svgTexteEnPng(svg).catch(() => null), titre: f.meta?.title ?? id, legende: f.meta?.caption ?? "" };
      }
      return { octets, titre: f.meta?.title ?? id, legende: f.meta?.caption ?? "" };
    },
    /** Toutes les figures (identifiant, titre, dossier), pour en choisir une à rattacher. */
    "figures.catalogue": async (charge) => {
      const ctx = charge as Contexte;
      const racine = ctx.dossierFigures;
      if (!racine) return [];
      const { figures } = await scanLibrary(ctx.plateforme.fichiers(racine));
      return figures.flatMap((f) => (f.meta ? [{ dossier: f.folder, id: f.id, titre: f.meta.title }] : []));
    },
    /** Rattache (ou détache) une figure à une campagne ou une étude ; charge : { ctx, dossier, cible }. */
    "figures.rattacher": async (charge) => {
      const { ctx, dossier, cible } = charge as { ctx: Contexte; dossier: string; cible: Cible };
      if (!ctx.dossierFigures) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (Réglages du poste).");
      await rattacher(ctx.plateforme.fichiers(ctx.dossierFigures), dossier, cible, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    "figures.detacher": async (charge) => {
      const { ctx, dossier, cible } = charge as { ctx: Contexte; dossier: string; cible: Cible };
      if (!ctx.dossierFigures) return;
      await detacher(ctx.plateforme.fichiers(ctx.dossierFigures), dossier, cible, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()), ctx.poste);
    },
    /** Ouvre une figure dans la bibliothèque ; charge : { ctx, dossier }. */
    "figures.ouvrir": async (charge) => {
      const { ctx, dossier } = charge as { ctx: Contexte; dossier: string };
      useNavigation.getState().ouvrir(dossier);
      ctx.naviguer("figures");
    },
  },
  etat: async (ctx) => (ctx.dossierFigures ? `Bibliothèque : ${ctx.dossierFigures.split(/[\\/]/).filter(Boolean).pop()}` : "Bibliothèque à choisir"),
};

export default figures;
