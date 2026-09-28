/**
 * Exécution d'un cas (fil principal ou Worker) : runCase du cœur, puis une forme transférable
 * (pas de classe ni de Map) pour revenir du Worker.
 */
import { CArray } from "../core/carray";
import { GridResult, type GridMeta } from "../core/grid";
import { runCase, type CaseJSON, type GaugeSignal, type Summary } from "../core/io";
import { fieldKey, type Component } from "../core/spectral";

export interface DemandeCalcul {
  cas: CaseJSON;
}

export interface ResultatSerialise {
  x: Float64Array;
  y: Float64Array;
  /** Champs calculés ; im est null pour des champs réels. */
  champs: { comp: Component; z: number; re: Float64Array; im: Float64Array | null }[];
  meta: GridMeta;
  synthese: Summary;
  jauges: GaugeSignal[];
}

export function executer(d: DemandeCalcul, progres: (part: number, texte: string) => void): ResultatSerialise {
  const { res, summary, gauges } = runCase(d.cas, { progress: progres });
  return {
    x: res.x,
    y: res.y,
    champs: res.keys.map(({ comp, z }) => {
      const f = res.get(comp, z);
      return { comp, z, re: f.re, im: res.meta.complex ? f.im : null };
    }),
    meta: res.meta,
    synthese: summary,
    jauges: gauges,
  };
}

/** Le GridResult du cœur, reconstitué. */
export function versResultat(s: ResultatSerialise): GridResult {
  const fields = new Map(s.champs.map((c) => [fieldKey(c.comp, c.z), new CArray(c.re, c.im ?? undefined)]));
  return new GridResult(s.x, s.y, fields, s.meta);
}

/** Lance le calcul dans un Worker (repli sur le fil principal si indisponible). */
export function calculer(cas: CaseJSON, progres: (part: number, texte: string) => void): { promesse: Promise<ResultatSerialise>; annuler(): void } {
  if (typeof Worker === "undefined") {
    return { promesse: Promise.resolve().then(() => executer({ cas }, progres)), annuler: () => undefined };
  }
  const w = new Worker(new URL("./calcul.worker.ts", import.meta.url), { type: "module" });
  let rejeter: (e: Error) => void = () => undefined;
  const promesse = new Promise<ResultatSerialise>((ok, ko) => {
    rejeter = ko;
    w.onmessage = (ev: MessageEvent<{ type: string; part?: number; texte?: string; resultat?: ResultatSerialise; message?: string }>) => {
      const m = ev.data;
      if (m.type === "progres") progres(m.part ?? 0, m.texte ?? "");
      else {
        w.terminate();
        if (m.type === "fin") ok(m.resultat!);
        else ko(new Error(m.message));
      }
    };
    w.onerror = (e) => {
      w.terminate();
      ko(new Error(e.message || "Erreur du calcul."));
    };
    w.postMessage({ cas } satisfies DemandeCalcul);
  });
  return {
    promesse,
    annuler: () => {
      w.terminate();
      rejeter(new Error("Calcul annulé."));
    },
  };
}
