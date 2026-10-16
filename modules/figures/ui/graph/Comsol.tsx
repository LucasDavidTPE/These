/**
 * Panneau « Exports COMSOL » de la page Graphes : exports « Données » (profils, coupes) et exports de tables
 * (séries temporelles). Profils superposés, carte d'une coupe, profils interpolés, séries temporelles (pic,
 * référence), opérations entre fichiers, colonnes calculées, changement de repère, tableau de synthèse.
 * Tout aboutit à un graphe modifiable (axes, couleurs, repères…) ; la lecture d'un fichier se corrige si la
 * détection automatique s'est trompée. Les correspondances de légende et les interfaces de couches sont
 * réglées une fois pour toute la bibliothèque.
 */
import { useEffect, useMemo, useState } from "react";
import {
  OPERATIONS,
  ajouterColonne,
  changerRepere,
  combiner,
  descriptionGeometrie,
  geometrie,
  grapheBarres,
  grapheCarte,
  grapheProfils,
  grapheTemporel,
  lecturesPossibles,
  legendeCarte,
  legendes,
  libelleColonne,
  lireValeurs,
  motsDuNom,
  nomsColonnes,
  parametresDe,
  pic,
  profilsInterpoles,
  synthese,
  syntheseLatex,
  type ExportComsol,
  type GraphDoc,
  type LigneSynthese,
  type ModePic,
  type Operation,
  type SourceLegende,
  type Statistique,
  type UniteLongueur,
} from "../../core/graph";
import { getBackend } from "../platform/backend";
import { useGraph } from "./useGraph";
import { useReglagesComsol } from "./useReglagesComsol";

const nf = (x: number) => String(Number(x.toPrecision(5))).replace(".", ",");
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
const nombre = (t: string) => Number(t.trim().replace(",", "."));

/** Expressions communes à des exports (dans l'ordre du premier). */
const communes = (es: readonly ExportComsol[]) => (es.length ? es[0]!.colonnes.map((c) => c.expression).filter((x) => es.every((e) => e.colonnes.some((c) => c.expression === x))) : []);
const court = (e: ExportComsol, x: string) => {
  const c = e.colonnes.find((k) => k.expression === x);
  return c ? libelleColonne(c).court : x;
};

function alerte(e: unknown) {
  window.alert(e instanceof Error ? e.message : String(e));
}

