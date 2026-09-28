/**
 * Modèles de graphes : une bande compacte de vignettes, repliée par défaut (ce n'est pas
 * l'essentiel de la page). Un clic remplace le graphe par le modèle, valeurs d'exemple
 * comprises.
 */
import { useMemo, useState } from "react";
import { exportGraphSvg, GRAPH_TEMPLATES } from "../../core/graph";
import { useGraph } from "./useGraph";

export function Modeles() {
  const s = useGraph();
  const [ouvert, setOuvert] = useState(false);
  const vignettes = useMemo(() => (ouvert ? GRAPH_TEMPLATES.map((t) => ({ t, svg: exportGraphSvg(t.doc).replace(/<\?xml[^>]*>/, "") })) : []), [ouvert]);

  function choisir(i: number) {
    const t = GRAPH_TEMPLATES[i]!;
    if (s.doc.series.length && !window.confirm(`Remplacer le graphe en cours par le modèle « ${t.name} » ?`)) return;
    s.fromTemplate(t.doc, t.name);
    setOuvert(false);
  }

  return (
    <div className="modeles-graphes">
      <button type="button" className="small-btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? "▾" : "▸"} Modèles de graphes
      </button>
      {ouvert ? (
        <div className="modeles-bande" role="list">
          {vignettes.map(({ t, svg }, i) => (
            <button key={t.id} type="button" role="listitem" className="modele-vignette" title={`${t.note} — valeurs d'exemple`} onClick={() => choisir(i)}>
              <span className="modele-image" dangerouslySetInnerHTML={{ __html: svg }} />
              <span className="modele-nom">{t.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
