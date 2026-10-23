/**
 * En-tête d'un projet ouvert dans la bibliothèque (SPEC §6.1) : titre, description, dossier,
 * et les blocs Scripts Python et Classeurs Excel du projet. La grille en dessous montre ses figures.
 */
import { useCallback, useEffect, useState } from "react";
import { useContexte } from "@interface/contexte";
import { absolu } from "@noyau/stockage";
import { DOSSIERS_PROJET, cheminProjet, fichiersProjet, type FichiersProjet, type Projet } from "../../core/projets";
import { useLibrary } from "./useLibrary";

export function ProjetEntete({ projet }: { projet: Projet }) {
  const ctx = useContexte();
  const s = useLibrary();
  const [edition, setEdition] = useState<{ titre: string; description: string } | null>(null);
  const [fichiers, setFichiers] = useState<FichiersProjet>({ scripts: [], classeurs: [] });
  const [etat, setEtat] = useState("");

  const [version, setVersion] = useState(0);
  const relire = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!s.backend || !s.root) return;
    let vivant = true;
    void fichiersProjet(s.backend.fs(s.root), projet.slug).then((f) => vivant && setFichiers(f));
    return () => {
      vivant = false;
    };
  }, [s.backend, s.root, projet.slug, s.index, version]);

  const abs = (...parts: string[]) => absolu(s.root!, cheminProjet(projet.slug, ...parts));
  const ouvrir = async (chemin: string) => {
    try {
      await ctx.plateforme.ouvrirDossier(chemin);
    } catch (e) {
      setEtat(e instanceof Error ? e.message : String(e));
    }
  };

  const ajouterClasseur = async () => {
    const f = await ctx.plateforme.ouvrirFichier("Classeur Excel à ranger dans le projet", ["xlsx", "xlsm"]);
    if (!f || !s.backend || !s.root) return;
    const fs = s.backend.fs(s.root);
    const dossier = cheminProjet(projet.slug, DOSSIERS_PROJET.excel);
    await fs.createDir(dossier).catch(() => undefined);
    const existants = new Set((await fs.listDir(dossier)).map((e) => e.name.toLowerCase()));
    const [base, ext] = /^(.*?)(\.[^.]+)?$/.exec(f.nom)!.slice(1) as [string, string | undefined];
    let nom = f.nom;
    for (let n = 2; existants.has(nom.toLowerCase()); n++) nom = `${base} (${n})${ext ?? ""}`;
    await fs.writeBytesAtomic(`${dossier}/${nom}`, f.octets);
    setEtat(`« ${nom} » copié dans le projet : modifiez désormais cette copie (Ouvrir dans Excel).`);
    relire();
  };

  return (
    <section className="projet-entete">
      {edition ? (
        <form
          className="meta-edit"
          onSubmit={(e) => {
            e.preventDefault();
            void s.modifierProjet(projet.slug, edition).then(() => setEdition(null));
          }}
        >
          <label className="field">
            <span>Titre</span>
            <input autoFocus value={edition.titre} onChange={(e) => setEdition({ ...edition, titre: e.target.value })} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea rows={2} value={edition.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} />
          </label>
          <div className="row">
            <button type="submit" className="primary" disabled={!edition.titre.trim()}>
              Enregistrer
            </button>
            <button type="button" onClick={() => setEdition(null)}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="projet-tete">
          <div>
            <h2>{projet.titre}</h2>
            {projet.description && <p className="muted">{projet.description}</p>}
          </div>
          <div className="rangee-boutons">
            <button type="button" onClick={() => void ouvrir(abs())} title={abs()}>
              Ouvrir le dossier
            </button>
            <button type="button" onClick={() => setEdition({ titre: projet.titre, description: projet.description ?? "" })}>
              Renommer
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Retirer le projet « ${projet.titre} » ?\n\nLes figures restent dans la bibliothèque ; le dossier du projet (scripts, classeurs) est rangé dans _projets/_corbeille, rien n'est effacé.`))
                  void s.supprimerProjet(projet.slug);
              }}
            >
              Retirer le projet
            </button>
          </div>
        </div>
      )}

      <div className="projet-blocs">
        <div className="projet-bloc">
          <h3>Classeurs Excel</h3>
          {fichiers.classeurs.length === 0 ? (
            <p className="muted small">Aucun classeur dans {DOSSIERS_PROJET.excel}/.</p>
          ) : (
            <ul className="projet-fichiers">
              {fichiers.classeurs.map((c) => (
                <li key={c}>
                  <span className="grow">{c}</span>
                  <button type="button" onClick={() => void ouvrir(abs(DOSSIERS_PROJET.excel, c))}>
                    Ouvrir dans Excel
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="link" onClick={() => void ajouterClasseur()}>
            + Ajouter un classeur…
          </button>
        </div>
        <div className="projet-bloc">
          <h3>Scripts Python</h3>
          {fichiers.scripts.length === 0 ? (
            <p className="muted small">Aucun script dans {DOSSIERS_PROJET.scripts}/.</p>
          ) : (
            <ul className="projet-fichiers">
              {fichiers.scripts.map((sc) => (
                <li key={sc}>
                  <span className="grow">{sc}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="link" onClick={() => void ouvrir(abs(DOSSIERS_PROJET.scripts))}>
            Ouvrir le dossier des scripts
          </button>
        </div>
      </div>
      {etat && <p className="muted small">{etat}</p>}
    </section>
  );
}
