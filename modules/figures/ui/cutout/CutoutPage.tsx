import { useEffect, useRef, useState } from "react";
import { useCutout } from "./useCutout";
import { getBackend } from "../platform/backend";

/** Page Détourage (SPEC §8) : coller / glisser / ouvrir → détourer → copier / enregistrer. */
export function CutoutPage() {
  const s = useCutout();
  const [title, setTitle] = useState("");

  // Ctrl+V n'importe où sur la page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      void useCutout.getState().paste(e);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Glisser-déposer : fichiers (Tauri fournit des chemins, le navigateur des File).
  useEffect(() => {
    let off: (() => void) | undefined;
    void getBackend().then(async (b) => {
      off = await b.onFileDrop(async (paths) => {
        const path = paths[0];
        if (!path) return;
        try {
          await useCutout.getState().load(await b.readDroppedFile(path), null);
        } catch (e) {
          useCutout.setState({ error: String(e) });
        }
      });
    });
    return () => off?.();
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
    if (file) await s.load(new Uint8Array(await file.arrayBuffer()), null);
  };

  return (
    <section className="page cutout" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="toolbar">
        <button type="button" onClick={() => s.paste(null)} disabled={!!s.busy} title="Ctrl+V">
          Coller
        </button>
        <button type="button" onClick={() => s.open()} disabled={!!s.busy}>
          Ouvrir…
        </button>
        {s.image && (
          <button type="button" onClick={() => s.clear()} disabled={!!s.busy}>
            Effacer
          </button>
        )}
        <span className="grow" />
        {s.result && (
          <>
            <button type="button" className="primary" onClick={() => s.copy()} disabled={!!s.busy} title="Formats PNG et DIB">
              Copier
            </button>
            <button type="button" onClick={() => s.saveAs()} disabled={!!s.busy}>
              Enregistrer sous…
            </button>
          </>
        )}
      </header>
      {s.busy && <p className="banner">{s.busy}</p>}
      {s.error && <p className="banner error">{s.error}</p>}
      {s.info && <p className="banner">{s.info}</p>}

      {!s.image ? (
        <div className="dropzone">
          <p>
            <b>Ctrl+V</b> pour coller une image, ou glissez un fichier ici.
          </p>
          <p className="muted">Le détourage est fait sur ce PC, sans connexion.</p>
        </div>
      ) : (
        <div className="cutout-body">
          <CutoutCanvas />
          <aside className="cutout-side">
            <fieldset>
              <legend>Masque</legend>
              <Slider label="Seuil" min={1} max={254} value={s.settings.threshold} onChange={(v) => s.setSettings({ threshold: v })} />
              <Slider label="Douceur" min={0} max={127} value={s.settings.softness} onChange={(v) => s.setSettings({ softness: v })} />
              <Slider label="Lissage des bords" min={0} max={8} value={s.settings.smoothing} onChange={(v) => s.setSettings({ smoothing: v })} />
            </fieldset>
            <fieldset>
              <legend>Pinceau</legend>
              <div className="row">
                {(["off", "keep", "remove"] as const).map((m) => (
                  <label key={m} className="chip">
                    <input type="radio" name="brush" checked={s.brushMode === m} onChange={() => s.setBrush(m)} />
                    {m === "off" ? "Aucun" : m === "keep" ? "Garder" : "Retirer"}
                  </label>
                ))}
              </div>
              <Slider label="Taille" min={2} max={200} value={s.brushSize} onChange={(v) => s.setBrush(s.brushMode, v)} />
              <button type="button" onClick={() => s.resetBrush()}>
                Annuler les retouches
              </button>
            </fieldset>
            <label className="chip">
              <input type="checkbox" checked={s.showOriginal} onChange={(e) => s.toggleOriginal(e.target.checked)} />
              Voir l'original
            </label>
            {s.ms !== null && s.ms > 0 && <p className="muted small">Détourage : {(s.ms / 1000).toFixed(1)} s</p>}
            <fieldset>
              <legend>Bibliothèque</legend>
              <label className="field">
                <span>Titre</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Image détourée" />
              </label>
              <p className="muted small">
                Source : {s.origin.pageUrl ?? s.origin.imageUrl ?? "inconnue (à compléter dans la bibliothèque)"}
              </p>
              <button type="button" onClick={() => s.saveToLibrary(title)} disabled={!!s.busy || !s.result}>
                Enregistrer dans la bibliothèque
              </button>
            </fieldset>
          </aside>
        </div>
      )}
    </section>
  );
}

function Slider(props: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>
        {props.label} : {props.value}
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/** Aperçu sur damier ; le pinceau peint directement dessus. */
function CutoutCanvas() {
  const image = useCutout((s) => s.image);
  const result = useCutout((s) => s.result);
  const showOriginal = useCutout((s) => s.showOriginal);
  const brushMode = useCutout((s) => s.brushMode);
  const stroke = useCutout((s) => s.stroke);
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<[number, number] | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !image) return;
    c.width = image.width;
    c.height = image.height;
    const pixels = showOriginal || !result ? image.rgba : result;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), image.width, image.height), 0, 0);
  }, [image, result, showOriginal]);

  const toImage = (e: React.PointerEvent): [number, number] => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
  };

  return (
    <div className="cutout-view checker">
      <canvas
        ref={canvas}
        className={brushMode !== "off" ? "painting" : undefined}
        onPointerDown={(e) => {
          if (brushMode === "off") return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toImage(e);
          last.current = p;
          stroke(p, p);
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const p = toImage(e);
          stroke(last.current, p);
          last.current = p;
        }}
        onPointerUp={() => (last.current = null)}
      />
    </div>
  );
}
