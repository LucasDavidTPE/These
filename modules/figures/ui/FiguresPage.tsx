import { PageAVenir } from "@interface/composants";
import { useContexte } from "@interface/contexte";

export function FiguresPage() {
  const ctx = useContexte();
  return (
    <PageAVenir
      titre="Figures"
      resume="Bibliothèque de figures, détourage, schémas TikZ, recadrage, graphes"
      phase="P1"
      prevu={[
        "Figurine 1.0 reprise telle quelle : bibliothèque, détourage, schéma, recadrage, graphes, exports TikZ / SVG / PNG / pgfplots",
        "La bibliothèque de figures actuelle est rouverte sans conversion",
        "« Enregistrer dans Figures » depuis les autres modules (courbe maîtresse, graphe d'essai, Gantt)",
      ]}
      enAttendant={<p>Figurine 1.0 reste installée et utilisable. Sa bibliothèque sera reprise telle quelle : choisissez déjà son dossier dans les <button type="button" className="lien" onClick={() => ctx.naviguer("reglages")}>réglages du poste</button>.</p>}
    />
  );
}
