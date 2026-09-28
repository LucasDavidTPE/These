/**
 * Courbes en SVG, sans bibliothèque : un panneau par famille d'unités (jamais deux
 * grandeurs d'échelles différentes sur le même axe), légende cliquable pour masquer une
 * voie, réticule qui affiche les valeurs, zoom en glissant sur une plage de temps (double-
 * clic pour revenir). Partagé entre les modules.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cadrer, COULEURS, formaterNombre, graduer, type Panneau, type Trace, type Vue } from "@noyau/courbes";

export type { Panneau, Trace, Vue } from "@noyau/courbes";

const H = 170;
const M = { g: 58, d: 12, h: 10, b: 22 };
const fmt = formaterNombre;

interface Props {
  p: Panneau;
  largeur: number;
  xLibelle: string;
  masquees: Set<string>;
  basculer(n: string): void;
  curseur: number | null;
  setCurseur(x: number | null): void;
  plage: [number, number] | null;
  setPlage(p: [number, number] | null): void;
}

function Graphe({ p, largeur, xLibelle, masquees, basculer, curseur, setCurseur, plage, setPlage }: Props) {
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const { traces, x0, x1, y0, y1 } = cadrer(p, { masquees: [...masquees], plage });
  const W = largeur - M.g - M.d;
  const px = (v: number) => M.g + ((v - x0) / (x1 - x0 || 1)) * W;
  const py = (v: number) => M.h + (1 - (v - y0) / (y1 - y0)) * (H - M.h - M.b);
  const valeurA = (t: Trace, x: number) => {
    let meilleur = 0;
    for (let i = 1; i < t.x.length; i++) if (Math.abs(t.x[i]! - x) < Math.abs(t.x[meilleur]! - x)) meilleur = i;
    return t.y[meilleur];
  };
  return (
    <div className="courbes-panneau">
      <div className="courbes-entete">
        <strong>
          {p.titre} ({p.unite})
        </strong>
        {p.traces.map((t, i) => (
          <button key={t.nom} type="button" className={masquees.has(t.nom) ? "courbes-legende masquee" : "courbes-legende"} onClick={() => basculer(t.nom)} title="Afficher ou masquer">
            <span style={{ background: COULEURS[i % COULEURS.length] }} />
            {t.nom}
            {curseur !== null && !masquees.has(t.nom) ? <em> {fmt(valeurA(t, curseur) ?? NaN)}</em> : null}
          </button>
        ))}
      </div>
      <svg
        width={largeur}
        height={H}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = x0 + ((e.clientX - r.left - M.g) / W) * (x1 - x0);
          setCurseur(x >= x0 && x <= x1 ? x : null);
          if (selection) setSelection([selection[0], x]);
        }}
        onMouseDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = x0 + ((e.clientX - r.left - M.g) / W) * (x1 - x0);
          setSelection([x, x]);
        }}
        onMouseUp={() => {
          if (selection && Math.abs(selection[1] - selection[0]) > (x1 - x0) / 200) setPlage([Math.min(...selection), Math.max(...selection)]);
          setSelection(null);
        }}
        onDoubleClick={() => setPlage(null)}
        onMouseLeave={() => {
          setCurseur(null);
          setSelection(null);
        }}
      >
        {graduer(y0, y1, 4).map((v) => (
          <g key={`y${v}`}>
            <line x1={M.g} x2={largeur - M.d} y1={py(v)} y2={py(v)} className="courbes-grille" />
            <text x={M.g - 6} y={py(v) + 4} textAnchor="end" className="courbes-texte">
              {fmt(v)}
            </text>
          </g>
        ))}
        {graduer(x0, x1, 8).map((v) => (
          <text key={`x${v}`} x={px(v)} y={H - 6} textAnchor="middle" className="courbes-texte">
            {fmt(v)}
          </text>
        ))}
        <text x={largeur - M.d} y={H - 6} textAnchor="end" className="courbes-texte">
          {xLibelle}
        </text>
        {selection ? <rect x={px(Math.min(...selection))} y={M.h} width={Math.abs(px(selection[1]) - px(selection[0]))} height={H - M.h - M.b} className="courbes-selection" /> : null}
        {traces.map((t, i) =>
          masquees.has(t.nom) ? null : (
            <polyline
              key={t.nom}
              fill="none"
              stroke={COULEURS[i % COULEURS.length]}
              strokeWidth={1.2}
              points={t.x.map((x, j) => (Number.isFinite(t.y[j]!) ? `${px(x).toFixed(1)},${py(t.y[j]!).toFixed(1)}` : "")).filter(Boolean).join(" ")}
            />
          ),
        )}
        {curseur !== null ? <line x1={px(curseur)} x2={px(curseur)} y1={M.h} y2={H - M.b} className="courbes-curseur" /> : null}
      </svg>
    </div>
  );
}

/**
 * `onVue` reçoit les voies masquées et la plage zoomée à chaque changement : de quoi
 * refaire la même figure plus tard (Enregistrer dans Figures, puis Régénérer).
 */
export function Courbes({ panneaux, xLibelle, onVue }: { panneaux: Panneau[]; xLibelle: string; onVue?(v: Vue): void }) {
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(800);
  const [masquees, setMasquees] = useState<Set<string>>(new Set());
  const [curseur, setCurseur] = useState<number | null>(null);
  const [plage, setPlage] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    const o = new ResizeObserver(() => setLargeur(Math.max(320, el.clientWidth)));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => onVue?.({ masquees: [...masquees], plage }), [masquees, plage, onVue]);
  const basculer = useMemo(() => (n: string) => setMasquees((m) => (m.has(n) ? new Set([...m].filter((x) => x !== n)) : new Set([...m, n]))), []);
  return (
    <div className="courbes" ref={boite}>
      <p className="discret petit">
        Glisser sur une courbe pour zoomer sur une plage{plage ? " · " : ""}
        {plage ? (
          <button type="button" className="lien" onClick={() => setPlage(null)}>
            vue entière
          </button>
        ) : null}
      </p>
      {panneaux.map((p) => (
        <Graphe key={p.titre} p={p} largeur={largeur} xLibelle={xLibelle} masquees={masquees} basculer={basculer} curseur={curseur} setCurseur={setCurseur} plage={plage} setPlage={setPlage} />
      ))}
    </div>
  );
}

/** Petite courbe sans axes, pour une carte (aperçu). */
export function Apercu({ x, y, largeur = 240, hauteur = 42, couleur = "currentColor" }: { x: number[]; y: number[]; largeur?: number; hauteur?: number; couleur?: string }) {
  const ys = y.filter(Number.isFinite);
  if (x.length < 2 || !ys.length) return null;
  const [x0, x1, y0, y1] = [Math.min(...x), Math.max(...x), Math.min(...ys), Math.max(...ys)];
  const pts = x
    .map((v, i) => (Number.isFinite(y[i]!) ? `${(((v - x0) / (x1 - x0 || 1)) * largeur).toFixed(1)},${(hauteur - 2 - ((y[i]! - y0) / (y1 - y0 || 1)) * (hauteur - 4)).toFixed(1)}` : ""))
    .filter(Boolean)
    .join(" ");
  return (
    <svg width={largeur} height={hauteur} className="apercu" aria-hidden="true">
      <polyline fill="none" stroke={couleur} strokeWidth={1.3} points={pts} />
    </svg>
  );
}
