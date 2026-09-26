/**
 * Études (SPEC §8.4, P7) : une étude = une question, un dossier dans l'espace :
 *
 *   etudes/<AAAA-MM-JJ>_<titre>/etude.json        la fiche
 *   etudes/<…>/run.py                             le script, lancé dans VS Code
 *   etudes/<…>/these_etude.py                     l'outil qui trace chaque exécution
 *   etudes/<…>/sorties/<horodatage>/execution.json + fichiers produits
 *
 * Les études de these-lgcb (`study.toml`, `outputs/`, `*.prov.json`) sont lues telles quelles :
 * il suffit de copier leur dossier dans `etudes/`.
 */
import { lireToml } from "@noyau/formats/toml";

export const DOSSIER = "etudes";
export const STATUTS = ["en cours", "terminée", "en pause", "abandonnée"] as const;

export interface Etude {
  titre: string;
  question: string;
  conclusion: string;
  statut: string;
  /** « AAAA-MM-JJ ». */
  date: string;
  /** Campagnes liées (slugs du module Campagnes, ou noms de projets these-lgcb). */
  campagnes: string[];
  tags: string[];
  /** Données d'entrée : nom → référence « racine:chemin ». */
  entrees: Record<string, string>;
}

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : []);
const table = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string")) : {};

export function lireEtude(brut: unknown): Etude {
  const b = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  if (typeof b.titre !== "string") throw new Error("Champ « titre » manquant.");
  return { titre: b.titre, question: t(b.question), conclusion: t(b.conclusion), statut: t(b.statut) || "en cours", date: t(b.date), campagnes: liste(b.campagnes), tags: liste(b.tags), entrees: table(b.entrees) };
}

const STATUTS_LGCB: Record<string, string> = { "en cours": "en cours", termine: "terminée", "en pause": "en pause", abandonne: "abandonnée" };

/** Fiche `study.toml` de these-lgcb → étude. */
export function depuisStudyToml(texte: string): Etude {
  const s = lireToml(texte);
  return {
    titre: t(s.title) || "Étude sans titre",
    question: t(s.question),
    conclusion: t(s.conclusion),
    statut: STATUTS_LGCB[t(s.status)] ?? "en cours",
    date: t(s.date),
    campagnes: [...liste(s.project), ...liste(s.projects)],
    tags: liste(s.tags),
    entrees: table(s.inputs),
  };
}

export interface Execution {
  /** Nom du dossier de sorties (horodatage). */
  dossier: string;
  debut: string;
  fin: string;
  dureeS: number | null;
  poste: string;
  python: string;
  statut: "ok" | "erreur" | "en cours";
  erreur: string;
  entrees: { reference: string; chemin: string }[];
  fichiers: { nom: string; octets: number }[];
}

export function lireExecution(dossier: string, brut: unknown): Execution {
  const b = typeof brut === "object" && brut !== null ? (brut as Record<string, unknown>) : {};
  const tab = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null) : []);
  return {
    dossier,
    debut: t(b.debut),
    fin: t(b.fin),
    dureeS: typeof b.duree_s === "number" ? b.duree_s : null,
    poste: t(b.poste),
    python: t(b.python),
    statut: b.statut === "ok" || b.statut === "erreur" ? b.statut : "en cours",
    erreur: t(b.erreur),
    entrees: tab(b.entrees).map((e) => ({ reference: t(e.reference), chemin: t(e.chemin) })),
    fichiers: tab(b.fichiers).map((f) => ({ nom: t(f.nom), octets: typeof f.octets === "number" ? f.octets : 0 })),
  };
}
