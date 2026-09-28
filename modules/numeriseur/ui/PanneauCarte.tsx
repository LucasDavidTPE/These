/**
 * Carte de couleurs : légende étalonnée → valeur de chaque pixel ; coupes le long de lignes ;
 * moyennes sur un maillage (rectangle, disques, polaire) ; exports CSV, Excel, Figures et
 * chargement ChaussSpec (disques = charges circulaires uniformes, rectangle = carte de pression).
 */
import { useState } from "react";
import { grapheSvg, PALETTE_THEME } from "@noyau/graphe";
import { useContexte } from "@interface/contexte";
import { coupe, couverture, lireCarte, lireLegende } from "../core/carte";
import { versDonnees } from "../core/etalonnage";
import { chargementCarte, chargementDisques, csvCellules, csvCoupe, csvMatrice, grapheFigures, matrice, textePourExcel, type VersSI } from "../core/exports";
import { hex } from "../core/image";
import { moyennes, resultante, type Maillage } from "../core/maillage";
import { ECHELLES, gammeConnue, NOMS_ECHELLES } from "../core/echelles";
import { echelleConnueDe, etalonnageDe, legendeDe } from "../core/projet";
import { useNumeriseur } from "./etat";
import { fmt, fmtAxe, lireNombre } from "./format";
import { Nombre } from "./Nombre";

const LONGUEURS: [string, number][] = [
  ["m", 1],
  ["cm", 0.01],
  ["mm", 0.001],
];
const PRESSIONS: [string, number][] = [
  ["Pa", 1],
  ["kPa", 1e3],
  ["MPa", 1e6],
  ["bar", 1e5],
];

