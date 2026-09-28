/**
 * Essai à ouvrir dans le traitement, demandé par un autre module (Campagnes) via l'action
 * « traitement.ouvrir-essai ». Mémorisé ici le temps que la page du module s'affiche.
 */
import { referenceDepuisChemin } from "@noyau/poste/racines";
import type { Contexte } from "@interface/contexte";
import { fichiersDonnees } from "@interface/donnees";

export interface DemandeEssai {
  /** « Module complexe B2C4 bio — Essai1 ». */
  titre: string;
  /** Dossier des données de l'essai (référence de racine, « essais:tsrst/Essai1 ») et export à lire. */
  donnees?: string;
  /** Anciennes figures : dossier absolu des données sur le poste qui les a faites. */
  dossierDonnees?: string;
  fichier: string;
  /** Chemin (relatif à l'espace) où le dépouillement est enregistré : …/traitement.json. */
  projet: string;
  /** Campagne d'origine, pour y revenir (action « campagnes.ouvrir »). */
  campagne?: string;
}

let courante: DemandeEssai | null = null;
const abonnes = new Set<(d: DemandeEssai) => void>();

export function demander(d: DemandeEssai): void {
  courante = d;
  for (const f of abonnes) f(d);
}

export function prendre(): DemandeEssai | null {
  return courante;
}

export function surDemande(f: (d: DemandeEssai) => void): () => void {
  abonnes.add(f);
  return () => abonnes.delete(f);
}

/** Lit l'export d'un essai demandé : par sa copie dans l'espace (copié au passage s'il ne l'est pas encore). */
export async function lireExport(ctx: Pick<Contexte, "espace" | "plateforme" | "racines">, d: DemandeEssai): Promise<Uint8Array> {
  const ref = d.donnees ?? (d.dossierDonnees ? referenceDepuisChemin(d.dossierDonnees, ctx.racines) : null);
  if (ref) {
    try {
      return await fichiersDonnees(ctx, ref).readBytes(d.fichier);
    } catch {
      throw new Error(`Données de l'essai ni dans l'espace, ni sur ce poste (${ref}).`);
    }
  }
  if (!d.dossierDonnees || !(await ctx.plateforme.dossierExiste(d.dossierDonnees))) throw new Error(`Données de l'essai absentes de ce poste (${d.dossierDonnees ?? d.titre}).`);
  return ctx.plateforme.fichiers(d.dossierDonnees).readBytes(d.fichier);
}
