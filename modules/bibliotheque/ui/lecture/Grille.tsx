/** Grille de lecture : une ligne par article, une colonne par critère ; un clic sur une case la modifie. */
import { useMemo, useState } from "react";
import { citation } from "../../core/calculs";
import { avecCellule, cleEtiquette, vocabulaire, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import { EditeurEtiquettes, Puces } from "./Etiquettes";

const normal = (s: string) => cleEtiquette(s);

export function Grille({
  refs,
  reglages,
  enregistrer,
  ouvrir,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrer(id: string, r: Reference): void;
  ouvrir(id: string): void;
}) {
  const [texte, setTexte] = useState("");
  const [ecartes, setEcartes] = useState(false);
  const [aCompleter, setACompleter] = useState("");
  const [edition, setEdition] = useState<string | null>(null);
  const vocab = useMemo(() => new Map(reglages.criteres.map((c) => [c.id, vocabulaire(refs, c.id, reglages)])), [refs, reglages]);

  const lignes = useMemo(() => {
    const q = normal(texte);
    return refs
      .filter((r) => ecartes || r.valeur.statut !== "Écarté")
      .filter((r) => !aCompleter || !r.valeur.lecture[aCompleter])
      .filter((r) => {
        if (!q) return true;
        const cases = Object.values(r.valeur.lecture)
          .flatMap((c) => [...c.etiquettes, c.note])
          .join(" ");
        return normal(`${r.id} ${citation(r.valeur)} ${r.valeur.titre} ${cases}`).includes(q);
      });
  }, [refs, texte, ecartes, aCompleter]);

  const remplies = (critere: string) => refs.filter((r) => r.valeur.statut !== "Écarté" && r.valeur.lecture[critere]).length;
  const actifs = refs.filter((r) => r.valeur.statut !== "Écarté").length;

  return (
    <>
      <div className="filtres">
        <input className="champ recherche" type="search" placeholder="Rechercher (article, étiquette, note)…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        <select className="champ" value={aCompleter} onChange={(e) => setACompleter(e.target.value)} aria-label="Articles à compléter">
          <option value="">Tous les articles</option>
          {reglages.criteres.map((c) => (
            <option key={c.id} value={c.id}>
              Sans « {c.nom} »
            </option>
          ))}
        </select>
        <label className="rangee petit">
          <input type="checkbox" checked={ecartes} onChange={(e) => setEcartes(e.target.checked)} /> écartés
        </label>
        <span className="discret petit">
          {lignes.length} article{lignes.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="defilement lc-grille-cadre">
        <table className="tableau lc-grille">
          <thead>
            <tr>
              <th className="lc-fixe">Article</th>
              {reglages.criteres.map((c) => (
                <th key={c.id} title={c.aide || undefined}>
                  {c.nom}
                  <div className="discret petit">
                    {remplies(c.id)}/{actifs}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((r) => (
              <tr key={r.id} className={r.valeur.statut === "Écarté" ? "lc-ecarte" : undefined}>
                <td className="lc-fixe">
                  <button type="button" className="lien" onClick={() => ouvrir(r.id)} title={r.valeur.titre}>
                    {citation(r.valeur) || r.id}
                  </button>
                  <div className="discret petit lc-titre">{r.valeur.titre}</div>
                </td>
                {reglages.criteres.map((c) => {
                  const cle = `${r.id}|${c.id}`;
                  return (
                    <td
                      key={c.id}
                      className={`lc-case${edition === cle ? " lc-case-edition" : ""}`}
                      onClick={() => edition !== cle && setEdition(cle)}
                      tabIndex={edition === cle ? -1 : 0}
                      onKeyDown={(e) => edition !== cle && (e.key === "Enter" || e.key === "F2") && setEdition(cle)}
                      aria-label={`${c.nom} de ${r.id}`}
                    >
                      {edition === cle ? (
                        <EditeurEtiquettes
                          autoFocus
                          valeur={r.valeur.lecture[c.id]}
                          vocabulaire={vocab.get(c.id) ?? []}
                          aide={c.aide}
                          onValider={(cellule) => enregistrer(r.id, avecCellule(r.valeur, c.id, cellule))}
                          onFermer={() => setEdition(null)}
                        />
                      ) : (
                        <Puces c={r.valeur.lecture[c.id]} max={4} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="discret petit">Un clic (ou Entrée) sur une case pour la modifier ; « ; » ou Entrée ajoute une étiquette, les plus utilisées sont proposées d'abord.</p>
    </>
  );
}