export function PanneauCarte() {
  const ctx = useContexte();
  const s = useNumeriseur();
  const p = s.projet;
  const e = etalonnageDe(p);
  const connue = echelleConnueDe(p);
  const leg = connue ? { log: connue.log } : legendeDe(p);
  const img = s.image;
  const [si, setSi] = useState<VersSI>({ longueur: 0.001, pression: 1e6 });
  const [seuil, setSeuil] = useState(0);
  const unite = p.legende.unite;
  const peutFigures = ctx.registre.aAction("figures.enregistrer-graphe");
  const peutChausspec = ctx.registre.aAction("chausspec.importer-chargement");

  function lire() {
    if (!img || !leg) return;
    try {
      const gamme = connue ? gammeConnue(connue.nom, connue.v1, connue.v2, connue.log, connue.inverse) : lireLegende(img.rgba, legendeDe(p)!);
      const champ = lireCarte(img.rgba, gamme, p.tolerance, p.zone, leg.log);
      let [mn, mx] = [Infinity, -Infinity];
      for (const v of champ.valeurs)
        if (!Number.isNaN(v)) {
          mn = Math.min(mn, v);
          mx = Math.max(mx, v);
        }
      useNumeriseur.setState({ gamme, champ, cellules: null });
      const c = couverture(champ);
      s.signaler(
        `Carte lue : ${Math.round(c * 100)} % des pixels de la zone ont une valeur (de ${fmt(mn)} à ${fmt(mx)} ${unite}).${c < 0.6 && !p.zone ? " Délimiter la zone de la carte pour écarter légende, titres et fond." : ""}`,
        c > 0 ? "info" : "attention",
      );
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  function calerSurZone() {
    if (!e || !p.zone) return;
    const [a, b, c, d] = p.zone;
    const coins = [versDonnees(e, [a, b]), versDonnees(e, [c, d])];
    const [x0, x1] = [Math.min(coins[0]![0], coins[1]![0]), Math.max(coins[0]![0], coins[1]![0])];
    const [y0, y1] = [Math.min(coins[0]![1], coins[1]![1]), Math.max(coins[0]![1], coins[1]![1])];
    const arr = (v: number) => Number(v.toPrecision(4));
    s.maj((q) => {
      const m = q.maillage;
      if (m.type === "rectangle" || m.type === "disques") Object.assign(m, { x0: arr(x0), x1: arr(x1), y0: arr(y0), y1: arr(y1) });
      else Object.assign(m, { xc: arr((x0 + x1) / 2), yc: arr((y0 + y1) / 2) });
    });
  }

  function changerType(t: Maillage["type"]) {
    s.maj((q) => {
      const m = q.maillage;
      const b = m.type === "polaire" ? { x0: m.xc - 1, x1: m.xc + 1, y0: m.yc - 1, y1: m.yc + 1 } : { x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1 };
      const L = Math.min(Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)) || 1;
      const arr = (v: number) => Number(v.toPrecision(3));
      q.maillage =
        t === "rectangle"
          ? { type: "rectangle", ...b, nx: 10, ny: 10 }
          : t === "disques"
            ? { type: "disques", ...b, R: arr(L / 20), pas: arr(L / 10), trame: "hexagonale" }
            : { type: "polaire", xc: (b.x0 + b.x1) / 2, yc: (b.y0 + b.y1) / 2, rayons: [0, 1, 2, 3, 4].map((k) => arr((k * L) / 8)), secteurs: 8 };
    });
    useNumeriseur.setState({ cellules: null });
  }

  function calculer() {
    if (!s.champ || !e) return;
    try {
      const c = moyennes(s.champ, e, p.maillage);
      useNumeriseur.setState({ cellules: c });
      const vides = c.filter((k) => Number.isNaN(k.valeur)).length;
      s.signaler(`${c.length} cellules, ${c.length - vides} avec une valeur.${vides ? ` ${vides} sans pixel lu (hors carte ou trop petites).` : ""}`);
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  async function enregistrer(nom: string, texte: string) {
    if (await ctx.plateforme.enregistrerSous(nom, new TextEncoder().encode(texte))) s.signaler(`${nom} enregistré.`);
  }

  function copier(texte: string) {
    void navigator.clipboard.writeText(texte).then(
      () => s.signaler("Copié : le coller dans Excel."),
      () => s.signaler("Copie refusée par le système.", "erreur"),
    );
  }

  async function versFiguresCoupe(i: number) {
    if (!s.champ || !e) return;
    const c = coupe(s.champ, e, p.coupes[i]!.a, p.coupes[i]!.b);
    const graphe = grapheFigures("$s$", `valeur${unite ? ` (${unite})` : ""}`, [{ name: `C${i + 1}`, x: c.s, y: c.v.map((v) => (Number.isNaN(v) ? 0 : v)), type: "line" }]);
    try {
      await ctx.registre.executer("figures.enregistrer-graphe", { ctx, titre: `Coupe C${i + 1} : ${s.nom || "carte"}`, source: `Numériseur, image ${p.image}`, tags: ["numérisé"], graphe });
      s.signaler("Coupe enregistrée dans Figures.");
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  async function versChausspec() {
    const c = s.cellules;
    const m = p.maillage;
    if (!c || m.type === "polaire") return;
    const wheels = m.type === "disques" ? chargementDisques(c, m.R, si, seuil) : chargementCarte(c, m, si);
    if (!wheels.length) return s.signaler("Aucun disque au-dessus du seuil.", "attention");
    try {
      await ctx.registre.executer("chausspec.importer-chargement", { ctx, wheels, source: `Numériseur, ${s.nom || p.image}` });
    } catch (err) {
      s.signaler(err instanceof Error ? err.message : String(err), "erreur");
    }
  }

  const m = p.maillage;
  const c = s.cellules;
  const ex = e ? Math.max(Math.abs(e.x.v1), Math.abs(e.x.v2)) : 1;
  const ey = e ? Math.max(Math.abs(e.y.v1), Math.abs(e.y.v2)) : 1;
  const R = c ? resultante(c) : 0;
  // charge envoyée à ChaussSpec : disques au-dessus du seuil seulement
  const Rsi = (c ? resultante(m.type === "disques" ? c.filter((k) => k.valeur > seuil) : c) : 0) * si.pression * si.longueur ** 2;

  return (
    <>
      <section className="nm-section">
        <h3>2. Légende de couleur</h3>
        <div className="rangee">
          <label className="nm-case" title="Si la carte a été tracée avec une échelle connue, choisissez-la et saisissez seulement les deux valeurs : inutile de pointer la légende de l'image.">
            Échelle{" "}
            <select className="champ" aria-label="Échelle de couleurs" value={p.legende.echelle ?? ""} onChange={(ev) => s.maj((q) => (q.legende.echelle = ev.target.value))}>
              <option value="">lue sur l'image</option>
              {NOMS_ECHELLES.map((n) => (
                <option key={n} value={n}>
                  {ECHELLES[n]!.libelle}
                </option>
              ))}
            </select>
          </label>
          {p.legende.echelle ? (
            <label className="nm-case">
              <input type="checkbox" checked={!!p.legende.inverse} onChange={(ev) => s.maj((q) => (q.legende.inverse = ev.target.checked))} /> inversée
            </label>
          ) : null}
        </div>
        <div className="rangee">
          <button type="button" className={`petit${s.outil === "leg1" ? " actif" : ""}`} disabled={!!p.legende.echelle} onClick={() => s.choisirOutil(s.outil === "leg1" ? null : "leg1")}>
            {p.legende.p1 ? "✓ " : ""}Début
          </button>
          <Nombre v={p.legende.v1} aria="Valeur au début de la légende" vide onChange={(v) => s.maj((q) => (q.legende.v1 = v))} />
          <button type="button" className={`petit${s.outil === "leg2" ? " actif" : ""}`} disabled={!!p.legende.echelle} onClick={() => s.choisirOutil(s.outil === "leg2" ? null : "leg2")}>
            {p.legende.p2 ? "✓ " : ""}Fin
          </button>
          <Nombre v={p.legende.v2} aria="Valeur à la fin de la légende" vide onChange={(v) => s.maj((q) => (q.legende.v2 = v))} />
          <label className="nm-case">
            <input type="checkbox" checked={p.legende.log} onChange={(ev) => s.maj((q) => (q.legende.log = ev.target.checked))} /> log
          </label>
          <input className="champ" style={{ width: "7ch" }} value={unite} placeholder="unité" aria-label="Unité des valeurs" onChange={(ev) => s.maj((q) => (q.legende.unite = ev.target.value))} />
        </div>
        {s.gamme ? <div className="nm-gamme" style={{ background: `linear-gradient(to right, ${s.gamme.rvb.map((k) => hex(k.map(Math.round) as [number, number, number])).join(", ")})` }} title="Couleurs lues sur la légende" /> : null}
        <div className="rangee">
          <button type="button" className={`petit${s.outil === "zone" ? " actif" : ""}`} onClick={() => s.choisirOutil(s.outil === "zone" ? null : "zone")}>
            {p.zone ? "Redéfinir la zone de la carte" : "Zone de la carte"}
          </button>
          <label className="nm-curseur">
            <span className="petit discret">Tolérance {p.tolerance}</span>
            <input type="range" min={3} max={60} value={p.tolerance} onChange={(ev) => s.maj((q) => (q.tolerance = Number(ev.target.value)))} />
          </label>
        </div>
        <button type="button" className="principal" disabled={!leg || !img} onClick={lire} title={leg ? "" : p.legende.echelle ? "Saisir les valeurs du début et de la fin de l'échelle" : "Placer le début et la fin de la légende et saisir leurs valeurs"}>
          Lire la carte
        </button>
      </section>

      <section className="nm-section">
        <h3>3. Coupes</h3>
        <button type="button" className={`petit${s.outil === "coupe" ? " actif" : ""}`} disabled={!e || !s.champ} onClick={() => s.choisirOutil(s.outil === "coupe" ? null : "coupe")}>
          Tracer une coupe
        </button>
        {s.champ && e
          ? p.coupes.map((k, i) => {
              const cp = coupe(s.champ!, e, k.a, k.b);
              const pts = cp.s.map((x, j) => [x, cp.v[j]!] as const).filter((q) => !Number.isNaN(q[1]));
              const svg = grapheSvg({ series: [{ points: pts, mode: "ligne", couleur: "#b2182b", epaisseur: 1.6 }], xTitre: "s", yTitre: unite || "valeur" }, { largeur: 320, hauteur: 150, palette: PALETTE_THEME, id: `nmc${i}` });
              return (
                <div key={i} className="nm-coupe">
                  <div className="rangee">
                    <strong className="petit">C{i + 1}</strong>
                    <span className="petit discret">
                      ({fmtAxe(k.a[0], ex)} ; {fmtAxe(k.a[1], ey)}) → ({fmtAxe(k.b[0], ex)} ; {fmtAxe(k.b[1], ey)})
                    </span>
                    <span className="grow" />
                    <button type="button" className="petit" onClick={() => void enregistrer(`coupe-${i + 1}.csv`, csvCoupe(cp, unite))}>
                      CSV…
                    </button>
                    {peutFigures ? (
                      <button type="button" className="petit" onClick={() => void versFiguresCoupe(i)}>
                        → Figures
                      </button>
                    ) : null}
                    <button type="button" className="petit" aria-label={`Supprimer la coupe ${i + 1}`} onClick={() => s.maj((q) => q.coupes.splice(i, 1))}>
                      ✕
                    </button>
                  </div>
                  <div className="nm-graphe" dangerouslySetInnerHTML={{ __html: svg }} />
                </div>
              );
            })
          : null}
      </section>

      <section className="nm-section">
        <h3>4. Maillage</h3>
        <div className="rangee">
          <select className="champ" value={m.type} aria-label="Type de maillage" onChange={(ev) => changerType(ev.target.value as Maillage["type"])}>
            <option value="rectangle">Rectangulaire (matrice)</option>
            <option value="disques">Disques (charges circulaires)</option>
            <option value="polaire">Polaire (anneaux × secteurs)</option>
          </select>
          <button type="button" className="petit" disabled={!p.zone || !e} onClick={calerSurZone} title="Reprendre les bornes de la zone de la carte">
            Caler sur la zone
          </button>
        </div>
        {m.type !== "polaire" ? (
          <div className="nm-grille-champs">
            {(["x0", "x1", "y0", "y1"] as const).map((k) => (
              <label key={k}>
                <span className="petit discret">{k}</span>
                <Nombre v={m[k]} aria={k} onChange={(v) => v !== null && s.maj((q) => ((q.maillage as typeof m)[k] = v))} />
              </label>
            ))}
            {m.type === "rectangle" ? (
              <>
                <label>
                  <span className="petit discret">nx</span>
                  <Nombre v={m.nx} aria="Nombre de cellules selon x" largeur={4} onChange={(v) => v !== null && v >= 1 && s.maj((q) => q.maillage.type === "rectangle" && (q.maillage.nx = Math.round(v)))} />
                </label>
                <label>
                  <span className="petit discret">ny</span>
                  <Nombre v={m.ny} aria="Nombre de cellules selon y" largeur={4} onChange={(v) => v !== null && v >= 1 && s.maj((q) => q.maillage.type === "rectangle" && (q.maillage.ny = Math.round(v)))} />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span className="petit discret">R</span>
                  <Nombre v={m.R} aria="Rayon des disques" onChange={(v) => v !== null && v > 0 && s.maj((q) => q.maillage.type === "disques" && (q.maillage.R = v))} />
                </label>
                <label>
                  <span className="petit discret">pas</span>
                  <Nombre v={m.pas} aria="Distance entre centres" onChange={(v) => v !== null && v > 0 && s.maj((q) => q.maillage.type === "disques" && (q.maillage.pas = v))} />
                </label>
                <label>
                  <span className="petit discret">trame</span>
                  <select className="champ" value={m.trame} aria-label="Trame des disques" onChange={(ev) => s.maj((q) => q.maillage.type === "disques" && (q.maillage.trame = ev.target.value as "carree" | "hexagonale"))}>
                    <option value="hexagonale">hexagonale</option>
                    <option value="carree">carrée</option>
                  </select>
                </label>
              </>
            )}
          </div>
        ) : (
          <div className="nm-grille-champs">
            <label>
              <span className="petit discret">xc</span>
              <Nombre v={m.xc} aria="Centre, x" onChange={(v) => v !== null && s.maj((q) => q.maillage.type === "polaire" && (q.maillage.xc = v))} />
            </label>
            <label>
              <span className="petit discret">yc</span>
              <Nombre v={m.yc} aria="Centre, y" onChange={(v) => v !== null && s.maj((q) => q.maillage.type === "polaire" && (q.maillage.yc = v))} />
            </label>
            <button type="button" className={`petit${s.outil === "centre" ? " actif" : ""}`} disabled={!e} onClick={() => s.choisirOutil(s.outil === "centre" ? null : "centre")}>
              Cliquer le centre
            </button>
            <label className="nm-large">
              <span className="petit discret">rayons des anneaux (« ; »)</span>
              <input
                className="champ"
                defaultValue={m.rayons.map(fmt).join(" ; ")}
                key={m.rayons.join()}
                aria-label="Rayons des anneaux"
                onBlur={(ev) => {
                  const r = ev.target.value.split(";").map(lireNombre);
                  if (r.every((v): v is number => v !== null)) s.maj((q) => q.maillage.type === "polaire" && (q.maillage.rayons = r.sort((a, b) => a - b)));
                }}
              />
            </label>
            <label>
              <span className="petit discret">secteurs</span>
              <Nombre v={m.secteurs} aria="Nombre de secteurs" largeur={3} onChange={(v) => v !== null && v >= 1 && s.maj((q) => q.maillage.type === "polaire" && (q.maillage.secteurs = Math.round(v)))} />
            </label>
          </div>
        )}
        <button type="button" className="principal" disabled={!s.champ || !e} onClick={calculer} title={s.champ ? "" : "Lire la carte d'abord"}>
          Calculer les moyennes
        </button>
        {c ? (
          <>
            <p className="petit">
              {c.length} cellules ; résultante Σ valeur × aire = {fmt(R)} {unite}·(unité d'axe)².
            </p>
            <div className="nm-table-defile">
              <table className="nm-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>x</th>
                    <th>y</th>
                    <th>valeur</th>
                    <th>px</th>
                  </tr>
                </thead>
                <tbody>
                  {c.slice(0, 300).map((k, i) => (
                    <tr key={i}>
                      <td className="discret">{i + 1}</td>
                      <td>{fmt(k.centre[0])}</td>
                      <td>{fmt(k.centre[1])}</td>
                      <td>{Number.isNaN(k.valeur) ? "—" : fmt(k.valeur)}</td>
                      <td className="discret">{k.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rangee">
              {m.type === "rectangle" ? (
                <>
                  <button type="button" className="petit" onClick={() => void enregistrer("matrice.csv", csvMatrice(c, m, `valeurs${unite ? ` (${unite})` : ""} ; 1re ligne : x ; 1re colonne : y`))}>
                    Matrice CSV…
                  </button>
                  <button
                    type="button"
                    className="petit"
                    onClick={() => {
                      const { x, y, P } = matrice(c, m);
                      copier(textePourExcel([[NaN, ...x], ...y.map((yy, j) => [yy, ...P[j]!])]));
                    }}
                  >
                    Copier la matrice
                  </button>
                </>
              ) : null}
              <button type="button" className="petit" onClick={() => void enregistrer("cellules.csv", csvCellules(c))}>
                Cellules CSV…
              </button>
            </div>
            {peutChausspec && m.type !== "polaire" ? (
              <div className="nm-chausspec">
                <p className="petit discret">
                  Vers ChaussSpec : {m.type === "disques" ? "une charge circulaire uniforme par disque" : "une carte de pression (constante par cellule)"}, en remplacement du chargement du cas ouvert (la structure est gardée).
                </p>
                <div className="rangee">
                  <label className="nm-case">
                    <span className="petit discret">axes en</span>
                    <select className="champ" value={si.longueur} aria-label="Unité des axes" onChange={(ev) => setSi({ ...si, longueur: Number(ev.target.value) })}>
                      {LONGUEURS.map(([n, v]) => (
                        <option key={n} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="nm-case">
                    <span className="petit discret">valeurs en</span>
                    <select className="champ" value={si.pression} aria-label="Unité des valeurs" onChange={(ev) => setSi({ ...si, pression: Number(ev.target.value) })}>
                      {PRESSIONS.map(([n, v]) => (
                        <option key={n} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  {m.type === "disques" ? (
                    <label className="nm-case">
                      <span className="petit discret">seuil</span>
                      <Nombre v={seuil} aria="Valeur minimale d'un disque gardé" largeur={4} onChange={(v) => setSeuil(v ?? 0)} />
                    </label>
                  ) : null}
                </div>
                <div className="rangee">
                  <span className="petit">Charge totale ≈ {fmt(Rsi / 1000)} kN</span>
                  <span className="grow" />
                  <button type="button" onClick={() => void versChausspec()}>
                    → ChaussSpec
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </>
  );
}
