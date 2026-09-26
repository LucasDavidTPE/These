/** Import des fiches de campagne de these-lgcb (`projects/*.toml`). */
import { lireToml, type Table } from "@noyau/formats/toml";
import type { Campagne, Essai } from "./modele";
import { lireCampagne, lireEssai } from "./modele";

export { lireToml };

const TYPES_TOML: Record<string, string> = { "module-complexe": "module-complexe", tsrst: "tsrst", fluage: "fluage", fatigue: "fatigue" };
const STATUTS_TOML: Record<string, string> = { "en cours": "en cours", termine: "terminé", "en pause": "en pause", abandonne: "abandonné" };

/** Fiche these-lgcb → campagne et essais. Les « TODO » de modèle vide sont ignorés. */
export function depuisLgcb(texte: string): { campagne: Campagne; essais: Record<string, Essai> } {
  const t = lireToml(texte);
  const s = (v: unknown) => (typeof v === "string" && v.trim() !== "TODO" ? v.trim() : "");
  const m = (t.machine ?? {}) as Table;
  const campagne = lireCampagne({
    titre: s(t.title) || "Campagne sans titre",
    type: TYPES_TOML[s(t.kind)] ?? "autre",
    statut: STATUTS_TOML[s(t.status)] ?? "en cours",
    materiau: s(t.material),
    donnees: s(t.data),
    machine: { operateur: s(m.operateur), poste: s(m.poste), bati: s(m.bati), logiciel: s(m.logiciel) },
    notes: s(t.notes),
  });
  const essais: Record<string, Essai> = {};
  for (const [nom, e] of Object.entries((t.tests ?? {}) as Record<string, Table>)) {
    essais[nom] = lireEssai({ eprouvette: s(e.eprouvette), debut: s(e.debut), fin: s(e.fin), dureeH: e.duree_h, cycles: e.cycles, etat: s(e.etat) || s(e.note) });
  }
  return { campagne, essais };
}
