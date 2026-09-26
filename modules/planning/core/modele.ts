/**
 * Planning de la thèse (SPEC §10) : phases, tâches et jalons, un fichier par élément dans
 * `planning/`, et les catégories dans `planning/categories.json`. Partagé entre les deux
 * PC par OneDrive, sans aucun service extérieur.
 */
import type { DefinitionCollection } from "@noyau/stockage";

export interface Element {
  titre: string;
  categorie: string;
  /** « AAAA-MM-JJ ». */
  debut: string;
  /** « AAAA-MM-JJ » ; vide pour un jalon. */
  fin: string;
  /** Désactivé : masqué partout, sans être supprimé. Partagé entre les deux PC. */
  actif: boolean;
  /** 0 à 100. */
  avancement: number;
  notes: string;
  /** ID de l'élément parent (une phase contient des tâches) ; vide sinon. */
  parent: string;
}

export interface Categorie {
  id: string;
  nom: string;
  couleur: string;
  active: boolean;
}

export const CATEGORIES_PAR_DEFAUT: Categorie[] = [
  { id: "biblio", nom: "Bibliographie", couleur: "#2f5f8a", active: true },
  { id: "essais", nom: "Campagne d'essais", couleur: "#b0602c", active: true },
  { id: "modelisation", nom: "Modélisation", couleur: "#6b4fa0", active: true },
  { id: "redaction", nom: "Rédaction", couleur: "#2e7d4f", active: true },
  { id: "reunion", nom: "Réunion / comité de suivi", couleur: "#8a5a00", active: true },
  { id: "congres", nom: "Congrès", couleur: "#a8326e", active: true },
  { id: "formation", nom: "Formation", couleur: "#4f7a8a", active: true },
  { id: "enseignement", nom: "Enseignement", couleur: "#7a7a2e", active: true },
  { id: "conges", nom: "Congés", couleur: "#888888", active: true },
];

export const DOSSIER_PLANNING = "planning";
export const FICHIER_CATEGORIES = `${DOSSIER_PLANNING}/categories.json`;
/** Éléments supprimés : rangés ici, jamais effacés. */
export const DOSSIER_SUPPRIMES = `${DOSSIER_PLANNING}/.supprimes`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function lireElement(b: Record<string, unknown>): Element {
  if (typeof b.titre !== "string") throw new Error("Champ « titre » manquant.");
  if (typeof b.debut !== "string" || !DATE.test(b.debut)) throw new Error("Date de début invalide.");
  const fin = typeof b.fin === "string" && DATE.test(b.fin) && b.fin >= b.debut ? b.fin : "";
  const av = typeof b.avancement === "number" ? Math.max(0, Math.min(100, b.avancement)) : 0;
  return {
    titre: b.titre,
    categorie: typeof b.categorie === "string" ? b.categorie : "",
    debut: b.debut,
    fin,
    actif: b.actif !== false,
    avancement: av,
    notes: typeof b.notes === "string" ? b.notes : "",
    parent: typeof b.parent === "string" ? b.parent : "",
  };
}

export function lireCategories(brut: unknown): Categorie[] {
  if (!Array.isArray(brut)) return CATEGORIES_PAR_DEFAUT;
  const out = brut
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .filter((c) => typeof c.id === "string" && typeof c.nom === "string")
    .map((c) => ({
      id: c.id as string,
      nom: c.nom as string,
      couleur: typeof c.couleur === "string" && /^#[0-9a-fA-F]{6}$/.test(c.couleur) ? c.couleur : "#777777",
      active: c.active !== false,
    }));
  return out.length ? out : CATEGORIES_PAR_DEFAUT;
}

export const ELEMENTS: DefinitionCollection<Element> = { dossier: DOSSIER_PLANNING, format: { prefixe: "PH-", chiffres: 4 }, lire: lireElement };

export const estJalon = (e: Pick<Element, "fin">) => e.fin === "";
