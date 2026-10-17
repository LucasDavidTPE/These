/** Accès React à l'atelier : contexte d'exécution des recettes, légendes, recette en cours d'un mode. */
import { useMemo } from "react";
import { executerTrace, legendesDe, normaliser, traceVide, type ContexteTrace, type ExportComsol, type ModeTrace, type Trace } from "../../core/graph";
import { calculer, type Resultat } from "./atelierCalcul";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { useAtelier } from "./useAtelier";

export function useContexteTrace(): ContexteTrace {
  const exports = useAtelier((s) => s.exports);
  const cadre = useAtelier((s) => s.cadre);
  const noms = useAtelier((s) => s.noms);
  const reglages = useReglagesComsol((s) => s.reglages);
  return { exports, cadre, noms, correspondances: reglages.correspondances, interfaces: reglages.interfaces, criteres: reglages.criteres };
}

export function useLegende(): (e: ExportComsol) => string {
  return legendesDe(useContexteTrace());
}

/** Recette en cours d'un mode, complétée d'après les fichiers ouverts, et sa mise à jour. */
export function useTrace<T extends Trace>(mode: T["mode"]): [T, (p: Partial<T>) => void] {
  const brute = useAtelier((s) => s.traces[mode as ModeTrace]) ?? traceVide(mode as ModeTrace);
  const exports = useAtelier((s) => s.exports);
  const maj = (p: Partial<T>) => useAtelier.getState().majTrace(mode as ModeTrace, { ...(useAtelier.getState().traces[mode as ModeTrace] ?? traceVide(mode as ModeTrace)), ...p } as Trace);
  return [normaliser(brute, exports) as T, maj];
}

/**
 * Résultat d'une recette, recalculé seulement quand la recette, les fichiers ou les réglages changent (pas à
 * chaque rendu : survol de la sonde, saisie dans un autre champ…) — une carte d'un gros export coûte ~0,1 s.
 */
export function useResultat(t: Trace): Resultat {
  const { exports, cadre, noms, correspondances, interfaces, criteres } = useContexteTrace();
  const cle = JSON.stringify(t);
  return useMemo(
    () => calculer(() => executerTrace(JSON.parse(cle) as Trace, { exports, cadre, noms, correspondances, interfaces, ...(criteres ? { criteres } : {}) })),
    [cle, exports, cadre, noms, correspondances, interfaces, criteres],
  );
}
