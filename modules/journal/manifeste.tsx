import type { Contexte } from "@interface/contexte";
import { IconeJournal } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { demanderOuverture } from "@interface/ouverture";
import { basculer, jourDe, taches, titreJour } from "./core/journal";
import { brouillon, ecrireNote, listerJours, lireNote } from "./ui/donnees";
import { JournalPage } from "./ui/JournalPage";

/** Tâches du jour : celles de la note du jour, sinon celles qui y seront reportées. */
async function duJour(ctx: Contexte) {
  const fs = ctx.espace?.fichiers;
  if (!fs) return null;
  const jour = jourDe(new Date());
  const note = (await lireNote(fs, jour)) ?? (await brouillon(fs, jour));
  return { jour, note, taches: taches(note) };
}

const journal: Manifeste = {
  id: "journal",
  titre: "Journal",
  resume: "Une note par jour, avec sa liste de tâches (reportées d'un jour sur l'autre)",
  Icone: IconeJournal,
  Page: JournalPage,
  etat: async (ctx) => {
    const j = await duJour(ctx);
    if (!j) return null;
    const n = j.taches.filter((t) => !t.fait).length;
    return n ? `${n} tâche${n > 1 ? "s" : ""} à faire aujourd'hui` : "Rien à faire aujourd'hui";
  },
  indexer: async (ctx) => {
    const fs = ctx.espace?.fichiers;
    if (!fs) return [];
    const jours = await listerJours(fs);
    return Promise.all(
      jours.slice(-365).map(async (j) => {
        const md = (await lireNote(fs, j)) ?? "";
        return { id: j, module: "journal", genre: "Note du jour", titre: titreJour(j), mots: md.slice(0, 4000), ouvrir: { action: "journal.ouvrir", charge: { jour: j } } };
      }),
    );
  },
  actions: {
    /** Ouvre la note d'un jour ; charge : { ctx, jour }. */
    "journal.ouvrir": async (charge) => {
      const { ctx, jour } = charge as { ctx: Contexte; jour: string };
      demanderOuverture("journal", jour);
      ctx.naviguer("journal");
    },
    /** Pour l'Accueil : { jour, taches } du jour (null sans espace). */
    "journal.aujourdhui": async (ctx) => {
      const j = await duJour(ctx as Contexte);
      return j ? { jour: j.jour, taches: j.taches } : null;
    },
    /** Pour l'Accueil : coche ou décoche une tâche du jour (la note est créée si besoin) ; charge : { ctx, ligne }. */
    "journal.basculer": async (charge) => {
      const { ctx, ligne } = charge as { ctx: Contexte; ligne: number };
      const j = await duJour(ctx);
      if (!j || !ctx.espace) return;
      await ecrireNote(ctx.espace.fichiers, j.jour, basculer(j.note, ligne));
      ctx.rafraichir();
    },
  },
};

export default journal;
