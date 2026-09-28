/**
 * Courbes XY : séries de points relevés automatiquement par leur couleur (ligne ou symboles),
 * puis corrigés à la main (ajout, glisser, Suppr, tableau). Exports CSV, Excel, Figures.
 */
import { useMemo } from "react";
import { useContexte } from "@interface/contexte";
import { marqueurs, suivre } from "../core/courbe";
import { csvPoints, grapheFigures, textePourExcel } from "../core/exports";
import { couleursDominantes, depuisHex, hex } from "../core/image";
import { etalonnageDe } from "../core/projet";
import { useNumeriseur } from "./etat";
import { Nombre } from "./Nombre";

const PALETTE = ["#d62728", "#1f77b4", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b"];

export function PanneauCourbes() {
  const ctx = useContexte();
  const s = useNumeriseur();
  const p = s.projet;
  const e = etalonnageDe(p);
  const sr = p.series[s.serie] ?? p.series[0]!;
  const img = s.image;
  const dominantes = useMemo(() => (img ? couleursDominantes(img.rgba, p.zone, 8) : []), [img, p.zone]);
  const peutFigures = ctx.registre.aAction("figures.enregistrer-graphe");
  const titreX = p.axes.x.titre || "x",
    titreY = p.axes.y.titre || "y";

  function relever() {
    if (!img || !e) return;
    try {
      const o = { couleur: depuisHex(sr.couleur), tolerance: p.tolerance, zone: p.zone, pas: p.pas };
      const pts = sr.mode === "ligne" ? suivre(img.rgba, e, o) : marqueurs(img.rgba, e, o);
      s.maj((q) => (q.series[s.serie]!.points = pts));
      s.signaler(pts.length ? `${pts.length} points relevés pour « ${sr.nom} ». Les corriger à la main si besoin (glisser, Suppr, ajouter).` : "Aucun pixel de cette couleur : prendre la couleur à la pipette, ou augmenter la tolérance.", pts.length ? "info" : "attention");
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  async function exporterCsv() {
    const ok = await ctx.plateforme.enregistrerSous(`${sr.nom || "serie"}.csv`, new TextEncoder().encode(csvPoints(sr.points, titreX, titreY)));
    if (ok) s.signaler("Points enregistrés en CSV.");
  }

  function copierExcel() {
    const n = Math.max(...p.series.map((x) => x.points.length));
    const entete = p.series.map((x) => `${x.nom} : ${titreX}\t${x.nom} : ${titreY}`).join("\t");
    const lignes = Array.from({ length: n }, (_, i) => p.series.flatMap((x) => (x.points[i] ? [x.points[i][0], x.points[i][1]] : [NaN, NaN])));
    void navigator.clipboard.writeText(`${entete}\n${textePourExcel(lignes)}`).then(
      () => s.signaler("Points copiés : les coller dans Excel (une paire de colonnes par série)."),
      () => s.signaler("Copie refusée par le système.", "erreur"),
    );
  }

  async function versFigures() {
    const series = p.series.filter((x) => x.points.length).map((x) => ({ name: x.nom, x: x.points.map((q) => q[0]), y: x.points.map((q) => q[1]), type: x.mode === "ligne" ? ("line" as const) : ("points" as const) }));
    const graphe = { ...grapheFigures(titreX, titreY, series), x: { label: titreX, log: p.axes.x.log }, y: { label: titreY, log: p.axes.y.log } };
    try {
      await ctx.registre.executer("figures.enregistrer-graphe", { ctx, titre: `Numérisé : ${s.nom || "graphique"}`, source: `Numériseur, image ${p.image}`, tags: ["numérisé"], graphe });
      s.signaler("Graphe enregistré dans Figures (modifiable dans Graphes).");
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  return (
    <>
      <section className="nm-section">
        <h3>2. Séries</h3>
        <div className="nm-series">
          {p.series.map((x, i) => (
            <button key={i} type="button" className={`petit nm-serie${i === s.serie ? " actif" : ""}`} onClick={() => useNumeriseur.setState({ serie: i, selection: null })}>
              <span className="nm-pastille" style={{ background: x.couleur }} />
              {x.nom} ({x.points.length})
            </button>
          ))}
          <button
            type="button"
            className="petit"
            onClick={() => {
              s.maj((q) => q.series.push({ nom: `Série ${q.series.length + 1}`, couleur: PALETTE[q.series.length % PALETTE.length]!, mode: "ligne", points: [] }));
              useNumeriseur.setState({ serie: p.series.length });
            }}
          >
            + série
          </button>
        </div>
        <div className="rangee">
          <input className="champ grow" value={sr.nom} aria-label="Nom de la série" onChange={(ev) => s.maj((q) => (q.series[s.serie]!.nom = ev.target.value))} />
          <select className="champ" value={sr.mode} aria-label="Type de tracé" onChange={(ev) => s.maj((q) => (q.series[s.serie]!.mode = ev.target.value as "ligne" | "symboles"))}>
            <option value="ligne">Ligne</option>
            <option value="symboles">Symboles</option>
          </select>
          {p.series.length > 1 ? (
            <button
              type="button"
              className="petit"
              title="Supprimer la série"
              onClick={() => {
                s.maj((q) => q.series.splice(s.serie, 1));
                useNumeriseur.setState({ serie: 0, selection: null });
              }}
            >
              ✕
            </button>
          ) : null}
        </div>
        <div className="rangee">
          <span className="petit discret">Couleur</span>
          <input type="color" value={sr.couleur} aria-label="Couleur de la série" onChange={(ev) => s.maj((q) => (q.series[s.serie]!.couleur = ev.target.value))} />
          <button type="button" className={`petit${s.outil === "pipette" ? " actif" : ""}`} onClick={() => s.choisirOutil(s.outil === "pipette" ? null : "pipette")} title="Prendre la couleur sur l'image">
            Pipette
          </button>
          {dominantes.map((d) => (
            <button key={hex(d.couleur)} type="button" className="nm-puce" style={{ background: hex(d.couleur) }} title={`${hex(d.couleur)} (${Math.round(d.part * 100)} % des pixels colorés)`} aria-label={`Couleur ${hex(d.couleur)}`} onClick={() => s.maj((q) => (q.series[s.serie]!.couleur = hex(d.couleur)))} />
          ))}
        </div>
        <div className="rangee">
          <label className="nm-curseur">
            <span className="petit discret">Tolérance {p.tolerance}</span>
            <input type="range" min={3} max={60} value={p.tolerance} onChange={(ev) => s.maj((q) => (q.tolerance = Number(ev.target.value)))} />
          </label>
          {sr.mode === "ligne" ? (
            <label className="nm-case">
              <span className="petit discret">Pas (px)</span>
              <Nombre v={p.pas} aria="Pas entre deux points, en pixels" largeur={3} onChange={(v) => v !== null && v > 0 && s.maj((q) => (q.pas = v))} />
            </label>
          ) : null}
        </div>
        <div className="rangee">
          <button type="button" className={`petit${s.outil === "zone" ? " actif" : ""}`} onClick={() => s.choisirOutil(s.outil === "zone" ? null : "zone")} title="Limiter la recherche à un rectangle (hors légende, titres…)">
            {p.zone ? "Redéfinir la zone" : "Zone de recherche"}
          </button>
          {p.zone ? (
            <button type="button" className="petit" onClick={() => s.maj((q) => (q.zone = null))}>
              Toute l'image
            </button>
          ) : null}
        </div>
        <div className="rangee">
          <button type="button" className="principal" disabled={!e || !img} onClick={relever} title={e ? "" : "Étalonner d'abord les axes"}>
            Relever automatiquement
          </button>
          <button type="button" className={`petit${s.outil === "ajouter" ? " actif" : ""}`} disabled={!e} onClick={() => s.choisirOutil(s.outil === "ajouter" ? null : "ajouter")}>
            Ajouter à la main
          </button>
        </div>
      </section>

      <section className="nm-section">
        <h3>
          Points de « {sr.nom} » ({sr.points.length})
        </h3>
        {sr.points.length ? (
          <div className="nm-table-defile">
            <table className="nm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{titreX}</th>
                  <th>{titreY}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sr.points.map(([x, y], i) => (
                  <tr key={i} className={s.selection?.serie === s.serie && s.selection.point === i ? "choisi" : undefined} onClick={() => useNumeriseur.setState({ selection: { serie: s.serie, point: i } })}>
                    <td className="discret">{i + 1}</td>
                    <td>
                      <Nombre key={`x${i}-${x}`} v={x} aria={`x du point ${i + 1}`} onChange={(v) => v !== null && s.maj((q) => (q.series[s.serie]!.points[i]![0] = v))} />
                    </td>
                    <td>
                      <Nombre key={`y${i}-${y}`} v={y} aria={`y du point ${i + 1}`} onChange={(v) => v !== null && s.maj((q) => (q.series[s.serie]!.points[i]![1] = v))} />
                    </td>
                    <td>
                      <button type="button" className="petit" aria-label={`Supprimer le point ${i + 1}`} onClick={() => s.maj((q) => q.series[s.serie]!.points.splice(i, 1))}>
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="petit discret">Aucun point : « Relever automatiquement » ou « Ajouter à la main ».</p>
        )}
        <div className="rangee">
          <button type="button" className="petit" disabled={!sr.points.length} onClick={() => s.maj((q) => q.series[s.serie]!.points.sort((a, b) => a[0] - b[0]))}>
            Trier par x
          </button>
          <button type="button" className="petit" disabled={!sr.points.length} onClick={() => s.maj((q) => (q.series[s.serie]!.points = []))}>
            Tout effacer
          </button>
        </div>
      </section>

      <section className="nm-section">
        <h3>3. Exporter</h3>
        <div className="rangee">
          <button type="button" className="petit" disabled={!sr.points.length} onClick={() => void exporterCsv()}>
            CSV de la série…
          </button>
          <button type="button" className="petit" disabled={!p.series.some((x) => x.points.length)} onClick={copierExcel}>
            Copier pour Excel
          </button>
          {peutFigures ? (
            <button type="button" className="petit" disabled={!p.series.some((x) => x.points.length)} onClick={() => void versFigures()}>
              → Figures
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
