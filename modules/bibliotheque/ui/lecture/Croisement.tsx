/** Croisement de deux critères : nombre d'articles par combinaison ; les cases vides sont les trous de la littérature. */
import { useMemo, useState } from "react";
import { citation } from "../../core/calculs";
import { croiser, type ObjetRef, type ReglagesLecture } from "../../core/lecture";

export function CroisementVue({
  refs,
  reglages,
  enregistrerReglages,
  ouvrir,
}: {
  refs: ObjetRef[];
  reglages: ReglagesLecture;
  enregistrerReglages(r: ReglagesLecture): void;
  ouvrir(id: string): void;
}) {
  const ids = reglages.criteres.map((c) => c.id);
  const defaut = reglages.croisements.find(([a, b]) => ids.includes(a) && ids.includes(b)) ?? [ids[0] ?? "", ids[1] ?? ids[0] ?? ""];
  const [a, setA] = useState(defaut[0]);
  const [b, setB] = useState(defaut[1]);
  const [choix, setChoix] = useState<{ l: string; c: string; ids: string[] } | null>(null);
  const [ecartes, setEcartes] = useState(false);
  const actifs = useMemo(() => refs.filter((r) => ecartes || r.valeur.statut !== "Écarté"), [refs, ecartes]);
  const x = useMemo(() => croiser(actifs, a, b, reglages), [actifs, a, b, reglages]);
  const max = Math.max(1, ...[...x.cases.values()].map((v) => v.length));
  const enregistre = reglages.croisements.some(([p, q]) => p === a && q === b);
  const parId = new Map(refs.map((r) => [r.id, r.valeur]));
  const nom = (id: string) => reglages.criteres.find((c) => c.id === id)?.nom ?? id;
  const trous = x.lignes.length * x.colonnes.length - x.cases.size;

  return (
    <>
      <div className="filtres">
        <label className="rangee">
          Lignes
          <select className="champ" value={a} onChange={(e) => (setA(e.target.value), setChoix(null))}>
            {reglages.criteres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <button type="button" title="Inverser lignes et colonnes" onClick={() => (setA(b), setB(a), setChoix(null))}>
          ⇄
        </button>
        <label className="rangee">
          Colonnes
          <select className="champ" value={b} onChange={(e) => (setB(e.target.value), setChoix(null))}>
            {reglages.criteres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </label>
        <label className="rangee petit">
          <input type="checkbox" checked={ecartes} onChange={(e) => setEcartes(e.target.checked)} /> écartés
        </label>
        <button
          type="button"
          onClick={() =>
            enregistrerReglages({ ...reglages, croisements: enregistre ? reglages.croisements.filter(([p, q]) => !(p === a && q === b)) : [...reglages.croisements, [a, b]] })
          }
          title="Les croisements enregistrés sont recalculés dans la feuille « Croisement » du classeur Excel"
        >
          {enregistre ? "★ Retirer du classeur Excel" : "☆ Garder dans le classeur Excel"}
        </button>
      </div>
      <p className="discret petit">
        {x.renseignes} article(s) renseigné(s) pour « {nom(a)} » et « {nom(b)} ». {trous > 0 ? `${trous} combinaison(s) qu'aucun article ne traite (cases hachurées) : ce sont les pistes à vérifier pour situer la thèse.` : ""}
      </p>
      {!x.lignes.length || !x.colonnes.length ? (
        <p>Pas encore assez d'étiquettes dans ces deux critères pour les croiser.</p>
      ) : (
        <div className="defilement">
          <table className="tableau lc-croisement">
            <thead>
              <tr>
                <th>
                  {nom(a)} \ {nom(b)}
                </th>
                {x.colonnes.map((c) => (
                  <th key={c.cle} title={c.definition || undefined}>
                    <span className="lc-vertical">{c.etiquette}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {x.lignes.map((l) => (
                <tr key={l.cle}>
                  <th title={l.definition || undefined}>
                    {l.etiquette} <span className="discret petit">{l.ids.length}</span>
                  </th>
                  {x.colonnes.map((c) => {
                    const v = x.cases.get(`${l.cle}|${c.cle}`) ?? [];
                    const diag = a === b && l.cle === c.cle;
                    const actif = choix?.l === l.cle && choix.c === c.cle;
                    return (
                      <td
                        key={c.cle}
                        className={`lc-compte${v.length ? "" : diag ? " lc-diag" : " lc-trou"}${actif ? " lc-actif" : ""}`}
                        style={v.length ? { background: `color-mix(in srgb, var(--accent) ${Math.round(12 + (v.length / max) * 60)}%, transparent)` } : undefined}
                        onClick={() => v.length && setChoix({ l: l.cle, c: c.cle, ids: v })}
                        title={v.length ? `${l.etiquette} × ${c.etiquette} : ${v.length} article(s)` : `${l.etiquette} × ${c.etiquette} : aucun article`}
                      >
                        {v.length || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {choix ? (
        <div className="carte lc-choix">
          <strong>
            {x.lignes.find((l) => l.cle === choix.l)?.etiquette} × {x.colonnes.find((c) => c.cle === choix.c)?.etiquette}
          </strong>
          <ul>
            {choix.ids.map((id) => (
              <li key={id}>
                <button type="button" className="lien" onClick={() => ouvrir(id)}>
                  {citation(parId.get(id)!) || id}
                </button>{" "}
                <span className="discret">{parId.get(id)?.titre}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
