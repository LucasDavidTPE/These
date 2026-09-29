/**
 * Régression d'une série : type (droite, polynôme, puissance, exponentielle, logarithme),
 * plage des x prise en compte (saisie, ou tirée sur l'aperçu), prolongement de la courbe,
 * équation sur la figure.
 */
import { useState } from "react";
import { grapheSvg, PALETTE_THEME } from "@noyau/graphe";
import { DEGRE_MAX, DEGRE_MIN, fitInverse, fitResidus, fitLabel, fitSample, fitSeries, fitValue, type FitKind, type FitResult, type Series, type SeriesFit } from "../../core/graph";
import { NumberInput } from "../editor/fields";
import { usePlageRegression } from "./plageRegression";
import { useGraph } from "./useGraph";

const FITS: { value: FitKind; label: string }[] = [
  { value: "lineaire", label: "Linéaire (y = a·x + b)" },
  { value: "origine", label: "Linéaire par l'origine (y = a·x)" },
  { value: "polynome", label: "Polynôme (y = c₀ + c₁·x + … + cₙ·xⁿ)" },
  { value: "puissance", label: "Puissance (y = a·xᵇ)" },
  { value: "exponentielle", label: "Exponentielle (y = a·eᵇˣ)" },
  { value: "logarithmique", label: "Logarithmique (y = a·ln x + b)" },
];

const CONDITION: Partial<Record<FitKind, string>> = {
  puissance: "Il faut au moins deux points à x et y positifs.",
  exponentielle: "Il faut au moins deux points à y positif.",
  logarithmique: "Il faut au moins deux points à x positif.",
};

/** Équation lisible dans le panneau (le TeX de la figure, sans les commandes). */
function equationTexte(f: FitResult | null, fit: SeriesFit): string {
  if (!f) return fit.kind === "polynome" ? `Il faut au moins ${(fit.degre ?? DEGRE_MIN) + 1} x distincts dans la plage.` : (CONDITION[fit.kind] ?? "Pas assez de points distincts dans la plage.");
  const eq = fitLabel(f)
    .replace(/\$/g, "")
    .replace(/\{,\}/g, ",")
    .replace(/\\,/g, "·")
    .replace(/\\quad/g, "  ·  ")
    .replace(/\\ln/g, "ln")
    .replace(/\\times 10\^\{(-?\d+)\}/g, "×10^$1")
    .replace(/\^\{([^}]*)\}/g, "^$1")
    .replace("R^2", "R²");
  return `${eq}  ·  ${f.n} point${f.n > 1 ? "s" : ""}`;
}

const nombre = (v: number) => String(Number(v.toPrecision(6))).replace(".", ",");

