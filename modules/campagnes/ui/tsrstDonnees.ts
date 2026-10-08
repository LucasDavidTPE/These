/** Réglage partagé des températures et dépouillement TSRST d'un essai (lecture de l'export, rangement). */
import { useEffect, useState } from "react";
import type { Contexte } from "@interface/contexte";
import { fichiersDonnees } from "@interface/donnees";
import { lireCsv } from "@noyau/formats/wavematrix";
import { SUFFIXE_SUIVI } from "../core/decouverte";
import { depouillerTsrst, sectionDe, type ResultatsTsrst } from "../core/tsrst";
import { aujourdhui, ecrireReglagesTsrst, enregistrerTsrst, lireReglagesTsrst, type CampagneChargee } from "./donnees";

/** Températures où relever la contrainte (réglage partagé). */
export function useTemperatures(ctx: Contexte): [number[], (t: number[]) => void] {
  const fs = ctx.espace?.fichiers;
  const [t, setT] = useState<number[]>([-10, -20, -30]);
  useEffect(() => {
    if (!fs) return;
    let annule = false;
    void lireReglagesTsrst(fs).then((r) => !annule && setT(r.temperatures));
    return () => {
      annule = true;
    };
  }, [fs, ctx.revision]);
  return [
    t,
    (x) => {
      setT(x);
      if (fs) void ecrireReglagesTsrst(fs, { temperatures: x });
    },
  ];
}

/** Lit l'export de l'essai (copie dans l'espace ou source) et range son dépouillement. */
export async function depouillerEssai(ctx: Contexte, c: CampagneChargee, nom: string, temperatures: number[]): Promise<ResultatsTsrst> {
  const k = c.campagne;
  if (!k.donnees) throw new Error("Choisissez d'abord le dossier de données de la campagne.");
  const fsD = fichiersDonnees(ctx, k.donnees);
  const fichier = (await fsD.listDir(nom)).find((f) => f.name.endsWith(SUFFIXE_SUIVI));
  if (!fichier) throw new Error(`${nom} : pas d'export ${SUFFIXE_SUIVI} (ni dans l'espace, ni sur ce poste).`);
  const e = c.essais[nom]!;
  const serie = lireCsv(new TextDecoder().decode(await fsD.readBytes(`${nom}/${fichier.name}`)));
  const r = depouillerTsrst(serie, {
    section: sectionDe(e.fiche),
    temperatures,
    voieTemperature: e.voieTemperature || undefined,
    fichier: fichier.name,
    aujourdhui: aujourdhui(),
  });
  await enregistrerTsrst(ctx.espace!.fichiers, c.slug, nom, r);
  return r;
}
