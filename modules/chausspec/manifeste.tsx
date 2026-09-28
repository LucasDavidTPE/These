import { IconeChaussspec } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import type { Contexte } from "@interface/contexte";
import type { WheelJSON } from "./core/io";
import { ChaussspecPage } from "./ui/ChaussspecPage";
import { useChaussspec } from "./ui/etat";

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
  actions: {
    /**
     * Remplace le chargement du cas ouvert (la structure est gardée) et ouvre ChaussSpec.
     * Charge : { ctx, wheels (format JSON de chausspec), source }.
     */
    "chausspec.importer-chargement": async (charge) => {
      const { ctx, wheels, source } = charge as { ctx: Contexte; wheels: WheelJSON[]; source: string };
      const s = useChaussspec.getState();
      s.maj((c) => {
        c.loading = { wheels };
      });
      const F = wheels.reduce((t, w) => t + (w.footprint.force ?? 0), 0);
      s.signaler(`Chargement importé (${source}) : ${wheels.length} empreinte${wheels.length > 1 ? "s" : ""}${F ? `, ${Math.round(F / 1000)} kN` : ""}. Vérifier la grille (L, N, fenêtre) avant de calculer.`);
      ctx.naviguer("chausspec");
      return null;
    },
  },
};

export default chausspec;
