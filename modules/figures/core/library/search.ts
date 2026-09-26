/**
 * Recherche plein texte et filtres de la bibliothèque (S2).
 * Insensible à la casse et aux accents ; tous les mots doivent être trouvés.
 */
import type { FigureKind } from "./meta";
import type { FigureEntry } from "./scan";

export interface LibraryFilter {
  query: string;
  /** Types retenus ; vide = tous. */
  kinds: FigureKind[];
  /** Seulement les figures sans source ou sans licence (préparation d'un manuscrit). */
  missingSourceOrLicense: boolean;
}

export type LibrarySort = "modified" | "id" | "title";

export const EMPTY_FILTER: LibraryFilter = { query: "", kinds: [], missingSourceOrLicense: false };

/** Minuscules, sans accents, espaces normalisés. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texte dans lequel on cherche : titre, tags, source, légende, usages, ID, dossier. */
export function searchableText(entry: FigureEntry): string {
  const m = entry.meta;
  const parts = [entry.id, entry.folder];
  if (m) {
    parts.push(m.title, ...m.tags, ...m.used_in, m.caption ?? "", m.license ?? "");
    if (m.source) parts.push(m.source.author ?? "", m.source.url ?? "", m.source.bib ?? "", m.source.note ?? "", String(m.source.year ?? ""));
  }
  return normalizeText(parts.join(" "));
}

const UNKNOWN_LICENSES = new Set(["", "inconnue", "inconnu", "?"]);

/**
 * Une figure « à compléter » : pas de source du tout, ou une source extérieure sans
 * licence connue. Une figure dont meta.json est invalide est aussi à reprendre.
 */
export function lacksSourceOrLicense(entry: FigureEntry): boolean {
  const m = entry.meta;
  if (!m) return true;
  if (!m.source) return true;
  if (m.source.type === "own") return false;
  return UNKNOWN_LICENSES.has(normalizeText(m.license ?? ""));
}

export function matchesFilter(entry: FigureEntry, filter: LibraryFilter): boolean {
  if (filter.kinds.length > 0 && (!entry.meta || !filter.kinds.includes(entry.meta.kind))) return false;
  if (filter.missingSourceOrLicense && !lacksSourceOrLicense(entry)) return false;
  const words = normalizeText(filter.query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = searchableText(entry);
  return words.every((w) => text.includes(w));
}

export function filterAndSort(entries: readonly FigureEntry[], filter: LibraryFilter, sort: LibrarySort): FigureEntry[] {
  const out = entries.filter((e) => matchesFilter(e, filter));
  const byId = (a: FigureEntry, b: FigureEntry) => cmp(a.id.length, b.id.length) || cmp(a.id, b.id) || cmp(a.folder, b.folder);
  switch (sort) {
    case "id":
      return out.sort(byId);
    case "title":
      return out.sort((a, b) => cmp(normalizeText(a.meta?.title ?? a.folder), normalizeText(b.meta?.title ?? b.folder)) || byId(a, b));
    case "modified":
      // Les plus récentes d'abord ; les dates ISO se comparent après conversion.
      return out.sort((a, b) => cmp(time(b), time(a)) || byId(a, b));
  }
}

function time(e: FigureEntry): number {
  const t = e.meta ? Date.parse(e.meta.modified) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

function cmp<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Fichier à afficher en vignette : export.png, sinon export.svg, sinon original.png. */
export function thumbnailFile(entry: FigureEntry): string | null {
  for (const f of ["export.png", "export.svg", "original.png"]) if (entry.files.includes(f)) return f;
  return null;
}
