/**
 * Atelier de lecture croisée : tout sur un écran, sans défiler la page.
 *   gauche  : les articles (filtrés par la recherche et les étiquettes choisies), avec leur couverture critère par critère ;
 *   centre  : l'explorateur à facettes (par défaut), la constellation, le croisement, le tableau, la synthèse, Excel… ;
 *   droite  : l'inspecteur de l'article ou de l'étiquette choisis.
 * Clavier : J/K (ou ↓/↑) article suivant/précédent, N suivant à compléter, Échap désélectionner, F plein écran.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Message } from "@interface/composants";
import { citation } from "../../core/calculs";
import { couverture, facettes, filtrer, proposerNettoyage, type Choix } from "../../core/explorer";
import { cleEtiquette, type ObjetRef, type ReglagesLecture } from "../../core/lecture";
import type { Reference } from "../../core/modele";
import { Constellation, type Centre } from "./Constellation";
import { CroisementVue } from "./Croisement";
import { ExcelVue } from "./Excel";
import { Facettes } from "./Facettes";
import { Grille } from "./Grille";
import { Bilan, InspecteurArticle, InspecteurEtiquette, TYPE_GLISSE } from "./Inspecteur";
import { Nettoyage } from "./Nettoyage";
import { ReglagesVue } from "./Reglages";
import { SyntheseVue } from "./Synthese";
import type { EtatClasseur } from "./donnees";

const MODES = [
  ["explorer", "Explorer"],
  ["constellation", "Constellation"],
  ["croisement", "Croisement"],
  ["tableau", "Tableau"],
  ["synthese", "Synthèse"],
  ["excel", "Excel"],
  ["criteres", "Critères"],
] as const;
type Mode = (typeof MODES)[number][0] | "nettoyer";

const normal = (s: string) => cleEtiquette(s);

/**
 * Taille de l'atelier : toute la place qui reste dans la fenêtre à droite et en dessous de son coin, au-delà de la
 * largeur maximale des pages, pour que rien ne défile hors des colonnes.
 */
function useCadreFenetre(actif: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ width?: number; height?: number }>({});
  useLayoutEffect(() => {
    if (!actif) return;
    const calculer = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const width = Math.max(900, Math.floor(window.innerWidth - r.left - 24));
      const height = Math.max(520, Math.floor(window.innerHeight - top - 16));
      setStyle((s) => (s.width === width && s.height === height ? s : { width, height }));
    };
    calculer();
    const ro = new ResizeObserver(calculer);
    ro.observe(document.body);
    window.addEventListener("resize", calculer);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calculer);
    };
  }, [actif]);
  return [ref, actif ? style : {}] as const;
}

