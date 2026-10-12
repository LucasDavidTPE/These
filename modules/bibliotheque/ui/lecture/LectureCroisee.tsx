/**
 * Onglet « Lecture croisée » de la Bibliothèque : démarrage, puis l'atelier (Atelier.tsx). Les modifications sont
 * affichées tout de suite (avant le rechargement depuis les fichiers).
 */
import { useMemo, useState } from "react";
import { Message } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { CRITERES_DE_DEPART, initialiser, type ObjetRef } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import type { Biblio } from "../donnees";
import { Atelier } from "./Atelier";
import { ecrireFiches, useEtatClasseur, useReglagesLecture } from "./donnees";
import "./lecture.css";


/** Références avec les modifications locales pas encore relues depuis les fichiers. */
function useRefsLocales(b: Biblio) {
  const [locales, setLocales] = useState<Map<string, Reference>>(new Map());
  const refs = useMemo<ObjetRef[]>(() => b.references.map((r) => ({ id: r.id, valeur: locales.get(r.id) ?? r.valeur })), [b.references, locales]);
  // une modification locale est oubliée dès que le fichier relu la contient
  const aJour = useMemo(() => {
    let change = false;
    const m = new Map(locales);
    for (const r of b.references) {
      const l = m.get(r.id);
      if (l && JSON.stringify(l) === JSON.stringify(r.valeur)) {
        m.delete(r.id);
        change = true;
      }
    }
    return change ? m : locales;
  }, [b.references, locales]);
  if (aJour !== locales) setLocales(aJour);
  const poser = (modifiees: readonly ObjetRef[]) =>
    setLocales((m) => {
      const n = new Map(m);
      for (const x of modifiees) n.set(x.id, x.valeur);
      return n;
    });
  return { refs, poser };
}

export function LectureCroisee({ b, ouvrir }: { b: Biblio; ouvrir(id: string): void }) {
  const ctx = useContexte();
  const fs = ctx.espace!.fichiers;
  const { reglages, enregistrer: enregistrerReglages, erreur: erreurReglages } = useReglagesLecture();
  const { etat: classeur, relire } = useEtatClasseur();
  const { refs, poser } = useRefsLocales(b);
  const [erreur, setErreur] = useState<string | null>(null);
  const [demarrage, setDemarrage] = useState<string | null>(null);

  const garde = async (f: () => Promise<unknown>) => {
    try {
      await f();
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  };
  const enregistrerLot = async (modifiees: ObjetRef[]) => {
    poser(modifiees);
    await garde(() => ecrireFiches(fs, modifiees));
  };
  const enregistrer = (id: string, r: Reference) => void enregistrerLot([{ id, valeur: r }]);

  if (reglages === undefined) return <p className="discret">Lecture…</p>;
  if (erreurReglages) return <Message niveau="erreur">{erreurReglages}</Message>;

  if (reglages === null) {
    const avecDimensions = refs.filter((r) => CRITERES_DE_DEPART.some((c) => r.valeur.fiche[c.champ].trim()) || r.valeur.categories.length).length;
    return (
      <div className="carte lc-intro">
        <h2>Lecture croisée</h2>
        <p>
          Une <strong>grille</strong> : une ligne par article, une colonne par critère de lecture (pneu, contact, loi de comportement, méthode, chargement, cible,
          validation…). Chaque case reçoit des <strong>étiquettes</strong> (« MEF 3D », « 2S2P1D »…) tirées d'un vocabulaire qui se construit au fil de la saisie, et
          une note. Les articles se relient par des <strong>liens typés</strong> (étend, contredit, même méthode que…).
        </p>
        <p>
          On en tire le <strong>croisement</strong> de deux critères (les cases vides sont les trous de la littérature), une <strong>constellation</strong> autour de chaque article ou
          méthode, une <strong>synthèse</strong> par étiquette pour l'état de l'art, et un <strong>classeur Excel</strong> synchronisé dans les deux sens.
        </p>
        <p className="discret">
          Au démarrage, les champs Pneu, Contact, Loi, Méthode, Chargement, Cible et Validation de vos fiches ({avecDimensions} article(s) renseigné(s)) et les catégories
          de la Matrice croisée deviennent les premières étiquettes. Les fiches d'origine ne sont pas effacées.
        </p>
        <button
          type="button"
          className="principal"
          onClick={() =>
            void garde(async () => {
              const { reglages: r, modifiees } = initialiser(refs, null);
              await enregistrerLot(modifiees);
              await enregistrerReglages(r);
              setDemarrage(`${modifiees.length} article(s) repris dans la grille, ${r.criteres.length} critères.`);
            })
          }
        >
          Démarrer la lecture croisée
        </button>
        {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      </div>
    );
  }

  return (
    <>
      {demarrage ? <Message niveau="info">{demarrage}</Message> : null}
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      <Atelier
        refs={refs}
        reglages={reglages}
        classeur={classeur}
        relireClasseur={relire}
        enregistrer={enregistrer}
        enregistrerLot={enregistrerLot}
        enregistrerReglages={(r) => void garde(() => enregistrerReglages(r))}
        ouvrirFiche={ouvrir}
      />
    </>
  );
}
