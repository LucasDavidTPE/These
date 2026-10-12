/**
 * Panneau « Exports COMSOL » de la page Graphes : un ou plusieurs exports « Données » de COMSOL (.txt),
 * profils superposés en un clic (une série par fichier ou par expression, légende tirée des paramètres de
 * l'étude), profil extrait d'une coupe, carte en couleurs d'une coupe.
 */
import { useMemo, useState } from "react";
import {
  carte,
  carteSvg,
  descriptionGeometrie,
  extraireProfil,
  geometrie,
  grapheProfils,
  legendeCarte,
  legendes,
  libelleExpression,
  parametresDe,
  type ExportComsol,
  type UniteLongueur,
} from "../../core/graph";
import { getBackend } from "../platform/backend";
import { useGraph } from "./useGraph";

const nf = (x: number) => String(Number(x.toPrecision(5))).replace(".", ",");

function calculerCarte(coupe: ExportComsol, exprC: string, longueur: UniteLongueur, exageration: number | null): { svg: string; exa: number } | null {
  try {
    const m = carte(coupe, exprC, longueur);
    const lx = m.x.at(-1)! - m.x[0]!;
    const ly = m.y.at(-1)! - m.y[0]!;
    const exa = exageration ?? Math.max(1, Math.round(lx / ly / 3));
    return { svg: carteSvg(m, { titre: `${coupe.nom.replace(/\.(txt|csv|dat)$/i, "")} — ${legendeCarte(coupe, exprC)}`, legende: legendeCarte(coupe, exprC), uniteLongueur: longueur, exageration: exa }), exa };
  } catch {
    return null;
  }
}