export function Comsol() {
  const s = useGraph();
  const exports = s.comsol;
  const reg = useReglagesComsol();
  useEffect(() => {
    void useReglagesComsol.getState().charger();
  }, []);
  const [noms, setNoms] = useState<Record<string, string>>({});
  const [exclus, setExclus] = useState<string[]>([]);
  const [outils, setOutils] = useState<number | null>(null);
  const [source, setSource] = useState<SourceLegende>("auto");
  const [longueur, setLongueur] = useState<UniteLongueur>("mm");
  const [couches, setCouches] = useState(false);

  const majListe = (liste: ExportComsol[]) => useGraph.setState({ comsol: liste });
  const ajouter = (nouveaux: ExportComsol[]) => majListe([...exports, ...nouveaux]);
  const remplacer = (doc: GraphDoc, titre: string) => {
    if ((s.doc.series.length || s.doc.carte) && !window.confirm("Remplacer le graphe en cours ?")) return;
    s.tracerComsol(doc, titre);
  };
  const interfaces = couches ? reg.reglages.interfaces : undefined;

  // légendes : entre fichiers de même genre, avec les correspondances de la bibliothèque
  const genre = (e: ExportComsol) => geometrie(e).genre;
  const auto = useMemo(() => {
    const out = new Map<ExportComsol, string>();
    for (const g of ["profil", "serie", "coupe"] as const) {
      const es = exports.filter((e) => geometrie(e).genre === g);
      legendes(es, { correspondances: reg.reglages.correspondances, source }).forEach((l, k) => out.set(es[k]!, l));
    }
    return out;
  }, [exports, reg.reglages.correspondances, source]);
  const legende = (e: ExportComsol) => noms[e.nom] ?? auto.get(e) ?? sansExt(e.nom);

  const profils = exports.filter((e) => genre(e) === "profil");
  const profilsTraces = profils.filter((e) => !exclus.includes(e.nom));
  const tables = exports.filter((e) => genre(e) === "serie");
  const coupes = exports.filter((e) => genre(e) === "coupe" && geometrie(e).reguliere);

  /** Lecture imposée d'un fichier (null : détection automatique). */
  function lire(i: number, forcer: number[] | null) {
    const e: ExportComsol = { ...exports[i]! };
    if (forcer) e.forcer = forcer;
    else delete e.forcer;
    majListe(exports.map((x, k) => (k === i ? e : x)));
  }

  return (
    <section className="comsol-panneau">
      <h3>Exports COMSOL</h3>
      <p className="muted small">Exports « Données » (.txt : profils sur une ligne, coupes sur un plan) et exports de tables (signal en un point au cours du temps). Plusieurs fichiers = courbes superposées.</p>
      <button type="button" onClick={() => void s.ouvrirComsol()} disabled={s.busy}>
        Ouvrir des exports COMSOL…
      </button>
      {exports.length ? (
        <ul className="comsol-liste">
          {exports.map((e, i) => (
            <li key={`${e.nom}-${i}`} title={`${e.meta.Model ?? ""} · ${e.meta.Date ?? ""}\n${Object.entries(parametresDe(e)).map(([k, v]) => `${k} = ${v}`).join(", ")}`}>
              <div className="comsol-tete">
                {genre(e) === "profil" ? (
                  <input type="checkbox" checked={!exclus.includes(e.nom)} onChange={(x) => setExclus(x.target.checked ? exclus.filter((n) => n !== e.nom) : [...exclus, e.nom])} aria-label="Tracer ce profil" title="Tracé avec les autres profils" />
                ) : null}
                <strong>{sansExt(e.nom)}</strong>
                <button type="button" className="small-btn" title="Colonnes calculées, changement de repère" aria-expanded={outils === i} onClick={() => setOutils(outils === i ? null : i)}>
                  ƒ
                </button>
                <button type="button" className="small-btn" aria-label={`Retirer ${e.nom}`} onClick={() => majListe(exports.filter((_, k) => k !== i))}>
                  ×
                </button>
              </div>
              {e.nature === "table" ? (
                <span className="muted small">{descriptionGeometrie(e)}</span>
              ) : (
                <>
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
                </>
              )}
              {e.repere ? <span className="muted small">Repère : {Object.entries(e.repere).map(([k, r]) => `${e.coordonnees[Number(k)]} → ${r.facteur < 0 ? "−" : ""}(${e.coordonnees[Number(k)]}${r.origine ? ` − ${nf(r.origine)}` : ""})`).join(", ")}</span> : null}
              {genre(e) === "profil" || genre(e) === "serie" ? (
                <label className="field comsol-nom">
                  <span>Légende</span>
                  <input value={legende(e)} onChange={(x) => setNoms({ ...noms, [e.nom]: x.target.value })} />
                </label>
              ) : null}
              {outils === i ? <OutilsFichier e={e} remplacer={(n) => majListe(exports.map((x, k) => (k === i ? n : x)))} /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {exports.length ? (
        <>
          <div className="grid2">
            <label className="field">
              <span>Longueurs en</span>
              <select value={longueur} onChange={(e) => setLongueur(e.target.value as UniteLongueur)}>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            <label className="field">
              <span>Légendes depuis</span>
              <select value={source} onChange={(e) => setSource(e.target.value as SourceLegende)}>
                <option value="auto">Auto (nom, sinon paramètres)</option>
                <option value="nom">Mots du nom de fichier</option>
                <option value="parametres">Paramètres (@ lc=…, VE=…)</option>
                <option value="les-deux">Les deux</option>
              </select>
            </label>
          </div>
          <label className="chip" title="Lignes aux interfaces de couches (réglées ci-dessous, pour toute la bibliothèque)">
            <input type="checkbox" checked={couches} onChange={(e) => setCouches(e.target.checked)} />
            Repères des couches ({reg.reglages.interfaces.map((i) => i.texte || nf(i.z)).join(", ") || "aucune"})
          </label>
          <ReglagesPartages />
        </>
      ) : null}

      {exports.length >= 2 ? <Operations exports={exports} legende={legende} ajouter={ajouter} /> : null}

      {profils.length ? (
        <Profils
          profils={profilsTraces}
          legende={legende}
          longueur={longueur}
          tracer={remplacer}
          interfaces={interfaces}
        />
      ) : null}

      {tables.length ? <Temporel tables={tables} tous={exports} legende={legende} remplacer={remplacer} /> : null}

      {coupes.length ? <Coupes coupes={coupes} longueur={longueur} interfaces={interfaces} remplacer={remplacer} ajouter={ajouter} /> : null}

      {exports.length ? <Synthese exports={exports} longueur={longueur} remplacer={remplacer} /> : null}
    </section>
  );
}

/** Colonne calculée et changement de repère d'un fichier. */
function OutilsFichier({ e, remplacer }: { e: ExportComsol; remplacer: (n: ExportComsol) => void }) {
  const [formule, setFormule] = useState("");
  const [nom, setNom] = useState("");
  const [unite, setUnite] = useState("");
  const [k, setK] = useState(Math.max(0, e.coordonnees.findIndex((c) => /^z$/i.test(c))));
  const [signe, setSigne] = useState(false);
  const [origine, setOrigine] = useState("0");
  const disponibles = [...nomsColonnes(e).keys()].filter((n) => !/^c\d+$/.test(n));
  return (
    <div className="comsol-outils">
      <h5>Colonne calculée</h5>
      <label className="field">
        <span>Formule</span>
        <input value={formule} onChange={(x) => setFormule(x.target.value)} placeholder="abs(ezz) · max(e1, 0) · 0.5*(exx + eyy) · -1e-3*w" />
      </label>
      <p className="muted small">
        Noms : {disponibles.join(", ")} (ou c1, c2… par n° de colonne). Fonctions : abs, max, min, sqrt, exp, ln, log10, sign. Point décimal.
      </p>
      <div className="grid2">
        <label className="field">
          <span>Nom</span>
          <input value={nom} onChange={(x) => setNom(x.target.value)} placeholder="|εzz|" />
        </label>
        <label className="field">
          <span>Unité</span>
          <input value={unite} onChange={(x) => setUnite(x.target.value)} placeholder="µdef" />
        </label>
      </div>
      <button
        type="button"
        disabled={!formule.trim()}
        onClick={() => {
          try {
            remplacer(ajouterColonne(e, { formule, nom, unite }));
            setFormule("");
            setNom("");
          } catch (x) {
            alerte(x);
          }
        }}
      >
        Ajouter la colonne
      </button>
      {e.nature !== "table" ? (
        <>
          <h5>Repère</h5>
          <div className="grid2">
            <label className="field">
              <span>Coordonnée</span>
              <select value={k} onChange={(x) => setK(Number(x.target.value))}>
                {e.coordonnees.map((c, j) => (
                  <option key={c} value={j}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Origine ({e.uniteLongueur})</span>
              <input value={origine} onChange={(x) => setOrigine(x.target.value)} title="Nouvelle coordonnée = ± (ancienne − origine) : y0 de la roue pour centrer" />
            </label>
          </div>
          <label className="chip">
            <input type="checkbox" checked={signe} onChange={(x) => setSigne(x.target.checked)} />
            Changer le sens (z → profondeur positive)
          </label>
          <div className="rangee-boutons">
            <button
              type="button"
              onClick={() => {
                const o = nombre(origine);
                if (!Number.isFinite(o)) return alerte("Origine : un nombre.");
                remplacer(changerRepere(e, k, { facteur: signe ? -1 : 1, origine: o }));
              }}
            >
              Appliquer
            </button>
            {e.repere ? (
              <button
                type="button"
                title="Revenir aux coordonnées du fichier"
                onClick={() => {
                  let r = e;
                  // inverse de nouvelle = f (v − o) : v = (1/f) (nouvelle + f o)
                  for (const [j, t] of Object.entries(e.repere ?? {})) r = changerRepere(r, Number(j), { facteur: 1 / t.facteur, origine: -t.facteur * t.origine });
                  remplacer({ ...r, repere: undefined });
                }}
              >
                Repère d'origine
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Correspondances de légende et interfaces de couches, partagées par toute la bibliothèque. */
function ReglagesPartages() {
  const reg = useReglagesComsol();
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState(reg.reglages);
  const [vu, setVu] = useState(reg.reglages);
  if (vu !== reg.reglages) {
    setVu(reg.reglages);
    setBrouillon(reg.reglages);
  }
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(reg.reglages);
  return (
    <div className="comsol-reglages">
      <button type="button" className="small-btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? "▾" : "▸"} Correspondances et couches (toute la bibliothèque)
      </button>
      {ouvert ? (
        <>
          <p className="muted small">Un mot du nom de fichier (« het ») ou un paramètre de l'en-tête (« lc=1 », « VE=0 ») → le texte de la légende.</p>
          {brouillon.correspondances.map((c, k) => (
            <div key={k} className="comsol-ligne">
              <input value={c.de} onChange={(x) => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.map((y, j) => (j === k ? { ...y, de: x.target.value } : y)) })} aria-label="De" placeholder="lc=1" />
              <span>→</span>
              <input value={c.vers} onChange={(x) => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.map((y, j) => (j === k ? { ...y, vers: x.target.value } : y)) })} aria-label="Vers" placeholder="Rectangulaire" />
              <button type="button" className="small-btn" aria-label="Retirer" onClick={() => setBrouillon({ ...brouillon, correspondances: brouillon.correspondances.filter((_, j) => j !== k) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="small-btn" onClick={() => setBrouillon({ ...brouillon, correspondances: [...brouillon.correspondances, { de: "", vers: "" }] })}>
            + Correspondance
          </button>
          <p className="muted small">Interfaces de couches : cote z dans les coordonnées des fichiers (m, z = 0 en surface).</p>
          {brouillon.interfaces.map((c, k) => (
            <div key={k} className="comsol-ligne">
              <input
                defaultValue={String(c.z).replace(".", ",")}
                onBlur={(x) => {
                  const z = nombre(x.target.value);
                  if (Number.isFinite(z)) setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.map((y, j) => (j === k ? { ...y, z } : y)) });
                }}
                aria-label="Cote z (m)"
              />
              <input value={c.texte} onChange={(x) => setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.map((y, j) => (j === k ? { ...y, texte: x.target.value } : y)) })} aria-label="Nom" placeholder="BB/GB" />
              <button type="button" className="small-btn" aria-label="Retirer" onClick={() => setBrouillon({ ...brouillon, interfaces: brouillon.interfaces.filter((_, j) => j !== k) })}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="small-btn" onClick={() => setBrouillon({ ...brouillon, interfaces: [...brouillon.interfaces, { z: -0.1, texte: "" }] })}>
            + Interface
          </button>
          <div className="rangee-boutons">
            <button type="button" className="primary" disabled={!modifie} onClick={() => void reg.enregistrer({ ...brouillon, correspondances: brouillon.correspondances.filter((c) => c.de.trim()) })}>
              Enregistrer
            </button>
            {modifie ? (
              <button type="button" onClick={() => setBrouillon(reg.reglages)}>
                Annuler
              </button>
            ) : null}
          </div>
          {reg.erreur ? <p className="banner error">{reg.erreur}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/** A − B, A / B, écart relatif entre deux fichiers de même grille : le résultat rejoint la liste. */
function Operations({ exports, legende, ajouter }: { exports: ExportComsol[]; legende: (e: ExportComsol) => string; ajouter: (n: ExportComsol[]) => void }) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [op, setOp] = useState<Operation>("rapport");
  const [ouvert, setOuvert] = useState(false);
  const choix = (v: number, set: (n: number) => void) => (
    <select value={Math.min(v, exports.length - 1)} onChange={(e) => set(Number(e.target.value))}>
      {exports.map((e, i) => (
        <option key={i} value={i}>
          {legende(e)} ({sansExt(e.nom)})
        </option>
      ))}
    </select>
  );
  return (
    <>
      <h4>
        <button type="button" className="small-btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "▾" : "▸"}
        </button>{" "}
        Opérations entre fichiers
      </h4>
      {ouvert ? (
        <>
          <label className="field">
            <span>A</span>
            {choix(a, setA)}
          </label>
          <label className="field">
            <span>Opération</span>
            <select value={op} onChange={(e) => setOp(e.target.value as Operation)}>
              {(Object.keys(OPERATIONS) as Operation[]).map((o) => (
                <option key={o} value={o}>
                  {OPERATIONS[o]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>B</span>
            {choix(b, setB)}
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                const A = exports[Math.min(a, exports.length - 1)]!;
                const B = exports[Math.min(b, exports.length - 1)]!;
                ajouter([combiner(A, B, op, { nomA: legende(A), nomB: legende(B) })]);
              } catch (e) {
                alerte(e);
              }
            }}
          >
            Calculer (point à point)
          </button>
          <p className="muted small">Mêmes points exigés (refus sinon). Le résultat s'ajoute à la liste : carte, profils ou synthèse comme un fichier.</p>
        </>
      ) : null}
    </>
  );
}

function Profils({ profils, legende, longueur, tracer, interfaces }: { profils: ExportComsol[]; legende: (e: ExportComsol) => string; longueur: UniteLongueur; tracer: (d: GraphDoc, t: string) => void; interfaces?: { z: number; texte: string }[] }) {
  const [choisies, setChoisies] = useState<string[] | null>(null);
  const [profondeur, setProfondeur] = useState(false);
  const [orientation, setOrientation] = useState<"auto" | "verticale" | "horizontale">("auto");
  const expressions = communes(profils);
  const parDefaut = expressions.find((x) => /eZZ$/i.test(x)) ?? expressions[0];
  const actives = (choisies ?? (parDefaut ? [parDefaut] : [])).filter((x) => expressions.includes(x));
  const enZ = profils.length > 0 && profils.every((e) => /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!));
  return (
    <>
      <h4>Profils ({profils.length} cochés)</h4>
      <div className="comsol-expressions">
        {expressions.map((x) => (
          <label key={x} className="chip" title={x}>
            <input type="checkbox" checked={actives.includes(x)} onChange={(ev) => setChoisies(ev.target.checked ? [...actives, x] : actives.filter((y) => y !== x))} />
            {court(profils[0]!, x)}
          </label>
        ))}
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
      <button
        type="button"
        className="primary"
        disabled={!actives.length || !profils.length}
        onClick={() => {
          try {
            const doc = grapheProfils(profils, { expressions: actives, longueur, profondeur, orientation, noms: profils.map(legende), interfaces });
            const titre = actives.length === 1 ? `${court(profils[0]!, actives[0]!)} — ${profils.length} profil(s) COMSOL` : `Profils COMSOL — ${profils.map(legende).join(", ")}`;
            tracer(doc, titre);
          } catch (e) {
            alerte(e);
          }
        }}
      >
        Tracer {profils.length > 1 ? `les ${profils.length} profils` : "le profil"}
      </button>
    </>
  );
}

/** Séries temporelles (tables) : superposition, référence élastique, instant repère, pic annoté. */
function Temporel({ tables, tous, legende, remplacer }: { tables: ExportComsol[]; tous: ExportComsol[]; legende: (e: ExportComsol) => string; remplacer: (d: GraphDoc, t: string) => void }) {
  const expressions = communes(tables);
  const [choisies, setChoisies] = useState<string[] | null>(null);
  const actives = (choisies ?? expressions.slice(0, 1)).filter((x) => expressions.includes(x));
  const [refMode, setRefMode] = useState<string>("aucune");
  const [refValeur, setRefValeur] = useState("");
  const [refTexte, setRefTexte] = useState("Élastique");
  const [avecInstant, setAvecInstant] = useState(true);
  const [instant, setInstant] = useState("10");
  const [modePic, setModePic] = useState<ModePic | "">("abs");

  /** Valeur de référence : saisie, ou extremum (en valeur absolue) de la même grandeur dans un fichier. */
  function reference(): { valeur: number; texte: string } | null {
    if (refMode === "aucune") return null;
    if (refMode === "valeur") {
      const v = nombre(refValeur);
      if (!Number.isFinite(v)) throw new Error("Valeur de référence : un nombre.");
      return { valeur: v, texte: refTexte };
    }
    const e = tous[Number(refMode)]!;
    const x = actives[0]!;
    const j = e.colonnes.findIndex((c) => c.expression === x);
    if (j < 0) throw new Error(`${e.nom} n'a pas la colonne ${x}.`);
    const nc = e.coordonnees.length;
    const p = pic(e.valeurs[0]!, e.valeurs[nc + j]!, "abs");
    if (!p) throw new Error(`${e.nom} : aucune valeur.`);
    return { valeur: Number(p.y.toPrecision(6)), texte: refTexte || legende(e) };
  }

  return (
    <>
      <h4>Séries temporelles ({tables.length})</h4>
      <div className="comsol-expressions">
        {expressions.map((x) => (
          <label key={x} className="chip" title={x}>
            <input type="checkbox" checked={actives.includes(x)} onChange={(ev) => setChoisies(ev.target.checked ? [...actives, x] : actives.filter((y) => y !== x))} />
            {court(tables[0]!, x)}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Référence (trait horizontal)</span>
        <select value={refMode} onChange={(e) => setRefMode(e.target.value)}>
          <option value="aucune">Aucune</option>
          <option value="valeur">Valeur saisie…</option>
          {tous.map((e, i) => (
            <option key={i} value={String(i)}>
              Extremum de {legende(e)} ({sansExt(e.nom)})
            </option>
          ))}
        </select>
      </label>
      {refMode !== "aucune" ? (
        <div className="grid2">
          {refMode === "valeur" ? (
            <label className="field">
              <span>Valeur</span>
              <input value={refValeur} onChange={(e) => setRefValeur(e.target.value)} placeholder="−152" />
            </label>
          ) : null}
          <label className="field">
            <span>Texte</span>
            <input value={refTexte} onChange={(e) => setRefTexte(e.target.value)} />
          </label>
        </div>
      ) : null}
      <div className="grid2">
        <label className="chip">
          <input type="checkbox" checked={avecInstant} onChange={(e) => setAvecInstant(e.target.checked)} />
          Instant repère (s)
        </label>
        <input value={instant} disabled={!avecInstant} onChange={(e) => setInstant(e.target.value)} aria-label="Instant repère (s)" />
      </div>
      <label className="field">
        <span>Pic annoté (valeur, instant, décalage)</span>
        <select value={modePic} onChange={(e) => setModePic(e.target.value as ModePic | "")}>
          <option value="">Aucun</option>
          <option value="abs">Plus grande valeur absolue</option>
          <option value="max">Maximum</option>
          <option value="min">Minimum</option>
        </select>
      </label>
      <button
        type="button"
        className="primary"
        disabled={!actives.length}
        onClick={() => {
          try {
            const t = nombre(instant);
            const doc = grapheTemporel(tables, { expressions: actives, noms: tables.map(legende), reference: reference(), instant: avecInstant && Number.isFinite(t) ? t : null, pic: modePic || null });
            remplacer(doc, `${court(tables[0]!, actives[0]!)} au cours du temps — ${tables.length} série(s) COMSOL`);
          } catch (e) {
            alerte(e);
          }
        }}
      >
        Tracer {tables.length > 1 ? `les ${tables.length} séries` : "la série"}
      </button>
    </>
  );
}

/** Carte d'une coupe et profils interpolés (plusieurs d'un coup). */
function Coupes({ coupes, longueur, interfaces, remplacer, ajouter }: { coupes: ExportComsol[]; longueur: UniteLongueur; interfaces?: { z: number; texte: string }[]; remplacer: (d: GraphDoc, t: string) => void; ajouter: (n: ExportComsol[]) => void }) {
  const [iCoupe, setICoupe] = useState(0);
  const [exprCarte, setExprCarte] = useState<string | null>(null);
  const [fixe, setFixe] = useState<number | null>(null);
  const [valeurs, setValeurs] = useState("");
  const coupe = coupes[Math.min(iCoupe, coupes.length - 1)]!;
  const gc = geometrie(coupe);
  const exprC = exprCarte && coupe.colonnes.some((c) => c.expression === exprCarte) ? exprCarte : (coupe.colonnes.find((c) => /eZZ$/i.test(c.expression)) ?? coupe.colonnes[0])?.expression;
  const k = fixe !== null && gc.varient.includes(fixe) ? fixe : gc.varient[0]!;
  const grille = gc.grilles[gc.varient.indexOf(k)] ?? [];
  if (!exprC) return null;
  return (
    <>
      <h4>Coupe</h4>
      {coupes.length > 1 ? (
        <label className="field">
          <span>Coupe</span>
          <select value={iCoupe} onChange={(e) => setICoupe(Number(e.target.value))}>
            {coupes.map((e, j) => (
              <option key={j} value={j}>
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
      <button
        type="button"
        className="primary"
        title="Carte en couleurs, modifiable ensuite comme un graphe : palette, bornes, isolignes, contour d'empreinte, axes, taille"
        onClick={() => {
          try {
            remplacer(grapheCarte(coupe, exprC, longueur, { interfaces }), `${sansExt(coupe.nom)} — ${legendeCarte(coupe, exprC)}`);
          } catch (e) {
            alerte(e);
          }
        }}
      >
        Tracer la carte
      </button>
      <div className="comsol-extraire">
        <span className="muted small">Profils extraits (interpolés entre les lignes de la grille) :</span>
        <label className="field">
          <span>À coordonnée fixe</span>
          <select value={k} onChange={(e) => setFixe(Number(e.target.value))}>
            {gc.varient.map((j) => (
              <option key={j} value={j}>
                {coupe.coordonnees[j]} = … ({coupe.uniteLongueur})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Valeurs ({coupe.uniteLongueur}, de {nf(grille[0] ?? 0)} à {nf(grille.at(-1) ?? 0)})
          </span>
          <input value={valeurs} onChange={(e) => setValeurs(e.target.value)} placeholder="0,70 ; 0,848 ; 0,90 ; 0,967" />
        </label>
        <button
          type="button"
          disabled={!lireValeurs(valeurs).length}
          title="Les profils rejoignent la liste (cochés) et se tracent ensemble"
          onClick={() => {
            try {
              ajouter(profilsInterpoles(coupe, k, lireValeurs(valeurs)));
            } catch (e) {
              alerte(e);
            }
          }}
        >
          Ajouter {lireValeurs(valeurs).length > 1 ? `les ${lireValeurs(valeurs).length} profils` : "le profil"}
        </button>
      </div>
    </>
  );
}

/** Tableau de synthèse : max, min et positions ; LaTeX booktabs ; barres groupées. */
function Synthese({ exports, longueur, remplacer }: { exports: ExportComsol[]; longueur: UniteLongueur; remplacer: (d: GraphDoc, t: string) => void }) {
  const reg = useReglagesComsol();
  const [ouvert, setOuvert] = useState(false);
  // par défaut : les fichiers d'origine (ni tables, ni profils extraits, ni résultats d'opérations)
  const [choix, setChoix] = useState<Record<string, boolean>>({});
  const inclus = (e: ExportComsol) => choix[e.nom] ?? (!e.legende && e.nature !== "table");
  const [choisies, setChoisies] = useState<string[] | null>(null);
  const [virgule, setVirgule] = useState(false);
  const [lignes, setLignes] = useState<LigneSynthese[] | null>(null);
  const fichiers = exports.filter(inclus);
  const expressions = communes(fichiers);
  const actives = (choisies ?? expressions.slice(0, 1)).filter((x) => expressions.includes(x));
  const mots = fichiers.length ? motsDuNom(fichiers[0]!.nom) : [];
  const [categorie, setCategorie] = useState<number | null>(null);
  const [groupe, setGroupe] = useState<number | null>(null);
  const [stat, setStat] = useState<Statistique>("abs");
  const [exprBarres, setExprBarres] = useState<string | null>(null);
  const cat = categorie ?? Math.max(0, mots.length - 1);
  const grp = groupe ?? Math.max(0, mots.length - 2);
  const tex = () => syntheseLatex(lignes ?? [], { longueur, virgule });
  return (
    <>
      <h4>
        <button type="button" className="small-btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "▾" : "▸"}
        </button>{" "}
        Tableau de synthèse
      </h4>
      {ouvert ? (
        <>
          <div className="comsol-expressions">
            {exports.map((e) => (
              <label key={e.nom} className="chip" title={e.nom}>
                <input type="checkbox" checked={inclus(e)} onChange={(x) => setChoix({ ...choix, [e.nom]: x.target.checked })} />
                {sansExt(e.nom)}
              </label>
            ))}
          </div>
          <div className="comsol-expressions">
            {expressions.map((x) => (
              <label key={x} className="chip" title={x}>
                <input type="checkbox" checked={actives.includes(x)} onChange={(ev) => setChoisies(ev.target.checked ? [...actives, x] : actives.filter((y) => y !== x))} />
                {court(fichiers[0]!, x)}
              </label>
            ))}
          </div>
          <button type="button" disabled={!actives.length || !fichiers.length} onClick={() => setLignes(synthese(fichiers, actives, { longueur, correspondances: reg.reglages.correspondances }))}>
            Calculer
          </button>
          {lignes ? (
            <>
              <div className="comsol-synthese">
                <table>
                  <thead>
                    <tr>
                      <th>Cas</th>
                      <th>Grandeur</th>
                      <th>Max</th>
                      <th>Position ({longueur})</th>
                      <th>Min</th>
                      <th>Position ({longueur})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i}>
                        <td title={l.fichier}>{l.legende}</td>
                        <td>
                          {l.libelle.court} ({l.libelle.unite})
                        </td>
                        <td>{nf(l.max)}</td>
                        <td>{Object.values(l.posMax).map(nf).join(" ; ")}</td>
                        <td>{nf(l.min)}</td>
                        <td>{Object.values(l.posMin).map(nf).join(" ; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="chip">
                <input type="checkbox" checked={virgule} onChange={(e) => setVirgule(e.target.checked)} />
                Virgule décimale (LaTeX)
              </label>
              <div className="rangee-boutons">
                <button type="button" onClick={() => void getBackend().then((b) => b.copyText(tex()))}>
                  Copier LaTeX (booktabs)
                </button>
                <button type="button" onClick={() => void getBackend().then((b) => b.saveTextAs(tex(), "synthese-comsol.tex", "tex"))}>
                  Exporter .tex…
                </button>
              </div>
              <h5>Barres groupées</h5>
              <label className="field">
                <span>Grandeur</span>
                <select value={exprBarres ?? actives[0]} onChange={(e) => setExprBarres(e.target.value)}>
                  {[...new Set(lignes.map((l) => l.expression))].map((x) => (
                    <option key={x} value={x}>
                      {court(fichiers[0]!, x)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid2">
                <label className="field">
                  <span>Catégories (abscisse)</span>
                  <select value={cat} onChange={(e) => setCategorie(Number(e.target.value))}>
                    {mots.map((m, i) => (
                      <option key={i} value={i}>
                        mot {i + 1} (« {m} »)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Séries (couleurs)</span>
                  <select value={grp} onChange={(e) => setGroupe(Number(e.target.value))}>
                    {mots.map((m, i) => (
                      <option key={i} value={i}>
                        mot {i + 1} (« {m} »)
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Valeur</span>
                <select value={stat} onChange={(e) => setStat(e.target.value as Statistique)}>
                  <option value="abs">Extremum (plus grande valeur absolue)</option>
                  <option value="max">Maximum</option>
                  <option value="min">Minimum</option>
                </select>
              </label>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  try {
                    const x = exprBarres ?? actives[0]!;
                    remplacer(grapheBarres(lignes, { expression: x, categorie: cat, groupe: grp, statistique: stat, correspondances: reg.reglages.correspondances }), `${court(fichiers[0]!, x)} — synthèse COMSOL`);
                  } catch (e) {
                    alerte(e);
                  }
                }}
              >
                Tracer les barres
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
