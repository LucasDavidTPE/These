import { IconeBibliotheque } from "@interface/icones";
import { demanderOuverture } from "@interface/ouverture";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { dateLimite, premierJourDuMois, ajouterJours, temps } from "./core/calculs";
import { enregistrerObjet } from "@noyau/stockage";
import { REFERENCES } from "./core/modele";
import { BibliothequePage } from "./ui/BibliothequePage";
import { resoudre } from "./core/citations";
import { aujourdhui, chargerBiblio, lireCitations } from "./ui/donnees";

async function charger(ctx: Contexte) {
  return ctx.espace ? chargerBiblio(ctx.espace.fichiers) : null;
}

const bibliotheque: Manifeste = {
  id: "bibliotheque",
  titre: "Bibliothèque",
  resume: "Références, plan de lecture, fiches, demandes, lecture croisée",
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
      ouvrir: { action: "bibliotheque.ouvrir", charge: { id: r.id } },
    })),
  actions: {
    /**
     * Pour citer `[@BIB-020]` ailleurs (présentations, panneaux d'explication) : { actives, refs } où
     * refs associe chaque clé trouvée (identifiant ou clé BibTeX) à ses auteurs, son année et sa
     * référence complète. Charge : { ctx, cles }. actives = false : l'utilisateur a coupé les citations.
     */
    "bibliotheque.citations": async (charge) => {
      const { ctx, cles } = charge as { ctx: Contexte; cles: string[] };
      if (!ctx.espace) return { actives: false, refs: {} };
      const reglage = await lireCitations(ctx.espace.fichiers);
      if (!reglage.actives) return { actives: false, refs: {} };
      const b = await charger(ctx);
      return { actives: true, refs: b ? resoudre(b.references, cles) : {} };
    },
    /** Ouvre la fiche d'une référence ; charge : { ctx, id }. */
    "bibliotheque.ouvrir": async (charge) => {
      const { ctx, id } = charge as { ctx: Contexte; id: string };
      demanderOuverture("bibliotheque", id);
      ctx.naviguer("bibliotheque");
    },
    /**
     * Pour le Planning (planifier ses lectures) : les références à lire, meilleur score d'abord,
     * avec leur temps de lecture estimé (h) et leur état (EN RETARD, Ce mois-ci…).
     */
    "bibliotheque.a-lire": async (charge) => {
      const b = await charger(charge as Contexte);
      if (!b) return [];
      return b.calc
        .filter((c) => c.ref.cle && c.ref.statut !== "Lu" && c.ref.statut !== "Écarté")
        .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
        .map((c) => ({ id: c.id, citation: c.citation, titre: c.ref.titre, priorite: c.ref.priorite, mois: c.ref.mois, etat: c.etat, statut: c.ref.statut, heures: temps(c.ref, b.parametres), score: c.score }));
    },
    /** Depuis le Planning : la référence passe à « Lu » (lue aujourd'hui). Charge : { ctx, id }. */
    "bibliotheque.marquer-lu": async (charge) => {
      const { ctx, id } = charge as { ctx: Contexte; id: string };
      const b = await charger(ctx);
      const r = b?.references.find((x) => x.id === id);
      if (!ctx.espace || !r) throw new Error(`Référence ${id} introuvable dans la bibliothèque.`);
      await enregistrerObjet(ctx.espace.fichiers, REFERENCES, id, { ...r.valeur, statut: "Lu", dateLecture: r.valeur.dateLecture || aujourdhui() });
    },
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
