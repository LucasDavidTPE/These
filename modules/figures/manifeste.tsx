import { IconeFigures } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { FiguresPage } from "./ui/FiguresPage";

const figures: Manifeste = {
  id: "figures",
  titre: "Figures",
  resume: "Bibliothèque de figures, détourage, schémas TikZ, recadrage, graphes",
  Icone: IconeFigures,
  Page: FiguresPage,
  etat: async (ctx) => (ctx.reglages.figures ? `Bibliothèque : ${ctx.reglages.figures.split(/[\\/]/).filter(Boolean).pop()}` : "Bibliothèque à choisir"),
};

export default figures;
