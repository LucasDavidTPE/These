import { PageAVenir } from "@interface/composants";

export function CampagnesPage() {
  return (
    <PageAVenir
      titre="Campagnes"
      resume="Campagnes d'essais, données brutes, notes et photos"
      phase="P5"
      prevu={[
        "Galerie des campagnes avec aperçu des données, page de campagne, une carte par essai",
        "Découverte des essais dans les dossiers de données (racine « essais »)",
        "Viewer de courbes, export Excel, copie des données brutes",
        "Carnet : notes datées et images par campagne et par essai",
      ]}
      enAttendant={<p>Le tableau de bord de these-lgcb reste utilisable ; ses fiches de campagne seront importées.</p>}
    />
  );
}
