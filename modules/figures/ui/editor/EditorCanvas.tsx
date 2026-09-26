import { useEffect, useMemo, useRef, useState } from "react";
import { hitTest, itemBox, itemsInRect, moveItems, nearestAnchor, setEndpoint, snapPoint, snapValue, type Box } from "../../core/editor";
import { THEMES, layoutFigure, patternDef, primitiveSvg, type FigureDoc, type Pt } from "../../core/schema";
import { useEditor } from "./useEditor";

type Drag =
  | { mode: "move"; start: Pt; base: FigureDoc }
  | { mode: "end"; id: string; which: "from" | "to"; base: FigureDoc }
  | { mode: "marquee"; start: Pt; cur: Pt; add: boolean }
  | { mode: "pan"; client: Pt; pan: Pt };

/** Planche de dessin : rendu SVG identique à l'export, sélection, poignées, zoom. */
export function EditorCanvas() {
  const doc = useEditor((s) => s.preview ?? s.history.present);
  const selection = useEditor((s) => s.selection);
  const zoom = useEditor((s) => s.zoom);
  const pan = useEditor((s) => s.pan);
  const showGrid = useEditor((s) => s.showGrid);
  const readOnly = useEditor((s) => s.readOnly);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<[number, number]>([800, 600]);
  const drag = useRef<Drag | null>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [snapHint, setSnapHint] = useState<Pt | null>(null);

  const layout = useMemo(() => layoutFigure(doc), [doc]);
  const theme = THEMES[doc.theme] ?? THEMES.these!;
  const rendered = useMemo(
    () => layout.placed.map((p) => ({ id: p.item.id, html: p.primitives.map((pr) => primitiveSvg(theme, pr)).join("") })),
    [layout, theme],
  );
  const defs = useMemo(() => Object.entries(theme.hatches).map(([n, h]) => patternDef(n, h, theme.hatchColor.svg)).join(""), [theme]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toMm = (clientX: number, clientY: number): Pt => {
    const svg = svgRef.current!;
    const m = svg.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };

  const grid = doc.canvas.grid;
  const px = 1 / zoom;

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toMm(e.clientX, e.clientY);
    if (e.button === 1 || e.altKey) {
      drag.current = { mode: "pan", client: [e.clientX, e.clientY], pan: st.pan };
      return;
    }
    const handle = (e.target as Element).getAttribute("data-handle");
    if (handle && !readOnly) {
      const [id, which] = handle.split(":") as [string, "from" | "to"];
      drag.current = { mode: "end", id, which, base: st.history.present };
      return;
    }
    const hit = hitTest(layout, p, 3 * px);
    if (hit) {
      if (e.shiftKey) {
        st.select(st.selection.includes(hit) ? st.selection.filter((x) => x !== hit) : [...st.selection, hit]);
        return;
      }
      if (!st.selection.includes(hit)) st.select([hit]);
      if (!readOnly) drag.current = { mode: "move", start: p, base: st.history.present };
    } else {
      if (!e.shiftKey) st.select([]);
      drag.current = { mode: "marquee", start: p, cur: p, add: e.shiftKey };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const st = useEditor.getState();
    if (d.mode === "pan") {
      st.setView(st.zoom, [d.pan[0] - (e.clientX - d.client[0]) / st.zoom, d.pan[1] - (e.clientY - d.client[1]) / st.zoom]);
      return;
    }
    const p = toMm(e.clientX, e.clientY);
    if (d.mode === "marquee") {
      d.cur = p;
      setMarquee({ x: d.start[0], y: d.start[1], w: p[0] - d.start[0], h: p[1] - d.start[1] });
    } else if (d.mode === "move") {
      const g = st.snap ? grid : 0;
      const delta: Pt = [snapValue(p[0] - d.start[0], g), snapValue(p[1] - d.start[1], g)];
      st.setPreview(delta[0] === 0 && delta[1] === 0 ? null : moveItems(d.base, st.selection, delta, layoutFigure(d.base)));
    } else if (d.mode === "end") {
      let value: Pt | string = st.snap ? snapPoint(p, grid) : p;
      setSnapHint(null);
      if (st.snap) {
        const a = nearestAnchor(layoutFigure(d.base), p, 8 * px, new Set([d.id]));
        if (a) {
          value = a.ref;
          setSnapHint(a.point);
        }
      }
      st.setPreview(setEndpoint(d.base, d.id, d.which, value));
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setSnapHint(null);
    const st = useEditor.getState();
    if (!d) return;
    if (d.mode === "marquee") {
      setMarquee(null);
      const r = { x: d.start[0], y: d.start[1], w: d.cur[0] - d.start[0], h: d.cur[1] - d.start[1] };
      if (Math.abs(r.w) > 0.5 || Math.abs(r.h) > 0.5) {
        const ids = itemsInRect(layout, r);
        st.select(d.add ? [...new Set([...st.selection, ...ids])] : ids);
      }
    } else if (d.mode === "move" || d.mode === "end") {
      st.commitPreview();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const st = useEditor.getState();
    const p = toMm(e.clientX, e.clientY);
    const nz = Math.min(60, Math.max(0.5, st.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    st.setView(nz, [p[0] - ((p[0] - st.pan[0]) * st.zoom) / nz, p[1] - ((p[1] - st.pan[1]) * st.zoom) / nz]);
  };

  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData("application/x-figurine");
    if (!type || readOnly) return;
    e.preventDefault();
    useEditor.getState().add(type, toMm(e.clientX, e.clientY));
  };

  const selected = layout.placed.filter((p) => selection.includes(p.item.id));
  const gridStep = grid > 0 ? grid * Math.max(1, Math.ceil(4 / (grid * zoom))) : 0;

  return (
    <div className="editor-canvas" ref={boxRef} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        width={size[0]}
        height={size[1]}
        viewBox={`${pan[0]} ${pan[1]} ${size[0] / zoom} ${size[1] / zoom}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        fontFamily={theme.text.svgFamily}
        fontSize={theme.text.sizeMm}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs dangerouslySetInnerHTML={{ __html: defs }} />
        <defs>
          {gridStep > 0 && (
            <pattern id="editor-grid" patternUnits="userSpaceOnUse" width={gridStep} height={gridStep}>
              <path d={`M${gridStep} 0H0V${gridStep}`} fill="none" stroke="#d8dde3" strokeWidth={px} />
            </pattern>
          )}
        </defs>
        <rect x={0} y={0} width={doc.canvas.width} height={doc.canvas.height} fill="white" stroke="#9aa3ad" strokeWidth={px} />
        {showGrid && gridStep > 0 && <rect x={0} y={0} width={doc.canvas.width} height={doc.canvas.height} fill="url(#editor-grid)" pointerEvents="none" />}
        {rendered.map((r) => (
          <g key={r.id} data-id={r.id} dangerouslySetInnerHTML={{ __html: r.html }} />
        ))}
        {selected.map((p) => {
          const b = itemBox(p);
          return (
            <rect key={`sel-${p.item.id}`} x={b.x - 2 * px} y={b.y - 2 * px} width={b.w + 4 * px} height={b.h + 4 * px} fill="none" stroke="#2f7ae5" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />
          );
        })}
        {selection.length === 1 &&
          selected.map((p) =>
            p.def.placement === "segment" && p.item.from !== undefined
              ? (["from", "to"] as const).map((which) => {
                  const pt = p.anchors[which === "from" ? "start" : "end"]!;
                  const linked = typeof p.item[which] === "string";
                  return (
                    <circle key={which} data-handle={`${p.item.id}:${which}`} cx={pt[0]} cy={pt[1]} r={5 * px} fill={linked ? "#2f7ae5" : "white"} stroke="#2f7ae5" strokeWidth={1.5 * px} style={{ cursor: "crosshair" }}>
                      <title>{linked ? `Lié à ${p.item[which] as string}` : "Glisser sur une ancre pour lier"}</title>
                    </circle>
                  );
                })
              : null,
          )}
        {snapHint && <circle cx={snapHint[0]} cy={snapHint[1]} r={7 * px} fill="none" stroke="#e5732f" strokeWidth={2 * px} pointerEvents="none" />}
        {marquee && <rect x={Math.min(marquee.x, marquee.x + marquee.w)} y={Math.min(marquee.y, marquee.y + marquee.h)} width={Math.abs(marquee.w)} height={Math.abs(marquee.h)} fill="rgba(47,122,229,0.08)" stroke="#2f7ae5" strokeWidth={px} pointerEvents="none" />}
      </svg>
    </div>
  );
}
