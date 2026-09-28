/**
 * Exécution d'un cas (fil principal ou Worker) : lecture du JSON, solveur grille, synthèse et
 * signaux des jauges, sous une forme transférable (pas de Map).
 */
import { casDe, sortiesDe, type CasJSON } from "../core/cas";
import { cleChamp, resoudreGrille, type ResultatGrille } from "../core/grille";
import { signalJauge, synthese } from "../core/resultats";
import type { Composante } from "../core/spectral";

export interface DemandeCalcul {
  cas: CasJSON;
}

export interface ResultatSerialise {
  x: Float64Array;
  y: Float64Array;
  champs: { comp: Composante; z: number; re: Float64Array; im: Float64Array | null }[];
  meta: ResultatGrille["meta"];
  synthese: ReturnType<typeof synthese>;
  jauges: { comp: Composante; z: number; x: number; y: number; t: number[]; v: number[] }[];
}

export function executer(d: DemandeCalcul, progres: (part: number, texte: string) => void): ResultatSerialise {
  const { structure, chargement, regime } = casDe(d.cas);
  const s = sortiesDe(d.cas);
  const r = resoudreGrille(structure, chargement, regime, { profondeurs: s.profondeurs, comps: s.comps, L: s.L, N: s.N, fenetre: s.fenetre, filtre: s.filtre, progres });
  const jauges =
    regime.type === "moving"
      ? s.jauges.flatMap((g) => {
          const c = r.champs.get(cleChamp(g.comp, g.z));
          return c ? [{ comp: g.comp, z: g.z, x: g.x ?? 0, y: g.y, ...signalJauge(r, c.re, g.x ?? 0, g.y, regime.speed) }] : [];
        })
      : [];
  return {
    x: r.x,
    y: r.y,
    champs: r.cles.map(({ comp, z }) => ({ comp, z, ...r.champs.get(cleChamp(comp, z))! })),
    meta: r.meta,
    synthese: synthese(r),
    jauges,
  };
}

/** Le résultat reconstitué pour les fonctions de core/resultats. */
export function versResultat(s: ResultatSerialise): ResultatGrille {
  return {
    x: s.x,
    y: s.y,
    champs: new Map(s.champs.map((c) => [cleChamp(c.comp, c.z), { re: c.re, im: c.im }])),
    cles: s.champs.map(({ comp, z }) => ({ comp, z })),
    meta: s.meta,
  };
}

/** Lance le calcul dans un Worker (repli sur le fil principal si indisponible). */
export function calculer(cas: CasJSON, progres: (part: number, texte: string) => void): { promesse: Promise<ResultatSerialise>; annuler(): void } {
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
