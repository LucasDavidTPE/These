/** Étape 03 : synthèse par palier (moyenne, maximum, minimum, écart-type) et isothermes. */
import { COLONNES_SYNTHESE } from "../core/essai";
import { freq, nb } from "../core/format";
import { vuesSynthese } from "../core/vues";
import { Bloc } from "./champs";
import { essaiActif, useTraitement, type Statistique } from "./etat";
import { Graphe } from "./Graphe";
import { useFigure } from "./figure";

const STATS: [Statistique, string][] = [
  ["", "moyenne"],
  ["_max", "maximum"],
  ["_min", "minimum"],
  ["_et", "écart-type"],
];

export function EtapeSynthese() {
  const s = useTraitement();
  const e = essaiActif(s)!;
  const v = vuesSynthese(e, s.langue);
  const figure = useFigure();
  return (
    <>
      <Bloc titre="Synthèse par palier" aide="sur les cycles retenus">
        <div className="rangee">
          {STATS.map(([cle, nom]) => (
            <button key={nom} type="button" aria-pressed={s.stat === cle} className={s.stat === cle ? "tr-bascule actif" : "tr-bascule"} onClick={() => s.maj((x) => (x.stat = cle))}>
              {nom}
            </button>
          ))}
        </div>
        <div className="tr-cadre">
          <table className="tr-table">
            <thead>
              <tr>
                {COLONNES_SYNTHESE.map((c) => (
                  <th key={c[0]} scope="col">
                    {c[1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.synthese.map((a) => (
                <tr key={`${a.T}|${a.f}`}>
                  {COLONNES_SYNTHESE.map(([cle, , d]) => {
                    const brut = ["T", "f", "n", "ecartes"].includes(cle);
                    return <td key={cle}>{cle === "f" ? freq(a.f) : nb(a[brut ? cle : cle + s.stat] as number, d)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>
      <div className="tr-grille-2">
        <Graphe titre="|E*| par isotherme" sous="module en fonction de la fréquence de sollicitation" vue={v.module} figure={figure("|E*| par isotherme", "isothermesE")} />
        <Graphe titre="Angle de phase" sous="φ(E*) en fonction de la fréquence" vue={v.phase} figure={figure("Angle de phase par isotherme", "isothermesP")} />
      </div>
    </>
  );
}
