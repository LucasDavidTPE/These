import { PageAVenir } from "@interface/composants";

export function PlanningPage() {
  return (
    <PageAVenir
      titre="Planning"
      resume="Gantt de la thèse, partagé entre les deux PC"
      phase="P4"
      prevu={[
        "Phases, tâches et jalons, par catégorie (bibliographie, campagnes, rédaction, réunions…)",
        "Chaque élément et chaque catégorie s'active ou se désactive d'un clic",
        "Mois de lecture et périodes de campagne ajoutés automatiquement",
        "Exports PNG, SVG et pgfgantt",
      ]}
      enAttendant={<p>Le plan de lecture du classeur Excel reste la référence pour la bibliographie.</p>}
    />
  );
}
