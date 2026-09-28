/**
 * Résultats d'un calcul : carte du champ choisi, extrêmes (et ε1), coupes longitudinale et
 * transversale au point du maximum, signaux des jauges ; exports au format du code Python
 * (CSV par champ, synthese.json, jauges) et vers Figures.
 */
import { useMemo, useState } from "react";
import { grapheSvg, PALETTE_THEME, type Serie } from "@noyau/graphe";
import { useContexte } from "@interface/contexte";
import { extremes, fieldCsv, fmtE6 } from "../core/io";
import { STRAIN } from "../core/spectral";
import { coupeX, coupeY, dessiner, fmt, unite } from "./carte";
import { CarteChamp } from "./CarteChamp";
import { useChaussspec } from "./etat";
import { versResultat, type ResultatSerialise } from "./execution";

type Vue = "re" | "abs" | "im";

function GrapheXY({ series, xTitre, yTitre, hauteur = 220 }: { series: Serie[]; xTitre: string; yTitre: string; hauteur?: number }) {
  const svg = grapheSvg({ series, xTitre, yTitre, zeroY: true }, { largeur: 520, hauteur, palette: PALETTE_THEME, id: `cs${xTitre.length}${yTitre.length}` });
  return <div className="cs-graphe" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** graph.json (format Figures) d'une ou plusieurs courbes. */
function graphe(xLabel: string, yLabel: string, series: { name: string; x: number[]; y: number[] }[]) {
  return {
    format: "figurine-graph/1",
    width: 120,
    height: 80,
    theme: "these",
    x: { label: xLabel, log: false },
    y: { label: yLabel, log: false },
    legend: series.length > 1 ? "north east" : "none",
    grid: false,
    bar_width: 3,
    series: series.map((s) => ({ ...s, type: "line", legend: series.length > 1 })),
  };
}

export function Resultats({ r }: { r: ResultatSerialise }) {
  const ctx = useContexte();
  const { nom, signaler, cas } = useChaussspec();
  const res = useMemo(() => versResultat(r), [r]);
  const complexe = r.meta.complex;
  const zs = [...new Set(r.champs.map((c) => c.z))];
  const avecE1 = !complexe && STRAIN.every((c) => r.champs.some((k) => k.comp === c));
  const choix = [...r.champs.map((c) => `${c.comp}@${c.z}`), ...(avecE1 ? zs.map((z) => `e1@${z}`) : [])];
  const [cle, setCle] = useState(choix[0]!);
  const [vue, setVue] = useState<Vue>("re");
  const [comp, zTxt] = cle.split("@") as [string, string];
  const z = Number(zTxt);
  const f = useMemo(() => {
    if (comp === "e1") return res.principalStrains(z)[2];
    const c = r.champs.find((k) => k.comp === comp && k.z === z)!;
    if (vue === "re" || !c.im) return c.re;
    return vue === "im" ? c.im : Float64Array.from(c.re, (v, i) => Math.hypot(v, c.im![i]!));
  }, [comp, z, vue, r, res]);
  const ext = extremes(res, f);
  const { k, u } = unite(comp);
  const cx = coupeX(res.x, res.y, f, ext.y_max),
    cy = coupeY(res.x, res.y, f, ext.x_max);
  const regime = cas.regime?.type ?? "static";

  async function enregistrerDossier() {
    const dossier = await ctx.plateforme.choisirDossier("Dossier des résultats");
    if (!dossier) return;
    try {
      const fs = ctx.plateforme.fichiers(dossier);
      const sous = `resultats_${nom}`;
      await fs.ensureDir(sous);
      for (const c of r.champs) await fs.writeTextAtomic(`${sous}/${c.comp}_z${c.z.toFixed(3)}.csv`, fieldCsv(res, c.comp, c.z));
      await fs.writeTextAtomic(`${sous}/synthese.json`, JSON.stringify(r.synthese, null, 1) + "\n");
      for (const [i, j] of r.jauges.entries()) await fs.writeTextAtomic(`${sous}/jauge${i + 1}_${j.comp}.csv`, ["t (s);valeur", ...j.t.map((t, q) => `${fmtE6(t)};${fmtE6(j.f[q]!)}`)].join("\n") + "\n");
      await fs.writeTextAtomic(`${sous}/cas.json`, JSON.stringify(cas, null, 2) + "\n");
      signaler(`Résultats écrits dans ${dossier}/${sous} (même format que python -m chausspec).`);
    } catch (e) {
      signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  async function carteVersFigures() {
    try {
      const canvas = document.createElement("canvas");
      let vmax = 0;
      for (const v of f) vmax = Math.max(vmax, Math.abs(v));
      dessiner(canvas, f, res.x.length, res.y.length, vmax);
      // agrandie sans lissage pour garder les pixels nets
      const grand = document.createElement("canvas");
      const s = Math.max(1, Math.round(800 / res.x.length));
      grand.width = res.x.length * s;
      grand.height = res.y.length * s;
      const g = grand.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.drawImage(canvas, 0, 0, grand.width, grand.height);
      const png = new Uint8Array(await (await new Promise<Blob>((ok) => grand.toBlob((b) => ok(b!), "image/png"))).arrayBuffer());
      const titre = `ChaussSpec ${nom} : ${comp} à z = ${z} m`;
      await ctx.registre.executer("figures.enregistrer-image", { ctx, titre, png, source: `ChaussSpec, cas ${nom} (±${fmt(vmax * k)} ${u}, x ${fmt(res.x[0]!)} à ${fmt(res.x.at(-1)!)} m, y ${fmt(res.y[0]!)} à ${fmt(res.y.at(-1)!)} m)`, tags: ["ChaussSpec", comp] });
      signaler("Carte enregistrée dans Figures.");
    } catch (e) {
      signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  async function grapheVersFigures(titre: string, doc: unknown) {
    try {
      await ctx.registre.executer("figures.enregistrer-graphe", { ctx, titre: `ChaussSpec ${nom} : ${titre}`, source: `ChaussSpec, cas ${nom}`, tags: ["ChaussSpec"], graphe: doc });
      signaler("Graphe enregistré dans Figures (modifiable, pgfplots).");
    } catch (e) {
      signaler(e instanceof Error ? e.message : String(e), "erreur");
    }
  }

  const peutFigures = ctx.registre.aAction("figures.enregistrer-graphe");
  const lbl = `${comp} (${u})`;

  return (
    <div className="cs-resultats">
      <div className="rangee">
        <label className="cs-champ">
          <span>Champ</span>
          <select className="champ" value={cle} onChange={(e) => setCle(e.target.value)}>
            {choix.map((c) => (
              <option key={c} value={c}>
                {c.replace("@", " à z = ")} m
              </option>
            ))}
          </select>
        </label>
        {complexe && comp !== "e1" ? (
          <label className="cs-champ">
            <span>Harmonique</span>
            <select className="champ" value={vue} onChange={(e) => setVue(e.target.value as Vue)}>
              <option value="re">partie réelle (t = 0)</option>
              <option value="im">partie imaginaire</option>
              <option value="abs">amplitude |·|</option>
            </select>
          </label>
        ) : null}
        <span className="grow" />
        <button type="button" onClick={() => void enregistrerDossier()} title="CSV de chaque champ, synthese.json, jauges et cas.json, comme python -m chausspec">
          Enregistrer les résultats…
        </button>
        {ctx.registre.aAction("figures.enregistrer-image") ? (
          <button type="button" onClick={() => void carteVersFigures()}>
            Carte → Figures
          </button>
        ) : null}
      </div>
      <div className="cs-resultats-grille">
        <CarteChamp x={res.x} y={res.y} f={f} comp={comp} z={z} />
        <div>
          <table className="cs-table">
            <thead>
              <tr>
                <th>Champ</th>
                <th>max</th>
                <th>en (x, y)</th>
                <th>min</th>
                <th>en (x, y)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.synthese.extremes).map(([c, e]) => {
                const uu = unite(c);
                return (
                  <tr key={c} className={c.replace("=", "@").replace("@z@", "@") === cle ? "choisi" : undefined}>
                    <th scope="row">{c.replace("@z=", " à z = ")} m</th>
                    <td>
                      {fmt(e.max! * uu.k)} {uu.u}
                    </td>
                    <td>
                      ({fmt(e.x_max!)} ; {fmt(e.y_max!)})
                    </td>
                    <td>{e.min !== undefined ? `${fmt(e.min * uu.k)} ${uu.u}` : ""}</td>
                    <td>{e.x_min !== undefined ? `(${fmt(e.x_min)} ; ${fmt(e.y_min!)})` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="discret petit">
            Calcul : {r.meta.cpuS.toFixed(1).replace(".", ",")} s, grille {r.meta.N[0]} × {r.meta.N[1]} sur {r.meta.L[0]} × {r.meta.L[1]} m, {r.meta.nBandNodes[0]} + {r.meta.nBandNodes[1]} nœuds de bande ; charge totale {Math.round(r.meta.force / 1000).toLocaleString("fr-FR")} kN.
            {complexe ? " Régime harmonique : champs complexes." : ""}
          </p>
        </div>
      </div>
      <div className="cs-resultats-grille">
        <div>
          <div className="rangee">
            <strong className="petit">Coupe longitudinale en y = {fmt(ext.y_max)} m</strong>
            {peutFigures ? (
              <button type="button" className="petit" onClick={() => void grapheVersFigures(`${comp}, coupe en y = ${fmt(ext.y_max)} m, z = ${z} m`, graphe("$x$ (m)", lbl, [{ name: comp, x: Array.from(cx.x), y: Array.from(cx.v, (v) => v * k) }]))}>
                → Figures
              </button>
            ) : null}
          </div>
          <GrapheXY series={[{ points: Array.from(cx.x, (x, i) => [x, cx.v[i]! * k] as const), mode: "ligne", couleur: "#b2182b", epaisseur: 1.6 }]} xTitre="x (m)" yTitre={lbl} />
        </div>
        <div>
          <div className="rangee">
            <strong className="petit">Coupe transversale en x = {fmt(ext.x_max)} m</strong>
            {peutFigures ? (
              <button type="button" className="petit" onClick={() => void grapheVersFigures(`${comp}, coupe en x = ${fmt(ext.x_max)} m, z = ${z} m`, graphe("$y$ (m)", lbl, [{ name: comp, x: Array.from(cy.y), y: Array.from(cy.v, (v) => v * k) }]))}>
                → Figures
              </button>
            ) : null}
          </div>
          <GrapheXY series={[{ points: Array.from(cy.y, (y, i) => [y, cy.v[i]! * k] as const), mode: "ligne", couleur: "#2166ac", epaisseur: 1.6 }]} xTitre="y (m)" yTitre={lbl} />
        </div>
      </div>
      {regime === "moving" && r.jauges.length ? (
        <div className="cs-jauges-graphe">
          <div className="rangee">
            <strong className="petit">Jauges : signal au passage de la charge (t = 0 : charge au droit de la jauge)</strong>
            {peutFigures ? (
              <button
                type="button"
                className="petit"
                onClick={() =>
                  void grapheVersFigures(
                    "signaux des jauges",
                    graphe(
                      "$t$ (s)",
                      "valeur",
                      r.jauges.map((j) => ({ name: `${j.comp} z = ${j.z} m (${j.x} ; ${j.y})`, x: j.t, y: j.f.map((v) => v * unite(j.comp).k) })),
                    ),
                  )
                }
              >
                → Figures
              </button>
            ) : null}
          </div>
          <GrapheXY
            series={r.jauges.map((j, i) => ({ points: j.t.map((t, q) => [t, j.f[q]! * unite(j.comp).k] as const), mode: "ligne" as const, couleur: ["#b2182b", "#2166ac", "#1b9e77", "#7570b3"][i % 4]!, epaisseur: 1.6, libelle: `${j.comp} à z = ${j.z} m` }))}
            xTitre="t (s)"
            yTitre={r.jauges.length === 1 ? `${r.jauges[0]!.comp} (${unite(r.jauges[0]!.comp).u})` : "valeur"}
          />
        </div>
      ) : null}
    </div>
  );
}
