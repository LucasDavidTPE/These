/**
 * Opérations d'édition sur un schéma (fonctions pures : document → nouveau document).
 * Les références d'ancres restent cohérentes : renommer un élément met à jour ses
 * références, supprimer un support fige les éléments qui s'y rattachaient.
 */
import { COMPONENTS } from "../schema/components";
import { layoutFigure, splitAnchorRef, type Layout } from "../schema/layout";
import { validateParams } from "../schema/params";
import type { FigureDoc, Item, Pt } from "../schema/types";
import { itemBox, snapPoint, unionBox } from "./geometry";

/** Préfixe d'identifiant par type, pour des noms lisibles dans le TikZ (k1, d2, pav1…). */
const ID_PREFIX: Record<string, string> = {
  spring: "k",
  dashpot: "d",
  parabolic: "par",
  slider: "pat",
  link: "l",
  node: "n",
  layer_stack: "pav",
  force: "F",
  uniform_load: "q",
  pressure_profile: "p",
  rectangle: "r",
};

export function uniqueId(doc: FigureDoc, base: string): string {
  const taken = new Set(doc.items.map((i) => i.id));
  const clean = base.replace(/[^A-Za-z0-9_-]/g, "") || "e";
  const start = /^[A-Za-z]/.test(clean) ? clean : `e${clean}`;
  for (let n = 1; ; n++) {
    const id = `${start}${n}`;
    if (!taken.has(id)) return id;
  }
}

function prefixFor(type: string): string {
  return ID_PREFIX[type] ?? type.split("_").map((w) => w[0]).join("");
}

/** Nouvel élément avec ses paramètres par défaut, placé en `at` (aimanté à la grille). */
export function addItem(doc: FigureDoc, type: string, at: Pt): { doc: FigureDoc; id: string } {
  const def = COMPONENTS[type];
  if (!def) throw new Error(`Type inconnu : ${type}`);
  const id = uniqueId(doc, prefixFor(type));
  const params = validateParams(def.params, {}, "params").value;
  const p = snapPoint(at, doc.canvas.grid);
  const item: Item =
    def.placement === "segment"
      ? { id, type, from: p, to: [p[0] + (typeof params.length === "number" ? params.length : 20), p[1]], params }
      : { id, type, at: p, params };
  return { doc: { ...doc, items: [...doc.items, item] }, id };
}

function refTarget(ref: string | Pt | undefined): string | null {
  return typeof ref === "string" ? (splitAnchorRef(ref)?.id ?? null) : null;
}

function shift(p: Pt, d: Pt): Pt {
  return [p[0] + d[0], p[1] + d[1]];
}

/**
 * Déplace les éléments. Un élément posé sur une ancre (`on`) est détaché (il reçoit une
 * position `at`) ; les extrémités liées à une ancre restent liées (elles suivent leur support).
 */
export function moveItems(doc: FigureDoc, ids: readonly string[], d: Pt, layout: Layout = layoutFigure(doc)): FigureDoc {
  const set = new Set(ids);
  const placed = new Map(layout.placed.map((p) => [p.item.id, p]));
  return {
    ...doc,
    items: doc.items.map((it) => {
      if (!set.has(it.id)) return it;
      const next: Item = { ...it };
      if (it.at) next.at = shift(it.at, d);
      if (it.on !== undefined) {
        const origin = placed.get(it.id)?.transform.origin;
        if (origin) {
          delete next.on;
          next.at = shift(origin, d);
        }
      }
      if (Array.isArray(it.from)) next.from = shift(it.from, d);
      if (Array.isArray(it.to)) next.to = shift(it.to, d);
      return next;
    }),
  };
}

/** Modifie une extrémité d'un élément linéaire (point ou référence d'ancre). */
export function setEndpoint(doc: FigureDoc, id: string, end: "from" | "to", value: Pt | string): FigureDoc {
  return { ...doc, items: doc.items.map((it) => (it.id === id ? { ...it, [end]: value } : it)) };
}

/** Remplace dans les autres éléments les références vers `ids` par leur position actuelle. */
function freezeRefsTo(items: Item[], ids: ReadonlySet<string>, layout: Layout): Item[] {
  const placed = new Map(layout.placed.map((p) => [p.item.id, p]));
  const resolve = (ref: string): Pt | null => {
    const parts = splitAnchorRef(ref);
    const pt = parts ? placed.get(parts.id)?.anchors[parts.anchor] : undefined;
    return pt ? [pt[0], pt[1]] : null;
  };
  return items.map((it) => {
    const next: Item = { ...it };
    for (const k of ["from", "to"] as const) {
      const v = it[k];
      const t = refTarget(v);
      if (t && ids.has(t)) {
        const pt = resolve(v as string);
        if (pt) next[k] = pt;
      }
    }
    const t = refTarget(it.on);
    if (t && ids.has(t)) {
      const origin = placed.get(it.id)?.transform.origin;
      delete next.on;
      if (origin) next.at = [origin[0], origin[1]];
    }
    return next;
  });
}

