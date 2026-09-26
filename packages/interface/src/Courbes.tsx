/**
 * Courbes en SVG, sans bibliothèque : un panneau par famille d'unités (jamais deux
 * grandeurs d'échelles différentes sur le même axe), légende cliquable pour masquer une
 * voie, réticule qui affiche les valeurs, zoom en glissant sur une plage de temps (double-
 * clic pour revenir). Partagé entre les modules.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";

export interface Trace {
  nom: string;
  x: number[];
  y: number[];
}

export interface Panneau {
  titre: string;
  unite: string;
  traces: Trace[];
}

const COULEURS = ["#2f5f8a", "#b0602c", "#2e7d4f", "#a8326e", "#6b4fa0", "#8a5a00", "#4f7a8a", "#777777"];
const H = 170;
const M = { g: 58, d: 12, h: 10, b: 22 };

/** Graduations « rondes » entre a et b (environ n). */
function graduer(a: number, b: number, n = 5): number[] {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (a === b) return [a];
  const brut = (b - a) / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= brut) ?? brut;
  const out: number[] = [];
  for (let v = Math.ceil(a / pas) * pas; v <= b + pas * 1e-9; v += pas) out.push(Number(v.toPrecision(12)));
  return out;
}

const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : String(Number(v.toPrecision(4))));

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
  const dans = (x: number) => !plage || (x >= plage[0] && x <= plage[1]);
  const traces = p.traces.map((t) => {
    const i = t.x.map((x, j) => (dans(x) ? j : -1)).filter((j) => j >= 0);
    return { ...t, x: i.map((j) => t.x[j]!), y: i.map((j) => t.y[j]!) };
  });
  const visibles = traces.filter((t) => !masquees.has(t.nom) && t.x.length);
  const toutes = visibles.length ? visibles : traces;
  const xs = toutes.flatMap((t) => t.x);
  const ys = toutes.flatMap((t) => t.y).filter(Number.isFinite);
  const [x0, x1] = plage ?? [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const pad = (y1 - y0) * 0.05;
  y0 -= pad;
  y1 += pad;
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

export function Courbes({ panneaux, xLibelle }: { panneaux: Panneau[]; xLibelle: string }) {
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
