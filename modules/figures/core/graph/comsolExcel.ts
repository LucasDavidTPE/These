/**
 * Feuilles Excel des résultats de l'atelier COMSOL : les données du graphe (une paire de colonnes par courbe,
 * ou la grille d'une carte) et les tableaux calculés (synthèse, critères, bassins, maillage, sensibilité), pour
 * les collègues qui travaillent sous Excel ou pour vérifier un chiffre.
 */
import type { Feuille } from "@noyau/formats/xlsx-ecriture";
import type { Bassin, ecartMesure } from "./comsolBassin";
import type { LigneSynthese } from "./comsolCalcul";
import { critereDimensionnant, type TableauCriteres } from "./comsolCriteres";
import type { LigneMaillage } from "./comsolMaillage";
import type { SerieSensibilite } from "./comsolSensibilite";
import type { GraphDoc } from "./model";

const nettoyer = (t: string) =>
  t
    .replace(/\$/g, "")
    .replace(/\\varepsilon/g, "ε")
    .replace(/\\sigma/g, "σ")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/[{}\\]/g, "");
/** Nom de fichier proposé : sans accents ni lettres grecques (ε → e), mots séparés par des tirets. */
export function nomDeFichier(titre: string, defaut = "comsol"): string {
  const grec: Record<string, string> = {
    ε: "e",
    σ: "s",
    Δ: "D",
    µ: "u",
    μ: "u",
    τ: "t",
    γ: "g",
  };
  return (
    titre
      .replace(/[εσΔµμτγ]/g, (c) => grec[c] ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || defaut
  );
}

/** Nom de feuille Excel : 31 caractères au plus, sans : \ / ? * [ ]. */
const nomFeuille = (t: string) =>
  nettoyer(t)
    .replace(/[:\\/?*[\]]/g, " ")
    .slice(0, 31) || "Feuille";

/** Données d'un graphe : x et y de chaque courbe (colonnes côte à côte), ou la grille de la carte. */
export function feuillesGraphe(doc: GraphDoc): Feuille[] {
  const out: Feuille[] = [];
  if (doc.carte) {
    const c = doc.carte;
    out.push({
      nom: "Carte",
      entetes: [
        `${nettoyer(doc.y.label)} \\ ${nettoyer(doc.x.label)}`,
        ...c.x.map(String),
      ],
      lignes: c.y.map((y, j) => [y, ...c.x.map((_, i) => c.v[j]![i] ?? null)]),
      mise: { figerColonnes: 1 },
    });
  }
  const series = doc.series.filter((s) => s.x.length);
  if (series.length) {
    const n = Math.max(...series.map((s) => s.x.length));
    const cat = doc.x.categories;
    out.push({
      nom: "Courbes",
      entetes: series.flatMap((s) => [
        `${nettoyer(s.name)} — ${nettoyer(doc.x.label) || "x"}`,
        `${nettoyer(s.name)} — ${nettoyer(doc.y.label) || "y"}`,
      ]),
      lignes: Array.from({ length: n }, (_, i) =>
        series.flatMap((s) => [
          cat && s.x[i] !== undefined
            ? (cat[s.x[i]! - 1] ?? s.x[i]!)
            : (s.x[i] ?? null),
          s.y[i] ?? null,
        ]),
      ),
      mise: { largeurs: series.flatMap(() => [16, 16]) },
    });
  }
  return out;
}

export function feuilleSynthese(
  lignes: readonly LigneSynthese[],
  longueur: string,
): Feuille {
  const coords = lignes.length ? Object.keys(lignes[0]!.posMax) : [];
  return {
    nom: "Synthèse",
    entetes: [
      "Cas",
      "Grandeur",
      "Unité",
      "Max",
      ...coords.map((c) => `${c.toLowerCase()} du max (${longueur})`),
      "Min",
      ...coords.map((c) => `${c.toLowerCase()} du min (${longueur})`),
      "Fichier",
    ],
    lignes: lignes.map((l) => [
      l.legende,
      nettoyer(l.libelle.court),
      l.libelle.unite,
      l.max,
      ...coords.map((c) => l.posMax[c] ?? null),
      l.min,
      ...coords.map((c) => l.posMin[c] ?? null),
      l.fichier,
    ]),
    mise: { filtre: true, figerColonnes: 1 },
  };
}

export function feuilleCriteres(t: TableauCriteres): Feuille {
  return {
    nom: "Critères",
    entetes: [
      "Cas",
      ...t.criteres.flatMap((c) => [
        `${c.nom} (µdef)`,
        `${c.nom} N adm`,
        `${c.nom} dommage`,
      ]),
      "Dimensionnant",
    ],
    lignes: t.lignes.map((l) => [
      l.legende,
      ...l.cases.flatMap((x) =>
        "valeur" in x ? [x.valeur, x.cycles, x.dommage] : [null, null, null],
      ),
      critereDimensionnant(l, t.criteres)?.critere.nom ?? "",
    ]),
    mise: { figerColonnes: 1 },
  };
}

export function feuilleBassins(
  bs: readonly Bassin[],
  ecarts?: readonly (ReturnType<typeof ecartMesure> | null)[],
): Feuille {
  const capteurs = bs[0]?.capteurs.map((c) => c.r) ?? [];
  const u = bs[0]?.unite ?? "";
  return {
    nom: "Bassins",
    entetes: [
      "Cas",
      ...capteurs.map((r) => `D${Math.round(r * 1000)} (${u})`),
      `SCI (${u})`,
      `BDI (${u})`,
      `BCI (${u})`,
      "AREA (mm)",
      "R (m)",
      ...(ecarts ? ["RMS (%)", "Écart D0 (%)"] : []),
    ],
    lignes: bs.map((b, i) => [
      b.legende,
      ...b.capteurs.map((c) => c.d),
      b.indices.SCI,
      b.indices.BDI,
      b.indices.BCI,
      b.indices.AREA,
      b.indices.R,
      ...(ecarts ? [ecarts[i]?.relatif ?? null, ecarts[i]?.d0 ?? null] : []),
    ]),
    mise: { figerColonnes: 1 },
  };
}

export function feuilleMaillage(
  lignes: readonly LigneMaillage[],
  legende: (fichier: string) => string,
): Feuille {
  return {
    nom: "Maillage",
    entetes: [
      "Grossier",
      "Fin",
      "Grandeur",
      "Unité",
      "Pic grossier",
      "Pic fin",
      "Écart pic (%)",
      "Plus grand écart (%)",
      "L2 (%)",
      "Points comparés",
      "Méthode",
    ],
    lignes: lignes.map((l) => [
      legende(l.paire.grossier),
      legende(l.paire.fin),
      nettoyer(l.libelle.court),
      l.libelle.unite,
      l.picGrossier,
      l.picFin,
      l.ecartPic,
      l.ecartMaxRelatif,
      l.l2,
      l.points,
      l.methode === "points" ? "mêmes points" : "fin interpolé",
    ]),
    mise: { filtre: true },
  };
}

export function feuilleSensibilite(
  series: readonly SerieSensibilite[],
  parametre: string,
): Feuille {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(
    (a, b) => a - b,
  );
  return {
    nom: nomFeuille(`Sensibilité ${parametre}`),
    entetes: [parametre, ...series.map((s) => nettoyer(s.nom))],
    lignes: xs.map((x) => [
      x,
      ...series.map((s) => s.points.find((p) => p.x === x)?.y ?? null),
    ]),
  };
}