export function deleteItems(doc: FigureDoc, ids: readonly string[], layout: Layout = layoutFigure(doc)): FigureDoc {
  const set = new Set(ids);
  const kept = doc.items.filter((it) => !set.has(it.id));
  return { ...doc, items: freezeRefsTo(kept, set, layout) };
}

/** Change l'identifiant d'un élément et toutes les références vers lui. */
export function renameItem(doc: FigureDoc, from: string, to: string): FigureDoc {
  if (from === to) return doc;
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(to)) throw new Error("Identifiant invalide (lettres, chiffres, _ et -, commençant par une lettre).");
  if (doc.items.some((i) => i.id === to)) throw new Error(`L'identifiant « ${to} » est déjà utilisé.`);
  const fix = (v: string | Pt | undefined) => (typeof v === "string" && v.startsWith(`${from}.`) ? `${to}${v.slice(from.length)}` : v);
  return {
    ...doc,
    items: doc.items.map((it) => {
      const next: Item = { ...it, id: it.id === from ? to : it.id };
      if (it.on !== undefined) next.on = fix(it.on) as string;
      if (it.from !== undefined) next.from = fix(it.from);
      if (it.to !== undefined) next.to = fix(it.to);
      return next;
    }),
  };
}

export function updateItem(doc: FigureDoc, id: string, patch: Partial<Omit<Item, "id">>): FigureDoc {
  return {
    ...doc,
    items: doc.items.map((it) => {
      if (it.id !== id) return it;
      const next: Item = { ...it, ...patch };
      for (const k of ["at", "on", "from", "to", "rotate"] as const) if (next[k] === undefined) delete next[k];
      return next;
    }),
  };
}

export function setParam(doc: FigureDoc, id: string, key: string, value: unknown): FigureDoc {
  return {
    ...doc,
    items: doc.items.map((it) => {
      if (it.id !== id) return it;
      const params = { ...it.params };
      if (value === undefined) delete params[key];
      else params[key] = value;
      return { ...it, params };
    }),
  };
}

/** Presse-papier interne de l'éditeur (JSON sérialisable). */
export interface ItemClipboard {
  kind: "figurine/items";
  items: Item[];
}

export function copyItems(doc: FigureDoc, ids: readonly string[]): ItemClipboard {
  const set = new Set(ids);
  return { kind: "figurine/items", items: structuredClone(doc.items.filter((it) => set.has(it.id))) };
}

/**
 * Colle des éléments : identifiants renommés s'ils sont pris, références entre éléments
 * collés mises à jour, positions décalées de `offset`.
 */
export function pasteItems(doc: FigureDoc, clip: ItemClipboard, offset: Pt): { doc: FigureDoc; ids: string[] } {
  const taken = new Set(doc.items.map((i) => i.id));
  const rename = new Map<string, string>();
  for (const it of clip.items) {
    let id = it.id;
    if (taken.has(id)) {
      const base = it.id.replace(/\d+$/, "") || "e";
      for (let n = 1; taken.has(id); n++) id = `${base}${n}`;
    }
    taken.add(id);
    rename.set(it.id, id);
  }
  const fix = (v: string | Pt | undefined): string | Pt | undefined => {
    if (typeof v !== "string") return Array.isArray(v) ? shift(v, offset) : v;
    const parts = splitAnchorRef(v);
    return parts && rename.has(parts.id) ? `${rename.get(parts.id)}.${parts.anchor}` : v;
  };
  const pasted = clip.items.map((it) => {
    const next: Item = { ...structuredClone(it), id: rename.get(it.id)! };
    if (it.at) next.at = shift(it.at, offset);
    if (it.on !== undefined) next.on = fix(it.on) as string;
    if (it.from !== undefined) next.from = fix(it.from);
    if (it.to !== undefined) next.to = fix(it.to);
    return next;
  });
  return { doc: { ...doc, items: [...doc.items, ...pasted] }, ids: pasted.map((p) => p.id) };
}

export type Reorder = "front" | "back" | "forward" | "backward";

