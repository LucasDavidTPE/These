import { IconeBibliotheque } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { BibliothequePage } from "./ui/BibliothequePage";

const bibliotheque: Manifeste = {
  id: "bibliotheque",
  titre: "Bibliothèque",
  resume: "Références, plan de lecture, fiches, demandes, analyse croisée",
  Icone: IconeBibliotheque,
  Page: BibliothequePage,
  aVenir: "P3",
};

export default bibliotheque;
