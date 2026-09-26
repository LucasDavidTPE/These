import { PageAVenir } from "@interface/composants";

export function BibliothequePage() {
  return (
    <PageAVenir
      titre="Bibliothèque"
      resume="Références, plan de lecture, fiches, demandes, analyse croisée"
      phase="P3"
      prevu={[
        "Import du classeur Biblio_These_Lucas_MAITRE.xlsx, relançable jusqu'à la bascule",
        "Tableau de bord, références, fiche de lecture et notes, plan de lecture par mois",
        "Demandes (PEB, ENTPE, STAC), corrections TFE, pistes, analyse croisée",
        "Exports RIS et BibTeX ; états et scores identiques à ceux d'Excel, vérifiés par des tests",
      ]}
      enAttendant={<p>Continuez dans le classeur Excel : l'import sera relançable, rien de ce que vous y saisissez d'ici là ne sera perdu.</p>}
    />
  );
}
