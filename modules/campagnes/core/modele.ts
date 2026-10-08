/**
 * Campagnes d'essais (SPEC §8) : une campagne = un lot d'éprouvettes passées ensemble ;
 * un essai = une éprouvette. Un dossier par campagne dans l'espace :
 *
 *   campagnes/<slug>/campagne.json
 *   campagnes/<slug>/essais/<Essai1>/essai.json
 *   campagnes/<slug>/notes/<AAAA-MM-JJ>_<titre>.md     carnet
 *   campagnes/<slug>/images/<fichier>                 photos, captures
 *
 * Les données brutes restent sur leur disque : `donnees` est une référence à une racine
 * (« recherche:Sergio CM test Bio B2C4 brutes »).
 */
import type { RegressionDemandee } from "@noyau/courbes";
import { correspond } from "@noyau/texte";

export const TYPES = [
  ["module-complexe", "Module complexe", "#2f5f8a"],
  ["tsrst", "TSRST", "#b0602c"],
  ["fluage", "Fluage", "#6b4fa0"],
  ["fatigue", "Fatigue", "#a8326e"],
  ["autre", "Autre", "#777777"],
] as const;
export const STATUTS = ["en cours", "terminé", "en pause", "abandonné", "prévu"] as const;

export interface Campagne {
  titre: string;
  type: string;
  statut: string;
  materiau: string;
  /** Référence aux données brutes : « racine:chemin ». */
  donnees: string;
  machine: { operateur: string; poste: string; bati: string; logiciel: string };
  notes: string;
  /** Pour une campagne à venir (Planning) : dates prévues, « AAAA-MM-JJ ». */
  prevu: { debut: string; fin: string };
}

export interface Essai {
  eprouvette: string;
  /** « AAAA-MM-JJ HH:MM:SS », d'après le journal machine. */
  debut: string;
  fin: string;
  dureeH: number | null;
  cycles: number | null;
  etat: string;
  notes: string;
  /** Droites de régression posées sur ses courbes (vitesse de refroidissement…). */
  regressions: RegressionDemandee[];
  /** Fiche de l'éprouvette (1.23.0) : ce qui permet de trier et de comparer les essais. */
  fiche: Eprouvette;
  /** « valide », « ecarte » (exclu des moyennes) ou vide (pas encore jugé). */
  validite: string;
  /** Pourquoi l'essai est écarté (ou toute réserve). */
  motif: string;
  /** Voie de température retenue pour le dépouillement (nom brut de l'export) ; vide = automatique. */
  voieTemperature: string;
}

export interface Eprouvette {
  /** Matériau ou formulation ; vide = celui de la campagne. */
  materiau: string;
  forme: "" | "prisme" | "cylindre";
  /** Dimensions en mm. */
  largeur: number | null;
  epaisseur: number | null;
  diametre: number | null;
  longueur: number | null;
  /** Section saisie (mm²) ; sinon calculée depuis les dimensions. */
  section: number | null;
  /** Teneur en vides (%). */
  vides: number | null;
  /** « aucun », « RTFOT », « PAV 20 h », « 3 mois en étuve »… */
  vieillissement: string;
  /** Date de fabrication « AAAA-MM-JJ ». */
  fabrication: string;
  /** Vitesse de refroidissement de consigne (°C/h). */
  consigne: number | null;
}

export const VALIDITES = [
  ["", "à juger"],
  ["valide", "valide"],
  ["ecarte", "écarté"],
] as const;

export function lireEprouvette(brut: unknown): Eprouvette {
  const b = o(brut);
  const forme = b.forme === "prisme" || b.forme === "cylindre" ? b.forme : "";
  return {
    materiau: t(b.materiau),
    forme,
    largeur: n(b.largeur),
    epaisseur: n(b.epaisseur),
    diametre: n(b.diametre),
    longueur: n(b.longueur),
    section: n(b.section),
    vides: n(b.vides),
    vieillissement: t(b.vieillissement),
    fabrication: t(b.fabrication),
    consigne: n(b.consigne),
  };
}

export const DOSSIER = "campagnes";

const t = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const o = (v: unknown) => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function lireCampagne(brut: unknown): Campagne {
  const b = o(brut);
  if (typeof b.titre !== "string") throw new Error("Champ « titre » manquant.");
  const m = o(b.machine);
  const p = o(b.prevu);
  return {
    titre: b.titre,
    type: t(b.type) || "autre",
    statut: t(b.statut) || "en cours",
    materiau: t(b.materiau),
    donnees: t(b.donnees),
    machine: { operateur: t(m.operateur), poste: t(m.poste), bati: t(m.bati), logiciel: t(m.logiciel) },
    notes: t(b.notes),
    prevu: { debut: t(p.debut), fin: t(p.fin) },
  };
}

