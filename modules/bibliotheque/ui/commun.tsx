import { Pastille } from "@interface/composants";
import type { Etat } from "../core/calculs";

const NIVEAU: Record<string, "ok" | "attention" | "erreur" | "info"> = {
  "EN RETARD": "erreur",
  "Ce mois-ci": "attention",
  "Mois prochain": "info",
  Lu: "ok",
  Écarté: "info",
  "ENVOYER MAINTENANT": "erreur",
  RELANCER: "erreur",
  "En attente": "info",
  "En retard": "erreur",
  "En cours": "attention",
  Terminé: "ok",
};

export function PastilleEtat({ etat }: { etat: Etat | string }) {
  if (!etat) return null;
  const n = NIVEAU[etat];
  return n ? <Pastille niveau={n}>{etat}</Pastille> : <span className="discret">{etat}</span>;
}

