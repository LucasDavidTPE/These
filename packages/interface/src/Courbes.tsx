/**
 * Courbes en SVG, sans bibliothèque : un panneau par famille d'unités (jamais deux
 * grandeurs d'échelles différentes sur le même axe), légende cliquable pour masquer une
 * voie, réticule qui affiche les valeurs, zoom en glissant sur une plage de temps (double-
 * clic pour revenir). Partagé entre les modules.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cadrer, calculerRegressions, COULEURS, formaterNombre, graduer, libelleRegression, type Panneau, type RegressionDemandee, type Trace, type Vue } from "@noyau/courbes";

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
  /** « regression » : glisser pose une droite de régression au lieu de zoomer. */
  mode: "zoom" | "regression";
  regressions: RegressionDemandee[];
  ajouterRegression(de: number, a: number): void;
}

function Graphe({ p, largeur, xLibelle, masquees, basculer, curseur, setCurseur, plage, setPlage, mode, regressions, ajouterRegression }: Props) {
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
          if (selection && Math.abs(selection[1] - selection[0]) > (x1 - x0) / 200) {
            const [de, a] = [Math.min(...selection), Math.max(...selection)];
            if (mode === "regression") ajouterRegression(de, a);
            else setPlage([de, a]);
          }
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
        {calculerRegressions([p], regressions, xLibelle).map((r, k) => {
          const xa = Math.max(r.droite.x0, x0),
            xb = Math.min(r.droite.x1, x1);
          if (!(xb > xa)) return null;
          const f = (x: number) => r.droite.pente * x + r.droite.ordonnee;
          return (
            <g key={k}>
              <line x1={px(xa)} y1={py(f(xa))} x2={px(xb)} y2={py(f(xb))} className="courbes-regression" />
              <text x={px((xa + xb) / 2)} y={Math.min(py(f(xa)), py(f(xb))) - 6} textAnchor="middle" className="courbes-regression-texte">
                {fmt(r.droite.pente).replace(".", ",")} {r.unite}
              </text>
            </g>
          );
        })}
        {curseur !== null ? <line x1={px(curseur)} x2={px(curseur)} y1={M.h} y2={H - M.b} className="courbes-curseur" /> : null}
      </svg>
    </div>
  );
}

/**
 * `onVue` reçoit les voies masquées, la plage zoomée et les régressions à chaque changement :
 * de quoi refaire la même figure plus tard (Enregistrer dans Figures, puis Régénérer), et
 * garder les régressions avec l'essai (`regressionsInitiales` les restitue).
 */
export function Courbes({ panneaux, xLibelle, onVue, regressionsInitiales }: { panneaux: Panneau[]; xLibelle: string; onVue?(v: Vue): void; regressionsInitiales?: RegressionDemandee[] }) {
  const boite = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(800);
  const [masquees, setMasquees] = useState<Set<string>>(new Set());
  const [curseur, setCurseur] = useState<number | null>(null);
  const [plage, setPlage] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<"zoom" | "regression">("zoom");
  const [regressions, setRegressions] = useState<RegressionDemandee[]>(regressionsInitiales ?? []);
  useLayoutEffect(() => {
    const el = boite.current;
    if (!el) return;
    const o = new ResizeObserver(() => setLargeur(Math.max(320, el.clientWidth)));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => onVue?.({ masquees: [...masquees], plage, regressions }), [masquees, plage, regressions, onVue]);
  const calculees = calculerRegressions(panneaux, regressions, xLibelle);
  const basculer = useMemo(() => (n: string) => setMasquees((m) => (m.has(n) ? new Set([...m].filter((x) => x !== n)) : new Set([...m, n]))), []);
  return (
    <div className="courbes" ref={boite}>
      <div className="courbes-outils">
        <span className="courbes-mode" role="group" aria-label="Glisser sur une courbe pour">
          <button type="button" aria-pressed={mode === "zoom"} className={mode === "zoom" ? "actif" : undefined} onClick={() => setMode("zoom")}>
            Zoom
          </button>
          <button type="button" aria-pressed={mode === "regression"} className={mode === "regression" ? "actif" : undefined} onClick={() => setMode("regression")} title="Glisser sur un domaine : droite de régression de chaque voie affichée du panneau">
            Régression
          </button>
        </span>
        <span className="discret petit">
          {mode === "zoom" ? "Glisser sur une courbe pour zoomer sur une plage" : "Glisser sur un domaine pour y poser une droite de régression (voies affichées du panneau)"}
          {plage ? " · " : ""}
          {plage ? (
            <button type="button" className="lien" onClick={() => setPlage(null)}>
              vue entière
            </button>
          ) : null}
        </span>
      </div>
      {panneaux.map((p) => (
        <Graphe
          key={p.titre}
          p={p}
          largeur={largeur}
          xLibelle={xLibelle}
          masquees={masquees}
          basculer={basculer}
          curseur={curseur}
          setCurseur={setCurseur}
          plage={plage}
          setPlage={setPlage}
          mode={mode}
          regressions={regressions}
          ajouterRegression={(de, a) =>
            setRegressions((r) => [...r, ...p.traces.filter((t) => !masquees.has(t.nom)).map((t) => ({ panneau: p.titre, trace: t.nom, de: Number(de.toPrecision(8)), a: Number(a.toPrecision(8)) }))])
          }
        />
      ))}
      {calculees.length ? (
        <ul className="courbes-regressions">
          {calculees.map((r) => (
            <li key={`${r.demande.panneau}|${r.demande.trace}|${r.demande.de}|${r.demande.a}`}>
              <span className="pastille-couleur" style={{ background: r.couleur }} />
              {libelleRegression(r)}
              <button type="button" className="lien" title="Retirer cette régression" onClick={() => setRegressions((l) => l.filter((x) => x !== r.demande))}>
                retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
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
