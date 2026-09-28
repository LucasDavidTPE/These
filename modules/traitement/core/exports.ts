/** Classeur exporté par « Exporter .xlsx » : feuilles Data, Calcul et Modele (comme la page d'origine). */
import type { Feuille, Valeur } from "@noyau/formats/xlsx-ecriture";
import { tableauCalcul, tableauData, tableauModele, type Cellule, type Essai } from "./essai";

const feuille = (nom: string, lignes: Cellule[][]): Feuille => {
  const [entetes = [], ...reste] = lignes;
  const v = (c: Cellule): Valeur => (c === undefined ? null : c);
  return { nom, entetes: entetes.map((c) => (c === null || c === undefined ? "" : String(c))), lignes: reste.map((l) => l.map(v)) };
};

export function feuillesEssai(e: Essai): Feuille[] {
  return [feuille("Data", tableauData(e)), feuille("Calcul", tableauCalcul(e)), feuille("Modele", tableauModele(e))];
}
