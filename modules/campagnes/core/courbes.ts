/**
 * D'un export WaveMatrix aux panneaux de courbes : une famille d'unités par panneau, temps
 * en heures, séries réduites pour l'affichage. Et l'aperçu (température, force) enregistré
 * dans l'espace, pour que la galerie montre la signature de l'essai même sur le PC qui n'a
 * pas les données brutes.
 */
import { decimer, voieTemps, type Nature, type Serie } from "@noyau/formats/wavematrix";

export const PANNEAUX: [Nature, string][] = [
  ["temperature", "Température"],
  ["force", "Force"],
  ["contrainte", "Contrainte"],
  ["deformation", "Déformation"],
  ["deplacement", "Déplacement (capteurs)"],
  ["deplacement_verin", "Position du vérin"],
];

export interface PanneauEssai {
  titre: string;
  unite: string;
  traces: { nom: string; x: number[]; y: number[] }[];
}

function nomVoie(s: Serie, j: number): string {
  const v = s.voies[j]!;
  return v.capteur && v.capteur !== "Défini par utilisateur" ? `${v.grandeur} ${v.capteur}` : v.grandeur;
}

export function panneaux(s: Serie, points = 1500): PanneauEssai[] {
  const it = voieTemps(s);
  if (it < 0) throw new Error("Pas de colonne de temps dans cet export.");
  const heures = s.colonnes[it]!.map((t) => t / 3600);
  return PANNEAUX.flatMap(([nature, titre]) => {
    const js = s.voies.map((v, j) => (v.nature === nature ? j : -1)).filter((j) => j >= 0);
    if (!js.length) return [];
    return [{ titre, unite: s.voies[js[0]!]!.unite ?? "", traces: js.map((j) => ({ nom: nomVoie(s, j), ...decimer(heures, s.colonnes[j]!, points) })) }];
  });
}

export interface ApercuEssai {
  heures: number[];
  temperature: number[];
  force: number[];
}

/** Aperçu léger (≈ 150 points) : température et force en fonction du temps. */
export function apercu(s: Serie): ApercuEssai | null {
  const it = voieTemps(s);
  if (it < 0) return null;
  const h = s.colonnes[it]!.map((t) => t / 3600);
  const voie = (n: Nature) => s.voies.findIndex((v) => v.nature === n);
  const reduire = (j: number) => (j < 0 ? { x: [] as number[], y: [] as number[] } : decimer(h, s.colonnes[j]!, 150));
  const T = reduire(voie("temperature"));
  const F = reduire(voie("force"));
  const base = T.x.length ? T : F;
  if (!base.x.length) return null;
  const arrondi = (v: number[]) => v.map((x) => Number(x.toPrecision(4)));
  return { heures: arrondi(base.x), temperature: arrondi(T.y), force: arrondi(F.y) };
}
