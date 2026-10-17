/**
 * Tuiles d'ingénierie de l'atelier COMSOL :
 *  - « Bassin de déflexion » : la déflexion en surface lue comme un essai HWD (géophones, D0, SCI, BDI, BCI,
 *    AREA, rayon de courbure), comparée au besoin à un bassin mesuré collé depuis le rapport d'essai ;
 *  - « Convergence du maillage » : le même cas sur un maillage grossier et sur un maillage raffiné (paires
 *    trouvées d'après les noms, « EL » / « EL-fin »), écarts sur le pic, au pire point et en norme L2.
 */
import { useState } from "react";
import {
  CAPTEURS_HWD,
  avecSurface,
  bassinsLatex,
  candidatsSensibilite,
  courtDe,
  expressionsCommunes,
  geometrie,
  libelleDe,
  lireMesure,
  lireValeurs,
  maillageLatex,
  pairesMaillage,
  sensibiliteLatex,
  sourcesSensibilite,
  type PaireMaillage,
  type TraceBassin,
  type TraceMaillage,
  type TraceSensibilite,
  type UniteLongueur,
} from "../../core/graph";
import { getBackend } from "../platform/backend";
import { AtelierApercu } from "./AtelierApercu";
import { useContexteTrace, useLegende, useTrace, useResultat } from "./hooks";
import { ChoixEtape } from "./Instants";

const fr = (x: number | null | undefined, ch = 3) =>
  x === null || x === undefined || !Number.isFinite(x)
    ? "—"
    : String(Number(x.toPrecision(ch)))
        .replace(".", ",")
        .replace("-", "−");
const mm = (m: number) => fr(m * 1000, 4);

function BoutonsLatex({ tex, nom }: { tex: () => string; nom: string }) {
  return (
    <div className="rangee-boutons">
      <button
        type="button"
        onClick={() => void getBackend().then((b) => b.copyText(tex()))}
      >
        Copier le tableau LaTeX (booktabs)
      </button>
      <button
        type="button"
        onClick={() =>
          void getBackend().then((b) => b.saveTextAs(tex(), nom, "tex"))
        }
      >
        Exporter .tex…
      </button>
    </div>
  );
}

// ---- Bassin de déflexion ----

