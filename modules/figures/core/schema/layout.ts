/**
 * Mise en place des éléments : résolution des ancres (« pav.layer[0].top.right »),
 * placement (at / on / from-to, rotation) et géométrie en coordonnées de la planche.
 * Une ancre introuvable produit une erreur claire, jamais un plantage.
 */
import type { ComponentDef, GeometryContext } from "./component";
import { COMPONENTS } from "./components";
import { applyTransform, dist, transformPrimitive, type Primitive, type Transform } from "./geometry";
import type { FigureDoc, FigureError, Item, Pt } from "./types";

export interface PlacedItem {
  item: Item;
  def: ComponentDef;
  ctx: GeometryContext;
  transform: Transform;
  /** Primitives en coordonnées de la planche. */
  primitives: Primitive[];
  /** Ancres en coordonnées de la planche. */
  anchors: Record<string, Pt>;
}

export interface Layout {
  placed: PlacedItem[];
  errors: FigureError[];
}

/** « pav.layer[0].top.right » → { id: « pav », anchor: « layer[0].top.right » }. */
export function splitAnchorRef(ref: string): { id: string; anchor: string } | null {
  const dot = ref.indexOf(".");
  if (dot <= 0 || dot === ref.length - 1) return null;
  return { id: ref.slice(0, dot), anchor: ref.slice(dot + 1) };
}

export function layoutFigure(doc: FigureDoc, registry: Record<string, ComponentDef> = COMPONENTS): Layout {
  const errors: FigureError[] = [];
  const byId = new Map(doc.items.map((it, i) => [it.id, { item: it, index: i }]));
  const placed = new Map<string, PlacedItem>();
  const failed = new Set<string>();
  const state = new Map<string, "visiting" | "done">();

  const pathOf = (id: string) => `items[${byId.get(id)!.index}]`;

  const resolveRef = (from: Item, ref: string, chain: string[]): Pt | null => {
    const parts = splitAnchorRef(ref);
    if (!parts) {
      errors.push({ path: pathOf(from.id), message: `« ${from.id} » : ancre « ${ref} » mal formée (attendu « élément.ancre »).` });
      return null;
    }
    const target = byId.get(parts.id);
    if (!target) {
      errors.push({ path: pathOf(from.id), message: `« ${from.id} » : l'élément « ${parts.id} » n'existe pas (ancre « ${ref} »).` });
      return null;
    }
    const p = visit(parts.id, [...chain, from.id]);
    if (!p) return null;
    const pt = p.anchors[parts.anchor];
    if (!pt) {
      const names = Object.keys(p.anchors);
      const shown = names.slice(0, 12).join(", ") + (names.length > 12 ? ", …" : "");
      errors.push({ path: pathOf(from.id), message: `« ${from.id} » : ancre « ${ref} » introuvable. Ancres de « ${parts.id} » : ${shown}.` });
      return null;
    }
    return pt;
  };

  const point = (from: Item, v: string | Pt, chain: string[]): Pt | null => (typeof v === "string" ? resolveRef(from, v, chain) : v);

  function visit(id: string, chain: string[]): PlacedItem | null {
    if (placed.has(id)) return placed.get(id)!;
    if (failed.has(id)) return null;
    if (state.get(id) === "visiting") {
      errors.push({ path: pathOf(id), message: `dépendance circulaire : ${[...chain, id].join(" → ")}.` });
      failed.add(id);
      return null;
    }
    state.set(id, "visiting");
    const { item } = byId.get(id)!;
    const def = registry[item.type];
    let result: PlacedItem | null = null;
    if (!def) {
      errors.push({ path: pathOf(id), message: `type « ${item.type} » inconnu.` });
    } else {
      let transform: Transform | null = null;
      let ctx: GeometryContext = { length: typeof item.params.length === "number" ? item.params.length : 0 };
      if (item.from !== undefined && item.to !== undefined) {
        const a = point(item, item.from, chain);
        const b = point(item, item.to, chain);
        if (a && b) {
          const L = dist(a, b);
          if (L < 1e-9) errors.push({ path: pathOf(id), message: `« ${id} » : « from » et « to » sont confondus.` });
          else {
            // Angle visuel (sens trigonométrique, y vers le bas).
            const deg = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI;
            transform = { origin: a, deg };
            ctx = { length: L };
          }
        }
      } else {
        const origin = item.on !== undefined ? resolveRef(item, item.on, chain) : (item.at ?? null);
        if (origin) transform = { origin, deg: item.rotate ?? 0 };
      }
      if (transform) {
        const local = def.geometry(item.params, ctx);
        const anchors = Object.fromEntries(
          Object.entries(def.anchors(item.params, ctx)).map(([k, v]) => [k, applyTransform(transform!, v)]),
        );
        result = {
          item,
          def,
          ctx,
          transform,
          primitives: local.map((p) => transformPrimitive(transform!, p)),
          anchors,
        };
      }
    }
    state.set(id, "done");
    if (result) placed.set(id, result);
    else failed.add(id);
    return result;
  }

  for (const item of doc.items) visit(item.id, []);
  // Ordre du document (ordre de dessin), pas l'ordre de résolution.
  return { placed: doc.items.map((it) => placed.get(it.id)).filter((p): p is PlacedItem => !!p), errors };
}

/** Résout une ancre isolée (pour l'éditeur) ; null + message si introuvable. */
export function resolveAnchor(layout: Layout, ref: string): { point: Pt } | { error: string } {
  const parts = splitAnchorRef(ref);
  if (!parts) return { error: `ancre « ${ref} » mal formée (attendu « élément.ancre »).` };
  const p = layout.placed.find((x) => x.item.id === parts.id);
  if (!p) return { error: `l'élément « ${parts.id} » n'existe pas.` };
  const pt = p.anchors[parts.anchor];
  return pt ? { point: pt } : { error: `ancre « ${ref} » introuvable.` };
}
