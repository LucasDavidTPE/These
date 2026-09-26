import { COMPONENT_LIST, type Category } from "../../core/schema";
import { useEditor } from "./useEditor";

const CATEGORY_LABELS: Record<Category, string> = {
  rheologie: "Rhéologie",
  structure: "Structure",
  chargement: "Chargement",
  annotation: "Annotations",
  libre: "Formes libres",
};

/** Palette des composants : glisser sur la planche, ou cliquer pour ajouter au centre de la vue. */
export function Palette() {
  const readOnly = useEditor((s) => s.readOnly);
  const addAtCenter = (type: string) => {
    const st = useEditor.getState();
    const el = document.querySelector(".editor-canvas");
    const w = el ? el.clientWidth : 600;
    const h = el ? el.clientHeight : 400;
    st.add(type, [st.pan[0] + w / st.zoom / 2, st.pan[1] + h / st.zoom / 2]);
  };
  const groups = (Object.keys(CATEGORY_LABELS) as Category[])
    .map((c) => ({ c, items: COMPONENT_LIST.filter((d) => d.category === c) }))
    .filter((g) => g.items.length > 0);
  return (
    <nav className="palette" aria-label="Composants">
      {groups.map((g) => (
        <section key={g.c}>
          <h4>{CATEGORY_LABELS[g.c]}</h4>
          {g.items.map((d) => (
            <button
              key={d.type}
              type="button"
              draggable={!readOnly}
              disabled={readOnly}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-figurine", d.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => addAtCenter(d.type)}
              title={`${d.label} (${d.type})`}
            >
              {d.label}
            </button>
          ))}
        </section>
      ))}
    </nav>
  );
}
