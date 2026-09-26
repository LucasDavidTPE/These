import { IconeAccueil } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { AccueilPage } from "./ui/AccueilPage";

const accueil: Manifeste = {
  id: "accueil",
  titre: "Accueil",
  resume: "Les modules, ce qui est à régler, l'état du poste",
  Icone: IconeAccueil,
  Page: AccueilPage,
};

export default accueil;
