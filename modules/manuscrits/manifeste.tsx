import { IconeManuscrits } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { ManuscritsPage } from "./ui/ManuscritsPage";
import { listerPresentations } from "./ui/presentations";

const manuscrits: Manifeste = {
  id: "manuscrits",
  titre: "Manuscrits",
  resume: "Versions datées de vos manuscrits Word, sources LaTeX, présentations PowerPoint",
  Icone: IconeManuscrits,
  Page: ManuscritsPage,
  indexer: async (ctx) => (ctx.espace ? (await listerPresentations(ctx.espace.fichiers).catch(() => [])).map((n) => ({ id: n, module: "manuscrits", genre: "Présentation", titre: n })) : []),
  etat: async (ctx) => (ctx.racines.manuscrits ? `Dossier : ${ctx.racines.manuscrits.split(/[\\/]/).filter(Boolean).pop()}` : "Dossier à choisir"),
};

export default manuscrits;
