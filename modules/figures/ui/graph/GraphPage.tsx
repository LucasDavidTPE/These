import { useEffect, useState } from "react";
import { columnLetters, type LegendPos, type SeriesType } from "../../core/graph";
import { NumberInput, TextInput } from "../editor/fields";
import { useLibrary } from "../library/useLibrary";
import { Apercu } from "./Apercu";
import { Apparence, SerieLook } from "./Apparence";
import { Modeles } from "./Modeles";
import { useGraph } from "./useGraph";

const TYPES: { value: SeriesType; label: string }[] = [
  { value: "linepoints", label: "Lignes et points" },
  { value: "line", label: "Lignes" },
  { value: "points", label: "Points" },
  { value: "bar", label: "Barres" },
];

const LEGENDS: { value: LegendPos; label: string }[] = [
  { value: "north east", label: "En haut à droite" },
  { value: "north west", label: "En haut à gauche" },
  { value: "south east", label: "En bas à droite" },
  { value: "south west", label: "En bas à gauche" },
  { value: "none", label: "Aucune" },
];

/** Page Graphes (SPEC §10). */
export function GraphPage() {
  const s = useGraph();
  const [pasted, setPasted] = useState("");

  const root = useLibrary((l) => l.root);
  const loadStyles = useGraph((g) => g.loadStyles);
  // Styles enregistrés : relus à l'ouverture de la page et quand la bibliothèque change.
  useEffect(() => {
    void loadStyles();
  }, [root, loadStyles]);

  const sheet = s.sheets[s.pick.sheet];
  const cols = sheet ? Math.max(0, ...sheet.rows.map((r) => r.length)) : 0;
  const header = sheet && s.pick.header ? sheet.rows[s.pick.firstRow] : undefined;
  const colName = (c: number) => `${columnLetters(c)}${header?.[c] !== undefined && header[c] !== null ? ` — ${String(header[c])}` : ""}`;

  return (
    <div className="editor">
      <header className="toolbar editor-toolbar">
        <button type="button" onClick={() => s.newGraph()}>
          Nouveau
        </button>
        <button type="button" className="primary" onClick={() => s.saveToLibrary()} disabled={s.busy}>
          Enregistrer
        </button>
        <span className="sep" />
        <button type="button" onClick={() => s.openFile()} disabled={s.busy}>
          Ouvrir des données…
        </button>
        <span className="grow" />
        <button type="button" onClick={() => s.copyPgfplots()} disabled={s.busy}>
          Copier pgfplots
        </button>
        <button type="button" onClick={() => s.copySvg()} disabled={s.busy}>
          Copier SVG
        </button>
        <button type="button" onClick={() => s.copyPng()} disabled={s.busy}>
          Copier PNG
        </button>
        <select
          value=""
          aria-label="Exporter"
          onChange={(e) => {
            const v = e.target.value as "tex" | "svg" | "png";
            e.target.value = "";
            if (v) void s.exportAs(v);
          }}
        >
          <option value="">Exporter…</option>
          <option value="tex">pgfplots (document autonome)</option>
          <option value="svg">SVG</option>
          <option value="png">PNG 600 dpi</option>
        </select>
      </header>
      {s.message && (
        <p className={`banner ${s.message.kind === "error" ? "error" : ""}`} style={{ whiteSpace: "pre-line" }}>
          {s.message.text}
        </p>
      )}
      <div className="editor-body">
        <aside className="panel graph-data">
          <Modeles />
          <h3>Données</h3>
          <label className="field">
            <span>Coller depuis Excel (colonnes séparées par des tabulations)</span>
            <textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"x\ty\n0,1\t8 200\n1\t11 000"} />
          </label>
          <button type="button" disabled={!pasted.trim()} onClick={() => s.paste(pasted)}>
            Lire le collage
          </button>
          {sheet && (
            <>
              <p className="muted small">Source : {s.sourceName}</p>
              {s.sheets.length > 1 && (
                <label className="field">
                  <span>Feuille</span>
                  <select value={s.pick.sheet} onChange={(e) => s.setPick({ sheet: Number(e.target.value) })}>
                    {s.sheets.map((sh, i) => (
                      <option key={i} value={i}>
                        {sh.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="chip">
                <input type="checkbox" checked={s.pick.header} onChange={(e) => s.setPick({ header: e.target.checked })} />
                Première ligne = noms des colonnes
              </label>
              <div className="grid2">
                <label className="field">
                  <span>De la ligne</span>
                  <NumberInput value={s.pick.firstRow + 1} onChange={(v) => s.setPick({ firstRow: Math.max(0, Math.round(v) - 1) })} />
                </label>
                <label className="field">
                  <span>à la ligne</span>
                  <NumberInput value={s.pick.lastRow + 1} onChange={(v) => s.setPick({ lastRow: Math.max(0, Math.round(v) - 1) })} />
                </label>
              </div>
              <label className="field">
                <span>Colonne des x</span>
                <select value={s.pick.x} onChange={(e) => s.setPick({ x: Number(e.target.value) })}>
                  {Array.from({ length: cols }, (_, c) => (
                    <option key={c} value={c}>
                      {colName(c)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="list-field">
                <legend>Colonnes des y</legend>
                {Array.from({ length: cols }, (_, c) => c)
                  .filter((c) => c !== s.pick.x)
                  .map((c) => (
                    <label key={c} className="chip">
                      <input
                        type="checkbox"
                        checked={s.pick.ys.includes(c)}
                        onChange={(e) => s.setPick({ ys: e.target.checked ? [...s.pick.ys, c].sort((a, b) => a - b) : s.pick.ys.filter((y) => y !== c) })}
                      />
                      {colName(c)}
                    </label>
                  ))}
              </fieldset>
              <button type="button" className="primary" disabled={s.pick.ys.length === 0} onClick={() => s.addSeries()}>
                Ajouter les séries
              </button>
              <DataPreview />
            </>
          )}
        </aside>
        <Apercu />
        <aside className="panel props">
          <h3>Graphe</h3>
          <label className="field">
            <span>Titre (bibliothèque)</span>
            <TextInput value={s.title} onChange={(v) => s.set({ title: v })} placeholder="Graphe" />
          </label>
          <Apparence />
          <div className="grid2">
            <label className="field">
              <span>Largeur (mm)</span>
              <NumberInput value={s.doc.width} onChange={(v) => s.update({ width: v })} />
            </label>
            <label className="field">
              <span>Hauteur (mm)</span>
              <NumberInput value={s.doc.height} onChange={(v) => s.update({ height: v })} />
            </label>
          </div>
          {(["x", "y"] as const).map((k) => (
            <fieldset key={k} className="list-field">
              <legend>Axe {k}</legend>
              <label className="field">
                <span>Titre ($…$ pour les maths)</span>
                <TextInput value={s.doc[k].label} onChange={(v) => s.update({ [k]: { ...s.doc[k], label: v } })} />
              </label>
              <label className="chip">
                <input type="checkbox" checked={s.doc[k].log} onChange={(e) => s.update({ [k]: { ...s.doc[k], log: e.target.checked } })} />
                Échelle logarithmique
              </label>
              <div className="grid2">
                <label className="field">
                  <span>Min (vide = auto)</span>
                  <TextInput
                    value={s.doc[k].min === undefined ? "" : String(s.doc[k].min).replace(".", ",")}
                    onChange={(v) => {
                      const n = Number(v.replace(",", "."));
                      s.update({ [k]: { ...s.doc[k], min: v.trim() === "" || !Number.isFinite(n) ? undefined : n } });
                    }}
                  />
                </label>
                <label className="field">
                  <span>Max (vide = auto)</span>
                  <TextInput
                    value={s.doc[k].max === undefined ? "" : String(s.doc[k].max).replace(".", ",")}
                    onChange={(v) => {
                      const n = Number(v.replace(",", "."));
                      s.update({ [k]: { ...s.doc[k], max: v.trim() === "" || !Number.isFinite(n) ? undefined : n } });
                    }}
                  />
                </label>
              </div>
            </fieldset>
          ))}
          <label className="field">
            <span>Légende</span>
            <select value={s.doc.legend} onChange={(e) => s.update({ legend: e.target.value as LegendPos })}>
              {LEGENDS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="chip">
            <input type="checkbox" checked={s.doc.grid} onChange={(e) => s.update({ grid: e.target.checked })} />
            Grille
          </label>
          <label className="chip">
            <input type="checkbox" checked={s.dataFiles} onChange={(e) => s.set({ dataFiles: e.target.checked })} />
            Données dans des fichiers .dat (à l'enregistrement)
          </label>
          <h3>Séries</h3>
          {s.doc.series.map((sr, i) => (
            <div key={i} className="list-row">
              <div className="list-row-head">
                <b>{i + 1}</b>
                <span className="muted small">{sr.x.length} points</span>
                <span className="grow" />
                <button type="button" className="small-btn" disabled={i === 0} onClick={() => s.moveSeries(i, -1)}>
                  ↑
                </button>
                <button type="button" className="small-btn" disabled={i === s.doc.series.length - 1} onClick={() => s.moveSeries(i, 1)}>
                  ↓
                </button>
                <button type="button" className="small-btn" onClick={() => s.removeSeries(i)}>
                  ✕
                </button>
              </div>
              <label className="field">
                <span>Nom (légende)</span>
                <TextInput value={sr.name} onChange={(v) => s.setSeries(i, { name: v })} />
              </label>
              <label className="field">
                <span>Type</span>
                <select value={sr.type} onChange={(e) => s.setSeries(i, { type: e.target.value as SeriesType })}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <SerieLook i={i} sr={sr} />
              <label className="chip">
                <input type="checkbox" checked={sr.legend} onChange={(e) => s.setSeries(i, { legend: e.target.checked })} />
                Dans la légende
              </label>
            </div>
          ))}
          {s.doc.series.some((sr) => sr.type === "bar") && (
            <label className="field">
              <span>Largeur des barres (mm)</span>
              <NumberInput value={s.doc.bar_width} onChange={(v) => s.update({ bar_width: v })} />
            </label>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Aperçu des premières lignes de la feuille choisie. */
function DataPreview() {
  const sheet = useGraph((s) => s.sheets[s.pick.sheet]);
  if (!sheet) return null;
  const rows = sheet.rows.slice(0, 8);
  const cols = Math.max(0, ...rows.map((r) => r.length));
  return (
    <table className="data-preview">
      <thead>
        <tr>
          <th />
          {Array.from({ length: cols }, (_, c) => (
            <th key={c}>{columnLetters(c)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <th>{i + 1}</th>
            {Array.from({ length: cols }, (_, c) => (
              <td key={c}>{r[c] === null || r[c] === undefined ? "" : String(r[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
      {sheet.rows.length > rows.length && (
        <tfoot>
          <tr>
            <td colSpan={cols + 1} className="muted small">
              … {sheet.rows.length} lignes
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
