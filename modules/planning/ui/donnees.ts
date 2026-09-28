import { useEffect, useState } from "react";
import { chargerCollection, creerObjet, enregistrerObjet, jsonStable, type Fichiers, type ObjetCharge, type Probleme } from "@noyau/stockage";
import type { Contexte } from "@interface/contexte";
import { svgTexteEnPng } from "@interface/image";
import { barresDepuis, grouper, type Barre, type Groupe } from "../core/gantt";
import { ganttSvg } from "../core/svg";
import { DOSSIER_SUPPRIMES, ELEMENTS, FICHIER_CATEGORIES, lireCategories, type Categorie, type Element } from "../core/modele";

export interface Planning {
  elements: ObjetCharge<Element>[];
  categories: Categorie[];
  /** Fournis par les autres modules (plan de lecture, demandes). */
  externes: Barre[];
  problemes: Probleme[];
}

interface PlanBiblio {
  mois: { numero: number; titre: string; debut: string; fin: string; total: number; lues: number; heuresPrevues: number; capacite: number; etat: string }[];
  jalons: { date: string; titre: string }[];
}

/** Périodes des campagnes d'essais, si le module Campagnes est dans l'installeur. */
async function campagnes(ctx: Contexte): Promise<Barre[]> {
  if (!ctx.registre.aAction("campagnes.planning")) return [];
  const c = (await ctx.registre.executer("campagnes.planning", ctx)) as { id: string; titre: string; debut: string; fin: string; detail: string }[];
  return c.map((x) => ({ ...x, categorie: "essais", avancement: 0, source: "campagnes" }));
}

/** Barres fournies par la Bibliothèque et les Campagnes, si elles sont dans l'installeur (SPEC §10.2). */
async function externes(ctx: Contexte): Promise<Barre[]> {
  const deCampagnes = await campagnes(ctx).catch(() => []);
  if (!ctx.registre.aAction("bibliotheque.planning")) return deCampagnes;
  const p = (await ctx.registre.executer("bibliotheque.planning", ctx)) as PlanBiblio;
  return [
    ...p.mois.map((m) => ({
      id: `biblio-mois-${m.numero}`,
      titre: `Lecture, mois ${m.numero}${m.titre ? ` : ${m.titre}` : ""}`,
      categorie: "biblio",
      debut: m.debut,
      fin: m.fin,
      avancement: m.total ? Math.round((100 * m.lues) / m.total) : 0,
      source: "bibliotheque",
      detail: `${m.lues}/${m.total} lues · ${m.heuresPrevues} h prévues pour ${m.capacite} h · ${m.etat}`,
    })),
    ...p.jalons.map((j, i) => ({ id: `biblio-jalon-${i}`, titre: j.titre, categorie: "biblio", debut: j.date, fin: "", avancement: 0, source: "bibliotheque", detail: "Date limite d'envoi d'une demande" })),
    ...deCampagnes,
  ];
}

export async function chargerPlanning(ctx: Contexte): Promise<Planning | null> {
  const fs = ctx.espace?.fichiers;
  if (!fs) return null;
  const [col, texteCats, ext] = await Promise.all([
    chargerCollection(fs, ELEMENTS),
    fs.exists(FICHIER_CATEGORIES).then((ok) => (ok ? fs.readText(FICHIER_CATEGORIES) : null)),
    externes(ctx).catch(() => []),
  ]);
  let categories = lireCategories(null);
  const problemes = [...col.problemes];
  if (texteCats) {
    try {
      categories = lireCategories(JSON.parse(texteCats));
    } catch (e) {
      problemes.push({ type: "illisible", chemin: FICHIER_CATEGORIES, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return { elements: col.objets, categories, externes: ext, problemes };
}

/** Ce que montre le Gantt : éléments actifs et éléments fournis, par catégorie active. */
export function groupesDe(p: Planning): Groupe[] {
  return grouper([...barresDepuis(p.elements), ...p.externes], p.categories);
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const TITRE_FIGURE = "Planning de la thèse";

/** Le Gantt de toute la thèse, en SVG et en PNG (export, Figures, régénération). */
export async function renduGantt(p: Planning, jour = aujourdhui()): Promise<{ svg: string; png: Uint8Array }> {
  const svg = ganttSvg(groupesDe(p), jour, { titre: `${TITRE_FIGURE} — ${new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}` });
  return { svg, png: await svgTexteEnPng(svg) };
}

export function usePlanning(ctx: Contexte) {
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const fs: Fichiers | null = ctx.espace?.fichiers ?? null;

  useEffect(() => {
    let annule = false;
    chargerPlanning(ctx)
      .then((p) => !annule && setPlanning(p))
      .catch((e: unknown) => !annule && setErreur(String(e)));
    return () => {
      annule = true;
    };
    // Rechargé quand les fichiers changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, ctx.revision]);

  async function garde<T>(f: (fs: Fichiers) => Promise<T>): Promise<T | undefined> {
    if (!fs) return undefined;
    try {
      const r = await f(fs);
      setErreur(null);
      return r;
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  }

  return {
    planning,
    erreur,
    creer: (e: Element) => garde((f) => creerObjet(f, ELEMENTS, e)),
    enregistrer: (id: string, e: Element) => garde((f) => enregistrerObjet(f, ELEMENTS, id, e)),
    supprimer: (id: string) =>
      garde(async (f) => {
        await f.ensureDir(DOSSIER_SUPPRIMES);
        const cible = `${DOSSIER_SUPPRIMES}/${id}-${Date.now()}.json`;
        await f.rename(`${ELEMENTS.dossier}/${id}.json`, cible);
      }),
    enregistrerCategories: (c: Categorie[]) => garde(async (f) => (await f.ensureDir("planning"), f.writeTextAtomic(FICHIER_CATEGORIES, jsonStable(c)))),
  };
}
