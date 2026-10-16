/**
 * Étape 1 de l'atelier COMSOL : les fichiers ouverts, décrits en clair (forme, étendue, grandeurs, étude), avec
 * une petite figure de ce qu'ils contiennent. La lecture se corrige en mots (« c'est une ligne le long de z »,
 * « carte : x à l'horizontale, z à la verticale ») ; ƒ transforme le fichier (colonne calculée, repère).
 */
import { useState } from "react";
import { decrireExport, geometrie, type Description, type ExportComsol } from "../../core/graph";
import { useLegende } from "./hooks";
import { OutilsFichier } from "./Outils";
import { useAtelier } from "./useAtelier";

/** Petite figure : ligne verticale / horizontale, plan avec ses axes, signal temporel. */
export function Vignette({ d }: { d: Description }) {
  const trait = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" } as const;
  return (
    <svg className="atelier-vignette" viewBox="0 0 40 40" aria-hidden="true">
      {d.forme === "ligne" && d.titre.includes("verticale") ? (
        <>
          <rect x="6" y="6" width="28" height="28" {...trait} strokeWidth={0.8} opacity={0.4} />
          <line x1="20" y1="6" x2="20" y2="34" {...trait} />
          <circle cx="20" cy="6" r="2" fill="currentColor" />
        </>
      ) : d.forme === "ligne" ? (
        <>
          <rect x="6" y="6" width="28" height="28" {...trait} strokeWidth={0.8} opacity={0.4} />
          <line x1="6" y1="20" x2="34" y2="20" {...trait} />
        </>
      ) : d.forme === "plan" ? (
        <>
          <rect x="8" y="6" width="26" height="24" fill="currentColor" opacity={0.25} />
          <rect x="8" y="6" width="26" height="24" {...trait} />
          <text x="21" y="38" fontSize="7" textAnchor="middle" fill="currentColor">
            {d.axes?.[0]}
          </text>
          <text x="3" y="20" fontSize="7" textAnchor="middle" fill="currentColor">
            {d.axes?.[1]}
          </text>
        </>
      ) : d.forme === "serie" ? (
        <>
          <line x1="5" y1="34" x2="36" y2="34" {...trait} strokeWidth={0.8} />
          <path d="M5 30 C 14 30, 16 8, 21 8 S 28 30, 36 30" {...trait} />
        </>
      ) : (
        <text x="20" y="25" fontSize="16" textAnchor="middle" fill="currentColor">
          ?
        </text>
      )}
    </svg>
  );
}

