/**
 * Accès à la machine vu par l'interface. Deux implémentations, fournies par la coquille :
 * - Tauri (l'application réelle, sous Windows) ;
 * - démonstration en mémoire, quand on ouvre l'interface dans un navigateur (`npm run dev`),
 *   pour développer et vérifier l'interface sans Tauri.
 */
import type { Fichiers } from "@noyau/stockage";

export interface Plateforme {
  genre: "tauri" | "demo";
  nomDuPoste(): Promise<string>;
  lireReglages(): Promise<string | null>;
  ecrireReglages(contenu: string): Promise<void>;
  /** Dossiers OneDrive du poste (professionnel d'abord). */
  dossiersOneDrive(): Promise<string[]>;
  /** Boîte « choisir un dossier » ; null si annulée. */
  choisirDossier(titre: string, depart?: string): Promise<string | null>;
  /** Vrai si le chemin absolu existe et est un dossier. */
  dossierExiste(chemin: string): Promise<boolean>;
  /** Crée le dossier (et ses parents) s'il n'existe pas. */
  creerDossier(chemin: string): Promise<void>;
  /** Accès aux fichiers sous une racine absolue. */
  fichiers(racine: string): Fichiers;
  /** Supprime un fichier temporaire `*.tmp` laissé par une écriture interrompue. */
  supprimerTemporaire(racine: string, chemin: string): Promise<void>;
  /**
   * Boîte « Enregistrer sous » puis écriture du fichier ; false si l'utilisateur annule.
   * `nom` propose le nom de fichier (son extension sert de filtre).
   */
  enregistrerSous(nom: string, octets: Uint8Array): Promise<boolean>;
  /** Boîte « Ouvrir » limitée à des extensions (« xlsx ») ; null si annulée. */
  ouvrirFichier(titre: string, extensions: string[]): Promise<{ nom: string; octets: Uint8Array } | null>;
  /** Ouvre un dossier dans l'Explorateur. */
  ouvrirDossier(chemin: string): Promise<void>;
  /** Ouvre une adresse web dans le navigateur par défaut. */
  ouvrirLien(url: string): Promise<void>;
  /**
   * Surveille une racine : `rappel` reçoit les chemins relatifs modifiés (par cette
   * application ou par OneDrive). Renvoie la fonction d'arrêt.
   */
  surveiller(racine: string, rappel: (chemins: string[]) => void): Promise<() => void>;
}
