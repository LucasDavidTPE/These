/**
 * Nettoyage du vocabulaire : un croisement n'a de sens qu'avec des étiquettes courtes et réutilisées.
 * Propose de séparer « Viscoélastique (2S2P1D) » en étiquette + note, de fusionner les écritures voisines
 * (« Éléments finis » / « élément fini »), et signale les étiquettes trop longues. Rien n'est appliqué sans clic.
 */
import { useMemo, useState } from "react";
import { appliquerNettoyage, proposerNettoyage } from "../../core/explorer";
import type { ObjetRef, ReglagesLecture } from "../../core/lecture";

export function Nettoyage({ refs, reglages, enregistrerLot, fermer }: { refs: ObjetRef[]; reglages: ReglagesLecture; enregistrerLot(m: ObjetRef[]): Promise<void>; fermer(): void }) {
  const p = useMemo(() => proposerNettoyage(refs, reglages), [refs, reglages]);
  const [sansSep, setSansSep] = useState<Set<number>>(new Set());
  const [sansFus, setSansFus] = useState<Set<number>>(new Set());
  const [fait, setFait] = useState<string | null>(null);
  const nom = (id: string) => reglages.criteres.find((c) => c.id === id)?.nom ?? id;
  const basculer = (s: Set<number>, i: number) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i]));
  const rien = !p.separations.length && !p.fusions.length;

  async function appliquer() {
    const m = appliquerNettoyage(
      refs,
      p.separations.filter((_, i) => !sansSep.has(i)),
      p.fusions.filter((_, i) => !sansFus.has(i)),
    );
    await enregistrerLot(m);
    setFait(`${m.length} fiche(s) mise(s) à jour.`);
  }

  return (
    <div className="lc-nettoyage">
      <div className="rangee">
        <h3>Nettoyer le vocabulaire</h3>
        <button type="button" onClick={fermer}>
          Fermer
        </button>
      </div>
      {fait ? <p className="lc-ok">{fait}</p> : null}
      {rien ? <p>Le vocabulaire est propre : rien à séparer ni à fusionner.</p> : null}
      {p.separations.length ? (
        <>
          <h4>Précisions entre parenthèses → note ({p.separations.length})</h4>
          <p className="discret petit">L'étiquette garde la tête (réutilisable d'un article à l'autre) ; la précision va dans la note de la case, rien n'est perdu.</p>
          <ul className="lc-propositions">
            {p.separations.map((s, i) => (
              <li key={`${s.critere}${s.etiquette}`}>
                <label>
                  <input type="checkbox" checked={!sansSep.has(i)} onChange={() => setSansSep(basculer(sansSep, i))} /> <span className="discret">{nom(s.critere)} :</span>{" "}
                  <s>{s.etiquette}</s> → <strong>{s.tete}</strong> <span className="discret">+ note « {s.precision} » · {s.ids.length} article(s)</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {p.fusions.length ? (
        <>
          <h4>Écritures voisines → une seule étiquette ({p.fusions.length})</h4>
          <ul className="lc-propositions">
            {p.fusions.map((f, i) => (
              <li key={`${f.critere}${f.cible}`}>
                <label>
                  <input type="checkbox" checked={!sansFus.has(i)} onChange={() => setSansFus(basculer(sansFus, i))} /> <span className="discret">{nom(f.critere)} :</span>{" "}
                  {f.sources.map((s) => (
                    <s key={s}>{s}</s>
                  ))}{" "}
                  → <strong>{f.cible}</strong> <span className="discret">· {f.ids.length} article(s)</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {p.longues.length ? (
        <>
          <h4>Étiquettes trop longues ({p.longues.length})</h4>
          <p className="discret petit">Plutôt des phrases que des étiquettes : à raccourcir dans « Critères et vocabulaire » (ou dans la case, en gardant le détail en note).</p>
          <ul className="lc-propositions">
            {p.longues.map((l) => (
              <li key={`${l.critere}${l.etiquette}`}>
                <span className="discret">{nom(l.critere)} :</span> {l.etiquette} <span className="discret">· {l.ids.length} article(s)</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {!rien ? (
        <button type="button" className="principal" onClick={() => void appliquer()}>
          Appliquer les propositions cochées
        </button>
      ) : null}
    </div>
  );
}
