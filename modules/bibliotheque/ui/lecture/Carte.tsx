/**
 * Carte de la lecture croisée : articles (ronds) et étiquettes (pastilles colorées par critère), reliés.
 * Glisser pour se déplacer, molette pour zoomer, survol pour isoler un nœud et ses voisins, clic sur un
 * article pour ouvrir sa fiche, sur une étiquette pour lister ses articles.
 */
import { useMemo, useRef, useState } from "react";
import { useContexte } from "@interface/contexte";
import { citation } from "../../core/calculs";
import { construireCarte, disposer, voisins, type Noeud } from "../../core/carte";
import type { ObjetRef, ReglagesLecture } from "../../core/lecture";

const L = 1100;
const H = 720;
/** Couleurs des critères (ordre fixe, jamais recyclé : au-delà de 8, gris). */
const SERIES = 8;

export function CarteVue({ refs, reglages, ouvrir }: { refs: ObjetRef[]; reglages: ReglagesLecture; ouvrir(id: string): void }) {
  const ctx = useContexte();
  const [criteres, setCriteres] = useState<string[]>(() => reglages.criteres.slice(0, 4).map((c) => c.id));
  const [liens, setLiens] = useState(true);
  const [min, setMin] = useState(1);
  const [survol, setSurvol] = useState<string | null>(null);
  const [etiquette, setEtiquette] = useState<Noeud | null>(null);
  const [vue, setVue] = useState({ x: 0, y: 0, z: 1 });
  const glisse = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const couleur = (critere: string) => {
    const i = reglages.criteres.findIndex((c) => c.id === critere);
    return i >= 0 && i < SERIES ? `var(--lc-serie-${i + 1})` : "var(--discret)";
  };
  const carte = useMemo(() => disposer(construireCarte(refs, reglages, { criteres, liens, minArticles: min, sansEcartes: true }), L, H, 260), [refs, reglages, criteres, liens, min]);
  const position = new Map(carte.noeuds.map((n) => [n.id, n]));
  const proches = survol ? voisins(carte, survol) : null;
  const typeNom = new Map(reglages.typesLiens.map((t) => [t.id, t.nom]));
  const parId = new Map(refs.map((r) => [r.id, r.valeur]));

  const exporter = async () => {
    if (!svg.current) return;
    const copie = svg.current.cloneNode(true) as SVGSVGElement;
    // les couleurs viennent de variables CSS : on les fige dans le fichier
    const style = getComputedStyle(svg.current);
    let texte = new XMLSerializer().serializeToString(copie);
    texte = texte.replace(/var\((--[\w-]+)\)/g, (_, v: string) => style.getPropertyValue(v).trim() || "#888");
    await ctx.plateforme.enregistrerSous("carte-lecture-croisee.svg", new TextEncoder().encode(texte));
  };

  return (
    <div className="lc-carte">
      <div className="filtres">
        {reglages.criteres.map((c, i) => (
          <label key={c.id} className="rangee petit lc-legende">
            <input type="checkbox" checked={criteres.includes(c.id)} onChange={(e) => setCriteres(e.target.checked ? [...criteres, c.id] : criteres.filter((x) => x !== c.id))} />
            <span className="lc-pastille" style={{ background: i < SERIES ? `var(--lc-serie-${i + 1})` : "var(--discret)" }} />
            {c.nom}
          </label>
        ))}
      </div>
      <div className="filtres">
        <label className="rangee petit">
          <input type="checkbox" checked={liens} onChange={(e) => setLiens(e.target.checked)} /> liens entre articles
        </label>
        <label className="rangee petit">
          étiquettes portées par au moins
          <input className="champ" type="number" min={1} max={20} value={min} onChange={(e) => setMin(Math.max(1, Number(e.target.value) || 1))} style={{ width: 56 }} /> article(s)
        </label>
        <button type="button" onClick={() => setVue({ x: 0, y: 0, z: 1 })}>
          Recentrer
        </button>
        <button type="button" onClick={() => void exporter()}>
          Enregistrer en SVG…
        </button>
        <span className="discret petit">
          {carte.noeuds.filter((n) => n.type === "article").length} articles, {carte.noeuds.filter((n) => n.type === "etiquette").length} étiquettes
        </span>
      </div>
      {!carte.noeuds.length ? (
        <p>Rien à montrer : remplissez la grille (ou cochez d'autres critères).</p>
      ) : (
        <svg
          ref={svg}
          className="lc-svg"
          viewBox={`0 0 ${L} ${H}`}
          role="img"
          aria-label="Carte des articles et des étiquettes"
          onWheel={(e) => {
            const z = Math.min(4, Math.max(0.4, vue.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
            setVue({ ...vue, z });
          }}
          onPointerDown={(e) => {
            if ((e.target as Element).closest("[data-noeud]")) return;
            glisse.current = { x: e.clientX, y: e.clientY, vx: vue.x, vy: vue.y };
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const g = glisse.current;
            if (!g || !svg.current) return;
            const k = L / svg.current.clientWidth / vue.z;
            setVue({ ...vue, x: g.vx + (e.clientX - g.x) * k, y: g.vy + (e.clientY - g.y) * k });
          }}
          onPointerUp={() => (glisse.current = null)}
        >
          <defs>
            <marker id="lc-fleche" viewBox="0 0 10 10" refX="16" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--texte)" />
            </marker>
          </defs>
          <g transform={`translate(${L / 2 + vue.x} ${H / 2 + vue.y}) scale(${vue.z}) translate(${-L / 2} ${-H / 2})`}>
            {carte.aretes.map((a, i) => {
              const p = position.get(a.de)!;
              const q = position.get(a.vers)!;
              const typee = a.type !== "etiquette";
              const eteinte = proches && !(proches.has(a.de) && proches.has(a.vers));
              return (
                <line
                  key={i}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  className={typee ? "lc-arete lc-arete-lien" : "lc-arete"}
                  markerEnd={typee ? "url(#lc-fleche)" : undefined}
                  opacity={eteinte ? 0.08 : typee ? 0.9 : 0.45}
                >
                  {typee ? <title>{`${a.de} ${typeNom.get(a.type) ?? a.type} ${a.vers}`}</title> : null}
                </line>
              );
            })}
            {carte.noeuds.map((n) => {
              const eteint = proches && !proches.has(n.id);
              const rayon = n.type === "article" ? 5 + Math.min(7, n.degre * 0.6) : 6 + Math.min(10, n.degre * 0.9);
              const libelle = n.type === "etiquette" || carte.noeuds.length < 80 || n.degre >= 3 || survol === n.id;
              return (
                <g
                  key={n.id}
                  data-noeud
                  transform={`translate(${n.x} ${n.y})`}
                  opacity={eteint ? 0.15 : 1}
                  onPointerEnter={() => setSurvol(n.id)}
                  onPointerLeave={() => setSurvol(null)}
                  onClick={() => (n.type === "article" ? ouvrir(n.id) : setEtiquette(n))}
                  style={{ cursor: "pointer" }}
                >
                  {n.type === "article" ? (
                    <circle r={rayon} className={n.groupe === "Lu" ? "lc-article lc-lu" : "lc-article"} />
                  ) : (
                    <rect x={-rayon} y={-rayon} width={rayon * 2} height={rayon * 2} rx={4} fill={couleur(n.groupe)} className="lc-etiquette" />
                  )}
                  {libelle ? (
                    <text y={-rayon - 4} textAnchor="middle" className={n.type === "article" ? "lc-texte lc-texte-article" : "lc-texte"}>
                      {n.libelle}
                    </text>
                  ) : null}
                  <title>{n.type === "article" ? `${n.libelle} — ${parId.get(n.id)?.titre ?? ""}` : `${n.libelle} (${reglages.criteres.find((c) => c.id === n.groupe)?.nom ?? ""}) — ${n.degre} article(s)`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <p className="discret petit">
        Ronds : articles (pleins = lus) ; carrés : étiquettes, colorées par critère. Flèches : liens entre articles. Survolez pour isoler, cliquez un article pour ouvrir sa fiche.
      </p>
      {etiquette ? (
        <div className="carte lc-choix">
          <strong>{etiquette.libelle}</strong>{" "}
          <button type="button" className="lien" onClick={() => setEtiquette(null)}>
            fermer
          </button>
          <ul>
            {carte.aretes
              .filter((a) => a.vers === etiquette.id && a.type === "etiquette")
              .map((a) => (
                <li key={a.de}>
                  <button type="button" className="lien" onClick={() => ouvrir(a.de)}>
                    {citation(parId.get(a.de)!) || a.de}
                  </button>{" "}
                  <span className="discret">{parId.get(a.de)?.titre}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
