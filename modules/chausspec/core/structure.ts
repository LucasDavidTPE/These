/** Description de la structure multicouche (structure.py). */
import type { Material } from "./materials";

export const BOTTOMS = ["halfspace", "rigid_bonded", "rigid_smooth"] as const;
export const INTERFACES = ["bonded", "slip"] as const;
export type Bottom = (typeof BOTTOMS)[number];
export type InterfaceKind = (typeof INTERFACES)[number];

/** Couche horizontale. thickness en m (Infinity pour le massif semi-infini de fond). */
export class Layer {
  constructor(
    readonly material: Material,
    readonly thickness: number,
    readonly name = "",
  ) {}
}

/**
 * Empilement de couches, de la surface (z = 0) vers le bas (z > 0).
 *
 * bottom :
 *   - "halfspace"     : la dernière couche est semi-infinie (épaisseur ignorée) ;
 *   - "rigid_bonded"  : la dernière couche repose sur un substratum rigide collé (u = 0) ;
 *   - "rigid_smooth"  : substratum rigide glissant (u_z = 0, cisaillement nul) — c'est la
 *                       condition « déplacement vertical bloqué » du modèle COMSOL du TFE.
 * interfaces : liste de layers.length - 1 éléments "bonded" (collée) ou "slip" (glissante).
 */
export class Structure {
  readonly layers: Layer[];
  readonly bottom: Bottom;
  readonly interfaces: InterfaceKind[];

  constructor(layers: Layer[], bottom: Bottom = "halfspace", interfaces?: InterfaceKind[]) {
    if (!BOTTOMS.includes(bottom)) throw new Error(`bottom doit être dans ${BOTTOMS.join(", ")}`);
    const n = layers.length;
    if (n === 0) throw new Error("Il faut au moins une couche.");
    const inter = interfaces ?? Array<InterfaceKind>(n - 1).fill("bonded");
    if (inter.length !== n - 1) throw new Error("Il faut len(layers)-1 conditions d'interface.");
    for (const c of inter) if (!INTERFACES.includes(c)) throw new Error(`interface inconnue : ${String(c)}`);
    layers.forEach((L, i) => {
      const last = i === n - 1;
      if (!(last && bottom === "halfspace") && !(Number.isFinite(L.thickness) && L.thickness > 0)) throw new Error(`Épaisseur invalide pour la couche ${i} (${L.name}).`);
    });
    this.layers = layers;
    this.bottom = bottom;
    this.interfaces = inter;
  }

  // ------------------------------------------------------------------------------
  get n(): number {
    return this.layers.length;
  }

  get thicknesses(): number[] {
    const h = this.layers.map((L) => L.thickness);
    if (this.bottom === "halfspace") h[h.length - 1] = Infinity;
    return h;
  }

  /** Cote du toit de chaque couche. */
  get tops(): number[] {
    const h = this.thicknesses;
    const tops = [0];
    for (let i = 0; i < h.length - 1; i++) tops.push(tops[i]! + h[i]!);
    return tops;
  }

  /**
   * Renvoie (indice de couche, cote locale s) pour la profondeur z.
   *
   * Si z tombe exactement sur une interface, side="above" choisit la couche du dessus
   * (utile pour la « base de couche liée »), side="below" celle du dessous.
   */
  locate(z: number, side: "above" | "below" = "above"): [number, number] {
    const tops = this.tops;
    const h = this.thicknesses;
    const bots = tops.map((t, j) => t + h[j]!);
    if (z < 0) throw new Error("z doit être >= 0 (axe z vers le bas).");
    const tol = 1e-12;
    for (let j = 0; j < this.n; j++) {
      if (side === "above") {
        if (tops[j]! - tol <= z && z <= bots[j]! + tol) return [j, Math.min(Math.max(z - tops[j]!, 0), h[j]!)];
      } else if ((tops[j]! - tol <= z && z < bots[j]! - tol) || (j === this.n - 1 && z <= bots[j]! + tol)) return [j, Math.max(z - tops[j]!, 0)];
    }
    throw new Error(`z = ${z} m est sous le fond de la structure.`);
  }

  describe(): string {
    const lines: string[] = [];
    this.layers.forEach((L, i) => {
      const h = i === this.n - 1 && this.bottom === "halfspace" ? Infinity : L.thickness;
      lines.push(`  [${i}] ${(L.name || "-").padEnd(14)} h = ${String(h).padStart(6)} m  loi = ${L.material.name}`);
      if (i < this.n - 1) lines.push(`      interface : ${this.interfaces[i]}`);
    });
    lines.push(`  fond : ${this.bottom}`);
    return lines.join("\n");
  }
}
