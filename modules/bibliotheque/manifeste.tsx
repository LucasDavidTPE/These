import { IconeBibliotheque } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { dateLimite, premierJourDuMois, ajouterJours } from "./core/calculs";
import { BibliothequePage } from "./ui/BibliothequePage";
import { chargerBiblio } from "./ui/donnees";

async function charger(ctx: Contexte) {
  return ctx.espace ? chargerBiblio(ctx.espace.fichiers) : null;
}

const bibliotheque: Manifeste = {
  id: "bibliotheque",
  titre: "Bibliothèque",
  resume: "Références, plan de lecture, fiches, demandes, analyse croisée",
  Icone: IconeBibliotheque,
  Page: BibliothequePage,
  etat: async (ctx) => {
    const b = await charger(ctx);
    if (!b || b.references.length === 0) return "Classeur à importer";
    return `${b.tb.lues} / ${b.tb.total} lues · mois ${b.tb.libelleMoisCourant} · ${b.tb.ceMois} à lire ce mois-ci`;
  },
  problemes: async (ctx) => (await charger(ctx))?.problemes ?? [],
  indexer: async (ctx) =>
    ((await charger(ctx))?.references ?? []).map((r) => ({
      id: r.id,
      module: "bibliotheque",
      genre: "Référence",
      titre: r.valeur.titre,
      detail: [r.valeur.auteurs, r.valeur.annee].filter(Boolean).join(" · "),
      mots: [r.valeur.cle, r.valeur.doi, r.valeur.statut, r.valeur.categories.join(" ")].join(" "),
    })),
  actions: {
    /**
     * Pour le Planning : un bloc par mois du plan de lecture, et les dates limites des
     * demandes en jalons (SPEC §10.2).
     */
    "bibliotheque.planning": async (charge) => {
      const b = await charger(charge as Contexte);
      if (!b || b.references.length === 0) return { mois: [], jalons: [] };
      return {
        mois: b.tb.parMois.map((m) => ({
          numero: m.numero,
          titre: b.parametres.objectifs[String(m.numero)]?.titre ?? "",
          debut: premierJourDuMois(m.numero, b.parametres),
          fin: ajouterJours(premierJourDuMois(m.numero + 1, b.parametres), -1),
          total: m.total,
          lues: m.lues,
          heuresPrevues: m.heuresPrevues,
          capacite: m.capacite,
          etat: m.etat,
        })),
        jalons: b.demandes
          .filter((d) => d.valeur.statut === "À envoyer" && dateLimite(d.valeur, b.parametres))
          .map((d) => ({ date: dateLimite(d.valeur, b.parametres), titre: `Envoyer : ${d.valeur.document}` })),
      };
    },
  },
};

export default bibliotheque;
