/**
 * Un script Python d'un projet (SPEC §6.1) : Exécuter (Python du poste), console en direct,
 * Arrêter, et ses sorties avec leur état dans la bibliothèque (à ajouter, à jour, à mettre à jour).
 */
import { useEffect, useRef, useState } from "react";
import { useContexte } from "@interface/contexte";
import { empreinteSortie, etatSortie, installerBibliotheque, listerSorties, origineScript, type EtatSortie, type Sortie } from "../../core/sortiesPython";
import type { LignePython } from "../platform/backend";
import { useLibrary } from "./useLibrary";
import bibliotheque from "../../python/these_figures.py?raw";

const LIGNES_MAX = 400;

const GENRES: Record<Sortie["genre"], string> = { graphe: "graphe modifiable", image: "image", svg: "SVG", pdf: "PDF" };

export function ScriptPython({ projet, script, chemin, editer }: { projet: string; script: string; chemin: string; editer: () => void }) {
  const ctx = useContexte();
  const s = useLibrary();
  const [console_, setConsole] = useState<LignePython[]>([]);
  const [voirConsole, setVoirConsole] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState("");
  const [sorties, setSorties] = useState<{ sortie: Sortie; etat: EtatSortie | null }[]>([]);
  const [version, setVersion] = useState(0);
  const [occupe, setOccupe] = useState(false);
  const id = useRef(`${projet}/${script}`);
  const bas = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!s.backend || !s.root) return;
    const fs = s.backend.fs(s.root);
    const figures = s.index?.figures ?? [];
    let vivant = true;
    void (async () => {
      const liste = await listerSorties(fs, projet, script);
      const out = await Promise.all(
        liste.map(async (sortie) => {
          try {
            return { sortie, etat: etatSortie(sortie, await empreinteSortie(fs, projet, script, sortie), projet, script, figures) };
          } catch {
            return { sortie, etat: null };
          }
        }),
      );
      if (vivant) setSorties(out);
    })();
    return () => {
      vivant = false;
    };
  }, [s.backend, s.root, s.index, projet, script, version]);

  useEffect(() => {
    bas.current?.scrollTo({ top: bas.current.scrollHeight });
  }, [console_]);

  const executer = async () => {
    if (!s.backend || !s.root) return;
    setEnCours(true);
    setVoirConsole(true);
    setConsole([]);
    setBilan("");
    try {
      await installerBibliotheque(s.backend.fs(s.root), projet, bibliotheque);
      const fin = await s.backend.executerPython(id.current, chemin, ctx.reglages.python, (l) => setConsole((c) => [...c.slice(-LIGNES_MAX + 1), l]));
      const duree = `${(fin.duree_ms / 1000).toFixed(1)} s`;
      setBilan(
        fin.depasse
          ? `Arrêté au bout de 10 min (${fin.python}).`
          : fin.arrete
            ? "Arrêté."
            : fin.code === 0
              ? `Terminé en ${duree} (${fin.python}).`
              : `Erreur (code ${fin.code ?? "?"}) après ${duree} : voir la console.`,
      );
      if (fin.code !== 0) setVoirConsole(true);
    } catch (e) {
      setBilan(e instanceof Error ? e.message : String(e));
    } finally {
      setEnCours(false);
      setVersion((v) => v + 1);
    }
  };

  const faire = async (fn: () => Promise<void>) => {
    setOccupe(true);
    try {
      await fn();
    } catch (e) {
      setBilan(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };
  const nouvelles = sorties.filter((x) => x.etat?.etat === "nouveau").map((x) => x.sortie);
  const perimees = sorties.flatMap((x) => (x.etat && "figure" in x.etat && x.etat.etat === "a-mettre-a-jour" ? [x.etat.figure] : []));
  const mettreAJour = (figures: typeof perimees) =>
    faire(async () => {
      for (const f of figures) await s.regenererScript(f.folder, origineScript(f.meta)!);
    });

  return (
    <li className="classeur">
      <div className="classeur-tete">
        <span className="grow">
          <b>{script}</b>
          {sorties.length > 0 && (
            <span className="muted small">
              {" "}
              — {sorties.length} sortie{sorties.length > 1 ? "s" : ""}
              {perimees.length ? `, ${perimees.length} à mettre à jour` : ""}
            </span>
          )}
        </span>
        {enCours ? (
          <button type="button" onClick={() => void s.backend?.arreterPython(id.current)}>
            Arrêter
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void executer()} title="Lance le script avec le Python de ce poste ; ses sorties apparaissent ci-dessous">
            Exécuter
          </button>
        )}
        <button type="button" onClick={editer} title="Ouvre le script dans VS Code (sinon, le dossier des scripts)">
          Modifier
        </button>
      </div>
      <div className="classeur-corps">
        {bilan && <p className={`small ${/Erreur|introuvable|Lancement/.test(bilan) ? "error" : "muted"}`}>{bilan}</p>}
        {(console_.length > 0 || enCours) && (
          <button type="button" className="link small" onClick={() => setVoirConsole(!voirConsole)}>
            {voirConsole ? "▾ Console" : "▸ Console"} ({console_.length} ligne{console_.length > 1 ? "s" : ""})
          </button>
        )}
        {voirConsole && (
          <pre className="console-python" ref={bas} aria-live="polite">
            {console_.map((l, i) => (
              <span key={i} className={l.flux === "stderr" ? "stderr" : undefined}>
                {l.texte}
                {"\n"}
              </span>
            ))}
            {enCours && <span className="muted">…</span>}
          </pre>
        )}
        {sorties.length > 0 && (
          <ul>
            {sorties.map(({ sortie, etat }) => (
              <li key={sortie.fichier} className="classeur-graphique">
                <span className="grow">
                  {sortie.fichier} <span className="muted small">— {GENRES[sortie.genre]}</span>
                </span>
                {etat === null && <span className="error small">illisible</span>}
                {etat?.etat === "nouveau" && (
                  <button type="button" disabled={occupe} onClick={() => void faire(() => s.importerSorties(projet, script, [sortie]))}>
                    Ajouter à Figures
                  </button>
                )}
                {etat?.etat === "a-mettre-a-jour" && (
                  <button type="button" className="primary" disabled={occupe} title="Reprend la nouvelle sortie ; la mise en forme faite dans Figures est gardée" onClick={() => void mettreAJour([etat.figure])}>
                    Mettre à jour
                  </button>
                )}
                {etat && "figure" in etat && (
                  <button type="button" className="link" onClick={() => void s.select(etat.figure.folder)}>
                    {etat.figure.id}
                    {etat.etat === "a-jour" ? " ✓" : ""}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {(nouvelles.length > 1 || perimees.length > 1) && (
          <div className="rangee-boutons">
            {nouvelles.length > 1 && (
              <button type="button" disabled={occupe} onClick={() => void faire(() => s.importerSorties(projet, script, nouvelles))}>
                Tout ajouter ({nouvelles.length})
              </button>
            )}
            {perimees.length > 1 && (
              <button type="button" disabled={occupe} onClick={() => void mettreAJour(perimees)}>
                Tout mettre à jour ({perimees.length})
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