export function Atelier({
  refs,
  reglages,
  classeur,
  relireClasseur,
  enregistrer,
  enregistrerLot,
  enregistrerReglages,
  ouvrirFiche,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  classeur: EtatClasseur | null;
  relireClasseur(): void;
  enregistrer(id: string, r: Reference): void;
  enregistrerLot(m: ObjetRef[]): Promise<void>;
  enregistrerReglages(r: ReglagesLecture): void;
  ouvrirFiche(id: string): void;
}) {
  const [mode, setMode] = useState<Mode>("explorer");
  const [choix, setChoix] = useState<Choix[]>([]);
  const [recherche, setRecherche] = useState("");
  const [ecartes, setEcartes] = useState(false);
  const [article, setArticle] = useState<string | null>(null);
  const [etiquette, setEtiquette] = useState<Choix | null>(null);
  const [plein, setPlein] = useState(false);
  const [refCadre, styleCadre] = useCadreFenetre(!plein);

  const visibles = useMemo(() => {
    const q = normal(recherche);
    return filtrer(refs, choix)
      .filter((r) => ecartes || r.valeur.statut !== "Écarté")
      .filter((r) => !q || normal(`${r.id} ${citation(r.valeur)} ${r.valeur.titre} ${r.valeur.auteurs}`).includes(q));
  }, [refs, choix, recherche, ecartes]);
  const lesFacettes = useMemo(() => facettes(refs.filter((r) => ecartes || r.valeur.statut !== "Écarté"), visibles, reglages), [refs, visibles, reglages, ecartes]);
  const aNettoyer = useMemo(() => {
    const p = proposerNettoyage(refs, reglages);
    return p.separations.length + p.fusions.length;
  }, [refs, reglages]);

  const choisirArticle = (id: string) => {
    setArticle(id);
    setEtiquette(null);
  };
  const centrerEtiquette = (c: Choix) => {
    setEtiquette(c);
    setArticle(null);
    setMode("constellation");
  };
  const basculer = (c: Choix) => setChoix((x) => (x.some((y) => y.critere === c.critere && y.cle === c.cle) ? x.filter((y) => !(y.critere === c.critere && y.cle === c.cle)) : [...x, c]));
  const incomplet = (r: ObjetRef) => reglages.criteres.some((c) => !r.valeur.lecture[c.id]?.etiquettes.length);
  const deplacer = (pas: number, aCompleter = false) => {
    if (!visibles.length) return;
    const i = visibles.findIndex((r) => r.id === article);
    for (let k = 1; k <= visibles.length; k++) {
      const j = (((i < 0 ? (pas > 0 ? -1 : 0) : i) + pas * k) % visibles.length + visibles.length) % visibles.length;
      const r = visibles[j]!;
      if (!aCompleter || incomplet(r)) return choisirArticle(r.id);
    }
  };

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        deplacer(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        deplacer(-1);
      } else if (e.key === "n") deplacer(1, true);
      else if (e.key === "f") setPlein((p) => !p);
      else if (e.key === "Escape") {
        if (plein) setPlein(false);
        else {
          setArticle(null);
          setEtiquette(null);
        }
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  const centre: Centre | null = article ? { genre: "article", id: article } : etiquette ? { genre: "etiquette", ...etiquette } : null;
  const position = article ? `${visibles.findIndex((r) => r.id === article) + 1}/${visibles.length}` : "";
  const nomCritere = (id: string) => reglages.criteres.find((c) => c.id === id)?.nom ?? id;
  const libelleChoix = (c: Choix) => lesFacettes.find((f) => f.critere === c.critere)?.etiquettes.find((e) => e.cle === c.cle)?.etiquette ?? c.cle;

  return (
    <div className={`lc-atelier${plein ? " lc-plein" : ""}`} ref={refCadre} style={styleCadre}>
      <div className="lc-barre">
        <nav className="lc-modes" aria-label="Vue">
          {MODES.map(([id, titre]) => (
            <button key={id} type="button" className={mode === id ? "actif" : undefined} onClick={() => setMode(id)}>
              {titre}
              {id === "excel" && classeur?.existe && classeur.modifie ? <span className="compteur" title="Le classeur a été modifié depuis la dernière synchronisation">!</span> : null}
            </button>
          ))}
        </nav>
        <button type="button" className={mode === "nettoyer" ? "actif" : undefined} onClick={() => setMode("nettoyer")} title="Séparer les précisions entre parenthèses, fusionner les écritures voisines">
          Nettoyer{aNettoyer ? <span className="compteur">{aNettoyer}</span> : null}
        </button>
        <button type="button" onClick={() => setPlein((p) => !p)} title="Plein écran (F)">
          {plein ? "⤡ Réduire" : "⤢ Plein écran"}
        </button>
      </div>

      <aside className="lc-colonne lc-articles">
        <input className="champ" type="search" placeholder="Rechercher un article…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        {choix.length ? (
          <div className="lc-choix-actifs">
            {choix.map((c) => (
              <button key={`${c.critere}${c.cle}`} type="button" className="lc-jeton lc-jeton-actif" onClick={() => basculer(c)} title={`${nomCritere(c.critere)} — retirer ce filtre`}>
                {libelleChoix(c)} ×
              </button>
            ))}
            <button type="button" className="lien petit" onClick={() => setChoix([])}>
              tout effacer
            </button>
          </div>
        ) : null}
        <div className="lc-entete-liste discret petit">
          <span>
            {visibles.length} article{visibles.length > 1 ? "s" : ""}
          </span>
          <label className="rangee">
            <input type="checkbox" checked={ecartes} onChange={(e) => setEcartes(e.target.checked)} /> écartés
          </label>
        </div>
        <ul className="lc-liste">
          {visibles.map((r) => (
            <li
              key={r.id}
              className={r.id === article ? "actif" : undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(TYPE_GLISSE, r.id);
                e.dataTransfer.effectAllowed = "link";
              }}
              onClick={() => choisirArticle(r.id)}
              onDoubleClick={() => ouvrirFiche(r.id)}
              title={`${r.valeur.titre}\nClic : inspecter · double-clic : fiche · glisser sur l'inspecteur : lier`}
            >
              <div className="lc-ligne-article">
                <strong>{citation(r.valeur) || r.id}</strong>
                <span className="lc-couverture" aria-label="Critères renseignés">
                  {couverture(r, reglages).map((plein, i) => (
                    <i key={i} className={plein ? "plein" : undefined} style={{ ["--lc-c" as string]: i < 8 ? `var(--lc-serie-${i + 1})` : "var(--discret)" }} />
                  ))}
                </span>
              </div>
              <div className="lc-titre-court">{r.valeur.titre}</div>
            </li>
          ))}
        </ul>
      </aside>

      <main className="lc-colonne lc-centre">
        {mode === "explorer" ? (
          <Facettes facettes={lesFacettes} reglages={reglages} choix={choix} basculer={basculer} centrer={centrerEtiquette} total={refs.length} selection={visibles.length} />
        ) : mode === "constellation" ? (
          <Constellation
            refs={refs}
            reglages={reglages}
            centre={centre}
            choisir={(c) => (c.genre === "article" ? choisirArticle(c.id) : (setEtiquette({ critere: c.critere, cle: c.cle }), setArticle(null)))}
            ouvrirFiche={ouvrirFiche}
          />
        ) : mode === "croisement" ? (
          <CroisementVue refs={visibles} reglages={reglages} enregistrerReglages={enregistrerReglages} ouvrir={choisirArticle} />
        ) : mode === "tableau" ? (
          <Grille refs={visibles} reglages={reglages} enregistrer={enregistrer} ouvrir={choisirArticle} />
        ) : mode === "synthese" ? (
          <SyntheseVue refs={visibles} reglages={reglages} />
        ) : mode === "excel" ? (
          <ExcelVue refs={refs} reglages={reglages} etat={classeur} relire={relireClasseur} />
        ) : mode === "criteres" ? (
          <ReglagesVue refs={refs} reglages={reglages} enregistrerReglages={enregistrerReglages} enregistrerLot={enregistrerLot} />
        ) : (
          <Nettoyage refs={refs} reglages={reglages} enregistrerLot={enregistrerLot} fermer={() => setMode("explorer")} />
        )}
        {choix.length && (mode === "croisement" || mode === "tableau" || mode === "synthese") ? (
          <Message niveau="info">Vue restreinte aux {visibles.length} article(s) filtré(s) à gauche.</Message>
        ) : null}
      </main>

      <aside className="lc-colonne lc-inspecteur">
        {article ? (
          <InspecteurArticle
            id={article}
            refs={refs}
            reglages={reglages}
            enregistrer={enregistrer}
            ouvrirFiche={ouvrirFiche}
            choisirArticle={choisirArticle}
            precedent={() => deplacer(-1)}
            suivant={(a) => deplacer(1, a)}
            position={position}
          />
        ) : etiquette ? (
          <InspecteurEtiquette
            choix={etiquette}
            refs={refs}
            reglages={reglages}
            enregistrerReglages={enregistrerReglages}
            enregistrerLot={enregistrerLot}
            filtrerPar={(c) => (setChoix((x) => (x.some((y) => y.critere === c.critere && y.cle === c.cle) ? x : [...x, c])), setMode("explorer"))}
            choisirArticle={choisirArticle}
            centrer={centrerEtiquette}
          />
        ) : (
          <Bilan refs={refs} reglages={reglages} commencer={() => deplacer(1, true)} nettoyables={aNettoyer} />
        )}
      </aside>
    </div>
  );
}
