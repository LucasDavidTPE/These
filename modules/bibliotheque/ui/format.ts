/** Mise en forme et filtres, partagés par les vues. */

export const pourcent = (x: number) => `${Math.round(x * 100)} %`;
export const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

export interface Filtres {
  texte: string;
  axe: string;
  mois: string;
  statut: string;
  priorite: string;
  etat: string;
  tri: "score" | "id";
}

export const FILTRES_VIDES: Filtres = { texte: "", axe: "", mois: "", statut: "", priorite: "", etat: "", tri: "id" };
