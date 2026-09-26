/**
 * Accès aux fichiers de la bibliothèque, vu depuis src/core.
 *
 * Tous les chemins sont relatifs à la racine (« » = la racine elle-même, séparateur « / »).
 * Implémentations : côté appli, les commandes Tauri (src-tauri/src/library) ;
 * côté tests, `MemoryFs`.
 */

export interface DirEntry {
  name: string;
  kind: "file" | "dir";
}

export interface LibraryFs {
  /** Contenu d'un dossier, trié par nom. */
  listDir(path: string): Promise<DirEntry[]>;
  readText(path: string): Promise<string>;
  /** Contenu binaire (images). */
  readBytes(path: string): Promise<Uint8Array>;
  /** Écriture atomique : fichier temporaire puis renommage (SPEC §4). */
  writeTextAtomic(path: string, content: string): Promise<void>;
  /** Idem pour un fichier binaire (images). */
  writeBytesAtomic(path: string, content: Uint8Array): Promise<void>;
  /** Crée un dossier ; échoue s'il existe déjà (sert à réserver un ID). */
  createDir(path: string): Promise<void>;
  /** Renomme ; échoue si la destination existe déjà. */
  rename(from: string, to: string): Promise<void>;
}

/** Erreur « existe déjà », reconnaissable par son code. */
export class AlreadyExistsError extends Error {
  readonly code = "already-exists";
  constructor(path: string) {
    super(`Existe déjà : ${path}`);
  }
}

export class NotFoundError extends Error {
  readonly code = "not-found";
  constructor(path: string) {
    super(`Introuvable : ${path}`);
  }
}

/** Verrou d'un autre poste (erreur « locked » renvoyée par Rust). */
export class LockedError extends Error {
  readonly code = "locked";
}

/** Autre erreur de la bibliothèque, avec le code renvoyé par Rust (« io », « invalid-path »…). */
export class LibraryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Convertit une erreur reçue d'une commande Tauri (`{ code, message }`, voir
 * src-tauri/src/library/error.rs) en erreur typée.
 */
export function libraryErrorFromIpc(e: unknown, path = ""): Error {
  if (typeof e === "object" && e !== null && "code" in e && "message" in e) {
    const { code, message } = e as { code: unknown; message: unknown };
    const msg = String(message);
    switch (code) {
      case "already-exists":
        return new AlreadyExistsError(path || msg);
      case "not-found":
        return new NotFoundError(path || msg);
      case "locked":
        return new LockedError(msg);
      default:
        return new LibraryError(String(code), msg);
    }
  }
  return new LibraryError("unknown", e instanceof Error ? e.message : String(e));
}
