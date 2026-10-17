/**
 * Mesures collées depuis Excel ou un fichier texte (jauges, capteurs, profil mesuré), tracées en noir avec le
 * calcul, et tableau des écarts (RMS, écart sur le pic, recalage dans le temps). Gardées dans la recette.
 */
import { useState } from "react";
import { lireMesures, type MesureCollee, type Trace } from "../../core/graph";
import { AtelierApercu } from "./AtelierApercu";
import type { Resultat } from "./atelierCalcul";

const fr = (x: number, ch = 3) =>
  Number.isFinite(x)
    ? String(Number(x.toPrecision(ch)))
        .replace(".", ",")
        .replace("-", "−")
    : "—";

export function MesuresCollees({
  mesures,
  set,
  aligner,
  setAligner,
  abscisse,
}: {
  mesures: MesureCollee[];
  set: (m: MesureCollee[]) => void;
  aligner?: boolean;
  setAligner?: (v: boolean) => void;
  abscisse: string;
}) {
  const [texte, setTexte] = useState("");
  const [facteur, setFacteur] = useState("1");
  const [inverser, setInverser] = useState(false);
  const ajouter = () => {
    const k = Number(facteur.replace(",", ".").replace("−", "-")) || 1;
    const m = lireMesures(texte, {
      facteur: k,
      signe: inverser ? -1 : 1,
      nom: `Mesure ${mesures.length + 1}`,
    });
    if (m.length) {
      set([...mesures, ...m]);
      setTexte("");
    }
  };
  return (
    <details
      className="atelier-champ atelier-declinaison"
      open={mesures.length > 0}
    >
      <summary>
        <strong>Mesures superposées</strong>{" "}
        <span className="muted small">
          (jauges, capteurs : coller depuis Excel)
        </span>
      </summary>
      {mesures.map((m, i) => (
        <div key={i} className="comsol-ligne small">
          <input
            value={m.nom}
            onChange={(e) =>
              set(
                mesures.map((x, j) =>
                  j === i ? { ...x, nom: e.target.value } : x,
                ),
              )
            }
            aria-label="Nom de la mesure"
          />
          <span className="muted">{m.x.length} points</span>
          <button
            type="button"
            className="small-btn"
            aria-label="Retirer"
            onClick={() => set(mesures.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <textarea
        rows={4}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder={`Une ligne par point : ${abscisse}, puis une colonne par mesure\n(première ligne de titres facultative)`}
      />
      <div className="comsol-ligne small">
        <span>valeurs ×</span>
        <input
          value={facteur}
          onChange={(e) => setFacteur(e.target.value)}
          aria-label="Facteur des valeurs"
          title="Pour passer dans l'unité du calcul (1e6 : m/m → µdef ; 1e-3 : µm → mm)"
          style={{ width: 60 }}
        />
        <label className="chip">
          <input
            type="checkbox"
            checked={inverser}
            onChange={(e) => setInverser(e.target.checked)}
          />
          changer le signe
        </label>
        <button
          type="button"
          className="small-btn"
          disabled={!texte.trim()}
          onClick={ajouter}
        >
          Ajouter
        </button>
      </div>
      {setAligner ? (
        <label className="chip">
          <input
            type="checkbox"
            checked={!!aligner}
            onChange={(e) => setAligner(e.target.checked)}
          />
          Recaler les pics dans le temps (la mesure est décalée pour que son pic
          tombe sur celui du calcul)
        </label>
      ) : null}
    </details>
  );
}

/** Aperçu, puis les écarts de chaque courbe calculée à chaque mesure. */
export function ApercuMesures({
  resultat,
  trace,
  aide,
}: {
  resultat: Resultat;
  trace: Trace;
  aide?: string;
}) {
  const ecarts =
    resultat && "ecartsMesures" in resultat
      ? resultat.ecartsMesures
      : undefined;
  return (
    <>
      <AtelierApercu
        resultat={resultat}
        trace={trace}
        {...(aide ? { aide } : {})}
      />
      {ecarts?.length ? (
        <div className="comsol-synthese">
          <table>
            <thead>
              <tr>
                <th>Mesure</th>
                <th>Calcul</th>
                <th>Pic mesuré</th>
                <th>Pic calculé</th>
                <th>Écart pic</th>
                <th>RMS (/ pic mesuré)</th>
                <th>Décalage</th>
              </tr>
            </thead>
            <tbody>
              {ecarts.map((x, i) => (
                <tr key={i} title={`${x.ecart.n} points comparés`}>
                  <td>{x.mesure}</td>
                  <td>{x.calcul}</td>
                  <td>{fr(x.ecart.picMesure, 4)}</td>
                  <td>{fr(x.ecart.picCalcul, 4)}</td>
                  <td
                    className={
                      Math.abs(x.ecart.ecartPic) > 10
                        ? "atelier-avert"
                        : "atelier-suivi"
                    }
                  >
                    {fr(x.ecart.ecartPic, 2)} %
                  </td>
                  <td>
                    {fr(x.ecart.rms)} ({fr(x.ecart.rmsRelatif, 2)} %)
                  </td>
                  <td>{x.ecart.decalage ? fr(x.ecart.decalage) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
