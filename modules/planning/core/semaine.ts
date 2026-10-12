/**
 * Vue Semaine (SPEC §10.3), pure et testée : jours de la semaine, bande « toute la journée »
 * rangée en lignes, éléments horaires disposés en colonnes quand ils se chevauchent (comme un
 * agenda), créneau libre pour une lecture, déplacement au quart d'heure.
 */
import { iso, jour, type Barre } from "./gantt";
import type { Element } from "./modele";

export const PAS_MINUTES = 15;
const JOURS_COURTS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « HH:MM » → minutes depuis minuit (NaN si invalide). */
export function minutes(h: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Minutes → « HH:MM » (borné à 00:00 – 23:59). */
export function heure(min: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const aligner = (min: number, pas = PAS_MINUTES) => Math.round(min / pas) * pas;

/** Lundi de la semaine d'une date. */
export function lundiDe(date: string): string {
  const j = jour(date);
  const js = new Date(j * 86_400_000).getUTCDay();
  return iso(j - ((js + 6) % 7));
}

export const jours = (lundi: string, n = 7) => Array.from({ length: n }, (_, i) => iso(jour(lundi) + i));

/** « lun. 6 » */
export function libelleJour(date: string): { court: string; numero: number } {
  const d = new Date(`${date}T00:00:00Z`);
  return { court: JOURS_COURTS[d.getUTCDay()]!, numero: d.getUTCDate() };
}

/** « 5 – 11 oct. 2026 », « 28 sept. – 4 oct. 2026 », « 29 déc. 2026 – 4 janv. 2027 ». */
export function titreSemaine(lundi: string, n = 7): string {
  const a = new Date(`${lundi}T00:00:00Z`);
  const b = new Date(`${iso(jour(lundi) + n - 1)}T00:00:00Z`);
  const [ma, mb, ya, yb] = [a.getUTCMonth(), b.getUTCMonth(), a.getUTCFullYear(), b.getUTCFullYear()];
  if (ya !== yb) return `${a.getUTCDate()} ${MOIS[ma]} ${ya} – ${b.getUTCDate()} ${MOIS[mb]} ${yb}`;
  if (ma !== mb) return `${a.getUTCDate()} ${MOIS[ma]} – ${b.getUTCDate()} ${MOIS[mb]} ${yb}`;
  return `${a.getUTCDate()} – ${b.getUTCDate()} ${MOIS[mb]} ${yb}`;
}

export const estHoraire = (b: Pick<Barre, "heureDebut" | "heureFin">) => !!b.heureDebut && !!b.heureFin;

export interface PlaceBande {
  barre: Barre;
  /** Colonnes (0 = premier jour affiché), bornes comprises. */
  de: number;
  a: number;
  ligne: number;
  /** L'élément commence avant / finit après la semaine affichée. */
  coupeAvant: boolean;
  coupeApres: boolean;
}

/** Éléments « toute la journée » (périodes, jalons) qui touchent la semaine, rangés en lignes sans chevauchement. */
export function bande(barres: Barre[], premier: string, n = 7): PlaceBande[] {
  const j0 = jour(premier);
  const j1 = j0 + n - 1;
  const dans = barres
    .filter((b) => !estHoraire(b))
    .map((b) => ({ b, d: jour(b.debut), f: jour(b.fin || b.debut) }))
    .filter((x) => x.d <= j1 && x.f >= j0)
    .sort((x, y) => x.d - y.d || y.f - y.d - (x.f - x.d) || x.b.titre.localeCompare(y.b.titre));
  const finLigne: number[] = [];
  return dans.map(({ b, d, f }) => {
    const de = Math.max(d, j0) - j0;
    const a = Math.min(f, j1) - j0;
    let ligne = finLigne.findIndex((x) => x < de);
    if (ligne < 0) ligne = finLigne.length;
    finLigne[ligne] = a;
    return { barre: b, de, a, ligne, coupeAvant: d < j0, coupeApres: f > j1 };
  });
}

export interface PlaceHoraire {
  barre: Barre;
  debut: number;
  fin: number;
  /** Colonne dans le groupe de chevauchement, et nombre de colonnes du groupe. */
  colonne: number;
  colonnes: number;
}

/** Éléments horaires d'un jour : chaque groupe d'éléments qui se chevauchent est partagé en colonnes. */
export function disposer(barres: Barre[], date: string): PlaceHoraire[] {
  const items = barres
    .filter((b) => estHoraire(b) && b.debut === date)
    .map((b) => ({ barre: b, debut: minutes(b.heureDebut!), fin: Math.max(minutes(b.heureFin!), minutes(b.heureDebut!) + PAS_MINUTES) }))
    .sort((x, y) => x.debut - y.debut || y.fin - x.fin || x.barre.titre.localeCompare(y.barre.titre));
  const out: PlaceHoraire[] = [];
  let groupe: PlaceHoraire[] = [];
  let finGroupe = -1;
  const clore = () => {
    const n = Math.max(...groupe.map((g) => g.colonne)) + 1;
    for (const g of groupe) g.colonnes = n;
    out.push(...groupe);
    groupe = [];
  };
  for (const it of items) {
    if (groupe.length && it.debut >= finGroupe) clore();
    const occupees = new Set(groupe.filter((g) => g.fin > it.debut).map((g) => g.colonne));
    let c = 0;
    while (occupees.has(c)) c++;
    groupe.push({ ...it, colonne: c, colonnes: 1 });
    finGroupe = Math.max(finGroupe, it.fin);
  }
  if (groupe.length) clore();
  return out;
}

export interface Plage {
  /** Minutes : début et fin de la journée de travail. */
  debut: number;
  fin: number;
  /** Jours travaillés (0 = dimanche). */
  jours: number[];
}

export const PLAGE_TRAVAIL: Plage = { debut: 9 * 60, fin: 18 * 60, jours: [1, 2, 3, 4, 5] };

/**
 * Premier créneau libre d'au moins `duree` minutes, à partir de `depuis` (date et minute), dans la
 * plage de travail, sans chevaucher d'élément horaire, sur `horizon` jours. Null si rien.
 */
export function creneauLibre(barres: Barre[], depuis: { date: string; minute: number }, duree: number, plage = PLAGE_TRAVAIL, horizon = 28): { date: string; debut: number; fin: number } | null {
  const d = Math.min(duree, plage.fin - plage.debut);
  for (let i = 0; i < horizon; i++) {
    const date = iso(jour(depuis.date) + i);
    if (!plage.jours.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) continue;
    const pris = disposer(barres, date).sort((a, b) => a.debut - b.debut);
    let t = Math.max(plage.debut, i === 0 ? Math.ceil(depuis.minute / 30) * 30 : plage.debut);
    for (const p of pris) {
      if (p.fin <= t) continue;
      if (p.debut >= t + d) break;
      t = Math.ceil(p.fin / PAS_MINUTES) * PAS_MINUTES;
    }
    if (t + d <= plage.fin) return { date, debut: t, fin: t + d };
  }
  return null;
}

/** Élément horaire placé le `date` de `debut` à `fin` (minutes). */
export function placer(e: Element, date: string, debut: number, fin: number): Element {
  const d = Math.max(0, Math.min(24 * 60 - PAS_MINUTES, debut));
  return { ...e, debut: date, fin: date, heureDebut: heure(d), heureFin: heure(Math.max(d + PAS_MINUTES, Math.min(23 * 60 + 59, fin))) };
}

/** Élément « toute la journée » décalé de `n` jours (la durée est gardée). */
export function decaler(e: Element, n: number): Element {
  return { ...e, debut: iso(jour(e.debut) + n), fin: e.fin ? iso(jour(e.fin) + n) : "" };
}

/** Durée d'une lecture estimée en heures → minutes, au quart d'heure, entre 30 min et 4 h. */
export const dureeLecture = (heures: number) => Math.max(30, Math.min(240, aligner((heures || 1) * 60)));
