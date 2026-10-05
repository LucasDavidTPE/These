import { IconeManuscrits } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { ManuscritsPage } from "./ui/ManuscritsPage";
import { chargerPlan, listerProjets } from "./ui/donnees";
import { listerPresentations } from "./ui/presentations";

const manuscrits: Manifeste = {
  id: "manuscrits",
  titre: "Manuscrits",
  resume: "Plan de la thèse, versions des fichiers Word, présentations PowerPoint",
  Icone: IconeManuscrits,
  Page: ManuscritsPage,
  indexer: async (ctx) => (ctx.espace ? (await listerPresentations(ctx.espace.fichiers).catch(() => [])).map((n) => ({ id: n, module: "manuscrits", genre: "Présentation", titre: n })) : []),
  etat: async (ctx) => {
    if (!ctx.espace) return "Pas d'espace ouvert";
    const projets = await listerProjets(ctx.espace.fichiers).catch(() => []);
    if (!projets.length) return "Manuscrit à créer";
    const m = await chargerPlan(ctx.espace.fichiers, projets[0]!.id).catch(() => null);
    return m ? `${projets[0]!.titre} : ${m.parties.length} partie${m.parties.length > 1 ? "s" : ""}` : projets[0]!.titre;
  },
};

export default manuscrits;
