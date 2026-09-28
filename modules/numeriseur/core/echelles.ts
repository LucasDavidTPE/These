/**
 * Échelles de couleurs connues (jet, viridis…) : quand on connaît celle qui a servi à tracer
 * la carte, il suffit de donner les valeurs des deux extrémités, sans pointer la légende de
 * l'image (absente, rognée, ou trop bruitée). Points de contrôle interpolés linéairement en RVB.
 */
import type { Gamme } from "./carte";
import { versLab, type RVB } from "./image";

type Ancre = [number, string];

const hex = (h: string): RVB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const regulier = (...c: string[]): Ancre[] => c.map((h, i) => [i / (c.length - 1), h]);

export interface EchelleConnue {
  libelle: string;
  ancres: Ancre[];
}

export const ECHELLES: Record<string, EchelleConnue> = {
  jet: { libelle: "jet (bleu → rouge)", ancres: [[0, "000080"], [0.11, "0000FF"], [0.34, "00FFFF"], [0.66, "FFFF00"], [0.89, "FF0000"], [1, "800000"]] },
  turbo: { libelle: "turbo", ancres: regulier("30123B", "4662D7", "36AAF9", "1AE4B6", "72FE5E", "C7EF34", "FABA39", "F66B19", "CB2A04", "7A0403") },
  viridis: { libelle: "viridis", ancres: regulier("440154", "482878", "3E4A89", "31688E", "26828E", "1F9E89", "35B779", "6DCD59", "B4DE2C", "FDE725") },
  plasma: { libelle: "plasma", ancres: regulier("0D0887", "5C01A6", "9C179E", "CC4778", "ED7953", "FDB32F", "F0F921") },
  inferno: { libelle: "inferno", ancres: regulier("000004", "280B54", "65156E", "9F2A63", "D44842", "F57D15", "FAC127", "FCFFA4") },
  coolwarm: { libelle: "coolwarm (bleu → rouge, centre clair)", ancres: regulier("3B4CC0", "6788EE", "9ABBFF", "C9D7F0", "EDD1C2", "F7A889", "E26952", "B40426") },
  rdbu: { libelle: "RdBu (rouge → bleu, centre blanc)", ancres: regulier("67001F", "B2182B", "D6604D", "F4A582", "FDDBC7", "F7F7F7", "D1E5F0", "92C5DE", "4393C3", "2166AC", "053061") },
  hot: { libelle: "hot (noir → rouge → jaune → blanc)", ancres: [[0, "0A0000"], [0.37, "FF0000"], [0.75, "FFFF00"], [1, "FFFFFF"]] },
  gris: { libelle: "niveaux de gris", ancres: [[0, "000000"], [1, "FFFFFF"]] },
};

export const NOMS_ECHELLES = Object.keys(ECHELLES);

/** Couleur de l'échelle à la position t ∈ [0, 1]. */
export function couleurEchelle(nom: string, t: number): RVB {
  const e = ECHELLES[nom];
  if (!e) throw new Error(`Échelle inconnue : ${nom}`);
  const a = e.ancres;
  const u = Math.min(1, Math.max(0, t));
  for (let i = 0; i + 1 < a.length; i++) {
    const [t0, c0] = a[i]!;
    const [t1, c1] = a[i + 1]!;
    if (u <= t1) {
      const f = t1 > t0 ? (u - t0) / (t1 - t0) : 0;
      const [p, q] = [hex(c0), hex(c1)];
      return [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])];
    }
  }
  return hex(a[a.length - 1]![1]);
}

/**
 * La gamme d'une échelle connue entre deux valeurs (v1 au début de l'échelle, v2 à la fin ; `inverse`
 * pour une barre lue de la fin au début), au même format que celle lue sur une légende.
 */
export function gammeConnue(nom: string, v1: number, v2: number, log: boolean, inverse: boolean, n = 256): Gamme {
  if (log && (v1 <= 0 || v2 <= 0)) throw new Error("Échelle logarithmique : les valeurs doivent être positives.");
  const g: Gamme = { lab: [], rvb: [], valeurs: [] };
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const c = couleurEchelle(nom, inverse ? 1 - f : f);
    g.rvb.push(c);
    g.lab.push(versLab(c));
    g.valeurs.push(log ? 10 ** (Math.log10(v1) + f * (Math.log10(v2) - Math.log10(v1))) : v1 + f * (v2 - v1));
  }
  return g;
}
