/**
 * Panneau « Exports COMSOL » de la page Graphes : un ou plusieurs exports « Données » de COMSOL (.txt),
 * profils superposés en un clic (une série par fichier ou par expression, légendes automatiques), profil
 * extrait d'une coupe, carte en couleurs d'une coupe. Tout aboutit à un graphe modifiable (axes, couleurs,
 * bornes, taille…) ; la lecture d'un fichier se corrige si la détection automatique s'est trompée.
 */
import { useMemo, useState } from "react";
import {
  descriptionGeometrie,
  extraireProfil,
  geometrie,
  grapheCarte,
  grapheProfils,
  lecturesPossibles,
  legendeCarte,
  legendes,
  libelleExpression,
  parametresDe,
  type ExportComsol,
  type UniteLongueur,
} from "../../core/graph";
import { useGraph } from "./useGraph";

const nf = (x: number) => String(Number(x.toPrecision(5))).replace(".", ",");
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");

export function Comsol() {
  const s = useGraph();
  const exports = s.comsol;
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [choisies, setChoisies] = useState<string[] | null>(null);
  const [longueur, setLongueur] = useState<UniteLongueur>("mm");
  const [profondeur, setProfondeur] = useState(false);
  const [orientation, setOrientation] = useState<"auto" | "verticale" | "horizontale">("auto");
  const [iCoupe, setICoupe] = useState(0);
  const [exprCarte, setExprCarte] = useState<string | null>(null);
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
  const enZ = profils.length > 0 && profils.every(({ e }) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));

  const coupe = coupes[Math.min(iCoupe, coupes.length - 1)]?.e;
  const gc = coupe ? geometrie(coupe) : null;
  const exprC = coupe ? (exprCarte && coupe.colonnes.some((c) => c.expression === exprCarte) ? exprCarte : (coupe.colonnes.find((c) => /eZZ$/i.test(c.expression)) ?? coupe.colonnes[0])?.expression) : undefined;

  const remplacer = (doc: Parameters<typeof s.tracerComsol>[0], titre: string) => {
    if ((s.doc.series.length || s.doc.carte) && !window.confirm("Remplacer le graphe en cours ?")) return;
    s.tracerComsol(doc, titre);
  };

  function tracer() {
    try {
      const doc = grapheProfils(
        profils.map((p) => p.e),
        { expressions: actives, longueur, profondeur, orientation, noms: profils.map((p) => legende(p.i)) },
      );
      const titre = actives.length === 1 ? `${libelleExpression(profils[0]!.e.colonnes.find((c) => c.expression === actives[0])!).court} — ${profils.length} profil(s) COMSOL` : `Profils COMSOL — ${profils.map((p) => legende(p.i)).join(", ")}`;
      remplacer(doc, titre);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function tracerCarte() {
    if (!coupe || !exprC) return;
    try {
      remplacer(grapheCarte(coupe, exprC, longueur), `${sansExt(coupe.nom)} — ${legendeCarte(coupe, exprC)}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function ajouterProfil() {
    if (!coupe || !ligne) return;
    useGraph.setState({ comsol: [...exports, extraireProfil(coupe, ligne.fixe, ligne.valeur)] });
  }

  /** Lecture imposée d'un fichier (null : détection automatique). */
  function lire(i: number, forcer: number[] | null) {
    const e: ExportComsol = { ...exports[i]! };
    if (forcer) e.forcer = forcer;
    else delete e.forcer;
    useGraph.setState({ comsol: exports.map((x, k) => (k === i ? e : x)) });
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
                <strong>{sansExt(e.nom)}</strong>
                <button type="button" className="small-btn" aria-label={`Retirer ${e.nom}`} onClick={() => s.retirerComsol(i)}>
                  ×
                </button>
              </div>
              <select
                className="small-select"
                aria-label="Lecture du fichier"
                title="Si la détection automatique s'est trompée : choisir la coordonnée du profil, ou les axes de la coupe"
                value={e.forcer ? e.forcer.join(",") : ""}
                onChange={(x) => lire(i, x.target.value ? x.target.value.split(",").map(Number) : null)}
              >
                <option value="">{e.forcer ? "Détection automatique" : `Auto : ${descriptionGeometrie({ ...e, forcer: undefined })}`}</option>
                {lecturesPossibles(e).map((l) => (
                  <option key={l.forcer.join(",")} value={l.forcer.join(",")}>
                    {l.libelle}
                  </option>
                ))}
              </select>
              {e.forcer ? <span className="muted small">{descriptionGeometrie(e)}</span> : null}
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

      {exports.length ? (
        <label className="field">
          <span>Longueurs en</span>
          <select value={longueur} onChange={(e) => setLongueur(e.target.value as UniteLongueur)}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </label>
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
          <label className="field">
            <span>Tracé</span>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as typeof orientation)}>
              <option value="auto">Auto ({enZ ? "valeur en abscisse, cote en ordonnée" : "position en abscisse"})</option>
              <option value="verticale">Valeur en abscisse, position en ordonnée</option>
              <option value="horizontale">Position en abscisse, valeur en ordonnée</option>
            </select>
          </label>
          {enZ && orientation !== "horizontale" ? (
            <label className="chip">
              <input type="checkbox" checked={profondeur} onChange={(e) => setProfondeur(e.target.checked)} />
              profondeur positive (vers le bas)
            </label>
          ) : null}
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
          <button type="button" className="primary" onClick={tracerCarte} title="Carte en couleurs, modifiable ensuite comme un graphe : palette, bornes, niveaux, axes, taille">
            Tracer la carte
          </button>
          <div className="comsol-extraire">
            <span className="muted small">Ou extraire un profil :</span>
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
        </>
      ) : null}
    </section>
  );
}
