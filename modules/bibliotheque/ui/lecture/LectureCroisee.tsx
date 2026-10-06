/**
 * Onglet « Lecture croisée » de la Bibliothèque : grille, croisement, carte, synthèse, synchronisation Excel
 * et réglages. Les modifications sont affichées tout de suite (avant le rechargement depuis les fichiers).
 */
import { useMemo, useState } from "react";
import { Message } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { CRITERES_DE_DEPART, initialiser, type ObjetRef } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import type { Biblio } from "../donnees";
import { CarteVue } from "./Carte";
import { CroisementVue } from "./Croisement";
import { ExcelVue } from "./Excel";
import { Grille } from "./Grille";
import { ReglagesVue } from "./Reglages";
import { SyntheseVue } from "./Synthese";
import { ecrireFiches, useEtatClasseur, useReglagesLecture } from "./donnees";
import "./lecture.css";

const VUES = [
  ["grille", "Grille"],
  ["croisement", "Croisement"],
  ["carte", "Carte"],
  ["synthese", "Synthèse"],
  ["excel", "Excel"],
  ["reglages", "Critères et vocabulaire"],
] as const;
type Vue = (typeof VUES)[number][0];

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
  const [vue, setVue] = useState<Vue>("grille");
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
          On en tire le <strong>croisement</strong> de deux critères (les cases vides sont les trous de la littérature), une <strong>carte</strong> des articles et des
          méthodes, une <strong>synthèse</strong> par étiquette pour l'état de l'art, et un <strong>classeur Excel</strong> synchronisé dans les deux sens.
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
      {classeur?.existe && classeur.modifie && vue !== "excel" ? (
        <Message niveau="attention">
          Le classeur Excel a été modifié depuis la dernière synchronisation.{" "}
          <button type="button" onClick={() => setVue("excel")}>
            Synchroniser…
          </button>
        </Message>
      ) : null}
      <nav className="onglets lc-vues" aria-label="Lecture croisée">
        {VUES.map(([id, titre]) => (
          <button key={id} type="button" className={vue === id ? "actif" : undefined} onClick={() => setVue(id)}>
            {titre}
            {id === "excel" && classeur?.existe && classeur.modifie ? <span className="compteur">!</span> : null}
          </button>
        ))}
      </nav>
      {vue === "grille" ? (
        <Grille refs={refs} reglages={reglages} enregistrer={enregistrer} ouvrir={ouvrir} />
      ) : vue === "croisement" ? (
        <CroisementVue refs={refs} reglages={reglages} enregistrerReglages={(r) => void garde(() => enregistrerReglages(r))} ouvrir={ouvrir} />
      ) : vue === "carte" ? (
        <CarteVue refs={refs} reglages={reglages} ouvrir={ouvrir} />
      ) : vue === "synthese" ? (
        <SyntheseVue refs={refs} reglages={reglages} />
      ) : vue === "excel" ? (
        <ExcelVue refs={refs} reglages={reglages} etat={classeur} relire={relire} />
      ) : (
        <ReglagesVue refs={refs} reglages={reglages} enregistrerReglages={(r) => void garde(() => enregistrerReglages(r))} enregistrerLot={enregistrerLot} />
      )}
    </>
  );
}
