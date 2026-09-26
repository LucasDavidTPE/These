/**
 * Accès aux fichiers d'un dossier racine, vu depuis le noyau.
 *
 * Tous les chemins sont relatifs à la racine (séparateur « / », « » = la racine).
 * Implémentations : côté appli, les commandes Tauri (src-tauri/src/fichiers) ;
 * côté tests et démo, `FichiersMemoire`.
 */

export interface Entree {
  name: string;
  kind: "file" | "dir";
}

export interface Fichiers {
  /** Contenu d'un dossier, trié par nom. */
  listDir(path: string): Promise<Entree[]>;
  /** Vrai si le fichier ou le dossier existe. */
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  /** Écriture atomique : fichier temporaire puis renommage (SPEC §4.1). */
  writeTextAtomic(path: string, content: string): Promise<void>;
  writeBytesAtomic(path: string, content: Uint8Array): Promise<void>;
  /** Comme writeTextAtomic, mais échoue (`DejaExistant`) si le fichier existe : sert à réserver un ID. */
  writeTextNew(path: string, content: string): Promise<void>;
  /** Crée un dossier ; échoue s'il existe déjà. */
  createDir(path: string): Promise<void>;
  /** Crée un dossier et ses parents ; ne fait rien s'il existe. */
  ensureDir(path: string): Promise<void>;
  /** Renomme ; échoue si la destination existe déjà (rien n'est jamais écrasé ainsi). */
  rename(from: string, to: string): Promise<void>;
}

/** Erreur « existe déjà », reconnaissable par son code. */
export class DejaExistant extends Error {
  readonly code = "already-exists";
  constructor(chemin: string) {
    super(`Existe déjà : ${chemin}`);
  }
}

export class Introuvable extends Error {
  readonly code = "not-found";
  constructor(chemin: string) {
    super(`Introuvable : ${chemin}`);
  }
}

/** Objet en cours d'édition sur un autre poste (erreur « locked » renvoyée par Rust). */
export class Verrouille extends Error {
  readonly code = "locked";
}

/** Autre erreur de fichier, avec le code renvoyé par Rust (« io », « invalid-path »…). */
export class ErreurFichier extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Convertit une erreur reçue d'une commande Tauri (`{ code, message }`, voir
 * src-tauri/src/fichiers/error.rs) en erreur typée.
 */
export function erreurDepuisIpc(e: unknown, chemin = ""): Error {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code: unknown; message: unknown };
    const msg = String(message);
    switch (code) {
      case "already-exists":
        return new DejaExistant(chemin || msg);
      case "not-found":
        return new Introuvable(chemin || msg);
      case "locked":
        return new Verrouille(msg);
      default:
        return new ErreurFichier(String(code), msg);
    }
  }
  return new ErreurFichier("unknown", e instanceof Error ? e.message : String(e));
}

/** Sérialisation stable des JSON écrits sur disque : indentés, terminés par un saut de ligne. */
export function jsonStable(valeur: unknown): string {
  return JSON.stringify(valeur, null, 2) + "\n";
}
