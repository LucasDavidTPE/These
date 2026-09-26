/**
 * Schéma des paramètres d'un composant : sert à la validation (avec valeurs par défaut)
 * et, en S6, à générer le panneau de propriétés de l'éditeur.
 */
import type { FigureError } from "./types";

export type ParamSpec =
  | { kind: "number"; label: string; default: number; min?: number; max?: number; integer?: boolean; unit?: string }
  | { kind: "string"; label: string; default: string; math?: boolean }
  | { kind: "boolean"; label: string; default: boolean }
  | { kind: "enum"; label: string; default: string; options: readonly { value: string; label: string }[] }
  | { kind: "list"; label: string; default: Record<string, unknown>[]; item: ParamSchema; minItems?: number }
  | { kind: "numbers"; label: string; default: number[]; minItems?: number; maxItems?: number; unit?: string }
  | { kind: "points"; label: string; default: [number, number][]; minItems?: number; unit?: string }
  | { kind: "group"; label: string; default: Record<string, unknown>; fields: ParamSchema };

export type ParamSchema = Record<string, ParamSpec & { optional?: boolean }>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Valide `raw` selon `schema` et complète les valeurs absentes par défaut.
 * Les paramètres inconnus sont des erreurs (une faute de frappe ne doit pas passer).
 */
export function validateParams(
  schema: ParamSchema,
  raw: unknown,
  path: string,
): { value: Record<string, unknown>; errors: FigureError[] } {
  const errors: FigureError[] = [];
  const value: Record<string, unknown> = {};
  if (raw !== undefined && !isRecord(raw)) {
    return { value, errors: [{ path, message: "doit être un objet." }] };
  }
  const input = (raw ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(input).sort()) {
    if (!(key in schema)) errors.push({ path: `${path}.${key}`, message: `paramètre inconnu « ${key} ».` });
  }
  for (const [key, spec] of Object.entries(schema)) {
    const p = `${path}.${key}`;
    const v = input[key];
    if (v === undefined || v === null) {
      if (spec.kind === "group") value[key] = validateParams(spec.fields, spec.default, p).value;
      else if (!spec.optional) value[key] = structuredClone(spec.default);
      continue;
    }
    const err = (message: string) => errors.push({ path: p, message });
    switch (spec.kind) {
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) err("doit être un nombre.");
        else if (spec.integer && !Number.isInteger(v)) err("doit être un entier.");
        else if (spec.min !== undefined && v < spec.min) err(`doit être ≥ ${spec.min}.`);
        else if (spec.max !== undefined && v > spec.max) err(`doit être ≤ ${spec.max}.`);
        else value[key] = v;
        break;
      case "string":
        if (typeof v !== "string") err("doit être du texte.");
        else value[key] = v;
        break;
      case "boolean":
        if (typeof v !== "boolean") err("doit valoir true ou false.");
        else value[key] = v;
        break;
      case "enum":
        if (typeof v !== "string" || !spec.options.some((o) => o.value === v)) {
          err(`valeur « ${String(v)} » inconnue (possibles : ${spec.options.map((o) => o.value).join(", ")}).`);
        } else value[key] = v;
        break;
      case "numbers": {
        if (!Array.isArray(v) || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
          err("doit être une liste de nombres.");
        } else if (spec.minItems !== undefined && v.length < spec.minItems) err(`au moins ${spec.minItems} valeur(s).`);
        else if (spec.maxItems !== undefined && v.length > spec.maxItems) err(`au plus ${spec.maxItems} valeur(s).`);
        else value[key] = [...v];
        break;
      }
      case "points": {
        const ok = Array.isArray(v) && v.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every((x) => typeof x === "number" && Number.isFinite(x)));
        if (!ok) err("doit être une liste de points [x, y].");
        else if (spec.minItems !== undefined && (v as unknown[]).length < spec.minItems) err(`au moins ${spec.minItems} point(s).`);
        else value[key] = (v as [number, number][]).map(([x, y]) => [x, y]);
        break;
      }
      case "group": {
        const r = validateParams(spec.fields, v, p);
        errors.push(...r.errors);
        value[key] = r.value;
        break;
      }
      case "list": {
        if (!Array.isArray(v)) {
          err("doit être une liste.");
          break;
        }
        if (spec.minItems !== undefined && v.length < spec.minItems) err(`au moins ${spec.minItems} élément(s).`);
        value[key] = v.map((item, i) => {
          const r = validateParams(spec.item, item, `${p}[${i}]`);
          errors.push(...r.errors);
          return r.value;
        });
        break;
      }
    }
  }
  return { value, errors };
}
