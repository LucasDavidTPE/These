/**
 * Écritures en série dans la bibliothèque de figures, pour l'atelier COMSOL : une recette déclinée sur tous les
 * plans (N figures + une planche en matrice), et la régénération de toute une étude (chaque figure tracée
 * depuis ses recettes, puis les planches qui les contiennent) après un nouveau calcul COMSOL.
 */
import {
  exportGraphSvg,
  exportPgfplots,
  lirePlanche,
  plancheMatrice,
  plancheSvg,
  planchePgfplots,
  validateGraph,
  type Correspondance,
  type GraphDoc,
  type Matrice,
  type PlancheDoc,
  type StyleEtiquette,
} from "../../core/graph";
import { createFigure, joinPath, lockStatus, saveMeta, validateMeta, type FigureMeta } from "../../core/library";
import { svgToPng } from "../editor/raster";
import { nowIso, useLibrary } from "../library/useLibrary";
import { regenerer } from "./regeneration";
import type { EnvAtelier } from "./useAtelier";

async function bibliotheque() {
  await useLibrary.getState().init();
  const { backend, root, host } = useLibrary.getState();
  if (!backend || !root) throw new Error("Choisissez d'abord le dossier de la bibliothèque de figures (page Bibliothèque).");
  return { fs: backend.fs(root), host };
}

const pngPlanche = (svg: string, dpi = 300) => {
  const mm = (k: "width" | "height") => Number(new RegExp(`${k}="([\\d.]+)mm"`).exec(svg)?.[1] ?? 100);
  return svgToPng(svg, mm("width"), mm("height"), dpi, "white");
};

/** Écrit un graphe (nouvelle figure, ou la figure `dossier` existante) avec ses exports ; renvoie dossier et numéro. */
export async function ecrireGraphe(doc: GraphDoc, o: { titre: string; dossier?: string | null; tags?: string[] }): Promise<{ dossier: string; id: string }> {
  const { fs, host } = await bibliotheque();
  const v = validateGraph(doc);
  if (!v.ok) throw new Error(`${o.titre} : ${v.errors.map((e) => `${e.path} : ${e.message}`).join(" ; ")}`);
  let dossier = o.dossier ?? null;
  let meta: FigureMeta;
  if (dossier) {
    const m = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
    if (!m.ok) throw new Error(`${dossier} : meta.json illisible.`);
    meta = m.meta;
  } else {
    const c = await createFigure(fs, { title: o.titre, kind: "graph", now: nowIso(), host });
    dossier = c.folder;
    meta = { ...c.meta, tags: [...new Set([...c.meta.tags, ...(o.tags ?? [])])] };
  }
  const pgf = exportPgfplots(v.doc);
  await fs.writeTextAtomic(joinPath(dossier, "graph.json"), JSON.stringify(v.doc, null, 2) + "\n");
  await fs.writeTextAtomic(joinPath(dossier, "export.tex"), pgf.tex);
  await fs.writeTextAtomic(joinPath(dossier, "export.svg"), exportGraphSvg(v.doc));
  await fs.writeBytesAtomic(joinPath(dossier, "export.png"), await svgToPng(exportGraphSvg(v.doc), v.doc.width, v.doc.height, 300));
  const saved = await saveMeta(fs, dossier, o.dossier ? meta : { ...meta, title: o.titre }, { now: nowIso(), host });
  return { dossier, id: saved.id };
}

/** Écrit une planche (nouvelle, ou existante) avec ses exports. */
export async function ecrirePlanche(p: PlancheDoc, docs: (GraphDoc | null)[], o: { titre: string; dossier?: string | null; tags?: string[] }): Promise<{ dossier: string; id: string }> {
  const { fs, host } = await bibliotheque();
  let dossier = o.dossier ?? null;
  let meta: FigureMeta;
  if (dossier) {
    const m = validateMeta(JSON.parse(await fs.readText(joinPath(dossier, "meta.json"))));
    if (!m.ok) throw new Error(`${dossier} : meta.json illisible.`);
    meta = m.meta;
  } else {
    const c = await createFigure(fs, { title: o.titre, kind: "planche", now: nowIso(), host });
    dossier = c.folder;
    meta = { ...c.meta, tags: [...new Set([...c.meta.tags, ...(o.tags ?? [])])] };
  }
  const svg = plancheSvg(p, docs);
  await fs.writeTextAtomic(joinPath(dossier, "planche.json"), JSON.stringify(p, null, 2) + "\n");
  await fs.writeTextAtomic(joinPath(dossier, "export.svg"), svg);
  await fs.writeTextAtomic(joinPath(dossier, "export.tex"), planchePgfplots(p, docs));
  await fs.writeBytesAtomic(joinPath(dossier, "export.png"), await pngPlanche(svg));
  const saved = await saveMeta(fs, dossier, o.dossier ? meta : { ...meta, title: o.titre }, { now: nowIso(), host });
  return { dossier, id: saved.id };
}

export interface ResultatDeclinaison {
  figures: { plan: string; dossier: string; id: string }[];
  planche: { dossier: string; id: string } | null;
  erreurs: string[];
}

