/**
 * Découverte des essais d'une campagne dans son dossier de données (SPEC §8.2) : un
 * sous-dossier qui contient un export `*.steps.tracking.csv` est un essai ; son premier
 * `.log` donne dates, durée, cycles et état final. Portage de `projects.inspect`.
 */
import { joindre, type Fichiers } from "@noyau/stockage";
import { lireJournal } from "./journal";
import type { Campagne, Essai } from "./modele";

export const SUFFIXE_SUIVI = ".steps.tracking.csv";

export interface Decouverte {
  essais: Record<string, Pick<Essai, "debut" | "fin" | "dureeH" | "cycles" | "etat">>;
  machine: Partial<Campagne["machine"]>;
}

async function texte(fs: Fichiers, chemin: string): Promise<string> {
  // Journaux parfois en Windows-1252 : décodage tolérant plutôt qu'un échec.
  return new TextDecoder("utf-8", { fatal: false }).decode(await fs.readBytes(chemin));
}

/** `fs` a pour racine le dossier de données de la campagne. */
export async function decouvrir(fs: Fichiers): Promise<Decouverte> {
  const racine = await fs.listDir("");
  const essais: Decouverte["essais"] = {};
  let premierJournal: string | null = racine.find((e) => e.kind === "file" && e.name.toLowerCase().endsWith(".log"))?.name ?? null;
  for (const d of racine.filter((e) => e.kind === "dir")) {
    const contenu = await fs.listDir(d.name);
    if (!contenu.some((e) => e.name.endsWith(SUFFIXE_SUIVI))) continue;
    const log = contenu.filter((e) => e.kind === "file" && e.name.toLowerCase().endsWith(".log")).map((e) => e.name).sort()[0];
    if (!log) {
      essais[d.name] = { debut: "", fin: "", dureeH: null, cycles: null, etat: "essai sans journal" };
      continue;
    }
    const chemin = joindre(d.name, log);
    premierJournal ??= chemin;
    const j = lireJournal(await texte(fs, chemin));
    const cycles = Object.values(j.cycles);
    essais[d.name] = {
      debut: j.debut,
      fin: j.fin,
      dureeH: j.dureeS === null ? null : Math.round((j.dureeS / 3600) * 100) / 100,
      cycles: cycles.length ? cycles.reduce((a, b) => a + b, 0) : null,
      etat: j.etatFinal,
    };
  }
  let machine: Decouverte["machine"] = {};
  if (premierJournal) {
    const j = lireJournal(await texte(fs, premierJournal));
    machine = Object.fromEntries(Object.entries({ operateur: j.operateur, poste: j.poste, bati: j.bati, logiciel: j.logiciel }).filter(([, v]) => v));
  }
  return { essais, machine };
}
