/**
 * Un graphique de la page : SVG du traceur commun aux couleurs du thème, point survolé
 * affiché sous le titre, légende, et « → Figures » (couleurs fixes, titre et légende inclus).
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { disposer, grapheSvg, PALETTE_THEME, plusProche } from "@noyau/graphe";
import { useContexte } from "@interface/contexte";
import { svgTexteEnPng } from "@interface/image";
import type { Vue } from "../core/vues";
import { useTraitement } from "./etat";

let numero = 0;

export interface FigureDemandee {
  /** Titre de la figure dans la bibliothèque. */
  titre: string;
  source: string;
  tags?: string[];
  /** Pour la régénérer depuis les données (essai ouvert depuis une campagne). */
  origine?: { module: string; [k: string]: unknown };
}

export function Graphe({ vue, titre, sous, hauteur = 260, figure }: { vue: Vue | null; titre: string; sous?: string; hauteur?: number; figure?: FigureDemandee }) {
  const ctx = useContexte();
  const signaler = useTraitement((s) => s.signaler);
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(520);
  const [survol, setSurvol] = useState<{ x: number; y: number; texte: string; couleur: string } | null>(null);
  const id = useMemo(() => `tr${numero++}`, []);

  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    const o = new ResizeObserver(() => setLargeur(Math.max(260, Math.floor(el.clientWidth))));
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const svg = useMemo(() => (vue ? grapheSvg(vue.spec, { largeur, hauteur, palette: PALETTE_THEME, id }) : ""), [vue, largeur, hauteur, id]);

  function bouger(ev: React.MouseEvent<HTMLDivElement>) {
    if (!vue) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const d = disposer(vue.spec, largeur, hauteur);
    const p = plusProche(vue.spec, d, ev.clientX - r.left, ev.clientY - r.top);
    setSurvol(p ? { x: d.px(p.point[0]), y: d.py(p.point[1]), couleur: p.serie.couleur, texte: `${p.serie.libelle ? `${p.serie.libelle} — ` : ""}${vue.format(p.point[0], p.point[1], p.point[2])}` } : null);
  }

  async function versFigures() {
    if (!vue || !figure) return;
    try {
      const svgFixe = grapheSvg(vue.spec, { largeur: 760, hauteur: 420, titre: figure.titre, legende: vue.legende, id: "figure" });
      const png = await svgTexteEnPng(svgFixe);
      const dossier = await ctx.registre.executer("figures.enregistrer-image", { ctx, titre: figure.titre, png, svg: svgFixe, source: figure.source, tags: figure.tags ?? ["2S2P1D"], origine: figure.origine });
      signaler(`Figure enregistrée dans la bibliothèque : ${String(dossier)}${figure.origine ? " (régénérable depuis l'essai)" : ""}.`);
    } catch (e) {
      signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  return (
    <figure className="tr-graphe">
      <div className="tr-graphe-entete">
        <div>
          <h3>{titre}</h3>
          <p className="discret petit">{survol?.texte ?? vue?.sous ?? sous ?? " "}</p>
        </div>
        {figure && vue && ctx.registre.aAction("figures.enregistrer-image") ? (
          <button type="button" className="tr-mini" title="Enregistrer ce graphique dans la bibliothèque de figures" onClick={() => void versFigures()}>
            → Figures
          </button>
        ) : null}
      </div>
      <div ref={boite} className="tr-graphe-zone" style={{ height: hauteur }} onMouseMove={bouger} onMouseLeave={() => setSurvol(null)}>
        {/* SVG produit par le traceur commun (textes échappés) : le même que celui exporté. */}
        <div dangerouslySetInnerHTML={{ __html: svg }} />
        {survol ? (
          <svg className="tr-graphe-survol" width={largeur} height={hauteur} aria-hidden="true">
            <line x1={0} x2={largeur} y1={survol.y} y2={survol.y} />
            <line x1={survol.x} x2={survol.x} y1={0} y2={hauteur} />
            <circle cx={survol.x} cy={survol.y} r={4.5} fill={survol.couleur} />
          </svg>
        ) : null}
      </div>
      {vue?.legende?.length ? (
        <div className="tr-legende">
          {vue.legende.map(([nom, c]) => (
            <span key={nom}>
              <i style={{ background: c }} />
              {nom}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}
