/**
 * Outils communs de l'atelier COMSOL : transformer un fichier (colonne calculée, changement de repère) et réglages
 * partagés par toute la bibliothèque (correspondances de légende, interfaces de couches).
 */
import { useState } from "react";
import { ajouterColonne, colonnesProposees, expressionParDefaut, libelleColonne, nomsColonnes, positionExtremum, type ColonneProposee, type ExportComsol, type Transformation } from "../../core/graph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { useAtelier } from "./useAtelier";

const nombre = (t: string) => Number(t.trim().replace(",", ".").replace("−", "-"));

function alerte(e: unknown) {
  window.alert(e instanceof Error ? e.message : String(e));
}

/** Colonne calculée et changement de repère d'un fichier (gardés dans l'étude, rejoués à chaque relecture). */
export function OutilsFichier({ e, transformer, repereOrigine }: { e: ExportComsol; transformer: (t: Transformation) => void; repereOrigine: () => void }) {
  const [formule, setFormule] = useState("");
  const [nom, setNom] = useState("");
  const [unite, setUnite] = useState("");
  const [k, setK] = useState(Math.max(0, e.coordonnees.findIndex((c) => /^z$/i.test(c))));
  const [signe, setSigne] = useState(false);
  const [partout, setPartout] = useState(true);
  const proposees = colonnesProposees(e);
  // une grandeur dérivée usuelle, ici ou dans tous les fichiers d'origine qui ont les colonnes nécessaires
  const ajouterProposee = (p: ColonneProposee) => {
    const t: Transformation = { genre: "colonne", formule: p.formule, nom: p.nom, unite: p.unite };
    if (!partout) return transformer(t);
    const a = useAtelier.getState();
    for (const x of a.exports) if (a.fichiers.some((f) => f.nom === x.nom) && colonnesProposees(x).some((q) => q.nom === p.nom)) a.transformer(x.nom, t);
  };
  const [origine, setOrigine] = useState("0");
  const [centre, setCentre] = useState(expressionParDefaut(e.colonnes.map((c) => c.expression)) ?? "");
  const disponibles = [...nomsColonnes(e).keys()].filter((n) => !/^c\d+$/.test(n));
  const kz = e.coordonnees.findIndex((c) => /^z$/i.test(c));
  const horizontales = e.coordonnees.map((c, j) => ({ c, j })).filter(({ j }) => j !== kz);
  return (
    <div className="comsol-outils">
      <h5>Colonne calculée</h5>
      <label className="field">
        <span>Formule</span>
        <input value={formule} onChange={(x) => setFormule(x.target.value)} placeholder="abs(ezz) · max(e1, 0) · 0.5*(exx + eyy) · -1e-3*w" />
      </label>
      <p className="muted small">
        Noms : {disponibles.join(", ")} (ou c1, c2… par n° de colonne). Fonctions : abs, max, min, sqrt, exp, ln, log10, sign. Point décimal.
      </p>
      <div className="grid2">
        <label className="field">
          <span>Nom</span>
          <input value={nom} onChange={(x) => setNom(x.target.value)} placeholder="|εzz|" />
        </label>
        <label className="field">
          <span>Unité</span>
          <input value={unite} onChange={(x) => setUnite(x.target.value)} placeholder="µdef" />
        </label>
      </div>
      <button
        type="button"
        disabled={!formule.trim()}
        onClick={() => {
          try {
            // vérifiée sur le fichier avant d'être gardée (message clair si elle est fausse)
            ajouterColonne(e, { formule, nom, unite });
            transformer({ genre: "colonne", formule, nom: nom.trim() || formule.trim(), unite });
            setFormule("");
            setNom("");
          } catch (x) {
            alerte(x);
          }
        }}
      >
        Ajouter la colonne
      </button>
      <h5>Grandeurs dérivées</h5>
      {proposees.length ? (
        <>
          <div className="atelier-grandeurs">
            {proposees.map((p) => (
              <button key={p.nom} type="button" className="small-btn" title={`${p.explication}\n${p.formule}`} onClick={() => ajouterProposee(p)}>
                + {p.nom}
              </button>
            ))}
          </div>
          <label className="chip">
            <input type="checkbox" checked={partout} onChange={(x) => setPartout(x.target.checked)} />
            à tous les fichiers qui ont ces colonnes
          </label>
        </>
      ) : (
        <p className="muted small">Aucune proposée (il faut par exemple exx, ezz et exz pour les déformations principales dans le plan x-z).</p>
      )}
      {e.nature !== "table" ? (
        <>
          <h5>Repère</h5>
          <div className="rangee-boutons">
            {kz >= 0 && !(e.repere?.[kz]?.facteur === -1) ? (
              <button type="button" title="z devient la profondeur, positive vers le bas (surface en haut des cartes)" onClick={() => transformer({ genre: "repere", k: kz, facteur: -1, origine: 0 })}>
                z → profondeur
              </button>
            ) : null}
          </div>
          <div className="comsol-ligne">
            <span className="small">Centrer</span>
            <select value={horizontales.some((h) => h.j === k) ? k : (horizontales[0]?.j ?? 0)} onChange={(x) => setK(Number(x.target.value))} aria-label="Coordonnée à centrer">
              {horizontales.map(({ c, j }) => (
                <option key={c} value={j}>
                  {c.toLowerCase()}
                </option>
              ))}
            </select>
            <span className="small">sur l'extremum de</span>
            <select value={centre} onChange={(x) => setCentre(x.target.value)} aria-label="Grandeur">
              {e.colonnes.map((c) => (
                <option key={c.expression} value={c.expression}>
                  {libelleColonne(c).court}
                </option>
              ))}
            </select>
            <button
              type="button"
              title="Trouve le point où la grandeur est la plus forte (en valeur absolue) et y met l'origine : la roue au centre"
              onClick={() => {
                const kk = horizontales.some((h) => h.j === k) ? k : (horizontales[0]?.j ?? 0);
                const p = positionExtremum(e, centre);
                if (!p) return alerte("Aucune valeur.");
                transformer({ genre: "repere", k: kk, facteur: 1, origine: Number(p.coordonnees[kk]!.toPrecision(8)) });
              }}
            >
              OK
            </button>
          </div>
          <details>
            <summary className="small">Repère à la main…</summary>
            <div className="grid2">
              <label className="field">
                <span>Coordonnée</span>
                <select value={k} onChange={(x) => setK(Number(x.target.value))}>
                  {e.coordonnees.map((c, j) => (
                    <option key={c} value={j}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Origine ({e.uniteLongueur})</span>
                <input value={origine} onChange={(x) => setOrigine(x.target.value)} title="Nouvelle coordonnée = ± (ancienne − origine)" />
              </label>
            </div>
            <label className="chip">
              <input type="checkbox" checked={signe} onChange={(x) => setSigne(x.target.checked)} />
              Changer le sens
            </label>
            <button
              type="button"
              onClick={() => {
                const o = nombre(origine);
                if (!Number.isFinite(o)) return alerte("Origine : un nombre.");
                transformer({ genre: "repere", k, facteur: signe ? -1 : 1, origine: o });
              }}
            >
              Appliquer
            </button>
          </details>
          {e.repere ? (
            <button type="button" className="lien" title="Revenir aux coordonnées du fichier" onClick={repereOrigine}>
              Revenir au repère du fichier
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Correspondances de légende et interfaces de couches, partagées par toute la bibliothèque. */
export function ReglagesPartages({ ouvertParDefaut = false }: { ouvertParDefaut?: boolean } = {}) {
  const reg = useReglagesComsol();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [brouillon, setBrouillon] = useState(reg.reglages);
  const [vu, setVu] = useState(reg.reglages);
  if (vu !== reg.reglages) {
    setVu(reg.reglages);
    setBrouillon(reg.reglages);
  }
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(reg.reglages);
  return (
    <div className="comsol-reglages">
      <button type="button" className="small-btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? "▾" : "▸"} Correspondances et couches (toute la bibliothèque)
      </button>
      {ouvert ? (
        <>
          <p className="muted small">Un mot du nom de fichier (« het ») ou un paramètre de l'en-tête (« lc=1 », « VE=0 ») → le texte de la légende.</p>
          {brouillon.correspondances.map((c, k) => (
            <div key={k} className="comsol-ligne">
              <input value={c.de} onChange={(x) => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.map((y, j) => (j === k ? { ...y, de: x.target.value } : y)) })} aria-label="De" placeholder="lc=1" />
              <span>→</span>
              <input value={c.vers} onChange={(x) => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.map((y, j) => (j === k ? { ...y, vers: x.target.value } : y)) })} aria-label="Vers" placeholder="Rectangulaire" />
              <button type="button" className="small-btn" aria-label="Retirer" onClick={() => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.filter((_, j) => j !== k) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="small-btn" onClick={() => setBrouillon({ ...brouillon, correspondances: [...brouillon.correspondances, { de: "", vers: "" }] })}>
            + Correspondance
          </button>
          <p className="muted small">Interfaces de couches : cote z dans les coordonnées des fichiers (m, z = 0 en surface).</p>
          {brouillon.interfaces.map((c, k) => (
            <div key={k} className="comsol-ligne">
              <input
                defaultValue={String(c.z).replace(".", ",")}
                onBlur={(x) => {
                  const z = nombre(x.target.value);
                  if (Number.isFinite(z)) setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.map((y, j) => (j === k ? { ...y, z } : y)) });
                }}
                aria-label="Cote z (m)"
              />
              <input value={c.texte} onChange={(x) => setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.map((y, j) => (j === k ? { ...y, texte: x.target.value } : y)) })} aria-label="Nom" placeholder="BB/GB" />
              <button type="button" className="small-btn" aria-label="Retirer" onClick={() => setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.filter((_, j) => j !== k) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="small-btn" onClick={() => setBrouillon({ ...brouillon, interfaces: [...brouillon.interfaces, { z: -0.1, texte: "" }] })}>
            + Interface
          </button>
          <div className="rangee-boutons">
            <button type="button" className="primary" disabled={!modifie} onClick={() => void reg.enregistrer({ ...brouillon, correspondances: brouillon.correspondances.filter((c) => c.de.trim()) })}>
              Enregistrer
            </button>
            {modifie ? (
              <button type="button" onClick={() => setBrouillon(reg.reglages)}>
                Annuler
              </button>
            ) : null}
          </div>
          {reg.erreur ? <p className="banner error">{reg.erreur}</p> : null}
        </>
      ) : null}
    </div>
  );
}

