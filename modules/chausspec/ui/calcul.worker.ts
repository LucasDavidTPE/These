/// <reference lib="webworker" />
/**
 * Calcul d'un cas ChaussSpec hors du fil de l'interface : la page reste utilisable pendant les
 * quelques secondes (ou minutes, grandes grilles) du calcul, avec une jauge.
 */
import { executer, type DemandeCalcul } from "./execution";

self.onmessage = (ev: MessageEvent<DemandeCalcul>) => {
  try {
    const r = executer(ev.data, (part, texte) => self.postMessage({ type: "progres", part, texte }));
    const transferts = r.champs.flatMap((c) => (c.im ? [c.re.buffer, c.im.buffer] : [c.re.buffer]));
    self.postMessage({ type: "fin", resultat: r }, transferts as Transferable[]);
  } catch (e) {
    self.postMessage({ type: "erreur", message: e instanceof Error ? e.message : String(e) });
  }
};
