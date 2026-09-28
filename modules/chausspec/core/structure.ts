/** Structure multicouche (portage de chausspec/structure.py). z vers le bas, en m. */
import type { Materiau } from "./materiaux";

export type Fond = "halfspace" | "rigid_bonded" | "rigid_smooth";
export type Interface = "bonded" | "slip";

export interface Couche {
  materiau: Materiau;
  /** Épaisseur (m) ; ignorée pour le massif semi-infini du fond. */
  epaisseur: number;
  nom?: string;
}

export class Structure {
  readonly couches: Couche[];
  readonly fond: Fond;
  readonly interfaces: Interface[];

  constructor(couches: Couche[], fond: Fond = "halfspace", interfaces?: Interface[]) {
    if (!["halfspace", "rigid_bonded", "rigid_smooth"].includes(fond)) throw new Error(`Fond inconnu : ${fond}`);
    if (!couches.length) throw new Error("Il faut au moins une couche.");
    const n = couches.length;
    const inter = interfaces ?? Array<Interface>(n - 1).fill("bonded");
    if (inter.length !== n - 1) throw new Error("Il faut une condition d'interface de moins que de couches.");
    for (const i of inter) if (i !== "bonded" && i !== "slip") throw new Error(`Interface inconnue : ${String(i)}`);
    couches.forEach((L, i) => {
      if (!(i === n - 1 && fond === "halfspace") && !(Number.isFinite(L.epaisseur) && L.epaisseur > 0)) throw new Error(`Épaisseur invalide pour la couche ${i + 1} (${L.nom ?? ""}).`);
    });
    this.couches = couches;
    this.fond = fond;
    this.interfaces = inter;
  }

  get n(): number {
    return this.couches.length;
  }

  /** Épaisseurs (Infinity pour le massif semi-infini). */
  get epaisseurs(): number[] {
    return this.couches.map((L, i) => (i === this.n - 1 && this.fond === "halfspace" ? Infinity : L.epaisseur));
  }

  get toits(): number[] {
    const h = this.epaisseurs;
    const t = [0];
    for (let i = 0; i < h.length - 1; i++) t.push(t[i]! + h[i]!);
    return t;
  }

  /** (couche, cote locale) de la profondeur z ; sur une interface, `cote` choisit la couche. */
  localiser(z: number, cote: "above" | "below" = "above"): [number, number] {
    const tops = this.toits,
      h = this.epaisseurs;
    if (z < 0) throw new Error("z doit être ≥ 0 (axe z vers le bas).");
    const tol = 1e-12;
    for (let j = 0; j < this.n; j++) {
      const bot = tops[j]! + h[j]!;
      if (cote === "above") {
        if (tops[j]! - tol <= z && z <= bot + tol) return [j, Math.min(Math.max(z - tops[j]!, 0), h[j]!)];
      } else if ((tops[j]! - tol <= z && z < bot - tol) || (j === this.n - 1 && z <= bot + tol)) return [j, Math.max(z - tops[j]!, 0)];
    }
    throw new Error(`z = ${z} m est sous le fond de la structure.`);
  }
}
