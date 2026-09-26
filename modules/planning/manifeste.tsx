import { IconePlanning } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import { PlanningPage } from "./ui/PlanningPage";

const planning: Manifeste = {
  id: "planning",
  titre: "Planning",
  resume: "Gantt de la thèse, partagé entre les deux PC",
  Icone: IconePlanning,
  Page: PlanningPage,
  aVenir: "P4",
};

export default planning;
