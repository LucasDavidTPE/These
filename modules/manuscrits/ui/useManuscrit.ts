/** Le document courant (liste des documents de l'espace, choix, plan), partagé par les onglets Plan et Retours. */
import { useCallback, useEffect, useState } from "react";
import type { Contexte } from "@interface/contexte";
import { idProjet, manuscritVide, type Manuscrit, type TypeDocument } from "../core/plan";
import { chargerPlan, ecrirePlan, listerProjets, type Projet } from "./donnees";

export interface ManuscritCourant {
  projets: Projet[] | null;
  projet: string | null;
  setProjet(id: string): void;
  m: Manuscrit | null;
  /** Remplace le plan et l'écrit dans l'espace. */
  sauver(suivant: Manuscrit): Promise<void>;
  creer(titre: string, type: TypeDocument): Promise<string | null>;
  erreur: string | null;
}

export function useManuscrit(ctx: Contexte): ManuscritCourant {
  const espace = ctx.espace!;
  const [projets, setProjets] = useState<Projet[] | null>(null);
  const [projet, setProjet] = useState<string | null>(null);
  const [m, setM] = useState<Manuscrit | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

  useEffect(() => {
    let annule = false;
    listerProjets(espace.fichiers)
      .then((l) => {
        if (annule) return;
        setProjets(l);
        setProjet((p) => (p && l.some((x) => x.id === p) ? p : (l[0]?.id ?? null)));
      })
      .catch((e: unknown) => !annule && setErreur(message(e)));
    return () => {
      annule = true;
    };
  }, [espace, ctx.revision]);

  useEffect(() => {
    if (!projet) return;
    let annule = false;
    chargerPlan(espace.fichiers, projet)
      .then((p) => !annule && setM(p))
      .catch((e: unknown) => !annule && setErreur(message(e)));
    return () => {
      annule = true;
    };
  }, [espace, projet, ctx.revision]);

  const sauver = useCallback(
    async (suivant: Manuscrit) => {
      if (!projet) return;
      setM(suivant);
      try {
        await ecrirePlan(espace.fichiers, projet, suivant);
      } catch (e) {
        setErreur(`Plan non enregistré : ${message(e)}`);
      }
    },
    [espace, projet],
  );

  const creer = useCallback(
    async (titre: string, type: TypeDocument) => {
      const id = idProjet(titre);
      if (projets?.some((p) => p.id === id)) {
        setErreur(`Un document « ${id} » existe déjà : choisissez un autre titre.`);
        return null;
      }
      const neuf = manuscritVide(titre.trim() || "Document", type);
      await ecrirePlan(espace.fichiers, id, neuf);
      setProjets([...(projets ?? []), { id, titre: neuf.titre, type }]);
      setProjet(id);
      setM(neuf);
      return id;
    },
    [espace, projets],
  );

  return { projets, projet, setProjet, m: projet ? m : null, sauver, creer, erreur };
}
