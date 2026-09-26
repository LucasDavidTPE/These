/**
 * Remplissage d'une référence depuis son DOI (SPEC §9.3) : métadonnées Crossref, sur
 * demande explicite seulement. La réponse est convertie ici (pur, testé) ; l'appel réseau
 * est fait par l'interface.
 */
import type { Reference } from "./modele";

export const urlCrossref = (doi: string) => `https://api.crossref.org/works/${encodeURIComponent(doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//, ""))}`;

const TYPES: Record<string, string> = {
  "journal-article": "JOUR",
  "proceedings-article": "CONF",
  "book-chapter": "CHAP",
  book: "BOOK",
  monograph: "BOOK",
  dissertation: "THES",
  report: "RPRT",
  standard: "STAND",
};

type Crossref = {
  message?: {
    DOI?: string;
    title?: string[];
    author?: { family?: string; given?: string; name?: string }[];
    issued?: { "date-parts"?: number[][] };
    "container-title"?: string[];
    volume?: string;
    issue?: string;
    page?: string;
    publisher?: string;
    type?: string;
    URL?: string;
  };
};

const initiales = (prenom: string) =>
  prenom
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0]!.toUpperCase()}.`)
    .join(" ");

/** Champs de métadonnées tirés de la réponse Crossref (le reste de la référence est gardé). */
export function depuisCrossref(json: unknown): Partial<Reference> {
  const m = (json as Crossref).message;
  if (!m) throw new Error("Réponse Crossref inattendue.");
  const auteurs = (m.author ?? []).map((a) => (a.family ? `${a.family}${a.given ? `, ${initiales(a.given)}` : ""}` : (a.name ?? ""))).filter(Boolean);
  return {
    doi: m.DOI ?? "",
    titre: m.title?.[0]?.replace(/\s+/g, " ").trim() ?? "",
    auteurs: auteurs.join("; "),
    annee: m.issued?.["date-parts"]?.[0]?.[0] ?? null,
    support: m["container-title"]?.[0] ?? "",
    volume: m.volume ?? "",
    numero: m.issue ?? "",
    pages: m.page ?? "",
    editeur: m.publisher ?? "",
    typeRis: TYPES[m.type ?? ""] ?? "GEN",
    url: m.DOI ? `https://doi.org/${m.DOI}` : (m.URL ?? ""),
    typeLien: "Page éditeur (DOI)",
    verification: "Vérifié",
    sourceVerification: "Crossref (DOI)",
  };
}

/** Clé BibTeX à la manière du classeur : nom du premier auteur + année + premier mot du titre. */
export function cleProposee(r: Pick<Reference, "auteurs" | "annee" | "titre">): string {
  const nom = (r.auteurs.split(/[;,]/)[0] ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").toLowerCase();
  const mot = (r.titre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z]{4,}/g) ?? []).find((w) => !["with", "from", "that", "this", "pour", "dans", "avec", "des"].includes(w)) ?? "";
  return `${nom}${r.annee ?? ""}${mot}`;
}
