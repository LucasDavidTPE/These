/**
 * Essai à ouvrir dans le traitement, demandé par un autre module (Campagnes) via l'action
 * « traitement.ouvrir-essai ». Mémorisé ici le temps que la page du module s'affiche.
 */
export interface DemandeEssai {
  /** « Module complexe B2C4 bio — Essai1 ». */
  titre: string;
  /** Dossier absolu des données de l'essai, et nom de l'export à lire. */
  dossierDonnees: string;
  fichier: string;
  /** Chemin (relatif à l'espace) où le dépouillement est enregistré : …/traitement.json. */
  projet: string;
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