/** Écart entre la mesure et la courbe : une tendance ou un entonnoir dit que le modèle ne convient pas. */
function Residus({ f, x, y }: { f: FitResult; x: number[]; y: number[] }) {
  const [ouvert, setOuvert] = useState(false);
  const r = fitResidus(x, y, f);
  const svg = ouvert && r.n ? grapheSvg({ series: [{ points: r.x.map((v, i) => [v, r.r[i]!] as const), mode: "points", couleur: "#2f5f8a", taille: 2.5 }], xTitre: "x", yTitre: "résidu", zeroY: true }, { largeur: 300, hauteur: 150, palette: PALETTE_THEME, id: "residus" }) : null;
  return (
    <div className="field">
      <span>Qualité de l'ajustement</span>
      <p className="muted small">
        {r.n} point{r.n > 1 ? "s" : ""} · écart quadratique moyen {nombre(r.rmse)} · {r.sigma === null ? "erreur type : trop peu de points" : `erreur type ${nombre(r.sigma)}`} · écart maximal {nombre(r.maxAbs)} (en unités de y)
      </p>
      <button type="button" className="small-btn" aria-pressed={ouvert} onClick={() => setOuvert((v) => !v)}>
        {ouvert ? "Masquer les résidus" : "Voir les résidus"}
      </button>
      {svg ? <div dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      {svg ? <p className="muted small">Les points doivent se répartir sans forme autour de zéro ; une courbe ou un entonnoir signale un modèle inadapté.</p> : null}
    </div>
  );
}

/** Calculette sur la courbe : y pour un x (interpolation ou extrapolation), x pour un y. */
function Calculette({ f, plage }: { f: FitResult; plage: [number, number] }) {
  const [xq, setXq] = useState<number | undefined>();
  const [yq, setYq] = useState<number | undefined>();
  const yDeX = xq === undefined ? null : fitValue(f, xq);
  const xDeY = yq === undefined ? null : fitInverse(f, yq, plage);
  return (
    <div className="field">
      <span>Lire sur la courbe</span>
      <div className="row">
        <span className="muted small">x =</span>
        <NumberInput value={xq} title="Un x : donne le y de la courbe (au-delà de la plage, c'est une extrapolation)" onChange={setXq} />
        <span className="muted small">y = {yDeX === null ? "…" : Number.isFinite(yDeX) ? nombre(yDeX) : "indéfini"}</span>
      </div>
      <div className="row">
        <span className="muted small">y =</span>
        <NumberInput value={yq} title="Un y : donne le ou les x où la courbe le prend" onChange={setYq} />
        <span className="muted small">x = {xDeY === null ? "…" : xDeY.length ? xDeY.map(nombre).join(" ; ") : f.kind === "polynome" ? "aucun dans la plage" : "aucun"}</span>
      </div>
    </div>
  );
}

export function RegressionSerie({ i, sr }: { i: number; sr: Series }) {
  const s = useGraph();
  const choix = usePlageRegression((p) => p.serie);
  const fit = sr.fit;
  const maj = (patch: Partial<SeriesFit>) => s.setSeries(i, { fit: { ...fit!, ...patch } });

  function changerType(kind: string) {
    if (!kind) return s.setSeries(i, { fit: undefined });
    const f: SeriesFit = { ...(fit ?? { label: true }), kind: kind as FitKind };
    if (f.kind === "polynome") f.degre = fit?.degre ?? DEGRE_MIN;
    else delete f.degre;
    s.setSeries(i, { fit: f });
  }

  const xFinis = sr.x.filter(Number.isFinite);
  const [xLo, xHi] = xFinis.length ? [Math.min(...xFinis), Math.max(...xFinis)] : [0, 0];
  const plage = fit && (fit.xmin !== undefined || fit.xmax !== undefined);
  let f: FitResult | null = null;
  let echantillon: { x: number[]; y: number[] } = { x: [], y: [] };
  if (fit) {
    echantillon = fitSample(sr.x, sr.y, fit);
    f = fitSeries(echantillon.x, echantillon.y, fit.kind, fit.degre);
  }

  return (
    <>
      <label className="field">
        <span>Régression</span>
        <select value={fit?.kind ?? ""} onChange={(e) => changerType(e.target.value)}>
          <option value="">Aucune</option>
          {FITS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      {fit && (
        <>
          {fit.kind === "polynome" && (
            <label className="field">
              <span>Degré</span>
              <select value={fit.degre ?? DEGRE_MIN} onChange={(e) => maj({ degre: Number(e.target.value) })}>
                {Array.from({ length: DEGRE_MAX - DEGRE_MIN + 1 }, (_, k) => DEGRE_MIN + k).map((d) => (
                  <option key={d} value={d}>
                    {d === 2 ? "2 (parabole)" : d === 3 ? "3 (cubique)" : d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="field">
            <span>Plage de la régression (x)</span>
            <div className="row">
              <span className="muted small">de</span>
              <NumberInput value={fit.xmin ?? Number(xLo.toPrecision(6))} title="Plus petit x pris en compte" onChange={(v) => maj({ xmin: v })} />
              <span className="muted small">à</span>
              <NumberInput value={fit.xmax ?? Number(xHi.toPrecision(6))} title="Plus grand x pris en compte" onChange={(v) => maj({ xmax: v })} />
            </div>
            <div className="row">
              <button
                type="button"
                className={`small-btn${choix === i ? " actif" : ""}`}
                aria-pressed={choix === i}
                title="Tirer un rectangle sur l'aperçu : ses bornes en x deviennent celles de la régression"
                onClick={() => usePlageRegression.setState({ serie: choix === i ? null : i })}
              >
                ⇤⇥ Choisir sur l'aperçu
              </button>
              <button type="button" className="small-btn" disabled={!plage} title={`Toute la série (x de ${nombre(xLo)} à ${nombre(xHi)})`} onClick={() => maj({ xmin: undefined, xmax: undefined })}>
                Toute la série
              </button>
            </div>
          </div>
          <p className="muted small">{equationTexte(f, fit)}</p>
          {f && <Calculette f={f} plage={[fit.xmin ?? xLo, fit.xmax ?? xHi]} />}
          {f && <Residus f={f} x={echantillon.x} y={echantillon.y} />}
          {plage && (
            <label className="chip">
              <input type="checkbox" checked={!!fit.prolonger} onChange={(e) => maj({ prolonger: e.target.checked || undefined })} />
              Prolonger la courbe sur toute la série
            </label>
          )}
          <label className="chip">
            <input type="checkbox" checked={fit.label} onChange={(e) => maj({ label: e.target.checked })} />
            Équation sur la figure
          </label>
        </>
      )}
    </>
  );
}
