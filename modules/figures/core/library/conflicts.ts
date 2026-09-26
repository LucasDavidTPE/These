/**
 * Copies de conflit OneDrive (SPEC §4).
 *
 * Quand le même fichier a été modifié sur deux PC, OneDrive garde les deux et renomme
 * l'un en ajoutant le nom du poste : `figure-PC-MAISON.json`, puis `figure-PC-MAISON-1.json`…
 * On reconnaît aussi les copies de l'Explorateur (`meta - Copie.json`, `meta (2).json`),
 * qui ont la même conséquence : deux versions du même fichier.
 */
import { joinPath } from "./paths";

/** Fichiers attendus dans un dossier de figure (SPEC §4 ; graph.json pour les graphes, S9). */
export const FIGURE_FILES = [
  "figure.json",
  "graph.json",
  "meta.json",
  "original.png",
  "export.tex",
  "export.svg",
  "export.png",
] as const;

/** Fichier de préférences partagées à la racine. */
export const LIBRARY_FILE = "figurine-library.json";

/** Dossier (dans une figure) où sont rangées les versions écartées lors d'un conflit. */
export const CONFLICT_ARCHIVE_DIR = ".conflits";

export interface ConflictCopy {
  /** Nom du fichier canonique, « meta.json ». */
  original: string;
  /** Nom de la copie, « meta-PC-MAISON.json ». */
  copy: string;
  /** Ce qui distingue la copie : le nom du poste pour OneDrive, « (2) » ou « Copie » sinon. */
  tag: string;
}

const SUFFIX_PATTERNS: RegExp[] = [
  // OneDrive : « -NOMPC » ou « -NOMPC-2 ». Noms de poste Windows : lettres, chiffres, tirets.
  /^-([A-Za-z0-9][A-Za-z0-9_-]*)$/,
  // Explorateur Windows : « (2) », « - Copie », « - Copie (2) », « - Copy ».
  /^ (\(\d+\))$/,
  /^ - (Cop(?:ie|y)(?: \(\d+\))?)$/,
];

function splitName(name: string): [stem: string, ext: string] {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? [name, ""] : [name.slice(0, dot), name.slice(dot)];
}

/** Si `name` est une copie de conflit de l'un des `originals`, la décrit ; sinon null. */
export function detectConflictCopy(name: string, originals: readonly string[]): ConflictCopy | null {
  if (originals.includes(name)) return null;
  const [stem, ext] = splitName(name);
  for (const original of originals) {
    const [oStem, oExt] = splitName(original);
    if (ext.toLowerCase() !== oExt.toLowerCase() || !stem.startsWith(oStem)) continue;
    const rest = stem.slice(oStem.length);
    for (const re of SUFFIX_PATTERNS) {
      const m = re.exec(rest);
      if (m) return { original, copy: name, tag: m[1]! };
    }
  }
  return null;
}

/** Vrai pour un fichier temporaire d'écriture atomique resté en place (écriture interrompue). */
export function isLeftoverTemp(name: string): boolean {
  return name.endsWith(".tmp");
}

export type FileOp =
  | { op: "mkdir"; path: string }
  | { op: "rename"; from: string; to: string }
  | { op: "write"; path: string; content: string };

/**
 * Plan de résolution d'un conflit : la version choisie prend le nom canonique, l'autre
 * est rangée dans `.conflits/` (rien n'est supprimé). `stamp` rend le nom d'archive unique
 * (par exemple « 2026-09-25T17-02-00 »).
 */
export function planConflictResolution(
  folder: string,
  conflict: ConflictCopy,
  keep: "original" | "copy",
  stamp: string,
  archiveExists: boolean,
): FileOp[] {
  const safeStamp = stamp.replace(/[^0-9A-Za-z-]/g, "-");
  const archive = joinPath(folder, CONFLICT_ARCHIVE_DIR);
  const ops: FileOp[] = archiveExists ? [] : [{ op: "mkdir", path: archive }];
  const orig = joinPath(folder, conflict.original);
  const copy = joinPath(folder, conflict.copy);
  if (keep === "original") {
    ops.push({ op: "rename", from: copy, to: joinPath(archive, `${safeStamp}_${conflict.copy}`) });
  } else {
    ops.push({ op: "rename", from: orig, to: joinPath(archive, `${safeStamp}_${conflict.original}`) });
    ops.push({ op: "rename", from: copy, to: orig });
  }
  return ops;
}