export function Comsol() {
  const s = useGraph();
  const exports = s.comsol;
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [choisies, setChoisies] = useState<string[] | null>(null);
  const [longueur, setLongueur] = useState<UniteLongueur>("mm");
  const [profondeur, setProfondeur] = useState(false);
  const [iCoupe, setICoupe] = useState(0);
  const [exprCarte, setExprCarte] = useState<string | null>(null);
  const [exageration, setExageration] = useState<number | null>(null);
  const [ligne, setLigne] = useState<{ fixe: number; valeur: number } | null>(null);

  const profils = exports.map((e, i) => ({ e, i })).filter(({ e }) => geometrie(e).genre === "profil");
  // légendes calculées entre profils seulement (les coupes ne se tracent pas en courbes)
  const auto = useMemo(() => legendes(exports.filter((e) => geometrie(e).genre === "profil")), [exports]);
  const legende = (i: number) => noms[exports[i]!.nom] ?? auto[profils.findIndex((p) => p.i === i)] ?? exports[i]!.nom;
  const coupes = exports.map((e, i) => ({ e, i })).filter(({ e }) => geometrie(e).genre === "coupe" && geometrie(e).reguliere);
  // expressions communes aux profils (dans l'ordre du premier)
  const expressions = profils.length ? profils[0]!.e.colonnes.map((c) => c.expression).filter((x) => profils.every(({ e }) => e.colonnes.some((c) => c.expression === x))) : [];
  const parDefaut = expressions.find((x) => /eZZ$/i.test(x)) ?? expressions[0];
  const actives = (choisies ?? (parDefaut ? [parDefaut] : [])).filter((x) => expressions.includes(x));
  const vertical = profils.length > 0 && profils.every(({ e }) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));

  const coupe = coupes[Math.min(iCoupe, coupes.length - 1)]?.e;
  const gc = coupe ? geometrie(coupe) : null;
  const exprC = coupe ? (exprCarte && coupe.colonnes.some((c) => c.expression === exprCarte) ? exprCarte : (coupe.colonnes.find((c) => /eZZ$/i.test(c.expression)) ?? coupe.colonnes[0])?.expression) : undefined;
  const laCarte = coupe && exprC ? calculerCarte(coupe, exprC, longueur, exageration) : null;

  function tracer() {
    try {
      const doc = grapheProfils(
        profils.map((p) => p.e),
        { expressions: actives, longueur, profondeur, noms: profils.map((p) => legende(p.i)) },
      );
      const titre = actives.length === 1 ? `${libelleExpression(profils[0]!.e.colonnes.find((c) => c.expression === actives[0])!).court} — ${profils.length} profil(s) COMSOL` : `Profils COMSOL — ${profils.map((p) => legende(p.i)).join(", ")}`;
      if (s.doc.series.length && !window.confirm("Remplacer le graphe en cours par ces profils ?")) return;
      s.tracerComsol(doc, titre);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function ajouterProfil() {
    if (!coupe || !ligne) return;
    useGraph.setState({ comsol: [...exports, extraireProfil(coupe, ligne.fixe, ligne.valeur)] });
  }

  return (
    <section className="comsol-panneau">
      <h3>Exports COMSOL</h3>
      <p className="muted small">Fichiers « Données » exportés de COMSOL (.txt) : profils sur une ligne, coupes sur un plan. Plusieurs fichiers = courbes superposées.</p>
      <button type="button" onClick={() => void s.ouvrirComsol()} disabled={s.busy}>
        Ouvrir des exports COMSOL…
      </button>
      {exports.length ? (
        <ul className="comsol-liste">
          {exports.map((e, i) => (
            <li key={`${e.nom}-${i}`} title={`${e.meta.Model ?? ""} · ${e.meta.Date ?? ""}\n${Object.entries(parametresDe(e)).map(([k, v]) => `${k} = ${v}`).join(", ")}`}>
              <div className="comsol-tete">
                <strong>{e.nom.replace(/\.(txt|csv|dat)$/i, "")}</strong>
                <button type="button" className="small-btn" aria-label={`Retirer ${e.nom}`} onClick={() => s.retirerComsol(i)}>
                  ×
                </button>
              </div>
              <span className="muted small">{descriptionGeometrie(e)}</span>
              {geometrie(e).genre === "profil" ? (
                <label className="field comsol-nom">
                  <span>Légende</span>
                  <input value={legende(i)} onChange={(x) => setNoms({ ...noms, [e.nom]: x.target.value })} />
                </label>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {profils.length ? (
        <>
          <h4>Profils</h4>
          <div className="comsol-expressions">
            {expressions.map((x) => {
              const l = libelleExpression(profils[0]!.e.colonnes.find((c) => c.expression === x)!);
              return (
                <label key={x} className="chip" title={x}>
                  <input type="checkbox" checked={actives.includes(x)} onChange={(ev) => setChoisies(ev.target.checked ? [...actives, x] : actives.filter((y) => y !== x))} />
                  {l.court}
                </label>
              );
            })}
          </div>
          <div className="grid2">
            <label className="field">
              <span>Longueurs en</span>
              <select value={longueur} onChange={(e) => setLongueur(e.target.value as UniteLongueur)}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            {vertical ? (
              <label className="chip">
                <input type="checkbox" checked={profondeur} onChange={(e) => setProfondeur(e.target.checked)} />
                profondeur positive
              </label>
            ) : null}
          </div>
          <button type="button" className="primary" disabled={!actives.length} onClick={tracer}>
            Tracer {profils.length > 1 ? `les ${profils.length} profils` : "le profil"}
          </button>
        </>
      ) : null}

      {coupe && gc && exprC ? (
        <>
          <h4>Coupe</h4>
          {coupes.length > 1 ? (
            <label className="field">
              <span>Coupe</span>
              <select value={iCoupe} onChange={(e) => setICoupe(Number(e.target.value))}>
                {coupes.map(({ e }, k) => (
                  <option key={k} value={k}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Grandeur</span>
            <select value={exprC} onChange={(e) => setExprCarte(e.target.value)}>
              {coupe.colonnes.map((c) => (
                <option key={c.expression} value={c.expression}>
                  {legendeCarte(coupe, c.expression)}
                </option>
              ))}
            </select>
          </label>
          <div className="comsol-extraire">
            <span className="muted small">Extraire un profil :</span>
            {gc.varient.map((k, n) => (
              <label key={k} className="field">
                <span>
                  à {coupe.coordonnees[k]} = ({coupe.uniteLongueur})
                </span>
                <select value={ligne?.fixe === k ? String(ligne.valeur) : ""} onChange={(e) => setLigne(e.target.value === "" ? null : { fixe: k, valeur: Number(e.target.value) })}>
                  <option value="">—</option>
                  {gc.grilles[n]!.map((v) => (
                    <option key={v} value={String(v)}>
                      {nf(v)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button type="button" disabled={!ligne} onClick={ajouterProfil} title="Le profil rejoint la liste et se trace avec les autres">
              Ajouter ce profil
            </button>
          </div>
          {laCarte ? (
            <>
              <label className="field">
                <span>Exagération verticale de la carte (×)</span>
                <input type="number" min={1} max={50} step={1} value={laCarte.exa} onChange={(e) => setExageration(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              <div className="comsol-carte" dangerouslySetInnerHTML={{ __html: laCarte.svg }} />
              <div className="row">
                <button type="button" onClick={() => void s.enregistrerCarte(laCarte.svg, `${coupe.nom.replace(/\.(txt|csv|dat)$/i, "")} — ${legendeCarte(coupe, exprC)}`, `COMSOL : ${coupe.meta.Model ?? coupe.nom}`)}>
                  Enregistrer la carte
                </button>
                <button type="button" onClick={() => void getBackend().then((b) => b.saveTextAs(laCarte.svg, `${coupe.nom.replace(/\.(txt|csv|dat)$/i, "")}.svg`, "svg"))}>
                  SVG…
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
