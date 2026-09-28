/**
 * Aperçu du graphe : zoom de l'affichage (boutons, Ctrl + molette, taille réelle) et zoom sur
 * les données (tirer un rectangle fixe les bornes des axes ; « Axes auto » les libère). Les
 * coordonnées sous le curseur s'affichent en bas.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { exportGraphSvg, graphLayout, unproject, validateGraph, type GraphDoc } from "../../core/graph";
import { useGraph } from "./useGraph";

/** Pixels par millimètre à 100 % (96 dpi). */
const PX_MM = 96 / 25.4;
const PAS = 1.25;

type Rect = { x0: number; y0: number; x1: number; y1: number };

const nombre = (v: number) => (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(3) : String(Number(v.toPrecision(4)))).replace(".", ",");

export function Apercu() {
  const s = useGraph();
  const zone = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null); // null : ajusté à la place
  const [mode, setMode] = useState<"normal" | "zone">("normal");
  const [trace, setTrace] = useState<Rect | null>(null);
  const [curseur, setCurseur] = useState<string>("");
  const [place, setPlace] = useState({ w: 600, h: 400 });

  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return;
    const o = new ResizeObserver(() => setPlace({ w: el.clientWidth, h: el.clientHeight }));
    o.observe(el);
    return () => o.disconnect();
  }, []);

  const rendu = useMemo(() => {
    const v = validateGraph(s.doc);
    if (!v.ok) return { svg: "", error: v.errors.map((e) => `${e.path} : ${e.message}`).join("\n"), doc: null };
    if (v.doc.series.length === 0) return { svg: "", error: "", doc: null };
    try {
      return { svg: exportGraphSvg(v.doc).replace(/<\?xml[^>]*>/, ""), error: "", doc: v.doc };
    } catch (e) {
      return { svg: "", error: e instanceof Error ? e.message : String(e), doc: null };
    }
  }, [s.doc]);

  const disposition = useMemo(() => (rendu.doc ? graphLayout(rendu.doc) : null), [rendu.doc]);

  // Échelle affichée : imposée (zoom manuel) ou calculée pour remplir la place (ajusté).
  const ajuste = rendu.doc ? Math.max(0.5, Math.min((place.w - 32) / rendu.doc.width, (place.h - 32) / rendu.doc.height)) : PX_MM;
  const echelle = zoom ?? ajuste;
  useLayoutEffect(() => {
    const svg = zone.current?.querySelector("svg");
    if (!svg || !rendu.doc) return;
    svg.style.width = `${rendu.doc.width * echelle}px`;
    svg.style.height = `${rendu.doc.height * echelle}px`;
  }, [echelle, rendu]);

  const svgEl = () => zone.current?.querySelector("svg") ?? null;
  const changer = (k: number) => setZoom(Math.min(40, Math.max(0.5, echelle * k)));

  /** Point de l'écran → millimètres du graphe → valeurs des données. */
  function donnees(clientX: number, clientY: number): { x: number; y: number; dedans: boolean } | null {
    const svg = svgEl();
    if (!svg || !rendu.doc || !disposition) return null;
    const r = svg.getBoundingClientRect();
    const mx = ((clientX - r.left) / r.width) * rendu.doc.width;
    const my = ((clientY - r.top) / r.height) * rendu.doc.height;
    const { box, xs, ys } = disposition;
    const tx = (mx - box.x) / box.w,
      ty = 1 - (my - box.y) / box.h;
    return { x: unproject(xs, tx), y: unproject(ys, ty), dedans: tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1 };
  }

  function relacher() {
    const t = trace;
    setTrace(null);
    if (!t || Math.abs(t.x1 - t.x0) < 6 || Math.abs(t.y1 - t.y0) < 6) return;
    const a = donnees(t.x0, t.y0),
      b = donnees(t.x1, t.y1);
    if (!a || !b) return;
    const doc: GraphDoc = s.doc;
    const borne = (u: number, v: number, log: boolean) => {
      const [lo, hi] = u < v ? [u, v] : [v, u];
      return log && lo <= 0 ? null : { min: Number(lo.toPrecision(4)), max: Number(hi.toPrecision(4)) };
    };
    const bx = borne(a.x, b.x, doc.x.log),
      by = borne(a.y, b.y, doc.y.log);
    if (!bx || !by || !(bx.min < bx.max) || !(by.min < by.max)) return;
    s.update({ x: { ...doc.x, ...bx }, y: { ...doc.y, ...by } });
    setMode("normal");
  }

  const axesFixes = s.doc.x.min !== undefined || s.doc.x.max !== undefined || s.doc.y.min !== undefined || s.doc.y.max !== undefined;

  return (
    <div className="graph-preview-cadre">
      {rendu.svg ? (
        <div className="apercu-outils" role="toolbar" aria-label="Zoom">
          <button type="button" className="small-btn" aria-label="Réduire" title="Réduire (Ctrl + molette)" onClick={() => changer(1 / PAS)}>
            −
          </button>
          <button type="button" className="small-btn" aria-label="Agrandir" title="Agrandir (Ctrl + molette)" onClick={() => changer(PAS)}>
            +
          </button>
          <button type="button" className={`small-btn${zoom === null ? " actif" : ""}`} title="Ajuster à la place disponible" onClick={() => setZoom(null)}>
            Ajuster
          </button>
          <button type="button" className="small-btn" title="Taille réelle à l'écran (1 mm = 1 mm à 96 dpi)" onClick={() => setZoom(PX_MM)}>
            100 %
          </button>
          <span className="sep" />
          <button type="button" className={`small-btn${mode === "zone" ? " actif" : ""}`} aria-pressed={mode === "zone"} title="Tirer un rectangle sur le graphe : ses bornes deviennent celles des axes" onClick={() => setMode(mode === "zone" ? "normal" : "zone")}>
            ⬚ Zoom sur une zone
          </button>
          <button type="button" className="small-btn" disabled={!axesFixes} title="Bornes des axes calculées d'après les données" onClick={() => s.update({ x: { label: s.doc.x.label, log: s.doc.x.log }, y: { label: s.doc.y.label, log: s.doc.y.log } })}>
            Axes auto
          </button>
          <span className="grow" />
          <span className="muted small">{zoom === null ? `ajusté (${Math.round((ajuste / PX_MM) * 100)} %)` : `${Math.round((zoom / PX_MM) * 100)} %`}</span>
        </div>
      ) : null}
      <div
        className={`graph-preview checker${mode === "zone" ? " mode-zone" : ""}`}
        ref={zone}
        onWheel={(e) => {
          if (!e.ctrlKey || !rendu.svg) return;
          e.preventDefault();
          changer(e.deltaY < 0 ? PAS : 1 / PAS);
        }}
        onMouseDown={(e) => mode === "zone" && e.button === 0 && (e.preventDefault(), setTrace({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }))}
        onMouseMove={(e) => {
          if (trace) setTrace({ ...trace, x1: e.clientX, y1: e.clientY });
          const d = donnees(e.clientX, e.clientY);
          setCurseur(d?.dedans ? `x = ${nombre(d.x)}   y = ${nombre(d.y)}` : "");
        }}
        onMouseUp={relacher}
        onMouseLeave={() => (setCurseur(""), trace && relacher())}
        onDoubleClick={() => mode === "zone" && s.update({ x: { label: s.doc.x.label, log: s.doc.x.log }, y: { label: s.doc.y.label, log: s.doc.y.log } })}
      >
        {rendu.svg ? <div dangerouslySetInnerHTML={{ __html: rendu.svg }} /> : <p className="muted">{rendu.error || "Choisissez un modèle, ouvrez un fichier ou collez des colonnes, puis ajoutez des séries."}</p>}
        {trace ? (
          <div
            className="zone-trace"
            style={{ position: "fixed", left: Math.min(trace.x0, trace.x1), top: Math.min(trace.y0, trace.y1), width: Math.abs(trace.x1 - trace.x0), height: Math.abs(trace.y1 - trace.y0) }}
          />
        ) : null}
      </div>
      <div className="apercu-pied muted small">{curseur || (mode === "zone" ? "Tirez un rectangle sur la zone à agrandir ; double-clic : axes auto." : " ")}</div>
    </div>
  );
}
