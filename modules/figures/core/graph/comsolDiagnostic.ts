/**
 * Vérification des fichiers ouverts, avant de tracer : ce qui rendrait une comparaison fausse ou une figure
 * trompeuse — même grandeur dans des unités différentes, valeurs absentes, cas manquants dans le plan
 * d'expériences tiré des noms, deux fichiers qui auraient la même légende, pic au bord de la zone exportée
 * (zone peut-être trop petite), grilles différentes entre cas comparables.
 */
import {
  FACTEUR_LONGUEUR,
  geometrie,
  libelleColonne,
  type ExportComsol,
  type UniteLongueur,
} from "./comsol";
import { motsDuNom } from "./comsolCalcul";
import { motsVariables, ranger } from "./comsolLot";

export interface Constat {
  niveau: "attention" | "info";
  /** Fichier concerné (null : l'ensemble). */
  fichier: string | null;
  texte: string;
}

const fr = (x: number) =>
  String(Number(x.toPrecision(4)))
    .replace(".", ",")
    .replace("-", "−");
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");

export function diagnostiquer(
  exports: readonly ExportComsol[],
  o: { legende: (e: ExportComsol) => string; longueur: UniteLongueur },
): Constat[] {
  const out: Constat[] = [];
  const donnees = exports.filter((e) => !e.legende);
  // 1. même expression, unités différentes
  const unites = new Map<string, Map<string, string[]>>();
  for (const e of donnees)
    for (const c of e.colonnes) {
      const lib = libelleColonne(c);
      const m = unites.get(lib.court) ?? new Map<string, string[]>();
      m.set(lib.unite, [...(m.get(lib.unite) ?? []), e.nom]);
      unites.set(lib.court, m);
    }
  for (const [g, m] of unites)
    if (m.size > 1)
      out.push({
        niveau: "attention",
        fichier: null,
        texte: `${g} n'a pas la même unité partout : ${[...m].map(([u, fs]) => `${u} (${[...new Set(fs)].map(sansExt).slice(0, 3).join(", ")}${new Set(fs).size > 3 ? "…" : ""})`).join(" ; ")}. Les courbes ne se comparent pas telles quelles : réexporter avec la même expression (« 1e6*solid.eZZ »), ou ajouter une colonne calculée.`,
      });
  // 2. valeurs absentes
  for (const e of donnees) {
    const nc = e.coordonnees.length;
    let nan = 0;
    let total = 0;
    for (let j = nc; j < e.valeurs.length; j++)
      for (const v of e.valeurs[j]!) {
        total++;
        if (!Number.isFinite(v)) nan++;
      }
    if (nan && total)
      out.push({
        niveau: nan / total > 0.2 ? "attention" : "info",
        fichier: e.nom,
        texte: `${sansExt(e.nom)} : ${fr((100 * nan) / total)} % de valeurs absentes (NaN : points hors du domaine, ou grandeur non définie dans un matériau).`,
      });
  }
  // 3. deux fichiers avec la même légende
  const parLegende = new Map<string, string[]>();
  for (const e of exports)
    parLegende.set(o.legende(e), [
      ...(parLegende.get(o.legende(e)) ?? []),
      e.nom,
    ]);
  for (const [l, fs] of parLegende)
    if (fs.length > 1)
      out.push({
        niveau: "attention",
        fichier: null,
        texte: `${fs.map(sansExt).join(" et ")} ont la même légende « ${l} » : la saisir à la main (fiche du fichier) pour les distinguer sur les figures.`,
      });
  // 4. plan d'expériences tiré des noms : cases manquantes, par famille de forme
  for (const genre of ["coupe", "profil", "serie"] as const) {
    const es = donnees.filter((e) => geometrie(e).genre === genre);
    if (es.length < 3) continue;
    const longueurs = new Set(es.map((e) => motsDuNom(e.nom).length));
    if (longueurs.size !== 1) continue;
    const v = motsVariables(es.map((e) => e.nom));
    if (v.length !== 2) continue;
    try {
      const m = ranger(
        es.map((e) => e.nom),
        v[0]!.k,
        v[1]!.k,
      );
      const manquants = m.lignes.flatMap((l, i) =>
        m.colonnes.flatMap((c, j) => (m.cases[i]![j] ? [] : [`${l} × ${c}`])),
      );
      if (manquants.length)
        out.push({
          niveau: "info",
          fichier: null,
          texte: `${genre === "coupe" ? "Coupes" : genre === "profil" ? "Lignes" : "Tables"} : ${m.lignes.length} × ${m.colonnes.length} cas d'après les noms, il manque ${manquants.join(", ")}.`,
        });
    } catch {
      // deux fichiers dans la même case : rien à dire ici
    }
  }
  // 5. pic au bord de la zone exportée (zone de coupe ou ligne peut-être trop courte)
  for (const e of donnees) {
    const g = geometrie(e);
    if (g.genre !== "coupe" && g.genre !== "profil") continue;
    const f =
      FACTEUR_LONGUEUR[o.longueur]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
    const nc = e.coordonnees.length;
    const bornes = g.varient.map((k) => {
      let a = Infinity;
      let b = -Infinity;
      for (const v of e.valeurs[k]!) {
        if (v < a) a = v;
        if (v > b) b = v;
      }
      return { k, a, b };
    });
    const auBord: string[] = [];
    for (let j = 0; j < e.colonnes.length; j++) {
      const col = e.valeurs[nc + j]!;
      let i0 = -1;
      for (let i = 0; i < e.lignes; i++)
        if (
          Number.isFinite(col[i]!) &&
          (i0 < 0 || Math.abs(col[i]!) > Math.abs(col[i0]!))
        )
          i0 = i;
      if (i0 < 0) continue;
      const bord = bornes.filter(({ k, a, b }) => {
        const v = e.valeurs[k]![i0]!;
        const tol = 1e-9 * Math.max(1, Math.abs(b - a));
        // la surface (z maximal) est un bord naturel : seuls les bords latéraux et le bas comptent
        const surface =
          /^z$/i.test(e.coordonnees[k]!) && Math.abs(v - b) <= tol;
        return !surface && (Math.abs(v - a) <= tol || Math.abs(v - b) <= tol);
      });
      if (bord.length)
        auBord.push(
          `${libelleColonne(e.colonnes[j]!).court} (${bord.map(({ k }) => `${e.coordonnees[k]!.toLowerCase()} = ${fr(e.valeurs[k]![i0]! * f)}`).join(", ")} ${o.longueur})`,
        );
    }
    if (auBord.length)
      out.push({
        niveau: "info",
        fichier: e.nom,
        texte: `${sansExt(e.nom)} : pic au bord de la zone exportée pour ${auBord.join(", ")} ; la zone est peut-être trop petite pour contenir le vrai pic.`,
      });
  }
  // 6. cas comparables (même forme, mêmes coordonnées) sur des grilles différentes
  const coupes = donnees.filter(
    (e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere,
  );
  const grilles = new Map<string, string[]>();
  for (const e of coupes) {
    const g = geometrie(e);
    const cle = `${g.varient.map((k) => e.coordonnees[k]).join("")}|${g.grilles.map((x) => `${x.length}:${x[0]}:${x.at(-1)}`).join("|")}`;
    grilles.set(cle, [...(grilles.get(cle) ?? []), e.nom]);
  }
  const parAxes = new Map<string, number>();
  for (const k of grilles.keys())
    parAxes.set(k.split("|")[0]!, (parAxes.get(k.split("|")[0]!) ?? 0) + 1);
  for (const [axes, n] of parAxes)
    if (n > 1)
      out.push({
        niveau: "info",
        fichier: null,
        texte: `Plans ${axes.toLowerCase()} sur ${n} grilles différentes : « Comparer deux cas » et la convergence du maillage interpolent ou refusent ; réexporter sur la même grille pour comparer point à point.`,
      });
  if (!out.length && exports.length)
    out.push({
      niveau: "info",
      fichier: null,
      texte:
        "Rien à signaler : unités cohérentes, pas de valeur absente, pics à l'intérieur des zones exportées.",
    });
  return out;
}
