/**
 * Mise en page du Gantt, pure et testée : dates → abscisses, graduations, lignes groupées
 * par catégorie. L'interface ne fait que dessiner.
 */
import type { Categorie, Element, LienObjet } from "./modele";

export const MS_JOUR = 86_400_000;
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export const jour = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_JOUR;
export const iso = (j: number) => new Date(j * MS_JOUR).toISOString().slice(0, 10);

/** Élément à afficher : ceux de l'espace, et ceux fournis par les autres modules (lecture seule). */
export interface Barre {
  id: string;
  titre: string;
  categorie: string;
  debut: string;
  fin: string;
  avancement: number;
  /** Fourni par un autre module : modifiable seulement à sa source. */
  source?: string;
  detail?: string;
  /** « HH:MM » : élément horaire (vue Semaine). */
  heureDebut?: string;
  heureFin?: string;
  lien?: LienObjet | null;
}

export interface Echelle {
  debut: number;
  fin: number;
  pxParJour: number;
}

export type Zoom = "semaine" | "mois" | "trimestre" | "these";

const PX_PAR_JOUR: Record<Exclude<Zoom, "these">, number> = { semaine: 24, mois: 5, trimestre: 1.8 };

/** Échelle : du premier au dernier élément (au moins autour d'aujourd'hui), marge d'une semaine. */
export function echelle(barres: Barre[], aujourdhui: string, zoom: Zoom, largeurDisponible: number): Echelle {
  const dates = [jour(aujourdhui), ...barres.flatMap((b) => [jour(b.debut), jour(b.fin || b.debut)])];
  const debut = Math.min(...dates) - 7;
  let fin = Math.max(...dates) + 14;
  if (zoom !== "these") {
    // Au moins la largeur disponible, centrée vers aujourd'hui.
    const px = PX_PAR_JOUR[zoom];
    const jours = Math.ceil(largeurDisponible / px);
    if (fin - debut < jours) fin = debut + jours;
    return { debut, fin, pxParJour: px };
  }
  if (fin - debut < 60) fin = debut + 60;
  return { debut, fin, pxParJour: Math.max(0.3, largeurDisponible / (fin - debut)) };
}

export const x = (e: Echelle, date: string) => (jour(date) - e.debut) * e.pxParJour;
export const largeur = (e: Echelle) => (e.fin - e.debut) * e.pxParJour;

export interface Graduation {
  x: number;
  libelle: string;
  majeure: boolean;
}

/** Une graduation par mois (par semaine au zoom « semaine »), libellée ; majeure en janvier. */
export function graduations(e: Echelle, zoom: Zoom): Graduation[] {
  const out: Graduation[] = [];
  const d0 = new Date(e.debut * MS_JOUR);
  if (zoom === "semaine") {
    const lundi = e.debut + ((8 - d0.getUTCDay()) % 7);
    for (let j = lundi; j <= e.fin; j += 7) {
      const d = new Date(j * MS_JOUR);
      out.push({ x: (j - e.debut) * e.pxParJour, libelle: `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`, majeure: d.getUTCDate() <= 7 });
    }
    return out;
  }
  let a = d0.getUTCFullYear();
  let m = d0.getUTCMonth() + 1;
  for (;;) {
    if (m > 11) {
      m = 0;
      a++;
    }
    const j = Date.UTC(a, m, 1) / MS_JOUR;
    if (j > e.fin) break;
    const pas = zoom === "these" && e.pxParJour * 30 < 28 ? 3 : 1;
    if (m % pas === 0) out.push({ x: (j - e.debut) * e.pxParJour, libelle: m === 0 ? String(a) : MOIS_COURTS[m]!, majeure: m === 0 });
    m++;
  }
  return out;
}

export interface Groupe {
  categorie: Categorie;
  barres: Barre[];
}

/** Barres regroupées par catégorie (ordre des catégories), triées par date ; catégories inactives et vides omises. */
export function grouper(barres: Barre[], categories: Categorie[]): Groupe[] {
  const inconnue: Categorie = { id: "", nom: "Sans catégorie", couleur: "#777777", active: true };
  const toutes = [...categories, inconnue];
  const connues = new Set(categories.map((c) => c.id));
  return toutes
    .filter((c) => c.active)
    .map((c) => ({
      categorie: c,
      barres: barres
        .filter((b) => (c === inconnue ? !connues.has(b.categorie) : b.categorie === c.id))
        .sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : a.titre.localeCompare(b.titre))),
    }))
    .filter((g) => g.barres.length > 0);
}

/** Éléments de l'espace → barres (actifs seulement ; un sous-élément garde la catégorie de sa phase si la sienne est vide). */
export function barresDepuis(elements: { id: string; valeur: Element }[]): Barre[] {
  const parId = new Map(elements.map((e) => [e.id, e.valeur]));
  return elements
    .filter((e) => e.valeur.actif && (!e.valeur.parent || parId.get(e.valeur.parent)?.actif !== false))
    .map(({ id, valeur: v }) => ({
      id,
      titre: v.parent && parId.get(v.parent) ? `${parId.get(v.parent)!.titre} › ${v.titre}` : v.titre,
      categorie: v.categorie || parId.get(v.parent)?.categorie || "",
      debut: v.debut,
      fin: v.fin,
      avancement: v.avancement,
      ...(v.heureDebut ? { heureDebut: v.heureDebut, heureFin: v.heureFin } : {}),
      ...(v.lien ? { lien: v.lien } : {}),
    }));
}

/** « Cette semaine » : ce qui est en cours ou tombe dans les 7 prochains jours. */
export function cetteSemaine(barres: Barre[], aujourdhui: string): Barre[] {
  const t = jour(aujourdhui);
  return barres
    .filter((b) => {
      const d = jour(b.debut);
      const f = jour(b.fin || b.debut);
      return (d <= t + 7 && f >= t) || (b.fin === "" && d >= t && d <= t + 7);
    })
    .sort((a, b) => (a.debut < b.debut ? -1 : 1));
}

export interface Avancement {
  /** Premier début et dernière fin du planning. */
  debut: string;
  fin: string;
  /** Part écoulée entre les deux (0 à 1). */
  part: number;
  /** Jours restants jusqu'à la fin. */
  joursRestants: number;
  /** Prochain jalon à venir (aujourd'hui compris). */
  prochainJalon: { titre: string; date: string; dans: number } | null;
}

/** Pour l'Accueil : où en est la thèse d'après le planning, et le prochain jalon. */
export function avancement(barres: Barre[], aujourdhui: string): Avancement | null {
  if (!barres.length) return null;
  const t = jour(aujourdhui);
  let d = Infinity,
    f = -Infinity;
  for (const b of barres) {
    d = Math.min(d, jour(b.debut));
    f = Math.max(f, jour(b.fin || b.debut));
  }
  const jalons = barres
    .filter((b) => b.fin === "" && jour(b.debut) >= t)
    .sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
  const j = jalons[0];
  return {
    debut: iso(d),
    fin: iso(f),
    part: f > d ? Math.min(1, Math.max(0, (t - d) / (f - d))) : 1,
    joursRestants: Math.max(0, Math.round(f - t)),
    prochainJalon: j ? { titre: j.titre, date: j.debut, dans: Math.round(jour(j.debut) - t) } : null,
  };
}
