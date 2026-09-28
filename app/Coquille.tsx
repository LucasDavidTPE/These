/**
 * La coquille : barre des modules, page courante, et ce qu'elle partage avec les modules
 * (contexte, registre, surveillance de l'espace, liste « À régler »).
 */
import { absolu, avecGarde } from "@noyau/stockage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { problemesRacine } from "@noyau/espace/espace";
import { DANS_L_ESPACE, dossierFigures, horsEspace, racinesEffectives } from "@noyau/poste/racines";
import type { ReglagesPoste } from "@noyau/poste/reglages";
import type { Produit } from "@noyau/produits";
import { Registre } from "@noyau/registre";
import { ContexteReact, type Contexte, type Destination, type ProblemeSitue } from "@interface/contexte";
import { IconeDiagnostic, IconeReglages } from "@interface/icones";
import type { Manifeste } from "@interface/manifeste";
import type { Plateforme } from "@interface/plateforme";
import { BandeauMiseAJour } from "./BandeauMiseAJour";
import { DiagnosticPage } from "./DiagnosticPage";
import { Palette } from "./Palette";
import { ReglagesPage } from "./ReglagesPage";

interface Props {
  produit: Produit;
  manifestes: Manifeste[];
  plateforme: Plateforme;
  poste: string;
  reglages: ReglagesPoste;
  enregistrerReglages(r: ReglagesPoste): Promise<void>;
}

/** Délai de regroupement des notifications de fichiers : une rafale de OneDrive = un rechargement. */
const REGROUPEMENT_MS = 300;

export function Coquille({ produit, manifestes, plateforme, poste, reglages, enregistrerReglages }: Props) {
  const registre = useMemo(() => new Registre<Manifeste>(manifestes), [manifestes]);
  const [page, setPage] = useState<Destination>(manifestes[0]?.id ?? "reglages");
  const [revision, setRevision] = useState(0);
  const [problemes, setProblemes] = useState<ProblemeSitue[]>([]);
  const [palette, setPalette] = useState(false);

  // Ctrl+K (ou Cmd+K) ouvre et ferme la recherche globale.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, []);

  const espace = useMemo(
    () => (produit.espace && reglages.espace ? { racine: reglages.espace, fichiers: avecGarde(plateforme.fichiers(reglages.espace)) } : null),
    [produit.espace, reglages.espace, plateforme],
  );

  // Surveillance de l'espace : une modification (ici ou venue de l'autre PC par OneDrive)
  // fait avancer `revision`, et les vues abonnées se rechargent.
  useEffect(() => {
    if (!espace) return;
    let arret: (() => void) | null = null;
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    let annule = false;
    void plateforme
      .surveiller(espace.racine, () => {
        clearTimeout(minuteur);
        minuteur = setTimeout(() => setRevision((r) => r + 1), REGROUPEMENT_MS);
      })
      .then((f) => {
        if (annule) f();
        else arret = f;
      });
    return () => {
      annule = true;
      clearTimeout(minuteur);
      arret?.();
    };
  }, [espace, plateforme]);

  const cheminEspace = espace?.racine ?? null;
  const racines = useMemo(() => racinesEffectives(reglages.racines, cheminEspace), [reglages.racines, cheminEspace]);
  const figures = useMemo(() => dossierFigures(reglages.figures, cheminEspace), [reglages.figures, cheminEspace]);

  // Ce qui vit dans l'espace y a toujours son dossier, même vide (PDF, figures).
  useEffect(() => {
    if (!cheminEspace) return;
    for (const d of Object.values(DANS_L_ESPACE)) void plateforme.creerDossier(absolu(cheminEspace, d)).catch(() => undefined);
  }, [cheminEspace, plateforme]);

  const rafraichir = useCallback(() => setRevision((r) => r + 1), []);

  const contexte: Contexte = useMemo(
    () => ({
      produit,
      version: __APP_VERSION__,
      poste,
      plateforme,
      reglages,
      racines,
      dossierFigures: figures,
      espace,
      registre,
      revision,
      problemes,
      rafraichir,
      naviguer: setPage,
      enregistrerReglages,
    }),
    [produit, poste, plateforme, reglages, racines, figures, espace, registre, revision, problemes, rafraichir, enregistrerReglages],
  );

  // « À régler » : racine de l'espace, racines de données absentes, puis chaque module.
  useEffect(() => {
    if (!espace) return;
    let annule = false;
    (async () => {
      const out: ProblemeSitue[] = [];
      try {
        for (const p of await problemesRacine(espace.fichiers)) out.push({ source: "espace", probleme: p });
      } catch {
        // espace momentanément inaccessible (OneDrive) : le diagnostic le dira
      }
      const anciens = horsEspace(reglages, espace.racine);
      for (const [racine, chemin] of Object.entries(reglages.racines)) {
        if (anciens.some((a) => a.quoi === racine)) continue;
        if (!(await plateforme.dossierExiste(chemin))) out.push({ source: "poste", probleme: { type: "racine-absente", racine, chemin } });
      }
      for (const a of anciens) out.push({ source: "poste", probleme: { type: "hors-espace", ...a } });
      for (const m of manifestes) {
        if (!m.problemes) continue;
        try {
          for (const p of await m.problemes(contexte)) out.push({ source: m.id, probleme: p });
        } catch {
          // un module en erreur ne doit pas empêcher les autres de signaler leurs problèmes
        }
      }
      if (!annule) setProblemes(out);
    })();
    return () => {
      annule = true;
    };
    // `contexte` change à chaque nouvelle liste de problèmes : on ne recalcule que sur les vraies causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [espace, revision, reglages.racines, reglages.figures, manifestes, plateforme]);

  const courant = manifestes.find((m) => m.id === page);
  const seul = manifestes.length === 1 && !produit.espace;

  return (
    <ContexteReact.Provider value={contexte}>
      <div className="coquille">
        {seul ? null : (
          <nav className="barre" aria-label="Modules">
            <div className="barre-titre">{produit.nom}</div>
            <button type="button" className="barre-recherche" onClick={() => setPalette(true)} title="Chercher dans tout l'espace">
              <span>Rechercher…</span>
              <kbd>Ctrl K</kbd>
            </button>
            <ul>
              {manifestes.map((m) => (
                <li key={m.id}>
                  <button type="button" className={m.id === page ? "actif" : undefined} aria-current={m.id === page ? "page" : undefined} onClick={() => setPage(m.id)}>
                    <m.Icone />
                    {m.titre}
                    {m.aVenir ? <span className="a-venir">{m.aVenir}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            {produit.espace ? (
              <ul className="barre-bas">
                <li>
                  <button type="button" className={page === "reglages" ? "actif" : undefined} onClick={() => setPage("reglages")}>
                    <IconeReglages />
                    Réglages du poste
                  </button>
                </li>
                <li>
                  <button type="button" className={page === "diagnostic" ? "actif" : undefined} onClick={() => setPage("diagnostic")}>
                    <IconeDiagnostic />
                    Diagnostic
                  </button>
                </li>
              </ul>
            ) : null}
          </nav>
        )}
        <main className="contenu">
          {/* Les mises à jour publiées sont celles de Thèse : les installeurs d'un seul module ne vérifient pas. */}
          {produit.id === "these" ? <BandeauMiseAJour plateforme={plateforme} version={__APP_VERSION__} /> : null}
          {page === "reglages" ? <ReglagesPage /> : page === "diagnostic" ? <DiagnosticPage /> : courant ? <courant.Page /> : null}
        </main>
        {palette ? <Palette manifestes={manifestes} fermer={() => setPalette(false)} /> : null}
      </div>
    </ContexteReact.Provider>
  );
}
