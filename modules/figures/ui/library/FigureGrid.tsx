import { lockStatus, thumbnailFile, type FigureEntry } from "../../core/library";
import { KIND_LABELS } from "./labels";
import { useLibrary } from "./useLibrary";

/** Adresse d'une vignette, rechargée quand la figure change (une adresse blob: n'accepte pas de paramètre). */
const versionnee = (url: string, modifiee: string | undefined) => (modifiee && !url.startsWith("blob:") ? `${url}?v=${encodeURIComponent(modifiee)}` : url);

/** Type MIME du glisser-déposer d'une figure vers un projet. */
export const GLISSE_FIGURE = "application/x-these-figure";

export function FigureGrid({ entries }: { entries: FigureEntry[] }) {
  const selected = useLibrary((s) => s.selected);
  const select = useLibrary((s) => s.select);
  const imageUrl = useLibrary((s) => s.imageUrl);
  const host = useLibrary((s) => s.host);

  if (entries.length === 0) return <p className="muted empty">Aucune figure ne correspond.</p>;

  return (
    <ul className="grid">
      {entries.map((e) => {
        const thumb = thumbnailFile(e);
        const lock = lockStatus(e.lock, host, new Date());
        return (
          <li key={e.folder}>
            <button
              type="button"
              className={`card${selected === e.folder ? " selected" : ""}`}
              onClick={() => select(e.folder)}
              title={`${e.folder} — glisser sur un projet pour l'y ranger`}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.setData(GLISSE_FIGURE, e.folder);
                ev.dataTransfer.effectAllowed = "link";
              }}
            >
              <div className="thumb">
                {thumb ? <img src={versionnee(imageUrl(`${e.folder}/${thumb}`), e.meta?.modified)} alt="" loading="lazy" /> : <span>Pas d'aperçu</span>}
              </div>
              <div className="card-id">
                {e.id}
                {e.meta && <span className="kind">{KIND_LABELS[e.meta.kind]}</span>}
              </div>
              <div className="card-title">{e.meta?.title ?? e.folder}</div>
              <div className="badges">
                {lock === "other" && <span className="badge warn">Ouverte sur {e.lock!.host}</span>}
                {e.conflicts.length > 0 && <span className="badge warn">Conflit</span>}
                {!e.meta && <span className="badge error">meta.json à revoir</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
