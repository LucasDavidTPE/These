/**
 * Renumérotation d'une figure dont l'ID est en double (QUESTIONS.md, Q5) : le dossier
 * est renommé avec le nouvel ID et meta.json réécrit.
 */
import type { FileOp } from "./conflicts";
import { figureFolderName } from "./ids";
import { serializeMeta, type FigureMeta } from "./meta";
import { joinPath } from "./paths";

export function planRenumber(folder: string, meta: FigureMeta, newId: string, now: string, host: string): FileOp[] {
  const to = figureFolderName(newId, meta.title);
  const updated: FigureMeta = { ...meta, id: newId, modified: now, last_host: host };
  return [
    { op: "rename", from: folder, to },
    { op: "write", path: joinPath(to, "meta.json"), content: serializeMeta(updated) },
  ];
}
