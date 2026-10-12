/** Lecture et écriture de la lecture croisée dans l'espace : réglages, fiches modifiées en lot, classeur Excel. */
import { useCallback, useEffect, useState } from "react";
import { enregistrerObjet, Introuvable, type Fichiers } from "@noyau/stockage";
import { useContexte } from "@interface/contexte";
import { ecrireReglagesLecture, FICHIER_LECTURE, lireReglagesLecture, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import { empreinte, FICHIER_CLASSEUR, FICHIER_SYNCHRO, lireSynchro, type Synchro } from "../../core/lectureExcel";
import { REFERENCES } from "../../core/modele";

const absent = (e: unknown) => e instanceof Introuvable || (e as { code?: string } | null)?.code === "not-found";

export async function lireReglages(fs: Fichiers): Promise<ReglagesLecture | null> {
  try {
    return lireReglagesLecture(JSON.parse(await fs.readText(FICHIER_LECTURE)));
  } catch (e) {
    if (absent(e)) return null;
    if (e instanceof SyntaxError) throw new Error(`${FICHIER_LECTURE} est illisible (JSON abîmé).`, { cause: e });
    throw e;
  }
}

export const ecrireReglages = (fs: Fichiers, r: ReglagesLecture) => fs.writeTextAtomic(FICHIER_LECTURE, ecrireReglagesLecture(r));

/** Écrit des fiches modifiées, une par une (un fichier par référence). */
export async function ecrireFiches(fs: Fichiers, modifiees: readonly ObjetRef[]): Promise<void> {
  for (const m of modifiees) await enregistrerObjet(fs, REFERENCES, m.id, m.valeur);
}

/** Réglages de la lecture croisée (null tant qu'elle n'est pas démarrée), relus à chaque modification de l'espace. */
export function useReglagesLecture() {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers ?? null;
  const [reglages, setReglages] = useState<ReglagesLecture | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (!fs) return;
    let annule = false;
    lireReglages(fs)
      .then((r) => !annule && (setReglages(r), setErreur(null)))
      .catch((e: unknown) => !annule && setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision]);
  const enregistrer = useCallback(
    async (r: ReglagesLecture) => {
      if (!fs) return;
      setReglages(r);
      await ecrireReglages(fs, r);
    },
    [fs],
  );
  return { reglages, enregistrer, erreur };
}

export interface EtatClasseur {
  existe: boolean;
  synchro: Synchro | null;
  /** Modifié depuis la dernière synchronisation (enregistré par Excel, ou venu de l'autre PC). */
  modifie: boolean;
}

export async function etatClasseur(fs: Fichiers): Promise<EtatClasseur> {
  const synchro: Synchro | null = await fs
    .readText(FICHIER_SYNCHRO)
    .then((t) => lireSynchro(JSON.parse(t)))
    .catch(() => null);
  if (!(await fs.exists(FICHIER_CLASSEUR))) return { existe: false, synchro, modifie: false };
  const octets = await fs.readBytes(FICHIER_CLASSEUR);
  return { existe: true, synchro, modifie: !synchro || synchro.empreinte !== empreinte(octets) };
}

/** État du classeur, relu au retour dans la fenêtre (Excel l'a peut-être enregistré entre-temps). */
export function useEtatClasseur() {
  const ctx = useContexte();
  const fs = ctx.espace?.fichiers ?? null;
  const [etat, setEtat] = useState<EtatClasseur | null>(null);
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const f = () => setTour((t) => t + 1);
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, []);
  useEffect(() => {
    if (!fs) return;
    let annule = false;
    etatClasseur(fs)
      .then((e) => !annule && setEtat(e))
      .catch(() => !annule && setEtat(null));
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision, tour]);
  return { etat, relire: () => setTour((t) => t + 1) };
}