/**
 * Une figure par plan (docs déjà calculés, recette posée dans `origine`), puis la planche en matrice.
 * `progression(i, n)` est appelée après chaque figure.
 */
export async function ecrireDeclinaison(
  cas: { plan: string; doc: GraphDoc; titre: string }[],
  o: { matrice: Matrice; titrePlanche: string; tags: string[]; correspondances: readonly Correspondance[]; memeEchelle: boolean; etiquettes: StyleEtiquette; tailleCommune: boolean },
  progression?: (i: number, n: number) => void,
): Promise<ResultatDeclinaison> {
  const figures: ResultatDeclinaison["figures"] = [];
  const erreurs: string[] = [];
  for (const [i, c] of cas.entries()) {
    try {
      figures.push({ plan: c.plan, ...(await ecrireGraphe(c.doc, { titre: c.titre, tags: o.tags })) });
    } catch (e) {
      erreurs.push(`${c.plan} : ${e instanceof Error ? e.message : String(e)}`);
    }
    progression?.(i + 1, cas.length);
  }
  let planche: ResultatDeclinaison["planche"] = null;
  if (figures.length >= 2) {
    const dossiers = new Map(figures.map((f) => [f.plan, f.dossier]));
    const premier = cas[0]!.doc;
    const p = plancheMatrice(o.matrice, dossiers, { correspondances: o.correspondances, memeEchelle: o.memeEchelle, etiquettes: o.etiquettes, taille: o.tailleCommune ? { largeur: premier.width, hauteur: premier.height } : null });
    const docs = p.panneaux.map((x) => cas.find((c) => dossiers.get(c.plan) === x.dossier)?.doc ?? null);
    try {
      planche = await ecrirePlanche(p, docs, { titre: o.titrePlanche, tags: o.tags });
    } catch (e) {
      erreurs.push(`Planche : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await useLibrary.getState().rescan();
  return { figures, planche, erreurs };
}

export interface BilanRegeneration {
  figures: string[];
  planches: string[];
  /** Figures ouvertes sur l'autre PC (verrou) : laissées telles quelles. */
  verrouillees: string[];
  erreurs: string[];
}

/**
 * Régénère toutes les figures tracées depuis l'étude `etude` (données neuves, retouches gardées), puis réécrit
 * les exports des planches qui en contiennent une. Les figures verrouillées par l'autre PC ne sont pas touchées.
 */
export async function regenererEtude(etude: string, env: EnvAtelier, progression?: (texte: string) => void): Promise<BilanRegeneration> {
  await useLibrary.getState().rescan();
  const { fs, host } = await bibliotheque();
  const index = useLibrary.getState().index;
  const bilan: BilanRegeneration = { figures: [], planches: [], verrouillees: [], erreurs: [] };
  const regeneres = new Set<string>();
  const graphes = (index?.figures ?? []).filter((f) => f.meta?.kind === "graph" && f.files.includes("graph.json"));
  for (const f of graphes) {
    let doc: GraphDoc;
    try {
      const v = validateGraph(JSON.parse(await fs.readText(joinPath(f.folder, "graph.json"))));
      if (!v.ok || v.doc.origine?.etude !== etude) continue;
      doc = v.doc;
    } catch {
      continue;
    }
    if (lockStatus(f.lock, host, new Date()) === "other") {
      bilan.verrouillees.push(`${f.id} (ouverte sur ${f.lock?.host})`);
      continue;
    }
    progression?.(`Régénération de ${f.id} — ${f.meta?.title ?? ""}…`);
    try {
      const r = await regenerer(doc, env);
      await ecrireGraphe(r.doc, { titre: f.meta?.title ?? f.folder, dossier: f.folder });
      regeneres.add(f.folder);
      bilan.figures.push(f.id);
      if (r.avertissements.length) bilan.erreurs.push(...r.avertissements.map((a) => `${f.id} : ${a}`));
    } catch (e) {
      bilan.erreurs.push(`${f.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const planches = (index?.figures ?? []).filter((f) => f.meta?.kind === "planche" && f.files.includes("planche.json"));
  for (const f of planches) {
    try {
      const p = lirePlanche(JSON.parse(await fs.readText(joinPath(f.folder, "planche.json"))));
      if (!p.panneaux.some((x) => regeneres.has(x.dossier))) continue;
      if (lockStatus(f.lock, host, new Date()) === "other") {
        bilan.verrouillees.push(`${f.id} (ouverte sur ${f.lock?.host})`);
        continue;
      }
      progression?.(`Planche ${f.id}…`);
      const docs: (GraphDoc | null)[] = [];
      for (const x of p.panneaux) {
        if (!x.dossier) {
          docs.push(null);
          continue;
        }
        try {
          const v = validateGraph(JSON.parse(await fs.readText(joinPath(x.dossier, "graph.json"))));
          docs.push(v.ok ? v.doc : null);
        } catch {
          docs.push(null);
        }
      }
      await ecrirePlanche(p, docs, { titre: f.meta?.title ?? f.folder, dossier: f.folder });
      bilan.planches.push(f.id);
    } catch (e) {
      bilan.erreurs.push(`${f.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await useLibrary.getState().rescan();
  return bilan;
}
