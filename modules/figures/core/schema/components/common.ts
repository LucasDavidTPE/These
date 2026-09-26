/** Paramètres et aides partagés par plusieurs composants. */
import type { Fill } from "../geometry";
import type { ParamSpec } from "../params";

type EnumSpec = Extract<ParamSpec, { kind: "enum" }>;
type NumberSpec = Extract<ParamSpec, { kind: "number" }>;
import { HATCH_NAMES } from "../theme";

export const FILL_PARAM: EnumSpec = {
  kind: "enum",
  label: "Remplissage",
  default: "aucun",
  options: [
    { value: "aucun", label: "Aucun" },
    { value: "blanc", label: "Blanc" },
    { value: "gris", label: "Gris clair" },
    ...HATCH_NAMES.map((h) => ({ value: h, label: `Hachure ${h}` })),
  ],
};

export const HATCH_PARAM: EnumSpec = {
  kind: "enum",
  label: "Hachure",
  default: "aucune",
  options: [{ value: "aucune", label: "Aucune" }, ...HATCH_NAMES.map((h) => ({ value: h, label: h }))],
};

export function fillOf(value: string): Fill {
  if (value === "aucun" || value === "aucune") return "none";
  if (value === "blanc" || value === "gris") return value;
  return `hachure ${value}`;
}

export const LABEL_SIDE: EnumSpec = {
  kind: "enum",
  label: "Côté de l'étiquette",
  default: "dessus",
  options: [
    { value: "dessus", label: "Dessus" },
    { value: "dessous", label: "Dessous" },
  ],
};

/** Longueur par défaut d'un composant linéaire placé par `at`. */
export const LENGTH_PARAM: NumberSpec = { kind: "number", label: "Longueur", default: 20, min: 2, max: 1000, unit: "mm" };
