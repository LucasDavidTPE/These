import { IconeEtudes } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import { demanderOuverture } from "@interface/ouverture";
import type { Manifeste } from "@interface/manifeste";
import { EtudesPage } from "./ui/EtudesPage";
import { chargerEtudes } from "./ui/donnees";

const etudes: Manifeste = {
  id: "etudes",
  titre: "Études",
  resume: "Scripts Python d'analyse, exécutions et sorties tracées",
  Icone: IconeEtudes,
  Page: EtudesPage,
  indexer: async (ctx) => {
    if (!ctx.espace) return [];
    const { etudes } = await chargerEtudes(ctx.espace.fichiers);
    return etudes.map((e) => ({ id: e.dossier, module: "etudes", genre: "Étude", titre: e.etude.titre, detail: [e.etude.statut, e.etude.date].filter(Boolean).join(" · "), mots: `${e.etude.question} ${e.etude.conclusion} ${e.etude.tags.join(" ")}`, ouvrir: { action: "etudes.ouvrir", charge: { dossier: e.dossier } } }));
  },
  actions: {
    /** Ouvre une étude ; charge : { ctx, dossier }. */
    "etudes.ouvrir": async (charge) => {
      const { ctx, dossier } = charge as { ctx: Contexte; dossier: string };
      demanderOuverture("etudes", dossier);
      ctx.naviguer("etudes");
    },
  },
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
