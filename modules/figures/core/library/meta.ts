/**
 * Type et validation de `meta.json` (SPEC §3).
 *
 * La validation est tolérante : un fichier écrit par une version plus récente de
 * l'appli (champs inconnus) reste lisible, et ces champs sont conservés à la
 * réécriture pour ne rien perdre entre les deux PC.
 */
import { isIsoDateTime } from "./dates";
import { parseFigureId } from "./ids";

export const FIGURE_KINDS = ["schema", "image", "graph", "crop"] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

export const SOURCE_TYPES = ["own", "web", "article", "other"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export interface FigureSource {
  type: SourceType;
  url?: string;
  /** Clé de la bibliographie de l'utilisateur, « BIB-042 ». */
  bib?: string;
  author?: string;
  year?: number;
  note?: string;
  /** Champs inconnus, conservés tels quels. */
  [extra: string]: unknown;
}

export interface FigureMeta {
  id: string;
  title: string;
  kind: FigureKind;
  created: string;
  modified: string;
  tags: string[];
  source?: FigureSource;
  license?: string;
  caption?: string;
  used_in: string[];
  last_host?: string;
  /** Figure d'origine (recadrage, S8). */
  derived_from?: string;
  /** Champs inconnus, conservés tels quels. */
  [extra: string]: unknown;
}

export interface ValidationError {
  /** Chemin du champ fautif, « source.year ». */
  path: string;
  message: string;
}

export type MetaResult = { ok: true; meta: FigureMeta } | { ok: false; errors: ValidationError[] };

const BIB_RE = /^BIB-\d+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateMeta(raw: unknown): MetaResult {
  const errors: ValidationError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: "", message: "meta.json doit contenir un objet JSON." }] };
  }

  const str = (key: string, required: boolean): string | undefined => {
    const v = raw[key];
    if (v === undefined || v === null) {
      if (required) err(key, "champ obligatoire manquant.");
      return undefined;
    }
    if (typeof v !== "string") {
      err(key, "doit être du texte.");
      return undefined;
    }
    return v;
  };

  const strList = (key: string): string[] => {
    const v = raw[key];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) {
      err(key, "doit être une liste.");
      return [];
    }
    const out: string[] = [];
    v.forEach((item, i) => {
      if (typeof item === "string") out.push(item);
      else err(`${key}[${i}]`, "doit être du texte.");
    });
    return out;
  };

  const id = str("id", true);
  if (id !== undefined && parseFigureId(id) === null) err("id", `« ${id} » n'est pas un ID de la forme FIG-0007.`);

  const title = str("title", true);
  if (title !== undefined && title.trim() === "") err("title", "ne doit pas être vide.");

  const kind = str("kind", true);
  if (kind !== undefined && !(FIGURE_KINDS as readonly string[]).includes(kind)) {
    err("kind", `« ${kind} » inconnu (attendu : ${FIGURE_KINDS.join(", ")}).`);
  }

  const created = str("created", true);
  if (created !== undefined && !isIsoDateTime(created)) err("created", "date ISO 8601 avec fuseau attendue.");
  const modified = str("modified", true);
  if (modified !== undefined && !isIsoDateTime(modified)) err("modified", "date ISO 8601 avec fuseau attendue.");

  const tags = strList("tags");
  const usedIn = strList("used_in");
  const license = str("license", false);
  const caption = str("caption", false);
  const lastHost = str("last_host", false);
  const derivedFrom = str("derived_from", false);
  if (derivedFrom !== undefined && parseFigureId(derivedFrom) === null) err("derived_from", `« ${derivedFrom} » n'est pas un ID de la forme FIG-0007.`);

  let source: FigureSource | undefined;
  if (raw.source !== undefined && raw.source !== null) {
    source = validateSource(raw.source, err);
  }

  if (errors.length > 0) return { ok: false, errors };

  const meta: FigureMeta = {
    ...raw,
    id: id!,
    title: title!,
    kind: kind as FigureKind,
    created: created!,
    modified: modified!,
    tags,
    used_in: usedIn,
  };
  for (const [key, value] of [
    ["source", source],
    ["license", license],
    ["caption", caption],
    ["last_host", lastHost],
    ["derived_from", derivedFrom],
  ] as const) {
    if (value === undefined) delete meta[key];
    else (meta as Record<string, unknown>)[key] = value;
  }
  return { ok: true, meta };
}

function validateSource(raw: unknown, err: (path: string, message: string) => void): FigureSource | undefined {
  if (!isRecord(raw)) {
    err("source", "doit être un objet.");
    return undefined;
  }
  const out: Record<string, unknown> = { ...raw };
  const type = raw.type ?? "other";
  if (typeof type !== "string" || !(SOURCE_TYPES as readonly string[]).includes(type)) {
    err("source.type", `« ${String(type)} » inconnu (attendu : ${SOURCE_TYPES.join(", ")}).`);
  }
  out.type = type;
  for (const key of ["url", "bib", "author", "note"] as const) {
    const v = raw[key];
    if (v === undefined || v === null) delete out[key];
    else if (typeof v !== "string") err(`source.${key}`, "doit être du texte.");
  }
  if (typeof raw.bib === "string" && !BIB_RE.test(raw.bib)) {
    err("source.bib", `« ${raw.bib} » ne suit pas la convention BIB-042.`);
  }
  const year = raw.year;
  if (year === undefined || year === null) delete out.year;
  else if (typeof year !== "number" || !Number.isInteger(year) || year < 1000 || year > 9999) {
    err("source.year", "doit être une année sur 4 chiffres.");
  }
  return out as unknown as FigureSource;
}

/** Ordre des clés à l'écriture : celui de la SPEC, puis les champs inconnus triés. */
const KEY_ORDER = [
  "id",
  "title",
  "kind",
  "created",
  "modified",
  "tags",
  "source",
  "license",
  "caption",
  "used_in",
  "last_host",
  "derived_from",
];
const SOURCE_KEY_ORDER = ["type", "url", "bib", "author", "year", "note"];

function ordered(obj: Record<string, unknown>, order: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of order) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj).filter((k) => !order.includes(k)).sort()) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/**
 * Sérialisation stable de meta.json : même contenu → mêmes octets (ordre des clés fixe,
 * indentation 2, fin de ligne finale). Limite le bruit de synchronisation OneDrive.
 */
export function serializeMeta(meta: FigureMeta): string {
  const top = ordered(meta, KEY_ORDER);
  if (meta.source) top.source = ordered({ ...meta.source }, SOURCE_KEY_ORDER);
  return JSON.stringify(top, null, 2) + "\n";
}

/** Nouvelle fiche minimale pour une figure qu'on crée. */
export function newMeta(args: { id: string; title: string; kind: FigureKind; now: string; host: string }): FigureMeta {
  return {
    id: args.id,
    title: args.title,
    kind: args.kind,
    created: args.now,
    modified: args.now,
    tags: [],
    used_in: [],
    last_host: args.host,
  };
}
