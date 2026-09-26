/**
 * Format pivot d'un schéma, `figure.json` (SPEC §5).
 * Unités en mm sur la planche ; origine en haut à gauche, y vers le bas (comme SVG).
 */

export const CURRENT_FORMAT = "figurine/1";

export type Pt = [number, number];

export interface Canvas {
  unit: "mm";
  width: number;
  height: number;
  /** Pas de la grille aimantée (0 = pas de grille). */
  grid: number;
}

export interface Item {
  /** Identifiant unique, utilisé dans les ancres (« pav.top »). */
  id: string;
  /** Type de composant (« layer_stack », « spring »…). */
  type: string;
  /** Position de l'origine du composant. */
  at?: Pt;
  /** Position donnée par une ancre d'un autre élément (« pav.top »). */
  on?: string;
  /** Extrémités d'un composant linéaire (ressort, amortisseur, cote…) : ancre ou point. */
  from?: string | Pt;
  to?: string | Pt;
  /** Rotation en degrés, sens trigonométrique (comme TikZ). */
  rotate?: number;
  params: Record<string, unknown>;
}

export interface FigureDoc {
  format: typeof CURRENT_FORMAT;
  canvas: Canvas;
  theme: string;
  items: Item[];
}

export interface FigureError {
  /** Chemin du champ ou de l'élément fautif (« items[2].params.layers[0].h »). */
  path: string;
  message: string;
}
