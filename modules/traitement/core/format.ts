/** Mise en forme française des nombres, unique point de vérité de l'affichage (portage de ui/format.js). */
export { nb, puissance } from "@noyau/graphe";

export function freq(f: number): string {
  return String(f).replace(".", ",");
}

export function entier(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("fr-FR") : "—";
}
