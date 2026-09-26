/**
 * Formulaire d'édition de meta.json (panneau de métadonnées, S2) : tous les champs en
 * texte, convertis et validés ici pour que l'interface n'ait aucune logique.
 */
import { validateMeta, type FigureMeta, type MetaResult, type SourceType } from "./meta";

export interface MetaForm {
  title: string;
  /** Tags séparés par des virgules. */
  tags: string;
  sourceType: SourceType | "";
  url: string;
  bib: string;
  author: string;
  year: string;
  note: string;
  license: string;
  caption: string;
  /** Un usage par ligne. */
  usedIn: string;
}

/** Licences proposées dans la liste déroulante (texte libre accepté). */
export const LICENSE_SUGGESTIONS = [
  "inconnue",
  "CC-BY",
  "CC-BY-SA",
  "CC-BY-NC",
  "CC0",
  "domaine public",
  "autorisation obtenue",
  "tous droits réservés",
];

/** « a, b ,, a » → ["a", "b"] : sans vides ni doublons, ordre conservé. */
export function parseList(text: string, separator: RegExp): string[] {
  const out: string[] = [];
  for (const raw of text.split(separator)) {
    const v = raw.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

export function metaToForm(meta: FigureMeta): MetaForm {
  const s = meta.source;
  return {
    title: meta.title,
    tags: meta.tags.join(", "),
    sourceType: s?.type ?? "",
    url: s?.url ?? "",
    bib: s?.bib ?? "",
    author: s?.author ?? "",
    year: s?.year !== undefined ? String(s.year) : "",
    note: s?.note ?? "",
    license: meta.license ?? "",
    caption: meta.caption ?? "",
    usedIn: meta.used_in.join("\n"),
  };
}

/** Applique le formulaire à `meta` et valide le résultat (erreurs par champ). */
export function formToMeta(meta: FigureMeta, form: MetaForm): MetaResult {
  const raw: Record<string, unknown> = {
    ...meta,
    title: form.title.trim(),
    tags: parseList(form.tags, /[,;]/),
    used_in: parseList(form.usedIn, /\n/),
    license: form.license.trim() || undefined,
    caption: form.caption.trim() || undefined,
  };
  if (form.sourceType === "") {
    delete raw.source;
  } else {
    const year = form.year.trim();
    raw.source = {
      ...(meta.source ?? {}),
      type: form.sourceType,
      url: form.url.trim() || undefined,
      bib: form.bib.trim() || undefined,
      author: form.author.trim() || undefined,
      year: year === "" ? undefined : /^\d+$/.test(year) ? Number(year) : year,
      note: form.note.trim() || undefined,
    };
  }
  return validateMeta(JSON.parse(JSON.stringify(raw)));
}
