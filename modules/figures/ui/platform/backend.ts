/**
 * Accès à la plateforme vu par l'interface. Deux implémentations :
 * - Tauri (l'appli réelle, sous Windows) ;
 * - démo en mémoire, utilisée quand on ouvre l'interface dans un navigateur
 *   (`npm run dev`), pour développer et tester l'UI sans Tauri.
 */
import type { LibraryFs, LockInfo } from "../../core/library";

export type LockAcquired =
  | { outcome: "new" }
  | { outcome: "refreshed" }
  | { outcome: "took-over-stale"; previous: LockInfo | null }
  | { outcome: "forced"; previous: LockInfo };

export interface Locks {
  read(folder: string): Promise<LockInfo | null>;
  /** Lève `LockedError` si un autre poste édite la figure (sauf `force`). */
  acquire(folder: string, force?: boolean): Promise<LockAcquired>;
  release(folder: string, force?: boolean): Promise<boolean>;
}

export interface Backend {
  kind: "tauri" | "demo";
  hostName(): Promise<string>;
  readSettings(): Promise<string | null>;
  writeSettings(content: string): Promise<void>;
  oneDriveCandidates(): Promise<string[]>;
  /** Boîte de dialogue « choisir un dossier » ; null si annulée. */
  pickFolder(defaultPath?: string): Promise<string | null>;
  /** Crée la racine si besoin et l'ouvre aux vignettes. */
  openRoot(root: string, create: boolean): Promise<void>;
  fs(root: string): LibraryFs;
  locks(root: string): Locks;
  removeTemp(root: string, path: string): Promise<void>;
  /** URL affichable dans une balise <img> pour un fichier de la bibliothèque. */
  imageUrl(root: string, path: string): string;

  // ---- Détourage (S3) ----
  /** Détoure une image encodée (PNG, JPEG…) ; réponse binaire, voir parseSegmentResponse. */
  segment(image: Uint8Array): Promise<ArrayBuffer>;
  /** Image collée : presse-papier Windows (Tauri) ou événement de collage (démo). */
  pasteImage(event: ClipboardEvent | null): Promise<PastedImage | null>;
  /** Copie un PNG dans le presse-papier (formats « PNG » et DIB sous Windows). */
  copyPng(png: Uint8Array): Promise<void>;
  /** Copie un SVG (formats « image/svg+xml » et texte) accompagné de son rendu PNG. */
  copySvg(svg: string, png: Uint8Array): Promise<void>;
  /** Copie du texte (TikZ). */
  copyText(text: string): Promise<void>;
  /** Boîte « Ouvrir une image » ; renvoie le contenu du fichier choisi. */
  openImageFile(): Promise<Uint8Array | null>;
  /** Boîte « Ouvrir des données » (.xlsx, .csv, .txt) ; nom et contenu du fichier. */
  openDataFile(): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** Contenu d'un fichier déposé par glisser-déposer (chemin fourni par Tauri). */
  readDroppedFile(path: string): Promise<Uint8Array>;
  /** Abonnement aux fichiers déposés sur la fenêtre (Tauri) ; renvoie le désabonnement. */
  onFileDrop(handler: (paths: string[]) => void): Promise<() => void>;
  /** Boîte « Enregistrer sous » puis écriture du PNG ; false si annulé. */
  savePngAs(png: Uint8Array, defaultName: string): Promise<boolean>;
  /** Idem pour un fichier texte .svg, .tex ou .sty. */
  saveTextAs(content: string, defaultName: string, extension: "svg" | "tex" | "sty"): Promise<boolean>;
}

export interface PastedImage {
  bytes: Uint8Array;
  /** Contenu du format HTML du presse-papier (pour retrouver la source), s'il existe. */
  html: string | null;
}

/**
 * Dossier de la bibliothèque, tel que le connaît la coquille de Thèse (champ `figures` des
 * réglages du poste). Le module le branche avant le premier rendu de ses pages : Figurine
 * lit et écrit alors ses « réglages » (au format de Figurine 1.0) à travers lui.
 */
export interface PontReglages {
  lire(): Promise<string | null>;
  ecrire(contenu: string): Promise<void>;
}

let pont: PontReglages | null = null;

export function brancherReglages(p: PontReglages): void {
  pont = p;
}

let current: Backend | null = null;

export async function getBackend(): Promise<Backend> {
  if (current) return current;
  let base: Backend;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { tauriBackend } = await import("./tauriBackend");
    base = tauriBackend();
  } else {
    const { demoBackend } = await import("./demoBackend");
    base = demoBackend();
  }
  current = {
    ...base,
    readSettings: () => (pont ? pont.lire() : base.readSettings()),
    writeSettings: (contenu) => (pont ? pont.ecrire(contenu) : base.writeSettings(contenu)),
  };
  return current;
}
