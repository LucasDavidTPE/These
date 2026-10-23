/** Dessins SVG d'un projet (dossier svg/) : état dans la bibliothèque, ouverture dans le logiciel de dessin, mise à jour. */
import { useEffect, useState } from "react";
import { cheminSvg, etatSvg, origineSvg, type EtatSvg } from "../../core/svgProjet";
import { useLibrary } from "./useLibrary";

export function SvgsProjet({ projet, fichiers, ouvrir }: { projet: string; fichiers: string[]; ouvrir: (fichier: string) => void }) {
  const s = useLibrary();
  const [etats, setEtats] = useState<Record<string, EtatSvg | null>>({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    if (!s.backend || !s.root) return;
    const fs = s.backend.fs(s.root);
    const figures = s.index?.figures ?? [];
    let vivant = true;
    void Promise.all(
      fichiers.map(async (f) => {
        try {
          return [f, etatSvg(projet, f, await fs.readText(cheminSvg(projet, f)), figures)] as const;
        } catch {
          return [f, null] as const;
        }
      }),
    ).then((r) => vivant && setEtats(Object.fromEntries(r)));
    return () => {
      vivant = false;
    };
  }, [s.backend, s.root, s.index, projet, fichiers]);

  const faire = async (fn: () => Promise<void>) => {
    setOccupe(true);
    setErreur("");
    try {
      await fn();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };
  const nouveaux = fichiers.filter((f) => etats[f]?.etat === "nouveau");
  const perimes = fichiers.flatMap((f) => {
    const e = etats[f];
    return e && "figure" in e && e.etat === "a-mettre-a-jour" ? [e.figure] : [];
  });
  const mettreAJour = (liste: typeof perimes) =>
    faire(async () => {
      for (const f of liste) await s.regenererSvg(f.folder, origineSvg(f.meta)!);
    });

  return (
    <>
      <ul className="projet-fichiers">
        {fichiers.map((f) => {
          const e = etats[f];
          return (
            <li key={f}>
              <span className="grow">{f}</span>
              {e === null && <span className="error small">illisible</span>}
              {e?.etat === "nouveau" && (
                <button type="button" disabled={occupe} onClick={() => void faire(() => s.importerSvgsProjet(projet, [f]))}>
                  Ajouter à Figures
                </button>
              )}
              {e?.etat === "a-mettre-a-jour" && (
                <button type="button" className="primary" disabled={occupe} title="Reprend le fichier retouché ; titre, tags et légende de la fiche restent" onClick={() => void mettreAJour([e.figure])}>
                  Mettre à jour
                </button>
              )}
              {e && "figure" in e && (
                <button type="button" className="link" onClick={() => void s.select(e.figure.folder)}>
                  {e.figure.id}
                  {e.etat === "a-jour" ? " ✓" : ""}
                </button>
              )}
              <button type="button" onClick={() => ouvrir(f)} title="Ouvre le dessin dans le programme associé aux .svg sur ce PC (VectorArt…)">
                Ouvrir
              </button>
            </li>
          );
        })}
      </ul>
      {(nouveaux.length > 1 || perimes.length > 1) && (
        <div className="rangee-boutons">
          {nouveaux.length > 1 && (
            <button type="button" disabled={occupe} onClick={() => void faire(() => s.importerSvgsProjet(projet, nouveaux))}>
              Tout ajouter ({nouveaux.length})
            </button>
          )}
          {perimes.length > 1 && (
            <button type="button" disabled={occupe} onClick={() => void mettreAJour(perimes)}>
              Tout mettre à jour ({perimes.length})
            </button>
          )}
        </div>
      )}
      {erreur && <p className="error small">{erreur}</p>}
    </>
  );
}
