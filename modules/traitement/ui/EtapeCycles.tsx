/** Étape 02 : résultats par cycle d'un palier, signal ajusté, écarts entre capteurs, cycles écartés. */
import { useState } from "react";
import type { CleVoie } from "../core/donnees";
import { appliquerExclusions, basculerCycle, colonnesCycles, lignesEcartees, proposerEcarts, retenu, toutRetablir } from "../core/essai";
import { entier, freq, nb } from "../core/format";
import { NOMS_VOIES, vueEcartsCapteurs, vueSignal } from "../core/vues";
import { Bloc, ChampNombre } from "./champs";
import { essaiActif, useTraitement } from "./etat";
import { Graphe } from "./Graphe";

function classeEcart(cle: string, v: number): string | undefined {
  if (/^ec/.test(cle)) return Math.abs(v) > 25 ? "grave" : Math.abs(v) > 10 ? "alerte" : undefined;
  if (cle === "qMC") return v > 15 ? "grave" : v > 5 ? "alerte" : undefined;
  return undefined;
}

export function EtapeCycles() {
  const s = useTraitement();
  const e = essaiActif(s)!;
  const [seuils, setSeuils] = useState({ iq: 10, ecart: 25 });
  const iPalier = Math.min(s.palier, Math.max(0, e.paliers.length - 1));
  const p = e.paliers[iPalier];
  const cols = colonnesCycles(e);
  const basculer = (i: number, motif?: string) =>
    s.maj(() => {
      basculerCycle(e, p!.lignes[i]!, motif);
      appliquerExclusions(e);
    });

  if (!p) return <p className="discret">Aucun palier traité : vérifie la matrice de campagne (étape 01) puis « Traiter la campagne ».</p>;
  const tronques = p.lignes.filter((l) => l.tronque).length;
  const horsCalcul = p.lignes.filter((l) => !retenu(e, l)).length;
  const ecartees = lignesEcartees(e);
  const total = e.paliers.reduce((a, x) => a + x.lignes.length, 0);

  return (
    <>
      <Bloc titre="Palier" aide="un palier = un couple (T, f) = un classeur Calc-…">
        <div className="rangee">
          <select className="tr-champ" style={{ maxWidth: 360 }} value={iPalier} onChange={(ev) => s.maj((x) => ((x.palier = Number(ev.target.value)), (x.cycle = 0)))}>
            {e.paliers.map((q, i) => (
              <option key={i} value={i}>
                {q.libelle}
              </option>
            ))}
          </select>
          <span className="pastille pastille-info">{entier(p.nLignes)} lignes</span>
          <span className="pastille pastille-info">
            {p.lignes.length - horsCalcul} / {p.lignes.length} cycles retenus
          </span>
          {tronques ? <span className="pastille pastille-attention">{tronques} tronqués à 410 points</span> : null}
          {horsCalcul === p.lignes.length ? <span className="pastille pastille-erreur">palier entièrement écarté</span> : null}
        </div>
      </Bloc>

      <Bloc titre="Résultats par cycle" aide="clic : afficher le signal · X : écarter ou remettre">
        <div className="tr-cadre">
          <table className="tr-table">
            <thead>
              <tr>
                <th scope="col">Retenu</th>
                {cols.map((c) => (
                  <th key={c[0]} scope="col">
                    {c[1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.lignes.map((l, i) => {
                const dedans = retenu(e, l);
                return (
                  <tr
                    key={l.cycle}
                    className={[dedans ? "" : "ecarte", i === s.cycle ? "choisi" : ""].join(" ").trim() || undefined}
                    tabIndex={0}
                    onClick={() => s.maj((x) => (x.cycle = i))}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") s.maj((x) => (x.cycle = i));
                      if (ev.key === "x" || ev.key === "X") basculer(i);
                    }}
                  >
                    <td>
                      <input type="checkbox" checked={dedans} aria-label={`Retenir le cycle ${l.cycle} du palier ${p.libelle}`} onClick={(ev) => ev.stopPropagation()} onChange={() => basculer(i)} />
                    </td>
                    {cols.map(([cle, , d]) => {
                      const v = l[cle] as number;
                      return (
                        <td key={cle} className={classeEcart(cle, v)}>
                          {cle === "cycle" || cle === "nPoints" ? String(v) : nb(v, d)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Bloc>

      <div className="tr-grille-2">
        <div>
          <label className="tr-libelle tr-en-ligne">
            <span>Voie</span>
            <select className="tr-champ" value={s.voie} onChange={(ev) => s.maj((x) => (x.voie = ev.target.value as CleVoie))}>
              {NOMS_VOIES.map(([cle, nom]) => (
                <option key={cle} value={cle}>
                  {nom}
                </option>
              ))}
            </select>
          </label>
          <Graphe titre="Signal mesuré et sinusoïde ajustée" sous="choisir un cycle dans le tableau" vue={vueSignal(e, iPalier, s.cycle, s.voie)} />
        </div>
        <Graphe titre="Écart d'amplitude entre capteurs" vue={vueEcartsCapteurs(e, iPalier)} />
      </div>

      <Bloc titre="Cycles écartés du calcul" aide="ils restent dans les tableaux et l'export, marqués, avec le motif">
        <p className="discret">
          {ecartees.length
            ? `${ecartees.length} cycle${ecartees.length > 1 ? "s" : ""} écarté${ecartees.length > 1 ? "s" : ""} sur ${total}. Le choix est enregistré avec le projet.`
            : `Aucun cycle écarté : la synthèse porte sur les ${total} cycles.`}
        </p>
        <div className="rangee">
          <ChampNombre label="Indice de qualité au-delà de (%)" valeur={seuils.iq} onChange={(v) => setSeuils({ ...seuils, iq: v })} largeur={90} />
          <ChampNombre label="Écart d'un capteur au-delà de (%)" valeur={seuils.ecart} onChange={(v) => setSeuils({ ...seuils, ecart: v })} largeur={90} />
          <button
            type="button"
            onClick={() => {
              let n = 0;
              s.maj(() => (n = proposerEcarts(e, seuils.iq, seuils.ecart)));
              s.signaler(n ? `${n} cycle${n > 1 ? "s" : ""} proposé${n > 1 ? "s" : ""} à l'écart — à vérifier avant d'aller plus loin` : "aucun cycle ne dépasse ces seuils", n ? "attention" : "info");
            }}
          >
            Proposer
          </button>
          <button type="button" disabled={!ecartees.length} onClick={() => (s.maj(() => toutRetablir(e)), s.signaler("tous les cycles sont de nouveau pris en compte"))}>
            Tout remettre
          </button>
        </div>
        {ecartees.length ? (
          <div className="tr-cadre">
            <table className="tr-table">
              <thead>
                <tr>
                  <th />
                  <th scope="col">Palier</th>
                  <th scope="col">Cycle</th>
                  <th scope="col">|E*| (MPa)</th>
                  <th scope="col">φ (°)</th>
                  <th scope="col">Iq (%)</th>
                  <th scope="col">Motif</th>
                </tr>
              </thead>
              <tbody>
                {ecartees.map(({ palier, ligne, motif }) => (
                  <tr key={`${palier.T}|${palier.f}|${ligne.cycle}`}>
                    <td>
                      <button type="button" className="tr-mini" onClick={() => s.maj(() => (basculerCycle(e, ligne), appliquerExclusions(e)))}>
                        remettre
                      </button>
                    </td>
                    <th scope="row">
                      {palier.T} °C · {freq(palier.f)} Hz
                    </th>
                    <td>{ligne.cycle}</td>
                    <td>{nb(ligne.module, 1)}</td>
                    <td>{nb(ligne.phi, 2)}</td>
                    <td>{nb(ligne.qMC as number, 2)}</td>
                    <td className="texte">{motif || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Bloc>
    </>
  );
}
