import { IconeChaussspec } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { ChaussspecPage } from "./ui/ChaussspecPage";

const chausspec: Manifeste = {
  id: "chausspec",
  titre: "ChaussSpec",
  resume: "Chaussées multicouches (visco)élastiques sous chargements quelconques, calcul spectral",
  Icone: IconeChaussspec,
  Page: ChaussspecPage,
  etat: async (ctx) => {
    if (!ctx.espace) return "Cas d'exemple";
    try {
      const n = (await ctx.espace.fichiers.listDir("chausspec")).filter((e) => e.name.endsWith(".json")).length;
      return n ? `${n} cas enregistré${n > 1 ? "s" : ""}` : "Aucun cas enregistré";
    } catch {
      return "Aucun cas enregistré";
    }
  },
};

export default chausspec;
