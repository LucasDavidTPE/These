import { useEffect, useMemo, useState } from "react";
import { FIGURE_KINDS, filterAndSort, type FigureKind, type LibrarySort } from "../../core/library";
import { FigureGrid } from "./FigureGrid";
import { IssuesPanel } from "./IssuesPanel";
import { KIND_LABELS } from "./labels";
import { MetaPanel } from "./MetaPanel";
import { SettingsPanel } from "./SettingsDialog";
import { SetupScreen } from "./SetupScreen";
import { useLibrary } from "./useLibrary";

type Side = "none" | "issues" | "settings";

export function LibraryPage() {
  const s = useLibrary();
  const [side, setSide] = useState<Side>("none");

  useEffect(() => {
    void s.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () => (s.index ? filterAndSort(s.index.figures, s.filter, s.sort) : []),
    [s.index, s.filter, s.sort],
  );

  if (!s.ready) return <section className="page muted">Chargement…</section>;
  if (!s.root) return <SetupScreen />;

  const issueCount = (s.index?.issues.length ?? 0) + (s.index?.rootConflicts.length ?? 0);
  const selectedEntry = s.index?.figures.find((f) => f.folder === s.selected);
  const toggleKind = (k: FigureKind) =>
    s.setFilter({ kinds: s.filter.kinds.includes(k) ? s.filter.kinds.filter((x) => x !== k) : [...s.filter.kinds, k] });

  return (
    <div className="library">
      <div className="library-main">
        <header className="toolbar">
          <input
            type="search"
            className="grow"
            placeholder="Rechercher (titre, tags, source…)"
            value={s.filter.query}
            onChange={(e) => s.setFilter({ query: e.target.value })}
          />
          <select value={s.sort} onChange={(e) => s.setSort(e.target.value as LibrarySort)} aria-label="Tri">
            <option value="modified">Récentes d'abord</option>
            <option value="id">Par numéro</option>
            <option value="title">Par titre</option>
          </select>
          <button type="button" onClick={() => s.rescan()} disabled={s.scanning} title="Relire le dossier">
            {s.scanning ? "…" : "Actualiser"}
          </button>
          <button type="button" className={issueCount ? "warn" : undefined} onClick={() => setSide(side === "issues" ? "none" : "issues")}>
            À régler ({issueCount})
          </button>
          <button type="button" onClick={() => setSide(side === "settings" ? "none" : "settings")}>
            Réglages
          </button>
        </header>
        <div className="filters">
          {FIGURE_KINDS.map((k) => (
            <label key={k} className="chip">
              <input type="checkbox" checked={s.filter.kinds.includes(k)} onChange={() => toggleKind(k)} />
              {KIND_LABELS[k]}
            </label>
          ))}
          <label className="chip">
            <input
              type="checkbox"
              checked={s.filter.missingSourceOrLicense}
              onChange={(e) => s.setFilter({ missingSourceOrLicense: e.target.checked })}
            />
            Sans source ou sans licence
          </label>
          <span className="muted small">
            {visible.length} / {s.index?.figures.length ?? 0} figures
          </span>
        </div>
        {s.error && (
          <p className="banner error">
            {s.error}{" "}
            <button type="button" className="link" onClick={() => useLibrary.setState({ error: null })}>
              OK
            </button>
          </p>
        )}
        <FigureGrid entries={visible} />
      </div>
      {side === "issues" ? (
        <IssuesPanel onClose={() => setSide("none")} />
      ) : side === "settings" ? (
        <SettingsPanel onClose={() => setSide("none")} />
      ) : (
        selectedEntry && <MetaPanel key={selectedEntry.folder} entry={selectedEntry} />
      )}
    </div>
  );
}
