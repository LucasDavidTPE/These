/**
 * Index des sources LaTeX (racine « latex ») : figures TikZ autonomes, documents,
 * chapitres ; qui utilise chaque figure ; inclusions introuvables. Rien n'est compilé ni
 * déplacé : on ouvre la source dans VS Code, le dossier dans l'Explorateur, le PDF s'il existe.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { correspond } from "@noyau/texte";
import { Message, Pastille } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { indexer, type EntreeIndex, type Nature } from "../core/latex";
import { parcourirLatex } from "./donnees";

const NATURES: [Nature | "", string][] = [
  ["", "Tout"],
  ["figure", "Figures"],
  ["document", "Documents"],
  ["fragment", "Chapitres et fragments"],
];

export function LatexIndex() {
  const ctx = useContexte();
  const racine = ctx.reglages.racines.latex;
  const [index, setIndex] = useState<EntreeIndex[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nature, setNature] = useState<Nature | "">("figure");
  const [recherche, setRecherche] = useState("");
  const [tour, setTour] = useState(0);

  useEffect(() => {
    if (!racine) return;
    let annule = false;
    (async () => {
      if (!(await ctx.plateforme.dossierExiste(racine))) throw new Error(`${racine} est introuvable sur ce poste.`);
      const { sources, autres } = await parcourirLatex(ctx.plateforme.fichiers(racine));
      if (!annule) setIndex(indexer(sources, autres));
    })().catch((e: unknown) => !annule && setErreur(e instanceof Error ? e.message : String(e)));
    return () => {
      annule = true;
    };
  }, [racine, ctx.plateforme, tour]);

  const choisir = useCallback(async () => {
    const d = await ctx.plateforme.choisirDossier("Dossier de vos sources LaTeX (manuscrit, figures TikZ)", racine);
    if (d) await ctx.enregistrerReglages({ ...ctx.reglages, racines: { ...ctx.reglages.racines, latex: d } });
  }, [ctx, racine]);

  const sep = racine?.includes("\\") ? "\\" : "/";
  const absolu = (rel: string) => `${racine!.replace(/[\\/]+$/, "")}${sep}${rel.split("/").join(sep)}`;
  const dossierDe = (rel: string) => absolu(rel.split("/").slice(0, -1).join("/"));

  const visibles = useMemo(
    () => (index ?? []).filter((e) => (!nature || e.nature === nature) && correspond(`${e.titre} ${e.chemin} ${e.documentclass}`, recherche)),
    [index, nature, recherche],
  );
  const manquantes = (index ?? []).filter((e) => e.introuvables.length);

  if (!racine)
    return (
      <div className="carte">
        <p>Indiquez le dossier de vos sources LaTeX : chaque <code>.tex</code> y est classé (figure autonome, document, chapitre), avec ce qu'il inclut et qui l'utilise. Rien n'est déplacé ni compilé.</p>
        <button type="button" className="principal" onClick={() => void choisir()}>
          Choisir le dossier LaTeX…
        </button>
      </div>
    );

  return (
    <>
      <div className="rangee barre-outils">
        <span className="segmente">
          {NATURES.map(([n, l]) => (
            <button key={n} type="button" className={nature === n ? "actif" : undefined} onClick={() => setNature(n)}>
              {l}
              {index ? ` (${n ? index.filter((e) => e.nature === n).length : index.length})` : ""}
            </button>
          ))}
        </span>
        <input type="search" className="champ" placeholder="Rechercher (titre, chemin)…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        <button type="button" onClick={() => (setIndex(null), setTour((t) => t + 1))}>
          Relire
        </button>
        <button type="button" onClick={() => void choisir()} title={racine}>
          Changer de dossier…
        </button>
      </div>
      {erreur ? <Message niveau="erreur">{erreur}</Message> : null}
      {manquantes.length ? (
        <Message niveau="attention">
          Inclusions introuvables sous {racine} :{" "}
          {manquantes.map((e) => (
            <span key={e.chemin}>
              <code>{e.chemin}</code> → {e.introuvables.join(", ")} ·{" "}
            </span>
          ))}
        </Message>
      ) : null}
      {!index ? (
        <p className="discret">Lecture des sources…</p>
      ) : visibles.length === 0 ? (
        <p className="discret">Aucune source ne correspond.</p>
      ) : (
        <table className="tableau">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Fichier</th>
              <th>Nature</th>
              <th>Utilisé par</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((e) => (
              <tr key={e.chemin}>
                <td>{e.titre}</td>
                <td className="petit">
                  <code>{e.chemin}</code>
                </td>
                <td>
                  <Pastille niveau={e.nature === "figure" ? "ok" : e.nature === "document" ? "info" : "attention"}>{e.nature === "fragment" ? "fragment" : `${e.nature} (${e.documentclass})`}</Pastille>
                </td>
                <td className="petit">{e.utilisePar.length ? e.utilisePar.join(", ") : <span className="discret">—</span>}</td>
                <td className="nowrap">
                  <button type="button" onClick={() => void ctx.plateforme.ouvrirVSCode(absolu(e.chemin))}>
                    VS Code
                  </button>{" "}
                  {e.pdf ? (
                    <button type="button" onClick={() => void ctx.plateforme.ouvrirDossier(absolu(e.pdf!))}>
                      PDF
                    </button>
                  ) : null}{" "}
                  <button type="button" title="Ouvrir le dossier dans l'Explorateur" onClick={() => void ctx.plateforme.ouvrirDossier(dossierDe(e.chemin))}>
                    Dossier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
