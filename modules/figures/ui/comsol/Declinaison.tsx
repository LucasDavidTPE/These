/**
 * « Décliner pour tous les plans » : la carte (ou les profils dans une coupe) réglée une fois devient une figure
 * par plan, rangées en matrice (lignes et colonnes = mots des noms de fichiers) dans une planche avec titres,
 * échelle de couleurs commune et étiquettes. Chaque figure garde sa recette : « Régénérer toute l'étude » la
 * remettra à jour après un nouveau calcul.
 */
import { useState } from "react";
import { ETIQUETTES, ciblesDeclinaison, courtDe, executerTrace, motsVariables, ranger, type Matrice, type StyleEtiquette, type TraceDeclinable } from "../../core/graph";
import { useNavigation } from "../navigation";
import { usePlanche } from "../planche/usePlanche";
import { useContexteTrace, useLegende } from "./hooks";
import { ecrireDeclinaison } from "./lot";
import { useAtelier } from "./useAtelier";

export function Declinaison({ t }: { t: TraceDeclinable }) {
  const c = useContexteTrace();
  const legende = useLegende();
  const etude = useAtelier((s) => s.etude);
  const cibles = ciblesDeclinaison(t, c.exports);
  const [exclus, setExclus] = useState<string[]>([]);
  const noms = cibles.map((e) => e.nom).filter((n) => !exclus.includes(n));
  const variables = motsVariables(noms);
  const [ligne, setLigne] = useState<number | null | undefined>(undefined);
  const [colonne, setColonne] = useState<number | null | undefined>(undefined);
  const lig = ligne === undefined ? (variables.length >= 2 ? variables[0]!.k : null) : ligne;
  const col = colonne === undefined ? (variables.length >= 2 ? variables[1]!.k : (variables[0]?.k ?? null)) : colonne;
  const [memeEchelle, setMemeEchelle] = useState(true);
  const [etiquettes, setEtiquettes] = useState<StyleEtiquette>("(a)");
  const [tailleCommune, setTailleCommune] = useState(true);
  const [etat, setEtat] = useState<string | null>(null);
  const [planche, setPlanche] = useState<string | null>(null);
  let matrice: Matrice | null = null;
  let erreur = "";
  try {
    matrice = noms.length ? ranger(noms, lig, col) : null;
  } catch (e) {
    erreur = e instanceof Error ? e.message : String(e);
  }
  const parNom = new Map(cibles.map((e) => [e.nom, e]));
  const choixMot = (v: number | null, set: (k: number | null) => void) => (
    <select value={v === null ? "" : String(v)} onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}>
      <option value="">(une seule)</option>
      {variables.map((x) => (
        <option key={x.k} value={x.k}>
          mot {x.k + 1} : {x.valeurs.slice(0, 4).join(", ")}
          {x.valeurs.length > 4 ? "…" : ""}
        </option>
      ))}
    </select>
  );

  async function creer() {
    if (!matrice) return;
    setPlanche(null);
    try {
      setEtat("Calcul des figures…");
      const cas = noms.map((plan) => {
        const r = executerTrace({ ...t, plan }, c);
        if (!r) throw new Error(`${plan} : rien à tracer.`);
        return { plan, trace: { ...t, plan }, ...r };
      });
      const ids = await useAtelier.getState().sauverRecettes(cas.map((x) => ({ nom: x.titre, trace: x.trace })));
      const docs = cas.map((x, i) => ({ plan: x.plan, titre: x.titre, doc: ids ? { ...x.doc, origine: { etude: ids.etude, recette: ids.recettes[i]! } } : x.doc }));
      const expression = t.expression ? courtDe(parNom.get(noms[0]!), t.expression) : "";
      const titreEtude = useAtelier.getState().etude?.titre ?? "COMSOL";
      const r = await ecrireDeclinaison(
        docs,
        { matrice, titrePlanche: `${t.mode === "carte" ? "Cartes" : "Profils"} ${expression} — ${titreEtude}`, tags: ["comsol", titreEtude], correspondances: c.correspondances, memeEchelle, etiquettes, tailleCommune },
        (i, n) => setEtat(`Écriture des figures : ${i} / ${n}…`),
      );
      setPlanche(r.planche?.dossier ?? null);
      setEtat(
        `${r.figures.length} figure(s) créée(s) (${r.figures.map((f) => f.id).join(", ")})${r.planche ? ` et la planche ${r.planche.id}` : ""}.${r.erreurs.length ? `\nProblèmes :\n${r.erreurs.join("\n")}` : ""}${ids ? "" : "\nL'étude n'a pas pu être enregistrée : ces figures ne se régénéreront pas."}`,
      );
    } catch (e) {
      setEtat(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <details className="atelier-champ atelier-declinaison">
      <summary>
        <strong>Décliner pour tous les plans</strong> <span className="muted small">(une figure par plan + planche en matrice)</span>
      </summary>
      <p className="muted small">Mêmes réglages pour chaque plan coché ; les figures vont dans la bibliothèque et gardent leur recette{etude ? ` (étude « ${etude.titre} »)` : " (l'étude sera créée)"}.</p>
      <div className="atelier-grandeurs">
        {cibles.map((e) => (
          <label key={e.nom} className="chip">
            <input type="checkbox" checked={!exclus.includes(e.nom)} onChange={(x) => setExclus(x.target.checked ? exclus.filter((n) => n !== e.nom) : [...exclus, e.nom])} />
            {legende(e)}
          </label>
        ))}
      </div>
      <div className="grid2">
        <label className="field">
          <span>Lignes de la planche</span>
          {choixMot(lig, setLigne)}
        </label>
        <label className="field">
          <span>Colonnes</span>
          {choixMot(col, setColonne)}
        </label>
      </div>
      {erreur ? <p className="banner error">{erreur}</p> : null}
      {matrice ? (
        <table className="atelier-matrice">
          {matrice.colonnes.some(Boolean) ? (
            <thead>
              <tr>
                <th />
                {matrice.colonnes.map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {matrice.cases.map((l, i) => (
              <tr key={i}>
                <th>{matrice!.lignes[i]}</th>
                {l.map((n, j) => (
                  <td key={j} className={n ? "" : "vide"}>
                    {n ? legende(parNom.get(n)!) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {t.mode === "carte" ? (
        <label className="chip">
          <input type="checkbox" checked={memeEchelle} onChange={(e) => setMemeEchelle(e.target.checked)} />
          Même échelle de couleurs pour toutes les cartes
        </label>
      ) : null}
      <label className="chip">
        <input type="checkbox" checked={tailleCommune} onChange={(e) => setTailleCommune(e.target.checked)} />
        Même taille pour toutes les figures
      </label>
      <label className="field">
        <span>Étiquettes</span>
        <select value={etiquettes} onChange={(e) => setEtiquettes(e.target.value as StyleEtiquette)}>
          {ETIQUETTES.map((x) => (
            <option key={x} value={x}>
              {x === "aucune" ? "Aucune" : x}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="primary" disabled={!matrice || noms.length < 1 || (etat?.endsWith("…") ?? false)} onClick={() => void creer()}>
        Créer {noms.length} figure{noms.length > 1 ? "s" : ""}
        {noms.length >= 2 ? " + la planche" : ""}
      </button>
      {etat ? <p className="small" style={{ whiteSpace: "pre-line" }}>{etat}</p> : null}
      {planche ? (
        <button
          type="button"
          onClick={() => {
            useNavigation.getState().goTo("planches");
            void usePlanche.getState().openFromLibrary(planche);
          }}
        >
          Ouvrir la planche →
        </button>
      ) : null}
    </details>
  );
}