/** Ordre de dessin (calques simples : avant / arrière). */
export function reorderItems(doc: FigureDoc, ids: readonly string[], how: Reorder): FigureDoc {
  const set = new Set(ids);
  const items = [...doc.items];
  if (how === "front") return { ...doc, items: [...items.filter((i) => !set.has(i.id)), ...items.filter((i) => set.has(i.id))] };
  if (how === "back") return { ...doc, items: [...items.filter((i) => set.has(i.id)), ...items.filter((i) => !set.has(i.id))] };
  if (how === "forward") {
    for (let i = items.length - 2; i >= 0; i--) {
      if (set.has(items[i]!.id) && !set.has(items[i + 1]!.id)) [items[i], items[i + 1]] = [items[i + 1]!, items[i]!];
    }
  } else {
    for (let i = 1; i < items.length; i++) {
      if (set.has(items[i]!.id) && !set.has(items[i - 1]!.id)) [items[i], items[i - 1]] = [items[i - 1]!, items[i]!];
    }
  }
  return { ...doc, items };
}

export type Align = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Aligne les éléments sélectionnés sur leur boîte commune. */
export function alignItems(doc: FigureDoc, ids: readonly string[], how: Align, layout: Layout = layoutFigure(doc)): FigureDoc {
  const placed = layout.placed.filter((p) => ids.includes(p.item.id));
  const all = unionBox(placed.map(itemBox));
  if (!all || placed.length < 2) return doc;
  let cur = doc;
  for (const p of placed) {
    const b = itemBox(p);
    const d: Pt =
      how === "left"
        ? [all.x - b.x, 0]
        : how === "right"
          ? [all.x + all.w - (b.x + b.w), 0]
          : how === "hcenter"
            ? [all.x + all.w / 2 - (b.x + b.w / 2), 0]
            : how === "top"
              ? [0, all.y - b.y]
              : how === "bottom"
                ? [0, all.y + all.h - (b.y + b.h)]
                : [0, all.y + all.h / 2 - (b.y + b.h / 2)];
    if (d[0] !== 0 || d[1] !== 0) cur = moveItems(cur, [p.item.id], d, layoutFigure(cur));
  }
  return cur;
}

/** Répartit les centres à intervalles réguliers (au moins trois éléments). */
export function distributeItems(doc: FigureDoc, ids: readonly string[], axis: "h" | "v", layout: Layout = layoutFigure(doc)): FigureDoc {
  const placed = layout.placed.filter((p) => ids.includes(p.item.id));
  if (placed.length < 3) return doc;
  const center = (p: (typeof placed)[number]) => {
    const b = itemBox(p);
    return axis === "h" ? b.x + b.w / 2 : b.y + b.h / 2;
  };
  const sorted = [...placed].sort((a, b) => center(a) - center(b));
  const first = center(sorted[0]!);
  const step = (center(sorted.at(-1)!) - first) / (sorted.length - 1);
  let cur = doc;
  sorted.forEach((p, i) => {
    const delta = first + i * step - center(p);
    if (Math.abs(delta) > 1e-9) cur = moveItems(cur, [p.item.id], axis === "h" ? [delta, 0] : [0, delta], layoutFigure(cur));
  });
  return cur;
}

/** Figure vide pour un nouveau schéma. */
export function emptyFigure(width = 140, height = 90): FigureDoc {
  return { format: "figurine/1", canvas: { unit: "mm", width, height, grid: 1 }, theme: "these", items: [] };
}

/** Saisie d'une position : « 12 ; 30 » (virgule décimale acceptée) → [12, 30] ; sinon une ancre. */
export function parsePlace(text: string): Pt | string | null {
  const t = text.trim();
  if (t === "") return null;
  const m = /^(-?[\d.,]+)\s*[;\s]\s*(-?[\d.,]+)$/.exec(t);
  if (m) {
    const x = Number(m[1]!.replace(",", "."));
    const y = Number(m[2]!.replace(",", "."));
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return t;
}

/** « 0 0 ; 10 -5 ; 20 0 » (virgule décimale acceptée) → [[0,0],[10,-5],[20,0]] ; null si invalide. */
export function parsePoints(text: string): Pt[] | null {
  const pts: Pt[] = [];
  for (const part of text.split(";").map((t) => t.trim()).filter(Boolean)) {
    const nums = part.split(/\s+/).map((t) => Number(t.replace(",", ".")));
    if (nums.length !== 2 || !nums.every(Number.isFinite)) return null;
    pts.push([nums[0]!, nums[1]!]);
  }
  return pts;
}

export function formatPoints(pts: readonly Pt[]): string {
  return pts.map(([x, y]) => `${String(x).replace(".", ",")} ${String(y).replace(".", ",")}`).join(" ; ");
}
