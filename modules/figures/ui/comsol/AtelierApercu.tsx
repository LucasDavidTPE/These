/**
 * Aperçu en direct d'un tracé de l'atelier COMSOL (le graphe tel qu'il partira dans Graphes), cliquable au besoin
 * (placer des profils sur une carte), et bouton « Continuer dans Graphes ».
 */
import { useMemo, useState } from "react";
import { exportGraphSvg, graphLayout, versDonnees } from "../../core/graph";
import { envoyerVersGraphes, type Resultat } from "./atelierCalcul";

export function AtelierApercu({ resultat, onClic, aide, sansEnvoi, petit }: { resultat: Resultat; onClic?: (x: number, y: number) => void; aide?: string; sansEnvoi?: boolean; petit?: boolean }) {
  const [titre, setTitre] = useState<string | null>(null);
  // le titre saisi tient tant que le titre proposé ne change pas (autre grandeur, autres fichiers…)
  const propose = resultat && "doc" in resultat ? resultat.titre : "";
  const [vu, setVu] = useState(propose);
  if (vu !== propose) {
    setVu(propose);
    setTitre(null);
  }
  const rendu = useMemo(() => {
    if (!resultat || !("doc" in resultat)) return null;
    try {
      return { svg: exportGraphSvg(resultat.doc).replace(/<\?xml[^>]*>/, ""), layout: graphLayout(resultat.doc), erreur: "" };
    } catch (e) {
      return { svg: "", layout: null, erreur: e instanceof Error ? e.message : String(e) };
    }
  }, [resultat]);

  if (!resultat) return <div className="atelier-apercu vide">{aide ?? "Choisissez ce qu'il faut tracer : l'aperçu apparaît ici."}</div>;
  if ("erreur" in resultat) return <div className="atelier-apercu vide erreur">{resultat.erreur}</div>;
  const doc = resultat.doc;
  const clic = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!onClic || !rendu?.layout) return;
    const svg = ev.currentTarget.querySelector("svg");
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const p = versDonnees(doc, rendu.layout, ((ev.clientX - r.left) / r.width) * doc.width, ((ev.clientY - r.top) / r.height) * doc.height);
    if (p.dedans) onClic(p.x, p.y);
  };
  return (
    <div className={`atelier-apercu${petit ? " petit" : ""}`}>
      {aide ? <p className="muted small">{aide}</p> : null}
      {rendu?.erreur ? <p className="banner error">{rendu.erreur}</p> : null}
      {rendu?.svg ? <div className={`atelier-svg${onClic ? " cliquable" : ""}`} onClick={clic} dangerouslySetInnerHTML={{ __html: rendu.svg }} /> : null}
      {sansEnvoi ? null : (
        <div className="atelier-envoi">
          <input value={titre ?? resultat.titre} onChange={(e) => setTitre(e.target.value)} aria-label="Titre du graphe" title="Titre dans la bibliothèque" />
          <button type="button" className="primary" onClick={() => envoyerVersGraphes(doc, titre ?? resultat.titre)} title="Ouvre ce graphe dans Graphes : axes, couleurs, repères, taille… puis « Enregistrer »">
            Continuer dans Graphes →
          </button>
        </div>
      )}
    </div>
  );
}
