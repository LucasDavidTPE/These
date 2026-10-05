/** Lecture des parties à fusionner (fichiers Word, à défaut dernière version enregistrée) et écriture des sorties. */
import type { Contexte } from "@interface/contexte";
import { lireReference } from "@noyau/poste/racines";
import type { Fichiers } from "@noyau/stockage";
import type { PartieFusion } from "../core/fusion";
import { dossierSorties, ordreFusion, type Manuscrit } from "../core/plan";
import { resoudreSource, scinder } from "../core/sources";
import { chargerVersions } from "./donnees";

export interface PartiesLues {
  parties: PartieFusion[];
  /** Parties lues dans leur dernière version enregistrée (fichier introuvable sur ce PC). */
  repli: string[];
  /** Parties qu'on n'a pu lire d'aucune façon : la fusion est impossible. */
  manquantes: string[];
}

const dateCourte = (s: string) => (s ? new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export async function lirePartiesFusion(ctx: Contexte, projet: string, m: Manuscrit): Promise<PartiesLues> {
  const espace = ctx.espace!;
  const out: PartiesLues = { parties: [], repli: [], manquantes: [] };
  for (const p of ordreFusion(m)) {
    const r = resoudreSource(p.source, espace.racine, ctx.reglages.racines);
    const fichier = r.ok ? scinder(r.chemin).nom : scinder(lireReference(p.source)?.chemin ?? p.source).nom;
    let octets: Uint8Array | null = null;
    let raison = r.ok ? "" : r.message;
    if (r.ok) {
      try {
        octets = await ctx.plateforme.fichiers(r.dossier).readBytes(r.chemin);
      } catch (e) {
        raison = e instanceof Error ? e.message : String(e);
      }
    }
    if (!octets) {
      const v = (await chargerVersions(espace.fichiers, projet, p.id, fichier))[0];
      if (v) {
        octets = await espace.fichiers.readBytes(`${v.dossier}/${v.fichier}`);
        out.repli.push(`« ${p.nom} » : fichier introuvable (${raison}) ; dernière version enregistrée utilisée (${dateCourte(v.date) || v.fichier}).`);
      } else {
        out.manquantes.push(`« ${p.nom} » : ${raison}, et aucune version enregistrée.`);
        continue;
      }
    }
    out.parties.push({ id: p.id, nom: p.nom, genre: p.genre, fichier, octets });
  }
  return out;
}

/** Écrit un document fusionné dans `manuscrits/<projet>/sorties/` ; renvoie son chemin relatif à l'espace. */
export async function ecrireSortie(espace: Fichiers, projet: string, nom: string, octets: Uint8Array): Promise<string> {
  const dossier = dossierSorties(projet);
  await espace.ensureDir(dossier);
  const chemin = `${dossier}/${nom}`;
  await espace.writeBytesAtomic(chemin, octets);
  return chemin;
}