export function ModeBassin() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceBassin>("bassin");
  const cas = avecSurface(c.exports);
  const choisis = t.fichiers
    ? cas.filter((e) => t.fichiers!.includes(e.nom))
    : cas;
  const dispo = expressionsCommunes(choisis.length ? choisis : cas);
  const [capteurs, setCapteurs] = useState(
    t.capteurs.map((x) => mm(x)).join(" ; "),
  );
  const [collage, setCollage] = useState("");
  const [uDist, setUDist] = useState<UniteLongueur>("mm");
  const [uDefl, setUDefl] = useState<"µm" | "mm" | "1/100 mm">("µm");
  const resultat = useResultat(t);
  const bs = resultat && "bassins" in resultat ? resultat.bassins : undefined;
  const ecarts =
    resultat && "ecartsMesure" in resultat ? resultat.ecartsMesure : undefined;
  const tex = () =>
    bs
      ? bassinsLatex(bs, { virgule: t.virgule, ...(ecarts ? { ecarts } : {}) })
      : "";
  const basculer = (nom: string, oui: boolean) => {
    const actuels = t.fichiers ?? cas.map((e) => e.nom);
    const n = oui ? [...actuels, nom] : actuels.filter((x) => x !== nom);
    maj({ fichiers: n.length === cas.length ? null : n });
  };
  return (
    <>
      <div className="atelier-reglages">
        <ChoixEtape mode="bassin" />
        <fieldset className="atelier-champ">
          <legend>
            Lignes de surface (profil horizontal en z = 0, ou haut d'une coupe
            x-z)
          </legend>
          {cas.map((e) => (
            <label key={e.nom} className="chip">
              <input
                type="checkbox"
                checked={!t.fichiers || t.fichiers.includes(e.nom)}
                onChange={(x) => basculer(e.nom, x.target.checked)}
              />
              {legende(e)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Déflexion</span>
          <select
            value={t.expression ?? ""}
            onChange={(e) => maj({ expression: e.target.value || null })}
          >
            <option value="">automatique (w / uz de chaque fichier)</option>
            {dispo.map((x) => (
              <option key={x} value={x}>
                {courtDe(choisis[0] ?? cas[0], x)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Centre de la charge, en mm sur la ligne (vide : au pic de déflexion)
          </span>
          <input
            defaultValue={t.centre === null ? "" : mm(t.centre)}
            placeholder="automatique"
            onBlur={(e) =>
              maj({
                centre: e.target.value.trim()
                  ? lireValeurs(e.target.value.replace(/−/g, "-"))[0]! / 1000
                  : null,
              })
            }
          />
        </label>
        <label className="field">
          <span>Géophones, distances au centre en mm</span>
          <input
            value={capteurs}
            onChange={(e) => setCapteurs(e.target.value)}
            onBlur={() =>
              maj({ capteurs: lireValeurs(capteurs).map((x) => x / 1000) })
            }
          />
        </label>
        <div className="rangee-boutons">
          <button
            type="button"
            className="small-btn"
            onClick={() => (
              setCapteurs(CAPTEURS_HWD.map(mm).join(" ; ")),
              maj({ capteurs: [...CAPTEURS_HWD] })
            )}
          >
            HWD standard
          </button>
          <button
            type="button"
            className="small-btn"
            onClick={() => (
              setCapteurs("0 ; 300 ; 600 ; 900"),
              maj({ capteurs: [0, 0.3, 0.6, 0.9] })
            )}
          >
            0 / 300 / 600 / 900
          </button>
        </div>
        <label className="field">
          <span>Rayon de courbure calculé à r = (mm)</span>
          <input
            defaultValue={mm(t.rayon)}
            onBlur={(e) =>
              lireValeurs(e.target.value)[0] &&
              maj({ rayon: lireValeurs(e.target.value)[0]! / 1000 })
            }
          />
        </label>
        <fieldset className="atelier-champ">
          <legend>Bassin mesuré (HWD, facultatif)</legend>
          {t.mesure ? (
            <p className="small">
              {t.mesure.r.length} géophones :{" "}
              {t.mesure.r
                .map((r, i) => `${mm(r)} mm → ${fr(t.mesure!.d[i]! * 1e6)} µm`)
                .join(" ; ")}{" "}
              <button
                type="button"
                className="lien"
                onClick={() => maj({ mesure: null })}
              >
                retirer
              </button>
            </p>
          ) : null}
          <textarea
            rows={4}
            value={collage}
            onChange={(e) => setCollage(e.target.value)}
            placeholder={
              "Coller « distance déflexion » par ligne :\n0 512\n200 431\n300 388…"
            }
          />
          <div className="comsol-ligne small">
            <span>distances en</span>
            <select
              value={uDist}
              onChange={(e) => setUDist(e.target.value as UniteLongueur)}
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
            <span>déflexions en</span>
            <select
              value={uDefl}
              onChange={(e) =>
                setUDefl(e.target.value as "µm" | "mm" | "1/100 mm")
              }
            >
              <option value="µm">µm</option>
              <option value="1/100 mm">1/100 mm</option>
              <option value="mm">mm</option>
            </select>
            <button
              type="button"
              className="small-btn"
              disabled={!collage.trim()}
              onClick={() => {
                const m = lireMesure(collage, {
                  distance: uDist,
                  deflexion: uDefl,
                });
                if (m.r.length) {
                  maj({ mesure: m });
                  setCollage("");
                }
              }}
            >
              Utiliser
            </button>
          </div>
        </fieldset>
        <label className="chip">
          <input
            type="checkbox"
            checked={t.virgule}
            onChange={(e) => maj({ virgule: e.target.checked })}
          />
          Virgule décimale dans le LaTeX
        </label>
      </div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Bassins
        </h3>
        {resultat && "erreur" in resultat ? (
          <p className="banner error">{resultat.erreur}</p>
        ) : null}
        {bs ? (
          <>
            <div className="comsol-synthese">
              <table>
                <thead>
                  <tr>
                    <th>Cas</th>
                    {t.capteurs.map((r) => (
                      <th key={r}>D{Math.round(r * 1000)}</th>
                    ))}
                    <th>SCI</th>
                    <th>BDI</th>
                    <th>BCI</th>
                    <th>AREA (mm)</th>
                    <th>R (m)</th>
                    {ecarts ? <th>Écart à la mesure</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {bs.map((b, i) => (
                    <tr key={b.fichier}>
                      <td
                        title={`${b.fichier} — centre en ${mm(b.centre)} mm ; déflexions en ${b.unite}`}
                      >
                        {b.legende}
                      </td>
                      {b.capteurs.map((x) => (
                        <td key={x.r}>{fr(x.d)}</td>
                      ))}
                      <td>{fr(b.indices.SCI)}</td>
                      <td>{fr(b.indices.BDI)}</td>
                      <td>{fr(b.indices.BCI)}</td>
                      <td>{fr(b.indices.AREA)}</td>
                      <td>{fr(b.indices.R)}</td>
                      {ecarts ? (
                        <td>
                          {ecarts[i]
                            ? `RMS ${fr(ecarts[i]!.relatif, 2)} %${ecarts[i]!.d0 !== null ? ` ; D0 ${ecarts[i]!.d0! >= 0 ? "+" : ""}${fr(ecarts[i]!.d0, 2)} %` : ""}`
                            : "—"}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              Déflexions en {bs[0]!.unite}, positives vers le bas, moyennées des
              deux côtés du centre quand la ligne les a. SCI = D0 − D300, BDI =
              D300 − D600, BCI = D600 − D900, AREA = 150 (D0 + 2 D300 + 2 D600 +
              D900) / D0, R = r² / (2 (D0 − Dr)).
            </p>
            <BoutonsLatex tex={tex} nom="bassins-comsol.tex" />
            <AtelierApercu
              resultat={resultat}
              trace={t}
              aide="Bassins (géophones en pointillés) :"
            />
          </>
        ) : !(resultat && "erreur" in resultat) ? (
          <div className="atelier-apercu vide">
            Cochez au moins une ligne de surface.
          </div>
        ) : null}
      </section>
    </>
  );
}

// ---- Convergence du maillage ----

export function ModeMaillage() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceMaillage>("maillage");
  const auto = pairesMaillage(c.exports);
  const paires = t.paires ?? auto;
  const nom = (n: string) => {
    const e = c.exports.find((x) => x.nom === n);
    return e ? legende(e) : n;
  };
  const [g, setG] = useState("");
  const [f, setF] = useState("");
  const es = paires.flatMap((p) =>
    c.exports.filter((e) => e.nom === p.grossier || e.nom === p.fin),
  );
  const dispo = expressionsCommunes(es);
  const resultat = useResultat(t);
  const lignes =
    resultat && "maillage" in resultat ? resultat.maillage : undefined;
  const problemes =
    resultat && "problemes" in resultat ? (resultat.problemes ?? []) : [];
  const tex = () =>
    lignes ? maillageLatex(lignes, nom, { virgule: t.virgule }) : "";
  const pire = lignes?.length
    ? lignes.reduce((a, b) =>
        Math.abs(b.ecartPic) > Math.abs(a.ecartPic) ? b : a,
      )
    : null;
  const poser = (l: PaireMaillage[]) => maj({ paires: l });
  return (
    <>
      <div className="atelier-reglages">
        <ChoixEtape mode="maillage" />
        <fieldset className="atelier-champ">
          <legend>Paires maillage grossier / maillage fin</legend>
          {paires.length ? (
            paires.map((p, i) => (
              <div
                key={`${p.grossier}|${p.fin}`}
                className="comsol-ligne small"
              >
                <span>
                  {nom(p.grossier)} <span className="muted">/</span>{" "}
                  {nom(p.fin)}
                </span>
                <button
                  type="button"
                  className="small-btn"
                  aria-label="Retirer"
                  onClick={() => poser(paires.filter((_, k) => k !== i))}
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <p className="muted small">
              Aucune paire trouvée d'après les noms (un mot terminé par « fin »
              : « EL » / « EL-fin »). Ajoutez-en une :
            </p>
          )}
          <div className="comsol-ligne small">
            <select
              value={g}
              onChange={(e) => setG(e.target.value)}
              aria-label="Maillage grossier"
            >
              <option value="">grossier…</option>
              {c.exports.map((e) => (
                <option key={e.nom} value={e.nom}>
                  {legende(e)}
                </option>
              ))}
            </select>
            <select
              value={f}
              onChange={(e) => setF(e.target.value)}
              aria-label="Maillage fin"
            >
              <option value="">fin…</option>
              {c.exports.map((e) => (
                <option key={e.nom} value={e.nom}>
                  {legende(e)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="small-btn"
              disabled={!g || !f || g === f}
              onClick={() => (
                poser([...paires, { grossier: g, fin: f }]),
                setG(""),
                setF("")
              )}
            >
              + Paire
            </button>
          </div>
          {t.paires ? (
            <button
              type="button"
              className="lien"
              onClick={() => maj({ paires: null })}
            >
              revenir aux paires trouvées d'après les noms ({auto.length})
            </button>
          ) : null}
        </fieldset>
        <fieldset className="atelier-champ">
          <legend>Grandeurs</legend>
          <div className="atelier-grandeurs">
            {dispo.map((x) => (
              <label key={x} className="chip">
                <input
                  type="checkbox"
                  checked={t.expressions.includes(x)}
                  onChange={(e) =>
                    maj({
                      expressions: e.target.checked
                        ? [...t.expressions, x]
                        : t.expressions.filter((y) => y !== x),
                    })
                  }
                />
                {courtDe(es[0], x)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>Diagramme</span>
          <select
            value={t.mesure}
            onChange={(e) =>
              maj({ mesure: e.target.value as TraceMaillage["mesure"] })
            }
          >
            <option value="pic">Écart sur le pic (%)</option>
            <option value="max">
              Plus grand écart point à point, rapporté au pic fin (%)
            </option>
            <option value="l2">Écart en norme L2 relative (%)</option>
          </select>
        </label>
        <label className="chip">
          <input
            type="checkbox"
            checked={t.virgule}
            onChange={(e) => maj({ virgule: e.target.checked })}
          />
          Virgule décimale dans le LaTeX
        </label>
      </div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Écarts entre maillages
        </h3>
        {resultat && "erreur" in resultat ? (
          <p className="banner error" style={{ whiteSpace: "pre-line" }}>
            {resultat.erreur}
          </p>
        ) : null}
        {problemes.length ? (
          <p className="banner" style={{ whiteSpace: "pre-line" }}>
            {problemes.join("\n")}
          </p>
        ) : null}
        {lignes ? (
          <>
            <div className="comsol-synthese">
              <table>
                <thead>
                  <tr>
                    <th>Cas (grossier / fin)</th>
                    <th>Grandeur</th>
                    <th>Pic grossier</th>
                    <th>Pic fin</th>
                    <th>Écart pic</th>
                    <th>Plus grand écart</th>
                    <th>L2</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, i) => (
                    <tr
                      key={i}
                      title={
                        l.methode === "points"
                          ? `${l.points} points communs`
                          : `${l.points} points, maillage fin interpolé aux points du grossier`
                      }
                    >
                      <td>
                        {nom(l.paire.grossier)} / {nom(l.paire.fin)}
                      </td>
                      <td>
                        {l.libelle.court} ({l.libelle.unite})
                      </td>
                      <td>{fr(l.picGrossier, 4)}</td>
                      <td>{fr(l.picFin, 4)}</td>
                      <td
                        className={
                          Math.abs(l.ecartPic) > 2
                            ? "atelier-avert"
                            : "atelier-suivi"
                        }
                      >
                        {fr(l.ecartPic, 2)} %
                      </td>
                      <td>
                        {fr(l.ecartMaxRelatif, 2)} %{" "}
                        {l.ecartMax > 0 ? (
                          <span className="muted small">
                            (
                            {Object.entries(l.position)
                              .map(([k, v]) => `${k.toLowerCase()} ${fr(v, 4)}`)
                              .join(", ")}
                            )
                          </span>
                        ) : null}
                      </td>
                      <td>{fr(l.l2, 2)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pire ? (
              <p className="small">
                Plus grand écart sur le pic :{" "}
                <strong>{fr(pire.ecartPic, 2)} %</strong> (
                {nom(pire.paire.grossier)}, {pire.libelle.court}).{" "}
                {Math.abs(pire.ecartPic) <= 2
                  ? "Le maillage grossier suffit pour les pics (écart ≤ 2 %)."
                  : "Écart > 2 % : le maillage grossier n'est pas convergé pour cette grandeur."}
              </p>
            ) : null}
            <BoutonsLatex tex={tex} nom="maillage-comsol.tex" />
            <AtelierApercu
              resultat={resultat}
              trace={t}
              aide="Écarts (le maillage fin sert de référence) :"
            />
          </>
        ) : !(resultat && "erreur" in resultat) ? (
          <div className="atelier-apercu vide">
            Choisissez au moins une paire et une grandeur.
          </div>
        ) : null}
      </section>
    </>
  );
}

// ---- Sensibilité à un paramètre ----

export function ModeSensibilite() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceSensibilite>("sensibilite");
  const src = sourcesSensibilite(c.exports);
  const params = t.source === "instants" ? src.instants : src.fichiers;
  const candidats = candidatsSensibilite(c.exports, t.source, t.parametre);
  const choisis = t.fichiers ? candidats.filter((e) => t.fichiers!.includes(e.nom)) : candidats;
  const dispo = expressionsCommunes(choisis.length ? choisis : candidats);
  const plans = choisis.filter((e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere);
  const [px, setPx] = useState(t.point ? String(t.point.x) : "");
  const [py, setPy] = useState(t.point ? String(t.point.y) : "");
  const resultat = useResultat(t);
  const series = resultat && "sensibilite" in resultat ? resultat.sensibilite : undefined;
  const unite = params.find((p) => p.nom === t.parametre)?.unite ?? "";
  const tex = () => (series && t.parametre && t.expression && choisis[0] ? sensibiliteLatex(series, { parametre: t.parametre, unite, libelle: libelleDe(choisis[0], t.expression), virgule: t.virgule }) : "");
  const basculer = (nom: string, oui: boolean) => {
    const actuels = t.fichiers ?? candidats.map((e) => e.nom);
    const n = oui ? [...actuels, nom] : actuels.filter((x) => x !== nom);
    maj({ fichiers: n.length === candidats.length ? null : n });
  };
  const xs = series ? [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b) : [];
  const g0 = plans[0] ? geometrie(plans[0]) : null;
  const [nh, nv] = g0 && plans[0] ? (g0.varient.map((k) => plans[0]!.coordonnees[k]!.toLowerCase()) as [string, string]) : ["x", "z"];
  return (
    <>
      <div className="atelier-reglages">
        {t.source === "fichiers" ? <ChoixEtape mode="sensibilite" /> : null}
        <fieldset className="atelier-champ">
          <legend>Le paramètre varie…</legend>
          <label className="chip">
            <input type="radio" checked={t.source === "instants"} disabled={!src.instants.length} onChange={() => maj({ source: "instants", parametre: null, fichiers: null })} />
            dans un même fichier (balayage, instants : colonnes « @ E=… », « @ t=… »)
          </label>
          <label className="chip">
            <input type="radio" checked={t.source === "fichiers"} disabled={!src.fichiers.length} onChange={() => maj({ source: "fichiers", parametre: null, fichiers: null })} />
            d'un fichier à l'autre (paramètre de l'en-tête : lc=1, lc=2…)
          </label>
        </fieldset>
        <label className="field">
          <span>Paramètre</span>
          <select value={t.parametre ?? ""} onChange={(e) => maj({ parametre: e.target.value, fichiers: null })}>
            {params.map((p) => (
              <option key={p.nom} value={p.nom}>
                {p.nom}
                {p.unite ? ` (${p.unite})` : ""}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="atelier-champ">
          <legend>Fichiers</legend>
          {candidats.map((e) => (
            <label key={e.nom} className="chip">
              <input type="checkbox" checked={!t.fichiers || t.fichiers.includes(e.nom)} onChange={(x) => basculer(e.nom, x.target.checked)} />
              {legende(e)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>Grandeur</span>
          <select value={t.expression ?? ""} onChange={(e) => maj({ expression: e.target.value })}>
            {dispo.map((x) => (
              <option key={x} value={x}>
                {courtDe(choisis[0] ?? candidats[0], x)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="atelier-champ">
          <legend>Valeur retenue</legend>
          <label className="chip">
            <input type="radio" checked={!t.point} onChange={() => maj({ point: null })} />
            extremum sur tout le fichier :
          </label>
          <select value={t.statistique} disabled={!!t.point} onChange={(e) => maj({ statistique: e.target.value as TraceSensibilite["statistique"] })}>
            <option value="abs">plus grande valeur absolue</option>
            <option value="max">maximum</option>
            <option value="min">minimum</option>
          </select>
          {plans.length ? (
            <>
              <label className="chip">
                <input type="radio" checked={!!t.point} onChange={() => maj({ point: { x: Number(px.replace(",", ".")) || 0, y: Number(py.replace(",", ".")) || 0 } })} />
                valeur en un point des coupes ({c.cadre.longueur}) :
              </label>
              <div className="comsol-ligne small">
                <span>{nh} =</span>
                <input value={px} onChange={(e) => setPx(e.target.value)} onBlur={() => t.point && maj({ point: { x: Number(px.replace(",", ".").replace("−", "-")) || 0, y: t.point.y } })} aria-label="Abscisse du point" />
                <span>{nv} =</span>
                <input value={py} onChange={(e) => setPy(e.target.value)} onBlur={() => t.point && maj({ point: { x: t.point.x, y: Number(py.replace(",", ".").replace("−", "-")) || 0 } })} aria-label="Ordonnée du point" />
              </div>
            </>
          ) : null}
        </fieldset>
        <label className="chip">
          <input type="checkbox" checked={t.virgule} onChange={(e) => maj({ virgule: e.target.checked })} />
          Virgule décimale dans le LaTeX
        </label>
      </div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Sensibilité
        </h3>
        {resultat && "erreur" in resultat ? <p className="banner error">{resultat.erreur}</p> : null}
        {series ? (
          <>
            <div className="comsol-synthese">
              <table>
                <thead>
                  <tr>
                    <th>
                      {t.parametre}
                      {unite ? ` (${unite})` : ""}
                    </th>
                    {series.map((s) => (
                      <th key={s.nom}>{s.nom}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {xs.map((x) => (
                    <tr key={x}>
                      <td>{fr(x, 4)}</td>
                      {series.map((s) => {
                        const p = s.points.find((q) => q.x === x);
                        return (
                          <td key={s.nom} title={p?.position ? Object.entries(p.position).map(([k, v]) => `${k.toLowerCase()} = ${fr(v, 4)}`).join(", ") : undefined}>
                            {fr(p?.y, 4)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BoutonsLatex tex={tex} nom="sensibilite-comsol.tex" />
            <AtelierApercu resultat={resultat} trace={t} />
          </>
        ) : !(resultat && "erreur" in resultat) ? (
          <div className="atelier-apercu vide">Choisissez un paramètre, des fichiers et une grandeur.</div>
        ) : null}
      </section>
    </>
  );
}