export function AtelierFichiers() {
  const a = useAtelier();
  const legende = useLegende();
  const [ouvert, setOuvert] = useState<{ nom: string; quoi: "lecture" | "outils" } | null>(null);
  const suivi = (nom: string) => a.fichiers.find((f) => f.nom === nom);
  const derive = (nom: string) => a.derives.find((d) => d.nom === nom);
  return (
    <section className="atelier-colonne atelier-fichiers">
      <h3>
        <span className="atelier-etape">1</span> Fichiers COMSOL
      </h3>
      <div className="rangee-boutons">
        <button type="button" className="primary" onClick={() => void a.ouvrir()}>
          Ouvrir des fichiers .txt…
        </button>
        {a.fichiers.some((f) => f.source || f.absolu) ? (
          <button type="button" onClick={() => void a.relire()} title="Relit tous les fichiers depuis le disque (après un nouvel export COMSOL) ; transformations gardées">
            ↻ Relire
          </button>
        ) : null}
      </div>
      <p className="muted small">Exports « Données » (une ligne ou un plan de coupe) ou « Table » (un point au cours du temps). Plusieurs d'un coup : Ctrl + clic, ou glissez-les sur cette page.</p>
      {!a.exports.length ? (
        <div className="atelier-vide">
          <p>
            <strong>Comment ça marche ?</strong>
          </p>
          <ol>
            <li>Ouvrez (ou glissez) un ou plusieurs exports COMSOL : chacun est décrit ici en clair.</li>
            <li>Choisissez ce que vous voulez tracer (au centre) et réglez-le.</li>
            <li>L'aperçu se met à jour à droite ; « Continuer dans Graphes » pour les retouches et l'enregistrement.</li>
          </ol>
          <p className="muted small">Tout se garde dans une <strong>étude</strong> (en haut) : fichiers, transformations, tracés. Elle se rouvre sur l'autre PC, et les figures se régénèrent quand COMSOL réexporte.</p>
        </div>
      ) : null}
      <ul className="atelier-cartes">
        {a.exports.map((e) => {
          const d = decrireExport(e, a.cadre.longueur);
          const f = suivi(e.nom);
          const calc = derive(e.nom);
          return (
            <li key={e.nom} className={`atelier-fichier${d.avertissement ? " alerte" : ""}`} title={`${e.nom}\n${e.meta.Model ?? ""} · ${e.meta.Date ?? ""}${f?.source ? `\nSuivi : ${f.source}` : f?.absolu ? `\n${f.absolu}` : ""}`}>
              <div className="atelier-fichier-tete">
                <Vignette d={d} />
                <div className="atelier-fichier-texte">
                  <input className="atelier-legende" value={legende(e)} onChange={(x) => a.set({ noms: { ...a.noms, [e.nom]: x.target.value } })} aria-label="Légende" title="Légende de ce fichier sur les graphes (modifiable)" />
                  <span className="atelier-forme">{d.titre}</span>
                </div>
                {f && (f.source || f.absolu) ? (
                  <button type="button" className="small-btn" title="Relire depuis le disque" aria-label={`Relire ${e.nom}`} onClick={() => void a.relire(e.nom)}>
                    ↻
                  </button>
                ) : null}
                <button type="button" className="small-btn" aria-label={`Retirer ${e.nom}`} title="Retirer de la liste et de l'étude (le fichier n'est pas touché)" onClick={() => a.retirer(e.nom)}>
                  ×
                </button>
              </div>
              <div className="muted small">{d.detail}</div>
              <div className="atelier-grandeurs">
                {d.grandeurs.slice(0, 8).map((g, k) => (
                  <span key={k} className="atelier-puce">
                    {g}
                  </span>
                ))}
                {d.grandeurs.length > 8 ? <span className="muted small">+{d.grandeurs.length - 8}</span> : null}
              </div>
              {d.etude ? <div className="muted small">Étude : {d.etude}</div> : null}
              {calc ? <div className="muted small">Calculé : {calc.legendeA} {calc.op === "rapport" ? "/" : calc.op === "difference" ? "−" : "écart"} {calc.legendeB}</div> : null}
              {f ? (
                <div className={`small ${f.source ? "atelier-suivi" : "atelier-avert"}`}>
                  {f.source ? `✓ retrouvé sur les deux PC (${f.source.split(":")[0]})` : f.absolu ? "Hors OneDrive : à rouvrir sur l'autre PC" : "Ouvert sans chemin : non relisible"}
                  {f.transformations.length ? ` · ${f.transformations.length} transformation(s)` : ""}
                </div>
              ) : null}
              {d.avertissement ? <div className="atelier-avert">{d.avertissement}</div> : null}
              {f ? (
                <div className="atelier-fichier-actions">
                  {e.nature !== "table" ? (
                    <button type="button" className="lien" onClick={() => setOuvert(ouvert?.nom === e.nom && ouvert.quoi === "lecture" ? null : { nom: e.nom, quoi: "lecture" })}>
                      {e.forcer ? "Lecture corrigée ✎" : "Pas la bonne forme ?"}
                    </button>
                  ) : null}
                  <button type="button" className="lien" onClick={() => setOuvert(ouvert?.nom === e.nom && ouvert.quoi === "outils" ? null : { nom: e.nom, quoi: "outils" })}>
                    Transformer (ƒ)…
                  </button>
                </div>
              ) : null}
              {ouvert?.nom === e.nom && ouvert.quoi === "lecture" ? <Lecture e={e} forcer={(v) => a.forcer(e.nom, v)} /> : null}
              {ouvert?.nom === e.nom && ouvert.quoi === "outils" ? <OutilsFichier e={e} transformer={(t) => a.transformer(e.nom, t)} repereOrigine={() => a.repereOrigine(e.nom)} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Corriger la lecture en mots : une ligne le long de…, ou un plan avec ses axes horizontal et vertical. */
function Lecture({ e, forcer }: { e: ExportComsol; forcer: (v: number[] | null) => void }) {
  const g = geometrie(e);
  const coord = e.coordonnees;
  const [forme, setForme] = useState<"ligne" | "plan">(g.genre === "coupe" ? "plan" : "ligne");
  const [k, setK] = useState(g.genre === "profil" ? g.varient[0]! : Math.max(0, coord.findIndex((c) => /^z$/i.test(c))));
  const [h, setH] = useState(g.genre === "coupe" ? g.varient[0]! : 0);
  const [v, setV] = useState(g.genre === "coupe" ? g.varient[1]! : Math.min(coord.length - 1, 2));
  const appliquer = () => forcer(forme === "ligne" ? [k] : [h, v]);
  const auto = () => forcer(null);
  const choix = (val: number, set: (n: number) => void, exclu?: number) => (
    <select value={val} onChange={(x) => set(Number(x.target.value))}>
      {coord.map((c, j) => (
        <option key={c} value={j} disabled={j === exclu}>
          {c.toLowerCase()}
        </option>
      ))}
    </select>
  );
  return (
    <div className="atelier-lecture">
      <p className="muted small">Si l'appli s'est trompée sur ce que contient le fichier :</p>
      <label className="chip">
        <input type="radio" checked={forme === "ligne"} onChange={() => setForme("ligne")} />
        C'est une <strong>ligne</strong>, le long de {choix(k, setK)}
      </label>
      <label className="chip">
        <input type="radio" checked={forme === "plan"} onChange={() => setForme("plan")} />
        C'est un <strong>plan</strong> : carte avec {choix(h, setH, v)} à l'horizontale et {choix(v, setV, h)} à la verticale
      </label>
      <div className="rangee-boutons">
        <button type="button" onClick={appliquer} disabled={forme === "plan" && h === v}>
          Appliquer
        </button>
        {e.forcer ? (
          <button type="button" onClick={auto}>
            Revenir à la détection automatique
          </button>
        ) : null}
      </div>
    </div>
  );
}
