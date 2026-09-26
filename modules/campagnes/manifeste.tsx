import { IconeCampagnes } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { CampagnesPage } from "./ui/CampagnesPage";

const campagnes: Manifeste = {
  id: "campagnes",
  titre: "Campagnes",
  resume: "Campagnes d'essais, données brutes, notes et photos",
  Icone: IconeCampagnes,
  Page: CampagnesPage,
  aVenir: "P5",
};

export default campagnes;
