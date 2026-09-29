/**
 * Enregistrement automatique des dépouillements dans l'espace : peu après chaque modification,
 * chaque essai qui a un emplacement (`essai.enregistrement`) est écrit s'il a changé depuis
 * la dernière écriture. Un essai de campagne n'est écrit qu'après une première modification
 * (l'ouvrir pour regarder ne le marque pas « dépouillé » : son état d'ouverture est relevé par
 * `marquerEnregistre`) ; un fichier ouvert à la main l'est tout de suite, pour apparaître dans
 * « Dépouillements enregistrés ».
 */
import { useEffect } from "react";
import { isoAvecDecalage } from "@noyau/dates";
import { parent } from "@noyau/stockage";
import type { Contexte } from "@interface/contexte";
import { DOSSIER_DEPOUILLEMENTS } from "../core/depouillement";
import { contenuEnregistre, projetJSON, type Essai } from "../core/essai";
import { useTraitement } from "./etat";

/** Dernier projet écrit (ou trouvé à l'ouverture), par essai. */
const ecrits = new Map<string, string>();

/** À l'ouverture d'un dépouillement déjà enregistré : rien à réécrire tant qu'il ne change pas. */
export function marquerEnregistre(e: Essai): void {
  ecrits.set(e.id, projetJSON([e]));
}

export async function enregistrer(ctx: Pick<Contexte, "espace" | "poste">, e: Essai, forcer = false): Promise<boolean> {
  const fs = ctx.espace?.fichiers;
  if (!fs || !e.enregistrement || e.demo) return false;
  const projet = projetJSON([e]);
  if (!forcer && ecrits.get(e.id) === projet) return false;
  const contenu = contenuEnregistre(e, ctx.poste, isoAvecDecalage(new Date(), -new Date().getTimezoneOffset()));
  if (contenu === null) return false;
  await fs.ensureDir(parent(e.enregistrement.chemin));
  await fs.writeTextAtomic(e.enregistrement.chemin, contenu);
  ecrits.set(e.id, projet);
  useTraitement.setState({ enregistre: `Enregistré à ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` });
  return true;
}

export function useSauvegardeAuto(ctx: Contexte): void {
  const tour = useTraitement((s) => s.tour);
  useEffect(() => {
    if (!ctx.espace) return;
    const minuterie = setTimeout(() => {
      void (async () => {
        for (const e of useTraitement.getState().essais) {
          if (!e.enregistrement || e.demo) continue;
          try {
            await enregistrer(ctx, e);
          } catch (err) {
            useTraitement.getState().signaler(`Enregistrement automatique impossible : ${err instanceof Error ? err.message : String(err)}`, "erreur");
          }
        }
      })();
    }, 1200);
    return () => clearTimeout(minuterie);
  }, [tour, ctx]);
}

/**
 * Change l'emplacement d'enregistrement d'un essai (rattachement à un essai de campagne) et l'y
 * écrit. L'ancien enregistrement autonome (`traitement/…`) est rangé dans `.supprimes`, jamais effacé.
 */
export async function deplacerEnregistrement(ctx: Pick<Contexte, "espace" | "poste">, essaiId: string, chemin: string): Promise<void> {
  const e = useTraitement.getState().essais.find((x) => x.id === essaiId);
  if (!e) throw new Error("Essai introuvable (fermé entre-temps ?).");
  const ancien = e.enregistrement;
  e.enregistrement = { chemin, format: "depouillement" };
  await enregistrer(ctx, e, true);
  const fs = ctx.espace?.fichiers;
  if (fs && ancien && ancien.chemin !== chemin && ancien.chemin.startsWith(`${DOSSIER_DEPOUILLEMENTS}/`) && (await fs.exists(ancien.chemin))) {
    await fs.ensureDir(`${DOSSIER_DEPOUILLEMENTS}/.supprimes`);
    await fs.rename(ancien.chemin, `${DOSSIER_DEPOUILLEMENTS}/.supprimes/${Date.now()}-${ancien.chemin.split("/").pop()}`);
  }
}
