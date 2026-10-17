/**
 * Aperçu en direct d'un tracé de l'atelier COMSOL (le graphe tel qu'il partira dans Graphes), cliquable au besoin
 * (placer des profils sur une carte), et « Continuer dans Graphes » : la recette est gardée dans l'étude, et la
 * figure saura se régénérer quand COMSOL réexportera les fichiers.
 */
import { useMemo, useState } from "react";
import { useContexte } from "@interface/contexte";
import { ecrireClasseur, type Feuille } from "@noyau/formats/xlsx-ecriture";
import { exportGraphSvg, feuilleBassins, feuilleCriteres, feuilleMaillage, feuilleSensibilite, feuilleSynthese, feuillesGraphe, graphLayout, nomDeFichier, versDonnees, type GraphDoc, type ResultatTrace, type Trace } from "../../core/graph";
import { envoyerVersGraphes, type Resultat } from "./atelierCalcul";
import { useAtelier } from "./useAtelier";

export function AtelierApercu({
  resultat,
  trace,
  onClic,
  onSurvol,
  aide,
  petit,
}: {
  resultat: Resultat | { doc: GraphDoc; titre: string };
  trace?: Trace;
  onClic?: (x: number, y: number) => void;
  /** Position survolée, dans les unités des axes (null : hors des axes, ou souris sortie). */
  onSurvol?: (p: { x: number; y: number } | null) => void;
  aide?: string;
  petit?: boolean;
}) {
  const [titre, setTitre] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const ctx = useContexte();
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
  const position = (ev: React.MouseEvent<HTMLDivElement>) => {
    const svg = ev.currentTarget.querySelector("svg");
    if (!svg || !rendu?.layout) return null;
    const r = svg.getBoundingClientRect();
    const p = versDonnees(doc, rendu.layout, ((ev.clientX - r.left) / r.width) * doc.width, ((ev.clientY - r.top) / r.height) * doc.height);
    return p.dedans ? p : null;
  };
  const clic = (ev: React.MouseEvent<HTMLDivElement>) => {
    const p = onClic ? position(ev) : null;
    if (p) onClic!(p.x, p.y);
  };
  const survol = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (!onSurvol) return;
    const p = position(ev);
    onSurvol(p ? { x: p.x, y: p.y } : null);
  };
  // données du graphe et tableaux calculés, pour Excel
  const excel = async () => {
    const r = resultat as ResultatTrace;
    const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
    const feuilles: Feuille[] = [
      ...(r.lignes ? [feuilleSynthese(r.lignes, useAtelier.getState().cadre.longueur)] : []),
      ...(r.tableau ? [feuilleCriteres(r.tableau)] : []),
      ...(r.bassins ? [feuilleBassins(r.bassins, r.ecartsMesure)] : []),
      ...(r.maillage ? [feuilleMaillage(r.maillage, sansExt)] : []),
      ...(r.sensibilite && trace?.mode === "sensibilite" ? [feuilleSensibilite(r.sensibilite, trace.parametre ?? "paramètre")] : []),
      ...feuillesGraphe(doc),
    ];
    const nom = nomDeFichier(titre ?? resultat.titre);
    await ctx.plateforme.enregistrerSous(`${nom}.xlsx`, ecrireClasseur(feuilles));
  };
  const continuer = async () => {
    const t = titre ?? resultat.titre;
    setEnvoi(true);
    // la recette rejoint l'étude (créée au besoin) : la figure pourra se régénérer
    const origine = trace ? await useAtelier.getState().sauverRecette(t, trace) : null;
    setEnvoi(false);
    envoyerVersGraphes(doc, t, origine);
  };
  return (
    <div className={`atelier-apercu${petit ? " petit" : ""}`}>
      {aide ? <p className="muted small">{aide}</p> : null}
      {rendu?.erreur ? <p className="banner error">{rendu.erreur}</p> : null}
      {rendu?.svg ? (
        <div className={`atelier-svg${onClic ? " cliquable" : ""}`} onClick={clic} onMouseMove={onSurvol ? survol : undefined} onMouseLeave={onSurvol ? () => onSurvol(null) : undefined} dangerouslySetInnerHTML={{ __html: rendu.svg }} />
      ) : null}
      {trace ? (
        <div className="atelier-envoi">
          <input value={titre ?? resultat.titre} onChange={(e) => setTitre(e.target.value)} aria-label="Titre du graphe" title="Titre dans la bibliothèque" />
          <button type="button" onClick={() => void excel()} title="Les données de ce graphe (courbes, ou grille de la carte) et les tableaux calculés, dans un classeur Excel">
            Excel…
          </button>
          <button
            type="button"
            className="primary"
            disabled={envoi}
            onClick={() => void continuer()}
            title="Garde la recette dans l'étude, puis ouvre ce graphe dans Graphes : axes, couleurs, repères, taille… puis « Enregistrer ». La figure se régénérera depuis COMSOL."
          >
            Continuer dans Graphes →
          </button>
        </div>
      ) : null}
    </div>
  );
}
