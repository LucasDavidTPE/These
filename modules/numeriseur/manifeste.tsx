import { IconeNumeriseur } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { NumeriseurPage } from "./ui/NumeriseurPage";

const numeriseur: Manifeste = {
  id: "numeriseur",
  titre: "Numériseur",
  resume: "Relever les valeurs d'un graphique ou d'une carte de couleurs à partir de son image",
  Icone: IconeNumeriseur,
  Page: NumeriseurPage,
  etat: async (ctx) => {
    if (!ctx.espace) return null;
    try {
      const n = (await ctx.espace.fichiers.listDir("numeriseur")).filter((e) => e.name.endsWith(".json")).length;
      return n ? `${n} projet${n > 1 ? "s" : ""} enregistré${n > 1 ? "s" : ""}` : null;
    } catch {
      return null;
    }
  },
};

export default numeriseur;
