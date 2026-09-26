/**
 * Validation et migration de `figure.json` (SPEC §5).
 * Toute évolution du format fournit une migration de l'ancienne version vers la suivante.
 */
import { COMPONENTS } from "./components";
import { validateParams } from "./params";
import { THEMES } from "./theme";
import { CURRENT_FORMAT, type FigureDoc, type FigureError, type Item, type Pt } from "./types";

export interface Migration {
  /** Format produit par cette migration. */
  to: string;
  migrate(raw: Record<string, unknown>): Record<string, unknown>;
}

/** Migrations connues, indexées par format de départ. Vide tant que seul figurine/1 existe. */
export const MIGRATIONS: Record<string, Migration> = {};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Applique les migrations successives jusqu'au format courant. */
export function migrateWith(
  raw: unknown,
  migrations: Record<string, Migration>,
  current: string = CURRENT_FORMAT,
): { ok: true; value: Record<string, unknown>; applied: string[] } | { ok: false; error: FigureError } {
  if (!isRecord(raw)) return { ok: false, error: { path: "", message: "figure.json doit contenir un objet JSON." } };
  let doc = raw;
  const applied: string[] = [];
  for (let guard = 0; guard < 100; guard++) {
    const format = doc.format;
    if (format === current) return { ok: true, value: doc, applied };
    if (typeof format !== "string") {
      return { ok: false, error: { path: "format", message: `champ « format » manquant (attendu ${current}).` } };
    }
    const m = migrations[format];
    if (!m) {
      return { ok: false, error: { path: "format", message: `format « ${format} » inconnu (attendu ${current}). Figure créée par une version plus récente ?` } };
    }
    doc = { ...m.migrate(doc), format: m.to };
    applied.push(`${format} → ${m.to}`);
  }
  return { ok: false, error: { path: "format", message: "boucle dans les migrations." } };
}

const ID_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

function isPt(v: unknown): v is Pt {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** Valide (après migration) et complète les paramètres par défaut. */
export function validateFigure(raw: unknown): { ok: true; doc: FigureDoc } | { ok: false; errors: FigureError[] } {
  const migrated = migrateWith(raw, MIGRATIONS);
  if (!migrated.ok) return { ok: false, errors: [migrated.error] };
  const r = migrated.value;
  const errors: FigureError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });

  const c = r.canvas;
  let canvas: FigureDoc["canvas"] = { unit: "mm", width: 100, height: 60, grid: 1 };
  if (!isRecord(c)) err("canvas", "planche manquante.");
  else {
    if (c.unit !== "mm") err("canvas.unit", "seule l'unité « mm » est prise en charge.");
    for (const k of ["width", "height"] as const) {
      const v = c[k];
      if (typeof v !== "number" || !(v > 0) || v > 2000) err(`canvas.${k}`, "doit être un nombre entre 0 et 2000 mm.");
    }
    const grid = c.grid ?? 1;
    if (typeof grid !== "number" || grid < 0) err("canvas.grid", "doit être un nombre ≥ 0.");
    canvas = { unit: "mm", width: c.width as number, height: c.height as number, grid: grid as number };
  }

  const theme = r.theme ?? "these";
  if (typeof theme !== "string" || !(theme in THEMES)) err("theme", `thème « ${String(theme)} » inconnu (disponibles : ${Object.keys(THEMES).join(", ")}).`);

  const items: Item[] = [];
  if (!Array.isArray(r.items)) err("items", "doit être une liste.");
  const seen = new Set<string>();
  (Array.isArray(r.items) ? r.items : []).forEach((rawItem: unknown, i) => {
    const path = `items[${i}]`;
    if (!isRecord(rawItem)) return err(path, "doit être un objet.");
    const { id, type } = rawItem;
    if (typeof id !== "string" || !ID_RE.test(id)) return err(`${path}.id`, "identifiant manquant ou invalide (lettres, chiffres, _ et -, commençant par une lettre).");
    if (seen.has(id)) return err(`${path}.id`, `identifiant « ${id} » déjà utilisé.`);
    seen.add(id);
    const def = typeof type === "string" ? COMPONENTS[type] : undefined;
    if (!def) return err(`${path}.type`, `type de composant « ${String(type)} » inconnu.`);

    const item: Item = { id, type: type as string, params: {} };
    for (const k of Object.keys(rawItem)) {
      if (!["id", "type", "at", "on", "from", "to", "rotate", "params"].includes(k)) err(`${path}.${k}`, `champ inconnu « ${k} ».`);
    }
    if (rawItem.at !== undefined) {
      if (!isPt(rawItem.at)) err(`${path}.at`, "doit être un point [x, y].");
      else item.at = rawItem.at;
    }
    if (rawItem.on !== undefined) {
      if (typeof rawItem.on !== "string") err(`${path}.on`, "doit être une ancre (« pav.top »).");
      else item.on = rawItem.on;
    }
    for (const k of ["from", "to"] as const) {
      const v = rawItem[k];
      if (v === undefined) continue;
      if (typeof v === "string" || isPt(v)) item[k] = v;
      else err(`${path}.${k}`, "doit être une ancre ou un point [x, y].");
    }
    if (rawItem.rotate !== undefined) {
      if (typeof rawItem.rotate !== "number" || !Number.isFinite(rawItem.rotate)) err(`${path}.rotate`, "doit être un angle en degrés.");
      else item.rotate = rawItem.rotate;
    }

    // Placement cohérent avec le type de composant.
    const hasSeg = item.from !== undefined || item.to !== undefined;
    if (def.placement === "point") {
      if (hasSeg) err(path, `« ${def.label} » se place avec « at » ou « on », pas « from »/« to ».`);
      if ((item.at === undefined) === (item.on === undefined)) err(path, "préciser soit « at », soit « on ».");
    } else {
      if (hasSeg && (item.from === undefined || item.to === undefined)) err(path, "« from » et « to » vont ensemble.");
      if (hasSeg && (item.at !== undefined || item.on !== undefined)) err(path, "« from »/« to » excluent « at »/« on ».");
      if (!hasSeg && (item.at === undefined) === (item.on === undefined)) err(path, "préciser « from » et « to », ou bien « at » (ou « on »).");
    }

    const params = validateParams(def.params, rawItem.params, `${path}.params`);
    errors.push(...params.errors);
    item.params = params.value;
    if (params.errors.length === 0 && def.check) {
      for (const e of def.check(params.value)) err(`${path}.params.${e.path}`, e.message);
    }
    items.push(item);
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, doc: { format: CURRENT_FORMAT, canvas, theme: theme as string, items } };
}
