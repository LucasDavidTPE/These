import { parsePlace, renameItem, setParam, updateItem } from "../../core/editor";
import { COMPONENTS, type Item, type Pt } from "../../core/schema";
import { NumberInput, ParamField, TextInput } from "./fields";
import { useEditor } from "./useEditor";

function showPlace(v: Pt | string | undefined): string {
  if (v === undefined) return "";
  return typeof v === "string" ? v : `${String(v[0]).replace(".", ",")} ; ${String(v[1]).replace(".", ",")}`;
}

/** Panneau de propriétés, généré depuis le schéma des paramètres du composant. */
export function PropertiesPanel() {
  const doc = useEditor((s) => s.history.present);
  const selection = useEditor((s) => s.selection);
  const apply = useEditor((s) => s.apply);
  const title = useEditor((s) => s.title);
  const setTitle = useEditor((s) => s.setTitle);

  if (selection.length !== 1) {
    return (
      <aside className="panel props">
        <h3>{selection.length > 1 ? `${selection.length} éléments sélectionnés` : "Figure"}</h3>
        <label className="field">
          <span>Titre (bibliothèque)</span>
          <TextInput value={title} onChange={setTitle} placeholder="Schéma" />
        </label>
        <label className="field">
          <span>Largeur de la planche (mm)</span>
          <NumberInput value={doc.canvas.width} onChange={(v) => apply((d) => ({ ...d, canvas: { ...d.canvas, width: v } }))} />
        </label>
        <label className="field">
          <span>Hauteur de la planche (mm)</span>
          <NumberInput value={doc.canvas.height} onChange={(v) => apply((d) => ({ ...d, canvas: { ...d.canvas, height: v } }))} />
        </label>
        <label className="field">
          <span>Pas de la grille (mm, 0 = aucune)</span>
          <NumberInput value={doc.canvas.grid} onChange={(v) => apply((d) => ({ ...d, canvas: { ...d.canvas, grid: v } }))} />
        </label>
        <p className="muted small">
          Glissez un composant depuis la palette. Molette : zoom ; Alt + glisser : déplacer la vue. Les extrémités des
          éléments linéaires se lient aux ancres des autres éléments.
        </p>
      </aside>
    );
  }

  const item = doc.items.find((i) => i.id === selection[0]);
  if (!item) return <aside className="panel props" />;
  const def = COMPONENTS[item.type]!;
  const patch = (p: Partial<Omit<Item, "id">>) => apply((d) => updateItem(d, item.id, p));

  return (
    <aside className="panel props">
      <h3>{def.label}</h3>
      <label className="field">
        <span>Identifiant (ancres : {item.id}.…)</span>
        <TextInput value={item.id} onChange={(v) => apply((d) => renameItem(d, item.id, v.trim()), [v.trim()])} />
      </label>
      {def.placement === "segment" && item.from !== undefined ? (
        <>
          <label className="field">
            <span>Début (x ; y ou ancre)</span>
            <TextInput value={showPlace(item.from)} onChange={(v) => parsePlace(v) !== null && patch({ from: parsePlace(v)! })} />
          </label>
          <label className="field">
            <span>Fin (x ; y ou ancre)</span>
            <TextInput value={showPlace(item.to)} onChange={(v) => parsePlace(v) !== null && patch({ to: parsePlace(v)! })} />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>Position (x ; y en mm, ou ancre « élément.ancre »)</span>
            <TextInput
              value={showPlace(item.on ?? item.at)}
              onChange={(v) => {
                const p = parsePlace(v);
                if (p === null) return;
                patch(typeof p === "string" ? { on: p, at: undefined } : { at: p, on: undefined });
              }}
            />
          </label>
          <label className="field">
            <span>Rotation (°)</span>
            <NumberInput value={item.rotate ?? 0} onChange={(v) => patch({ rotate: v === 0 ? undefined : v })} />
          </label>
        </>
      )}
      {Object.entries(def.params).map(([key, spec]) => (
        <ParamField key={key} spec={spec} value={item.params[key]} onChange={(v) => apply((d) => setParam(d, item.id, key, v))} />
      ))}
    </aside>
  );
}
