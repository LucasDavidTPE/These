/**
 * En-tête d'un projet ouvert dans la bibliothèque (SPEC §6.1) : titre, description, dossier,
 * et les blocs Scripts Python et Classeurs Excel du projet. La grille en dessous montre ses figures.
 */
import { useCallback, useEffect, useState } from "react";
import { useContexte } from "@interface/contexte";
import { absolu } from "@noyau/stockage";
import { DOSSIERS_PROJET, cheminProjet, fichiersProjet, type FichiersProjet, type Projet } from "../../core/projets";
import { ClasseurExcel } from "./ClasseurExcel";
import { ScriptPython } from "./ScriptPython";
import { installerBibliotheque, modeleScript } from "../../core/sortiesPython";
import bibliothequePython from "../../python/these_figures.py?raw";
import { useLibrary } from "./useLibrary";
import modeleClasseur from "./modele-figure.xlsx?url";

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

  /** Écrit un classeur dans excel/ sous un nom libre (« Fig 2 (2).xlsx » si pris) ; renvoie le nom retenu. */
  const deposer = async (nomVoulu: string, octets: Uint8Array) => {
    const fs = s.backend!.fs(s.root!);
    const dossier = cheminProjet(projet.slug, DOSSIERS_PROJET.excel);
    await fs.createDir(dossier).catch(() => undefined);
    const existants = new Set((await fs.listDir(dossier)).map((e) => e.name.toLowerCase()));
    const [base, ext] = /^(.*?)(\.[^.]+)?$/.exec(nomVoulu)!.slice(1) as [string, string | undefined];
    let nom = nomVoulu;
    for (let n = 2; existants.has(nom.toLowerCase()); n++) nom = `${base} (${n})${ext ?? ""}`;
    await fs.writeBytesAtomic(`${dossier}/${nom}`, octets);
    relire();
    return nom;
  };

  const ajouterClasseur = async () => {
    try {
      const f = await ctx.plateforme.ouvrirFichier("Classeur Excel à ranger dans le projet", ["xlsx", "xlsm"]);
      if (!f || !s.backend || !s.root) return;
      const nom = await deposer(f.nom, f.octets);
      setEtat(`« ${nom} » copié dans le projet : modifiez désormais cette copie (Ouvrir dans Excel).`);
    } catch (e) {
      setEtat(e instanceof Error ? e.message : String(e));
    }
  };

  /** VS Code si installé ; sinon le dossier (ouvrir un .py par défaut l'exécuterait). */
  const editer = async (chemin: string) => {
    try {
      await ctx.plateforme.ouvrirVSCode(chemin);
    } catch {
      setEtat("VS Code introuvable : ouvrez le script avec votre éditeur (Spyder, IDLE…) depuis le dossier.");
      await ouvrir(abs(DOSSIERS_PROJET.scripts));
    }
  };

  const nouveauScript = async () => {
    const saisi = window.prompt("Nom du script (par exemple « fig3_module ») :", "");
    if (!saisi?.trim() || !s.backend || !s.root) return;
    try {
      const fs = s.backend.fs(s.root);
      const base = saisi.trim().replace(/\.py$/i, "").replace(/[^\w-]+/g, "_");
      const dossier = cheminProjet(projet.slug, DOSSIERS_PROJET.scripts);
      await installerBibliotheque(fs, projet.slug, bibliothequePython);
      const existants = new Set((await fs.listDir(dossier)).map((e) => e.name.toLowerCase()));
      let nom = `${base}.py`;
      for (let n = 2; existants.has(nom.toLowerCase()); n++) nom = `${base}_${n}.py`;
      await fs.writeTextAtomic(`${dossier}/${nom}`, modeleScript(base));
      relire();
      setEtat(`« ${nom} » créé : modifiez-le, puis « Exécuter ».`);
      await editer(abs(DOSSIERS_PROJET.scripts, nom));
    } catch (e) {
      setEtat(e instanceof Error ? e.message : String(e));
    }
  };

  const nouveauClasseur = async () => {
    const saisi = window.prompt("Nom du classeur (une figure, par exemple « Fig 3 module complexe ») :", "");
    if (!saisi?.trim() || !s.backend || !s.root) return;
    try {
      const octets = new Uint8Array(await (await fetch(modeleClasseur)).arrayBuffer());
      const nom = await deposer(`${saisi.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\.xlsx$/i, "")}.xlsx`, octets);
      setEtat(`« ${nom} » créé : remplissez la feuille Données, enregistrez, puis dépliez-le ici pour l'ajouter à Figures.`);
      await ouvrir(abs(DOSSIERS_PROJET.excel, nom));
    } catch (e) {
      setEtat(e instanceof Error ? e.message : String(e));
    }
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
                <ClasseurExcel key={c} projet={projet.slug} classeur={c} chemin={abs(DOSSIERS_PROJET.excel, c)} ouvrir={() => void ouvrir(abs(DOSSIERS_PROJET.excel, c))} />
              ))}
            </ul>
          )}
          <div className="rangee-boutons">
            <button type="button" className="link" onClick={() => void nouveauClasseur()} title="Classeur prêt à remplir : une feuille Données et un nuage de points">
              + Nouveau classeur
            </button>
            <button type="button" className="link" onClick={() => void ajouterClasseur()} title="Copie un classeur existant dans le projet">
              + Ajouter un classeur existant…
            </button>
          </div>
        </div>
        <div className="projet-bloc">
          <h3>Scripts Python</h3>
          {fichiers.scripts.length === 0 ? (
            <p className="muted small">Aucun script dans {DOSSIERS_PROJET.scripts}/.</p>
          ) : (
            <ul className="projet-fichiers">
              {fichiers.scripts.map((sc) => (
                <ScriptPython key={sc} projet={projet.slug} script={sc} chemin={abs(DOSSIERS_PROJET.scripts, sc)} editer={() => void editer(abs(DOSSIERS_PROJET.scripts, sc))} />
              ))}
            </ul>
          )}
          <div className="rangee-boutons">
            <button type="button" className="link" onClick={() => void nouveauScript()} title="Script prêt à lancer, avec la bibliothèque these_figures">
              + Nouveau script
            </button>
            <button type="button" className="link" onClick={() => void ouvrir(abs(DOSSIERS_PROJET.scripts))} title="Pour y déposer vos scripts .py existants">
              Ouvrir le dossier des scripts
            </button>
          </div>
        </div>
      </div>
      {etat && <p className="muted small">{etat}</p>}
    </section>
  );
}
