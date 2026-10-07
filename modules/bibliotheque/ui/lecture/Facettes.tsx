/**
 * Explorateur à facettes croisées : chaque critère est une rangée d'étiquettes, de taille proportionnelle à leur
 * fréquence. Un clic sélectionne une étiquette : la liste des articles se restreint et chaque autre rangée montre
 * combien d'articles de la sélection portent chacune de ses étiquettes. Les étiquettes à zéro (hachurées) sont
 * les combinaisons que personne n'a traitées : les trous de la littérature.
 */
import { useState } from "react";
import type { Choix, Facette } from "../../core/explorer";
import type { ReglagesLecture } from "../../core/lecture";

const VISIBLES = 14;

export function Facettes({
  facettes,
  reglages,
  choix,
  basculer,
  centrer,
  total,
  selection,
}: {
  facettes: Facette[];
  reglages: ReglagesLecture;
  choix: Choix[];
  basculer(c: Choix): void;
  /** Ouvre la constellation d'une étiquette. */
  centrer(c: Choix): void;
  total: number;
  selection: number;
}) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const actif = (critere: string, cle: string) => choix.some((c) => c.critere === critere && c.cle === cle);
  const filtre = choix.length > 0;
  return (
    <div className="lc-facettes">
      {facettes.map((f, i) => {
        const c = reglages.criteres.find((x) => x.id === f.critere)!;
        const max = Math.max(1, ...f.etiquettes.map((e) => e.total));
        const ouvert = ouverts.has(f.critere);
        const montrees = ouvert ? f.etiquettes : f.etiquettes.slice(0, VISIBLES);
        const trous = filtre ? f.etiquettes.filter((e) => !e.dansSelection && !actif(f.critere, e.cle)).length : 0;
        return (
          <section key={f.critere} className="lc-facette" style={{ ["--lc-c" as string]: i < 8 ? `var(--lc-serie-${i + 1})` : "var(--discret)" }}>
            <header>
              <span className="lc-pastille" />
              <strong title={c.aide || undefined}>{c.nom}</strong>
              <span className="lc-jauge" title={`${f.renseignes} article(s) sur ${selection} renseigné(s) pour ce critère`}>
                <span style={{ width: `${selection ? (100 * f.renseignes) / selection : 0}%` }} />
              </span>
              <span className="discret petit">
                {f.renseignes}/{selection}
                {trous ? ` · ${trous} trou${trous > 1 ? "s" : ""}` : ""}
              </span>
            </header>
            <div className="lc-nuage">
              {montrees.map((e) => {
                const on = actif(f.critere, e.cle);
                const n = filtre ? e.dansSelection : e.total;
                const vide = filtre && !on && !e.dansSelection;
                return (
                  <button
                    key={e.cle}
                    type="button"
                    className={`lc-jeton${on ? " lc-jeton-actif" : ""}${vide ? " lc-jeton-trou" : ""}`}
                    style={{ fontSize: `${12 + Math.round((5 * e.total) / max)}px` }}
                    onClick={(ev) => (ev.altKey || ev.ctrlKey ? centrer({ critere: f.critere, cle: e.cle }) : basculer({ critere: f.critere, cle: e.cle }))}
                    onContextMenu={(ev) => (ev.preventDefault(), centrer({ critere: f.critere, cle: e.cle }))}
                    title={`${e.etiquette} : ${e.total} article(s)${filtre ? `, dont ${e.dansSelection} dans la sélection` : ""}${e.definition ? `\n${e.definition}` : ""}\nClic : filtrer · clic droit : constellation`}
                  >
                    {e.etiquette}
                    <span className="lc-jeton-n">{n}</span>
                  </button>
                );
              })}
              {f.etiquettes.length > VISIBLES ? (
                <button type="button" className="lien petit" onClick={() => setOuverts((o) => (o.has(f.critere) ? new Set([...o].filter((x) => x !== f.critere)) : new Set([...o, f.critere])))}>
                  {ouvert ? "moins" : `+ ${f.etiquettes.length - VISIBLES} autres`}
                </button>
              ) : null}
              {!f.etiquettes.length ? <span className="discret petit">aucune étiquette</span> : null}
            </div>
          </section>
        );
      })}
      <p className="discret petit">
        {total} articles. Clic sur une étiquette : filtrer (plusieurs = ET) ; clic droit : sa constellation. Les étiquettes hachurées ne sont portées par aucun article
        de la sélection.
      </p>
    </div>
  );
}
