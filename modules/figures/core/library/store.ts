/**
 * Opérations d'écriture de haut niveau sur la bibliothèque.
 */
import { AlreadyExistsError, type LibraryFs } from "./fs";
import { figureFolderName, formatFigureId, parseFigureId } from "./ids";
import type { FileOp } from "./conflicts";
import { newMeta, serializeMeta, type FigureKind, type FigureMeta, type FigureSource } from "./meta";
import { joinPath } from "./paths";
import { scanLibrary } from "./scan";

/** Au-delà, on abandonne : quelque chose d'anormal se passe dans le dossier. */
const MAX_ID_ATTEMPTS = 50;

export interface CreatedFigure {
  folder: string;
  meta: FigureMeta;
}

/**
 * Crée le dossier d'une nouvelle figure et son meta.json. L'ID est max + 1 au moment de
 * la création (SPEC §4) ; si le dossier existe déjà (synchro arrivée entre-temps),
 * on passe à l'ID suivant.
 */
export async function createFigure(
  fs: LibraryFs,
  args: { title: string; kind: FigureKind; now: string; host: string },
): Promise<CreatedFigure> {
  const index = await scanLibrary(fs);
  const taken = new Set(index.figures.map((f) => f.id));
  let n = parseFigureId(index.nextId)!;
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++, n++) {
    const id = formatFigureId(n);
    if (taken.has(id)) continue;
    const folder = figureFolderName(id, args.title);
    try {
      await fs.createDir(folder);
    } catch (e) {
      if (e instanceof AlreadyExistsError) continue;
      throw e;
    }
    const meta = newMeta({ ...args, id });
    await fs.writeTextAtomic(joinPath(folder, "meta.json"), serializeMeta(meta));
    return { folder, meta };
  }
  throw new Error("Impossible de trouver un ID libre pour la nouvelle figure.");
}

/** Réécrit meta.json en mettant à jour `modified` et `last_host`. */
export async function saveMeta(
  fs: LibraryFs,
  folder: string,
  meta: FigureMeta,
  args: { now: string; host: string },
): Promise<FigureMeta> {
  const updated: FigureMeta = { ...meta, modified: args.now, last_host: args.host };
  await fs.writeTextAtomic(joinPath(folder, "meta.json"), serializeMeta(updated));
  return updated;
}

/** Exécute un plan d'opérations (par exemple la résolution d'un conflit), dans l'ordre. */
export async function applyFileOps(fs: LibraryFs, ops: readonly FileOp[]): Promise<void> {
  for (const op of ops) {
    if (op.op === "mkdir") await fs.createDir(op.path);
    else if (op.op === "rename") await fs.rename(op.from, op.to);
    else await fs.writeTextAtomic(op.path, op.content);
  }
}

/**
 * Enregistre une image (par exemple un détourage) comme nouvelle figure `kind=image` :
 * `original.png` (l'image d'origine), `export.png` (le résultat) et meta.json avec la
 * source préremplie et la légende proposée.
 */
export async function saveImageFigure(
  fs: LibraryFs,
  args: {
    title: string;
    original: Uint8Array;
    result: Uint8Array;
    source?: FigureSource;
    caption?: string;
    tags?: string[];
    now: string;
    host: string;
  },
): Promise<CreatedFigure> {
  const created = await createFigure(fs, { title: args.title, kind: "image", now: args.now, host: args.host });
  await fs.writeBytesAtomic(joinPath(created.folder, "original.png"), args.original);
  await fs.writeBytesAtomic(joinPath(created.folder, "export.png"), args.result);
  const meta: FigureMeta = { ...created.meta, tags: args.tags ?? [] };
  if (args.source) meta.source = args.source;
  if (args.caption) meta.caption = args.caption;
  const saved = await saveMeta(fs, created.folder, meta, { now: args.now, host: args.host });
  return { folder: created.folder, meta: saved };
}

/**
 * Enregistre un recadrage comme nouvelle figure `kind=crop` liée à l'originale
 * (`derived_from`), qui hérite de sa source, de sa licence et de sa légende.
 * `crop` (paramètres) est gardé dans meta.json pour pouvoir refaire le recadrage.
 */
export async function saveCropFigure(
  fs: LibraryFs,
  args: {
    title: string;
    original: Uint8Array;
    result: Uint8Array;
    from?: FigureMeta;
    crop: Record<string, unknown>;
    now: string;
    host: string;
  },
): Promise<CreatedFigure> {
  const created = await createFigure(fs, { title: args.title, kind: "crop", now: args.now, host: args.host });
  await fs.writeBytesAtomic(joinPath(created.folder, "original.png"), args.original);
  await fs.writeBytesAtomic(joinPath(created.folder, "export.png"), args.result);
  const meta: FigureMeta = { ...created.meta, crop: args.crop };
  if (args.from) {
    meta.derived_from = args.from.id;
    meta.tags = [...args.from.tags];
    if (args.from.source) meta.source = structuredClone(args.from.source);
    if (args.from.license) meta.license = args.from.license;
    if (args.from.caption) meta.caption = args.from.caption;
  }
  const saved = await saveMeta(fs, created.folder, meta, { now: args.now, host: args.host });
  return { folder: created.folder, meta: saved };
}
