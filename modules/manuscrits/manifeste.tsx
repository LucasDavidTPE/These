import { IconeManuscrits } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { ManuscritsPage } from "./ui/ManuscritsPage";

const manuscrits: Manifeste = {
  id: "manuscrits",
  titre: "Manuscrits",
  resume: "Versions datées de vos manuscrits Word, avec une note",
  Icone: IconeManuscrits,
  Page: ManuscritsPage,
  etat: async (ctx) => (ctx.racines.manuscrits ? `Dossier : ${ctx.racines.manuscrits.split(/[\\/]/).filter(Boolean).pop()}` : "Dossier à choisir"),
};

export default manuscrits;