export function lireEssai(brut: unknown): Essai {
  const b = o(brut);
  const regressions = (Array.isArray(b.regressions) ? b.regressions : []).map(o).filter((r) => typeof r.panneau === "string" && typeof r.trace === "string" && n(r.de) !== null && n(r.a) !== null);
  return {
    eprouvette: t(b.eprouvette),
    debut: t(b.debut),
    fin: t(b.fin),
    dureeH: n(b.dureeH),
    cycles: n(b.cycles),
    etat: t(b.etat),
    notes: t(b.notes),
    regressions: regressions.map((r) => ({ panneau: r.panneau as string, trace: r.trace as string, de: r.de as number, a: r.a as number })),
    fiche: lireEprouvette(b.fiche),
    validite: b.validite === "valide" || b.validite === "ecarte" ? b.validite : "",
    motif: t(b.motif),
    voieTemperature: t(b.voieTemperature),
  };
}

export const nouvelleCampagne = (titre: string): Campagne => lireCampagne({ titre });

export function typeDe(id: string): { libelle: string; couleur: string } {
  const x = TYPES.find(([i]) => i === id) ?? TYPES[4];
  return { libelle: x[1], couleur: x[2] };
}

/** Période réelle d'une campagne : du premier début au dernier fin de ses essais. */
export function periode(essais: Essai[], c?: Campagne): { debut: string; fin: string } | null {
  const debuts = essais.map((e) => e.debut).filter(Boolean).sort();
  const fins = essais.map((e) => e.fin || e.debut).filter(Boolean).sort();
  if (debuts.length) return { debut: debuts[0]!.slice(0, 10), fin: fins.at(-1)!.slice(0, 10) };
  if (c?.prevu.debut) return { debut: c.prevu.debut, fin: c.prevu.fin || c.prevu.debut };
  return null;
}

const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 22 → 25 juin 2026 », « 20 avr. → 3 mai 2026 », « 2 déc. 2025 → 10 janv. 2026 ». */
export function periodeLisible(p: { debut: string; fin: string }): string {
  const [a1, m1, j1] = p.debut.split("-").map(Number) as [number, number, number];
  const [a2, m2, j2] = p.fin.split("-").map(Number) as [number, number, number];
  if (p.debut === p.fin) return `${j1} ${MOIS[m1 - 1]} ${a1}`;
  if (a1 === a2 && m1 === m2) return `${j1} → ${j2} ${MOIS[m2 - 1]} ${a2}`;
  if (a1 === a2) return `${j1} ${MOIS[m1 - 1]} → ${j2} ${MOIS[m2 - 1]} ${a2}`;
  return `${j1} ${MOIS[m1 - 1]} ${a1} → ${j2} ${MOIS[m2 - 1]} ${a2}`;
}

/** Un essai récent, pour l'Accueil (action « campagnes.recents »). */
export interface EssaiRecent {
  slug: string;
  campagne: string;
  essai: string;
  /** « AAAA-MM-JJ HH:MM:SS » : fin de l'essai, ou son début s'il n'est pas fini. */
  date: string;
  detail: string;
}

/** Les `n` essais les plus récents (par date de fin, sinon de début), toutes campagnes confondues. */
export function essaisRecents(campagnes: { slug: string; titre: string; essais: Record<string, Essai> }[], n: number): EssaiRecent[] {
  return campagnes
    .flatMap((c) =>
      Object.entries(c.essais).flatMap(([nom, e]) => {
        const date = e.fin || e.debut;
        if (!date) return [];
        const detail = [e.etat, e.dureeH !== null ? `${e.dureeH.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h` : "", e.cycles !== null ? `${e.cycles.toLocaleString("fr-FR")} cycles` : ""].filter(Boolean).join(" · ");
        return [{ slug: c.slug, campagne: c.titre, essai: nom, date, detail }];
      }),
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.essai.localeCompare(b.essai)))
    .slice(0, n);
}

/** Filtres de la galerie ; une chaîne vide ne filtre pas. */
export interface FiltreCampagnes {
  type: string;
  statut: string;
  materiau: string;
  /** Recherche sans accents dans la fiche, les essais et le carnet. */
  texte: string;
}

export const FILTRE_VIDE: FiltreCampagnes = { type: "", statut: "", materiau: "", texte: "" };

export function garderCampagne(c: Campagne, essais: Record<string, Essai>, notes: readonly { titre: string; texte: string }[], f: FiltreCampagnes): boolean {
  if (f.type && c.type !== f.type) return false;
  if (f.statut && c.statut !== f.statut) return false;
  if (f.materiau && c.materiau !== f.materiau) return false;
  if (!f.texte.trim()) return true;
  const tout = [c.titre, c.materiau, c.notes, typeDe(c.type).libelle, ...Object.entries(essais).flatMap(([n, e]) => [n, e.eprouvette, e.notes]), ...notes.flatMap((n) => [n.titre, n.texte])].join("\n");
  return correspond(tout, f.texte);
}
