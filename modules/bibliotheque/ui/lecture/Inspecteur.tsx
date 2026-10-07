/**
 * Inspecteur (colonne de droite de l'atelier) : l'article choisi (ses cases, ses liens, glisser un article de la
 * liste pour le lier, précédent / suivant au clavier), ou l'étiquette choisie (définition, articles, étiquettes
 * compagnes, renommer), ou à défaut un bilan de la lecture.
 */
import { useState } from "react";
import { citation } from "../../core/calculs";
import { compagnes, filtrer, type Choix } from "../../core/explorer";
import { cleEtiquette, definir, lier, renommerEtiquette, vocabulaire, type BilanValidation, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import { ChampTexte } from "../champs";
import { LectureFiche } from "./LectureFiche";

export const TYPE_GLISSE = "application/x-these-bib";

export function InspecteurArticle({
  id,
  refs,
  reglages,
  enregistrer,
  ouvrirFiche,
  choisirArticle,
  precedent,
  suivant,
  position,
}: {
  id: string;
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrer(id: string, r: Reference): void;
  ouvrirFiche(id: string): void;
  choisirArticle(id: string): void;
  precedent(): void;
  suivant(quoi: false | "completer" | "valider"): void;
  position: string;
}) {
  const r = refs.find((x) => x.id === id);
  const [depose, setDepose] = useState<string | null>(null);
  const [type, setType] = useState(reglages.typesLiens[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [survol, setSurvol] = useState(false);
  if (!r) return null;
  const v = r.valeur;
  const nom = (x: string) => {
    const ref = refs.find((y) => y.id === x)?.valeur;
    return ref ? citation(ref) || ref.titre.slice(0, 40) : x;
  };
  return (
    <div
      className={`lc-inspecteur-article${survol ? " lc-depot" : ""}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TYPE_GLISSE)) {
          e.preventDefault();
          setSurvol(true);
        }
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        const autre = e.dataTransfer.getData(TYPE_GLISSE);
        if (autre && autre !== id) setDepose(autre);
      }}
    >
      <div className="lc-nav">
        <button type="button" onClick={precedent} title="Article précédent (K ou ↑)">
          ◀
        </button>
        <span className="discret petit">{position}</span>
        <button type="button" onClick={() => suivant(false)} title="Article suivant (J ou ↓)">
          ▶
        </button>
        <button type="button" onClick={() => suivant("completer")} title="Prochain article qui a des critères vides (N)">
          À compléter ⏭
        </button>
        <button type="button" onClick={() => suivant("valider")} title="Prochain article qui a des cases à valider (V)">
          À valider ⏭
        </button>
      </div>
      <h3 className="lc-titre-article">
        <button type="button" className="lien" onClick={() => ouvrirFiche(id)} title="Ouvrir la fiche complète">
          {citation(v) || id}
        </button>
      </h3>
      <p className="lc-sous-titre-article">{v.titre}</p>
      <p className="discret petit">
        {id} · {v.statut}
        {v.support ? ` · ${v.support}` : ""}
      </p>
      {depose ? (
        <div className="lc-lier-depose">
          <span>
            {citation(v) || id}
          </span>
          <select className="champ" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de lien">
            {reglages.typesLiens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nom}
              </option>
            ))}
          </select>
          <strong>{nom(depose)}</strong>
          <input className="champ" value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (facultative)" />
          <button
            type="button"
            className="principal"
            onClick={() => {
              enregistrer(id, lier(r, { vers: depose, type, note }));
              setDepose(null);
              setNote("");
            }}
          >
            Lier
          </button>
          <button type="button" onClick={() => setDepose(null)}>
            Annuler
          </button>
        </div>
      ) : (
        <p className="discret petit lc-astuce">Astuce : glissez un article de la liste ici pour le lier à celui-ci.</p>
      )}
      <LectureFiche key={id} id={id} r={v} refs={refs} reglages={reglages} enregistrer={(x) => enregistrer(id, x)} enregistrerAutre={enregistrer} ouvrir={choisirArticle} />
    </div>
  );
}

export function InspecteurEtiquette({
  choix,
  refs,
  reglages,
  enregistrerReglages,
  enregistrerLot,
  filtrerPar,
  choisirArticle,
  centrer,
}: {
  choix: Choix;
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrerReglages(r: ReglagesLecture): void;
  enregistrerLot(m: ObjetRef[]): Promise<void>;
  filtrerPar(c: Choix): void;
  choisirArticle(id: string): void;
  centrer(c: Choix): void;
}) {
  const e = vocabulaire(refs, choix.critere, reglages).find((x) => x.cle === choix.cle);
  const c = reglages.criteres.find((x) => x.id === choix.critere);
  if (!e || !c) return <p className="discret">Étiquette introuvable (renommée ?).</p>;
  const porteurs = filtrer(refs, [choix]);
  const comp = compagnes(refs, choix.critere, choix.cle, 10);
  return (
    <div>
      <p className="discret petit">{c.nom}</p>
      <h3 className="lc-titre-article">{e.etiquette}</h3>
      <div className="rangee">
        <button type="button" onClick={() => filtrerPar(choix)}>
          Filtrer la liste
        </button>
        <button type="button" onClick={() => centrer(choix)}>
          Constellation
        </button>
      </div>
      <label className="libelle">
        <span>Définition</span>
        <ChampTexte multiligne valeur={e.definition} onValider={(v) => enregistrerReglages(definir(reglages, choix.critere, e.etiquette, v))} placeholder="Ce que recouvre cette étiquette (reprise dans la synthèse et dans Excel)" />
      </label>
      <label className="libelle">
        <span>Renommer (sous le nom d'une autre étiquette : les fusionne)</span>
        <ChampTexte
          valeur={e.etiquette}
          onValider={(v) => {
            if (!v.trim() || v.trim() === e.etiquette) return;
            void enregistrerLot(renommerEtiquette(refs, choix.critere, e.etiquette, v)).then(() => {
              if (e.definition) enregistrerReglages(definir(definir(reglages, choix.critere, e.etiquette, ""), choix.critere, v, e.definition));
              centrer({ critere: choix.critere, cle: cleEtiquette(v) });
            });
          }}
        />
      </label>
      <h4>{porteurs.length} article(s)</h4>
      <ul className="lc-liste-simple">
        {porteurs.map((r) => (
          <li key={r.id}>
            <button type="button" className="lien" onClick={() => choisirArticle(r.id)}>
              {citation(r.valeur) || r.id}
            </button>
            {r.valeur.lecture[choix.critere]?.note ? <span className="discret petit"> — {r.valeur.lecture[choix.critere]!.note}</span> : null}
          </li>
        ))}
      </ul>
      {comp.length ? (
        <>
          <h4>Souvent avec</h4>
          <div className="lc-nuage">
            {comp.map((x) => (
              <button key={`${x.critere}${x.etiquette}`} type="button" className="lc-jeton" onClick={() => centrer({ critere: x.critere, cle: cleEtiquette(x.etiquette) })} title={reglages.criteres.find((y) => y.id === x.critere)?.nom}>
                {x.etiquette}
                <span className="lc-jeton-n">{x.n}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Bilan({
  refs,
  reglages,
  commencer,
  valider,
  validation,
  nettoyables,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  commencer(): void;
  valider(): void;
  validation: BilanValidation;
  nettoyables: number;
}) {
  const actifs = refs.filter((r) => r.valeur.statut !== "Écarté");
  const complets = actifs.filter((r) => reglages.criteres.every((c) => r.valeur.lecture[c.id]?.etiquettes.length)).length;
  const vides = actifs.filter((r) => !Object.keys(r.valeur.lecture).length).length;
  const etiquettes = reglages.criteres.reduce((s, c) => s + vocabulaire(refs, c.id).filter((e) => e.ids.length).length, 0);
  const liens = refs.reduce((s, r) => s + r.valeur.liens.length, 0);
  return (
    <div>
      <h3 className="lc-titre-article">Lecture croisée</h3>
      <div className="lc-chiffres">
        <div>
          <strong>{complets}</strong>
          <span>articles complets</span>
        </div>
        <div>
          <strong>{vides}</strong>
          <span>pas encore commencés</span>
        </div>
        <div>
          <strong>{etiquettes}</strong>
          <span>étiquettes</span>
        </div>
        <div>
          <strong>{liens}</strong>
          <span>liens</span>
        </div>
      </div>
      <h4>Validation</h4>
      <p className="petit">
        <strong>{validation.validees}</strong> case(s) validée(s) sur {validation.cases}
        {validation.articlesAValider ? ` · ${validation.articlesAValider} article(s) avec des cases à valider` : " · tout est validé"}
      </p>
      <div className="lc-jauge-validation" title={`${validation.cases ? Math.round((100 * validation.validees) / validation.cases) : 0} % validé`}>
        <span style={{ width: `${validation.cases ? (100 * validation.validees) / validation.cases : 0}%` }} />
      </div>
      <p className="discret petit">
        Les cases reprises automatiquement des fiches sont « à valider » (en pointillés). Une case que vous modifiez est validée ; ✓ la valide telle quelle. On
        peut valider un article à tout moment, lu ou non.
      </p>
      <div className="rangee">
        {validation.articlesAValider ? (
          <button type="button" className="principal" onClick={valider}>
            Valider : article suivant
          </button>
        ) : null}
        <button type="button" onClick={commencer}>
          Compléter : article suivant
        </button>
      </div>
      <p className="discret petit">J / K (ou ↓ / ↑) : article suivant / précédent ; V : suivant à valider ; N : suivant à compléter ; Échap : désélectionner ; F : plein écran.</p>
      {nettoyables ? <p className="lc-attention petit">{nettoyables} étiquette(s) à nettoyer (parenthèses, écritures voisines) : voir « Nettoyer ».</p> : null}
    </div>
  );
}
