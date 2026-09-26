/**
 * Index de la bibliothèque, reconstruit en scannant les dossiers (SPEC §4 : pas de base
 * de données). Le scan ne modifie rien : il décrit l'état et liste les problèmes.
 */
import {
  FIGURE_FILES,
  LIBRARY_FILE,
  detectConflictCopy,
  isLeftoverTemp,
  type ConflictCopy,
} from "./conflicts";
import type { LibraryFs } from "./fs";
import { nextFigureId, parseFigureId, parseFolderName } from "./ids";
import { LOCK_FILE, parseLock, type LockInfo } from "./lock";
import { validateMeta, type FigureMeta, type ValidationError } from "./meta";
import { joinPath } from "./paths";

export interface FigureEntry {
  /** Nom du dossier, relatif à la racine. */
  folder: string;
  /** ID tiré du nom du dossier (fait foi pour l'index). */
  id: string;
  /** null si meta.json est absent, illisible ou invalide. */
  meta: FigureMeta | null;
  /** Fichiers canoniques présents (FIGURE_FILES), dans l'ordre de FIGURE_FILES. */
  files: string[];
  conflicts: ConflictCopy[];
  /** Fichiers `.tmp` restés en place après une écriture interrompue. */
  leftovers: string[];
  /** Verrou d'édition, s'il y en a un (null s'il est absent ; illisible → host « ? »).
   * Les sous-dossiers (dont `.conflits/`) ne sont pas examinés. */
  lock: LockInfo | null;
}

export type LibraryIssue =
  | { type: "missing-meta"; folder: string }
  | { type: "unreadable-meta"; folder: string; message: string }
  | { type: "invalid-meta"; folder: string; errors: ValidationError[] }
  | { type: "id-mismatch"; folder: string; metaId: string }
  | { type: "duplicate-id"; id: string; folders: string[] }
  | { type: "conflict-copy"; folder: string; conflict: ConflictCopy }
  | { type: "interrupted-write"; folder: string; file: string };

export interface LibraryIndex {
  figures: FigureEntry[];
  issues: LibraryIssue[];
  /** Conflits OneDrive sur les fichiers de la racine (figurine-library.json). */
  rootConflicts: ConflictCopy[];
  /** Dossiers de la racine qui ne sont pas des figures (ignorés). */
  ignored: string[];
  /** Prochain ID libre : max(ID vus, dossiers et meta.json confondus) + 1. */
  nextId: string;
}

const ILLEGIBLE_LOCK_SINCE = "1970-01-01T00:00:00Z";

export async function scanLibrary(fs: LibraryFs): Promise<LibraryIndex> {
  const root = await fs.listDir("");
  const figures: FigureEntry[] = [];
  const issues: LibraryIssue[] = [];
  const ignored: string[] = [];
  const rootConflicts: ConflictCopy[] = [];

  for (const entry of root) {
    if (entry.kind === "file") {
      const c = detectConflictCopy(entry.name, [LIBRARY_FILE]);
      if (c) rootConflicts.push(c);
      continue;
    }
    const parsed = parseFolderName(entry.name);
    if (!parsed) {
      ignored.push(entry.name);
      continue;
    }
    figures.push(await scanFigure(fs, entry.name, parsed.id, issues));
  }

  figures.sort((a, b) => cmp(parseFigureId(a.id)!, parseFigureId(b.id)!) || cmp(a.folder, b.folder));

  const byId = new Map<string, string[]>();
  for (const f of figures) byId.set(f.id, [...(byId.get(f.id) ?? []), f.folder]);
  for (const [id, folders] of byId) {
    if (folders.length > 1) issues.push({ type: "duplicate-id", id, folders });
  }

  const seenIds = figures.flatMap((f) => (f.meta ? [f.id, f.meta.id] : [f.id]));
  return { figures, issues, rootConflicts, ignored, nextId: nextFigureId(seenIds) };
}

async function scanFigure(fs: LibraryFs, folder: string, id: string, issues: LibraryIssue[]): Promise<FigureEntry> {
  const entries = await fs.listDir(folder);
  const names = new Set(entries.filter((e) => e.kind === "file").map((e) => e.name));
  const files = FIGURE_FILES.filter((f) => names.has(f));
  const conflicts: ConflictCopy[] = [];
  const leftovers: string[] = [];

  for (const name of names) {
    if (isLeftoverTemp(name)) {
      leftovers.push(name);
      issues.push({ type: "interrupted-write", folder, file: name });
      continue;
    }
    const c = detectConflictCopy(name, FIGURE_FILES);
    if (c) {
      conflicts.push(c);
      issues.push({ type: "conflict-copy", folder, conflict: c });
    }
  }

  let meta: FigureMeta | null = null;
  if (!names.has("meta.json")) {
    issues.push({ type: "missing-meta", folder });
  } else {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readText(joinPath(folder, "meta.json")));
    } catch (e) {
      issues.push({ type: "unreadable-meta", folder, message: e instanceof Error ? e.message : String(e) });
    }
    if (raw !== undefined) {
      const r = validateMeta(raw);
      if (r.ok) {
        meta = r.meta;
        if (meta.id !== id) issues.push({ type: "id-mismatch", folder, metaId: meta.id });
      } else {
        issues.push({ type: "invalid-meta", folder, errors: r.errors });
      }
    }
  }

  let lock: LockInfo | null = null;
  if (names.has(LOCK_FILE)) {
    const text = await fs.readText(joinPath(folder, LOCK_FILE)).catch(() => "");
    lock = parseLock(text) ?? { host: "?", since: ILLEGIBLE_LOCK_SINCE };
  }

  return {
    folder,
    id,
    meta,
    files,
    conflicts: conflicts.sort((a, b) => cmp(a.copy, b.copy)),
    leftovers: leftovers.sort(),
    lock,
  };
}

function cmp<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Message en français pour l'interface. */
export function describeIssue(issue: LibraryIssue): string {
  switch (issue.type) {
    case "missing-meta":
      return `${issue.folder} : meta.json absent.`;
    case "unreadable-meta":
      return `${issue.folder} : meta.json illisible (${issue.message}).`;
    case "invalid-meta":
      return `${issue.folder} : meta.json invalide — ${issue.errors
        .map((e) => (e.path ? `${e.path} : ${e.message}` : e.message))
        .join(" ; ")}`;
    case "id-mismatch":
      return `${issue.folder} : meta.json indique l'ID ${issue.metaId}, différent du nom du dossier.`;
    case "duplicate-id":
      return `ID ${issue.id} utilisé par plusieurs dossiers : ${issue.folders.join(", ")}.`;
    case "conflict-copy":
      return `${issue.folder} : deux versions de ${issue.conflict.original} (copie « ${issue.conflict.copy} »). Choisir la version à garder.`;
    case "interrupted-write":
      return `${issue.folder} : écriture interrompue (${issue.file}), la version précédente est intacte.`;
  }
}
