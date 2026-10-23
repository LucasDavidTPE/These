/**
 * Un classeur Excel d'un projet (SPEC §6.1) : ses graphiques détectés et, pour chacun, son
 * état dans la bibliothèque (à ajouter, à jour, à mettre à jour depuis le classeur).
 */
import { useEffect, useState } from "react";
import { etatGraphique, lireGraphiques, type EtatGraphique, origineExcel } from "../../core/excelFigures";
import type { GraphiqueExcel } from "../../core/graph";
import { useLibrary } from "./useLibrary";

export function ClasseurExcel({ projet, classeur, ouvrir }: { projet: string; classeur: string; ouvrir: () => void }) {
  const s = useLibrary();
  const [deplie, setDeplie] = useState(false);
  const [graphiques, setGraphiques] = useState<GraphiqueExcel[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!deplie || !s.backend || !s.root) return;
    let vivant = true;
    lireGraphiques(s.backend.fs(s.root), projet, classeur).then(
      (g) => {
        if (!vivant) return;
        setGraphiques(g);
        setErreur("");
      },
      (e: unknown) => vivant && setErreur(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      vivant = false;
    };
  }, [deplie, s.backend, s.root, projet, classeur, s.index, version]);

  const figures = s.index?.figures ?? [];
  const etats: [GraphiqueExcel, EtatGraphique][] = (graphiques ?? []).map((g) => [g, etatGraphique(g, projet, classeur, figures)]);
  const nouveaux = etats.filter(([, e]) => e.etat === "nouveau").map(([g]) => g);
  const perimes = etats.filter(([, e]) => e.etat === "a-mettre-a-jour") as [GraphiqueExcel, Extract<EtatGraphique, { figure: unknown }>][];

  const action = async (fn: () => Promise<void>) => {
    setOccupe(true);
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };
  const mettreAJour = (liste: typeof perimes) =>
    action(async () => {
      for (const [, e] of liste) await s.regenererExcel(e.figure.folder, origineExcel(e.figure.meta)!);
    });

  return (
    <li className="classeur">
      <div className="classeur-tete">
        <button type="button" className="link grow" aria-expanded={deplie} onClick={() => setDeplie(!deplie)} title="Voir les graphiques de ce classeur">
          {deplie ? "▾" : "▸"} {classeur}
          {graphiques && ` (${graphiques.length} graphique${graphiques.length > 1 ? "s" : ""}${perimes.length ? `, ${perimes.length} à mettre à jour` : ""})`}
        </button>
        <button type="button" onClick={ouvrir}>
          Ouvrir dans Excel
        </button>
      </div>
      {deplie && (
        <div className="classeur-corps">
          {erreur && <p className="error small">{erreur}</p>}
          {graphiques === null && !erreur && <p className="muted small">Lecture…</p>}
          {graphiques?.length === 0 && <p className="muted small">Aucun graphique dans ce classeur. Insérez-en un dans Excel (nuage de points, courbes, barres), enregistrez, puis « Relire ».</p>}
          <ul>
            {etats.map(([g, e]) => (
              <li key={g.id}>
                <div className="classeur-graphique">
                  <span className="grow">
                    <b>{g.titre || g.nom}</b> <span className="muted small">— {g.feuille}, {g.nom}{g.graphe ? `, ${g.graphe.series.length} série${g.graphe.series.length > 1 ? "s" : ""}` : ""}</span>
                  </span>
                  {e.etat === "nouveau" && (
                    <button type="button" disabled={occupe} onClick={() => void action(() => s.importerGraphiques(projet, classeur, [g]))}>
                      Ajouter à Figures
                    </button>
                  )}
                  {e.etat === "a-mettre-a-jour" && (
                    <button type="button" className="primary" disabled={occupe} title="Relit les données du classeur ; la mise en forme faite dans Figures est gardée" onClick={() => void mettreAJour([[g, e]])}>
                      Mettre à jour
                    </button>
                  )}
                  {"figure" in e && (
                    <button type="button" className="link" onClick={() => void s.select(e.figure.folder)}>
                      {e.figure.id}
                      {e.etat === "a-jour" ? " ✓" : ""}
                    </button>
                  )}
                  {e.etat === "illisible" && <span className="muted small">non traduisible</span>}
                </div>
                {g.avertissements.length > 0 && (
                  <ul className="avertissements muted small">
                    {g.avertissements.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <div className="rangee-boutons">
            <button type="button" className="link" onClick={() => setVersion((v) => v + 1)}>
              Relire le classeur
            </button>
            {nouveaux.length > 1 && (
              <button type="button" disabled={occupe} onClick={() => void action(() => s.importerGraphiques(projet, classeur, nouveaux))}>
                Tout ajouter ({nouveaux.length})
              </button>
            )}
            {perimes.length > 1 && (
              <button type="button" disabled={occupe} onClick={() => void mettreAJour(perimes)}>
                Tout mettre à jour ({perimes.length})
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
