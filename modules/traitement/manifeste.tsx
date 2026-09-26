import { IconeTraitement } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { TraitementPage } from "./ui/TraitementPage";
import "./ui/traitement.css";

const traitement: Manifeste = {
  id: "traitement",
  titre: "Traitement 2S2P1D",
  resume: "Dépouillement de module complexe et calage 2S2P1D, Huet-Sayegh, KVG",
  Icone: IconeTraitement,
  Page: TraitementPage,
};

export default traitement;
