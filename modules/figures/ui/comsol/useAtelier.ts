/** État de l'atelier COMSOL (les fichiers ouverts eux-mêmes sont dans useGraph, partagés avec la page Graphes). */
import { create } from "zustand";
import { geometrie, legendes, type ExportComsol, type ModeAtelier, type SourceLegende, type UniteLongueur } from "../../core/graph";
import { useGraph } from "../graph/useGraph";
import { useReglagesComsol } from "../graph/useReglagesComsol";

interface EtatAtelier {
  mode: ModeAtelier | null;
  longueur: UniteLongueur;
  source: SourceLegende;
  /** Lignes de repère aux interfaces de couches. */
  couches: boolean;
  /** Légendes saisies à la main (par nom de fichier). */
  noms: Record<string, string>;
  set(p: Partial<Omit<EtatAtelier, "set" | "remplacer" | "retirer">>): void;
  /** Remplace un fichier de la liste (colonne calculée, repère, lecture corrigée). */
  remplacer(i: number, e: ExportComsol): void;
  retirer(i: number): void;
}

export const useAtelier = create<EtatAtelier>((set) => ({
  mode: null,
  longueur: "mm",
  source: "auto",
  couches: true,
  noms: {},
  set: (p) => set(p),
  remplacer: (i, e) => useGraph.setState({ comsol: useGraph.getState().comsol.map((x, k) => (k === i ? e : x)) }),
  retirer: (i) => useGraph.setState({ comsol: useGraph.getState().comsol.filter((_, k) => k !== i) }),
}));

/** Légende de chaque fichier : saisie, sinon calculée entre fichiers de même forme (correspondances comprises). */
export function useLegendes(): (e: ExportComsol) => string {
  const exports = useGraph((s) => s.comsol);
  const noms = useAtelier((s) => s.noms);
  const source = useAtelier((s) => s.source);
  const correspondances = useReglagesComsol((s) => s.reglages.correspondances);
  const auto = new Map<ExportComsol, string>();
  for (const g of ["profil", "serie", "coupe", "volume", "point"] as const) {
    const es = exports.filter((e) => geometrie(e).genre === g);
    legendes(es, { correspondances, source }).forEach((l, k) => auto.set(es[k]!, l));
  }
  return (e) => noms[e.nom] ?? auto.get(e) ?? e.nom.replace(/\.(txt|csv|dat)$/i, "");
}
