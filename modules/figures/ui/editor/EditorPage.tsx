import { useEffect, useMemo } from "react";
import { canRedo, canUndo } from "../../core/editor";
import { layoutFigure } from "../../core/schema";
import { EditorCanvas } from "./EditorCanvas";
import { Palette } from "./Palette";
import { PropertiesPanel } from "./PropertiesPanel";
import { useEditor } from "./useEditor";

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Page Schéma : palette, planche, propriétés (SPEC §5-§7). */
export function EditorPage() {
  const s = useEditor();
  const layout = useMemo(() => layoutFigure(s.history.present), [s.history.present]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useEditor.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const g = st.history.present.canvas.grid || 1;
      const step = e.shiftKey ? 10 * g : g;
      const key = e.key.toLowerCase();
      // Raccourcis toujours actifs, puis ceux qui modifient la figure.
      const always: Record<string, () => void> = {
        z: () => (e.shiftKey ? st.redo() : st.undo()),
        y: () => st.redo(),
      };
      const editing: Record<string, () => void> = {
        c: () => st.copy(),
        x: () => st.cut(),
        v: () => st.paste(),
        d: () => st.duplicate(),
        s: () => void st.saveToLibrary(),
        a: () => st.select(st.history.present.items.map((i) => i.id)),
      };
      let action: (() => void) | undefined;
      if (ctrl) action = always[key] ?? (st.readOnly ? undefined : editing[key]);
      else if (e.key === "Escape") action = () => st.select([]);
      else if (!st.readOnly && (e.key === "Delete" || e.key === "Backspace")) action = () => st.deleteSelection();
      else if (!st.readOnly && e.key.startsWith("Arrow") && st.selection.length > 0) {
        const d: [number, number] = e.key === "ArrowLeft" ? [-step, 0] : e.key === "ArrowRight" ? [step, 0] : e.key === "ArrowUp" ? [0, -step] : [0, step];
        action = () => st.nudge(d);
      }
      if (action) {
        e.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fit = () => {
    const el = document.querySelector(".editor-canvas");
    if (!el) return;
    const { width, height } = s.history.present.canvas;
    const z = Math.min((el.clientWidth - 40) / width, (el.clientHeight - 40) / height);
    s.setView(z, [-(el.clientWidth / z - width) / 2, -(el.clientHeight / z - height) / 2]);
  };

  const many = s.selection.length >= 2;
  const some = s.selection.length >= 1;

  return (
    <div className="editor">
      <header className="toolbar editor-toolbar">
        <button type="button" onClick={() => s.newFigure()} title="Nouveau schéma">
          Nouveau
        </button>
        <button type="button" className="primary" onClick={() => s.saveToLibrary()} disabled={s.busy || s.readOnly} title="Ctrl+S">
          Enregistrer{s.dirty ? " *" : ""}
        </button>
        <span className="sep" />
        <button type="button" onClick={() => s.undo()} disabled={!canUndo(s.history)} title="Annuler (Ctrl+Z)">
          ↶
        </button>
        <button type="button" onClick={() => s.redo()} disabled={!canRedo(s.history)} title="Rétablir (Ctrl+Y)">
          ↷
        </button>
        <span className="sep" />
        <button type="button" onClick={() => s.setView(s.zoom / 1.25, s.pan)} title="Zoom arrière">
          −
        </button>
        <button type="button" onClick={fit} title="Ajuster à la fenêtre">
          {Math.round((s.zoom / 3.78) * 100)} %
        </button>
        <button type="button" onClick={() => s.setView(s.zoom * 1.25, s.pan)} title="Zoom avant">
          +
        </button>
        <label className="chip">
          <input type="checkbox" checked={s.showGrid} onChange={() => s.toggle("showGrid")} />
          Grille
        </label>
        <label className="chip">
          <input type="checkbox" checked={s.snap} onChange={() => s.toggle("snap")} />
          Aimanter
        </label>
        <span className="sep" />
        <select
          value=""
          disabled={!some}
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith("align:")) s.align(v.slice(6) as Parameters<typeof s.align>[0]);
            else if (v.startsWith("dist:")) s.distribute(v.slice(5) as "h" | "v");
            else if (v.startsWith("order:")) s.reorder(v.slice(6) as Parameters<typeof s.reorder>[0]);
            e.target.value = "";
          }}
          aria-label="Disposition"
        >
          <option value="">Disposition…</option>
          <optgroup label="Aligner">
            {[
              ["left", "À gauche"],
              ["hcenter", "Centres (horizontal)"],
              ["right", "À droite"],
              ["top", "En haut"],
              ["vcenter", "Centres (vertical)"],
              ["bottom", "En bas"],
            ].map(([v, l]) => (
              <option key={v} value={`align:${v}`} disabled={!many}>
                {l}
              </option>
            ))}
          </optgroup>
          <optgroup label="Répartir">
            <option value="dist:h" disabled={s.selection.length < 3}>
              Horizontalement
            </option>
            <option value="dist:v" disabled={s.selection.length < 3}>
              Verticalement
            </option>
          </optgroup>
          <optgroup label="Ordre">
            <option value="order:front">Premier plan</option>
            <option value="order:forward">Avancer</option>
            <option value="order:backward">Reculer</option>
            <option value="order:back">Arrière-plan</option>
          </optgroup>
        </select>
        <button type="button" onClick={() => s.deleteSelection()} disabled={!some || s.readOnly} title="Suppr">
          Supprimer
        </button>
        <span className="grow" />
        <button type="button" onClick={() => s.copyTikz()} disabled={s.busy}>
          Copier TikZ
        </button>
        <button type="button" onClick={() => s.copySvg()} disabled={s.busy}>
          Copier SVG
        </button>
        <button type="button" onClick={() => s.copyPng(300)} disabled={s.busy} title="PNG 300 dpi, fond transparent">
          Copier PNG
        </button>
        <select
          value=""
          disabled={s.busy}
          aria-label="Exporter"
          onChange={(e) => {
            const v = e.target.value as Parameters<typeof s.exportAs>[0];
            e.target.value = "";
            if (v) void s.exportAs(v);
          }}
        >
          <option value="">Exporter…</option>
          <option value="png300">PNG 300 dpi (transparent)</option>
          <option value="png600">PNG 600 dpi (transparent)</option>
          <option value="png600white">PNG 600 dpi (fond blanc)</option>
          <option value="svg">SVG</option>
          <option value="tex">TikZ (environnement seul)</option>
          <option value="texStandalone">TikZ (document autonome)</option>
          <option value="sty">figurine.sty (paquet LaTeX)</option>
        </select>
      </header>
      {s.message && (
        <p className={`banner ${s.message.kind === "error" ? "error" : ""}`} style={{ whiteSpace: "pre-line" }}>
          {s.message.text}{" "}
          <button type="button" className="link" onClick={() => s.say(null)}>
            OK
          </button>
        </p>
      )}
      {s.readOnly && <p className="banner warn">Lecture seule : cette figure est en cours d'édition sur un autre poste.</p>}
      {layout.errors.length > 0 && (
        <p className="banner error" style={{ whiteSpace: "pre-line" }}>
          {layout.errors.map((e) => e.message).join("\n")}
        </p>
      )}
      <div className="editor-body">
        <Palette />
        <EditorCanvas />
        <PropertiesPanel />
      </div>
    </div>
  );
}
