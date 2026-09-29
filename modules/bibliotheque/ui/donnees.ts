/**
 * Chargement et enregistrement de la bibliothèque dans l'espace. Rechargée à chaque
 * modification des fichiers (ici ou venue de l'autre PC par OneDrive).
 */
import { useCallback, useEffect, useState } from "react";
import { chargerCollection, creerObjet, enregistrerObjet, Introuvable, jsonStable, type Fichiers, type ObjetCharge, type Probleme } from "@noyau/stockage";
import { useContexte } from "@interface/contexte";
import { calculer, moisCourant, tableauDeBord, type Calcule, type TableauDeBord } from "../core/calculs";
import { CITATIONS_PAR_DEFAUT, FICHIER_CITATIONS, lireReglageCitations, type ReglageCitations } from "../core/citations";
import { doublons, type Doublon } from "../core/doublons";
import type { ImportClasseur } from "../core/import";
import {
  CORRECTIONS,
  DEMANDES,
  DOSSIER,
  FICHIER_ANALYSE,
  FICHIER_PARAMETRES,
  lireParametres,
  PARAMETRES_PAR_DEFAUT,
  PISTES,
  REFERENCES,
  type Correction,
  type Demande,
  type Parametres,
  type Piste,
  type Reference,
} from "../core/modele";

export interface Biblio {
  references: ObjetCharge<Reference>[];
  demandes: ObjetCharge<Demande>[];
  corrections: ObjetCharge<Correction>[];
  pistes: ObjetCharge<Piste>[];
  parametres: Parametres;
  analyse: string;
  problemes: Probleme[];
  aujourdhui: string;
  calc: Calcule[];
  tb: TableauDeBord;
  doublons: Doublon[];
}

/** Date du jour, locale, « AAAA-MM-JJ ». */
export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function lireTexte(fs: Fichiers, chemin: string): Promise<string | null> {
  try {
    return await fs.readText(chemin);
  } catch (e) {
    if (e instanceof Introuvable || (e as { code?: string }).code === "not-found") return null;
    throw e;
  }
}

export async function chargerBiblio(fs: Fichiers, jour = aujourdhui()): Promise<Biblio> {
  const [references, demandes, corrections, pistes, texteParametres, analyse] = await Promise.all([
    chargerCollection(fs, REFERENCES),
    chargerCollection(fs, DEMANDES),
    chargerCollection(fs, CORRECTIONS),
    chargerCollection(fs, PISTES),
    lireTexte(fs, FICHIER_PARAMETRES),
    lireTexte(fs, FICHIER_ANALYSE),
  ]);
  const problemes = [...references.problemes, ...demandes.problemes, ...corrections.problemes, ...pistes.problemes];
  let parametres = PARAMETRES_PAR_DEFAUT;
  if (texteParametres !== null) {
    try {
      parametres = lireParametres(JSON.parse(texteParametres));
    } catch (e) {
      problemes.push({ type: "illisible", chemin: FICHIER_PARAMETRES, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  const calc = calculer(references.objets, parametres, moisCourant(jour, parametres));
  return {
    references: references.objets,
    demandes: demandes.objets,
    corrections: corrections.objets,
    pistes: pistes.objets,
    parametres,
    analyse: analyse ?? "",
    problemes,
    aujourdhui: jour,
    calc,
    doublons: doublons(references.objets),
    tb: tableauDeBord(
      calc,
      demandes.objets.map((d) => d.valeur),
      corrections.objets.filter((c) => !c.valeur.corrige).length,
      parametres,
      jour,
    ),
  };
}

/** Écrit tout le contenu d'un import (les objets de mêmes ID sont remplacés). */
export async function ecrireImport(fs: Fichiers, imp: ImportClasseur): Promise<void> {
  await fs.ensureDir(`${DOSSIER}/analyse`);
  await fs.writeTextAtomic(FICHIER_PARAMETRES, jsonStable(imp.parametres));
  await fs.writeTextAtomic(FICHIER_ANALYSE, imp.analyse);
  for (const r of imp.references) await enregistrerObjet(fs, REFERENCES, r.id, r.valeur);
  for (const d of imp.demandes) await enregistrerObjet(fs, DEMANDES, d.id, d.valeur);
  for (const c of imp.corrections) await enregistrerObjet(fs, CORRECTIONS, c.id, c.valeur);
  for (const p of imp.pistes) await enregistrerObjet(fs, PISTES, p.id, p.valeur);
}

export function useBiblio() {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers ?? null;
  const [biblio, setBiblio] = useState<Biblio | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!fs) return;
    let annule = false;
    chargerBiblio(fs)
      .then((b) => !annule && (setBiblio(b), setErreur(null)))
      .catch((e: unknown) => !annule && setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision]);

  const garde = useCallback(
    async (f: (fs: Fichiers) => Promise<unknown>) => {
      if (!fs) return;
      try {
        await f(fs);
        setErreur(null);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e));
      }
    },
    [fs],
  );

  return {
    biblio,
    erreur,
    enregistrerReference: (id: string, r: Reference) => garde((f) => enregistrerObjet(f, REFERENCES, id, r)),
    creerReference: async (r: Reference) => {
      let id: string | null = null;
      await garde(async (f) => (id = await creerObjet(f, REFERENCES, r)));
      return id;
    },
    enregistrerDemande: (id: string, d: Demande) => garde((f) => enregistrerObjet(f, DEMANDES, id, d)),
    enregistrerCorrection: (id: string, c: Correction) => garde((f) => enregistrerObjet(f, CORRECTIONS, id, c)),
    enregistrerPiste: (id: string, p: Piste) => garde((f) => enregistrerObjet(f, PISTES, id, p)),
    enregistrerAnalyse: (texte: string) => garde(async (f) => (await f.ensureDir(`${DOSSIER}/analyse`), f.writeTextAtomic(FICHIER_ANALYSE, texte))),
    importer: (imp: ImportClasseur) => garde((f) => ecrireImport(f, imp)),
  };
}

/** Réglage partagé des citations `[@…]` dans les autres modules (actives par défaut). */
export async function lireCitations(fs: Fichiers): Promise<ReglageCitations> {
  const t = await lireTexte(fs, FICHIER_CITATIONS).catch(() => null);
  try {
    return t ? lireReglageCitations(JSON.parse(t)) : CITATIONS_PAR_DEFAUT;
  } catch {
    return CITATIONS_PAR_DEFAUT;
  }
}

export async function ecrireCitations(fs: Fichiers, r: ReglageCitations): Promise<void> {
  await fs.ensureDir(DOSSIER);
  await fs.writeTextAtomic(FICHIER_CITATIONS, JSON.stringify(r, null, 2) + "\n");
}
