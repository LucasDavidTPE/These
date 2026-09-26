import { IconeEtudes } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { EtudesPage } from "./ui/EtudesPage";
import { chargerEtudes } from "./ui/donnees";

const etudes: Manifeste = {
  id: "etudes",
  titre: "Études",
  resume: "Scripts Python d'analyse, exécutions et sorties tracées",
  Icone: IconeEtudes,
  Page: EtudesPage,
  etat: async (ctx) => {
    if (!ctx.espace) return null;
    const { etudes } = await chargerEtudes(ctx.espace.fichiers);
    if (!etudes.length) return "Aucune étude";
    const x = etudes.reduce((s, e) => s + e.executions.length, 0);
    return `${etudes.length} étude(s), ${x} exécution(s) tracée(s)`;
  },
  problemes: async (ctx) => (ctx.espace ? (await chargerEtudes(ctx.espace.fichiers)).problemes : []),
};

export default etudes;
