import { useEffect, useRef, useState } from "react";
import { RATIOS, marginsFromRect, pxToMm, type Handle, type Rect } from "../../core/crop";
import { NumberInput } from "../editor/fields";
import { useCrop } from "./useCrop";

/** Page Recadrage (SPEC §9). */
export function CropPage() {
  const s = useCrop();

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      void useCrop.getState().paste(e);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const img = s.image;
  const margins = img ? marginsFromRect(img.width, img.height, s.rect, s.sourceDpi) : null;
  const size = img ? s.resultSize() : null;

  return (
    <section className="page cutout">
      <header className="toolbar">
        <button type="button" onClick={() => s.paste(null)} disabled={s.busy} title="Ctrl+V">
          Coller
        </button>
        <button type="button" onClick={() => s.open()} disabled={s.busy}>
          Ouvrir…
        </button>
        <span className="muted small">ou « Recadrer » depuis une figure de la bibliothèque</span>
        <span className="grow" />
        {img && (
          <>
            <button type="button" className="primary" onClick={() => s.copy()} disabled={s.busy}>
              Copier
            </button>
            <button type="button" onClick={() => s.saveAs()} disabled={s.busy}>
              Enregistrer sous…
            </button>
          </>
        )}
      </header>
      {s.message && <p className={`banner ${s.message.kind === "error" ? "error" : ""}`}>{s.message.text}</p>}
      {!img ? (
        <div className="dropzone">
          <p>
            <b>Ctrl+V</b> pour coller une image, « Ouvrir… », ou bouton « Recadrer » d'une figure de la bibliothèque.
          </p>
        </div>
      ) : (
        <div className="cutout-body">
          <CropView />
          <aside className="cutout-side">
            <fieldset>
              <legend>Cadre</legend>
              <label className="field">
                <span>Proportions</span>
                <select value={String(s.ratio)} onChange={(e) => s.setRatio(e.target.value === "null" ? null : Number(e.target.value))}>
                  {RATIOS.map((r) => (
                    <option key={r.label} value={String(r.value)}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row">
                <button type="button" onClick={() => s.trim("transparent")} title="Retire les bords transparents">
                  Rogner transparent
                </button>
                <button type="button" onClick={() => s.trim("blanc")} title="Retire les bords blancs">
                  Rogner blanc
                </button>
              </div>
              <div className="row">
                <button type="button" onClick={() => s.rotate(-1)} title="Rotation de 90° à gauche">
                  ⟲ 90°
                </button>
                <button type="button" onClick={() => s.rotate(1)} title="Rotation de 90° à droite">
                  ⟳ 90°
                </button>
              </div>
            </fieldset>
            {margins && (
              <fieldset>
                <legend>Marges (mm)</legend>
                <div className="grid2">
                  {(["top", "bottom", "left", "right"] as const).map((k) => (
                    <label key={k} className="field">
                      <span>{{ top: "Haut", bottom: "Bas", left: "Gauche", right: "Droite" }[k]}</span>
                      <NumberInput value={margins[k]} onChange={(v) => s.setMargins({ ...margins, [k]: v })} />
                    </label>
                  ))}
                </div>
                <label className="field">
                  <span>Résolution de l'image source (dpi)</span>
                  <NumberInput value={s.sourceDpi} onChange={(v) => v > 0 && s.set({ sourceDpi: v })} />
                </label>
              </fieldset>
            )}
            <fieldset>
              <legend>Taille de sortie</legend>
              <div className="grid2">
                <label className="field">
                  <span>Largeur (mm)</span>
                  <NumberInput value={s.target.widthMm} onChange={(v) => s.setTarget({ widthMm: v > 0 ? v : undefined })} />
                </label>
                <label className="field">
                  <span>Hauteur (mm)</span>
                  <NumberInput value={s.target.heightMm} onChange={(v) => s.setTarget({ heightMm: v > 0 ? v : undefined })} />
                </label>
              </div>
              <label className="field">
                <span>Résolution (dpi)</span>
                <select value={s.outDpi} onChange={(e) => s.set({ outDpi: Number(e.target.value) })}>
                  {[150, 300, 600].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              {size && (
                <p className="muted small">
                  Sélection : {s.rect.w} × {s.rect.h} px ({pxToMm(s.rect.w, s.sourceDpi).toFixed(1).replace(".", ",")} ×{" "}
                  {pxToMm(s.rect.h, s.sourceDpi).toFixed(1).replace(".", ",")} mm à {s.sourceDpi} dpi). Sortie : {size.width} × {size.height} px
                  {" "}= {pxToMm(size.width, s.outDpi).toFixed(1).replace(".", ",")} × {pxToMm(size.height, s.outDpi).toFixed(1).replace(".", ",")} mm à{" "}
                  {s.outDpi} dpi.
                </p>
              )}
              {s.target.widthMm === undefined && s.target.heightMm === undefined && <p className="muted small">Sans taille, les pixels sont gardés tels quels.</p>}
            </fieldset>
            <fieldset>
              <legend>Bibliothèque</legend>
              <label className="field">
                <span>Titre</span>
                <input value={s.title} onChange={(e) => s.set({ title: e.target.value })} placeholder="Recadrage" />
              </label>
              {s.from && <p className="muted small">Liée à {s.from.id} (source et licence reprises).</p>}
              <button type="button" onClick={() => s.saveToLibrary()} disabled={s.busy}>
                Enregistrer dans la bibliothèque
              </button>
            </fieldset>
          </aside>
        </div>
      )}
    </section>
  );
}

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Image et cadre de recadrage avec ses huit poignées. */
function CropView() {
  const image = useCrop((s) => s.image);
  const rect = useCrop((s) => s.rect);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ handle: Handle; start: Rect; x: number; y: number } | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
    force((n) => n + 1);
  }, [image]);

  if (!image) return null;
  const toPx = (e: React.PointerEvent) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    return [p.x, p.y] as const;
  };
  const hs = Math.max(image.width, image.height) / 80;
  const pos = (h: Handle): [number, number] => [
    h.includes("w") ? rect.x : h.includes("e") ? rect.x + rect.w : rect.x + rect.w / 2,
    h.includes("n") ? rect.y : h.includes("s") ? rect.y + rect.h : rect.y + rect.h / 2,
  ];

  return (
    <div className="cutout-view checker crop-view">
      <div className="crop-stack">
        <canvas ref={canvas} />
        <svg
          ref={svg}
          viewBox={`0 0 ${image.width} ${image.height}`}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const [x, y] = toPx(e);
            useCrop.getState().drag(d.handle, x - d.x, y - d.y, d.start);
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <path
            d={`M0 0H${image.width}V${image.height}H0Z M${rect.x} ${rect.y}V${rect.y + rect.h}H${rect.x + rect.w}V${rect.y}Z`}
            fill="rgba(0,0,0,0.45)"
            fillRule="evenodd"
          />
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill="transparent"
            stroke="#2f7ae5"
            strokeWidth={hs / 4}
            style={{ cursor: "move" }}
            onPointerDown={(e) => {
              e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);
              const [x, y] = toPx(e);
              drag.current = { handle: "move", start: rect, x, y };
            }}
          />
          {HANDLES.map((h) => {
            const [x, y] = pos(h);
            return (
              <rect
                key={h}
                data-handle={h}
                x={x - hs / 2}
                y={y - hs / 2}
                width={hs}
                height={hs}
                fill="white"
                stroke="#2f7ae5"
                strokeWidth={hs / 6}
                style={{ cursor: `${h === "n" || h === "s" ? "ns" : h === "e" || h === "w" ? "ew" : h === "ne" || h === "sw" ? "nesw" : "nwse"}-resize` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.ownerSVGElement!.setPointerCapture(e.pointerId);
                  const [px, py] = toPx(e);
                  drag.current = { handle: h, start: rect, x: px, y: py };
                }}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
