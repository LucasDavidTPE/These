/**
 * Étapes 2 et 3 de l'atelier COMSOL : réglages du tracé choisi (au centre) et aperçu en direct (à droite).
 * Chaque mode édite une **recette** (core/graph/comsolEtude.ts) : ce qui s'affiche est exactement ce que
 * l'étude gardera, et ce qui se rejouera pour régénérer la figure.
 */
import { useState } from "react";
import {
  OPERATIONS,
  arrondirClic,
  carteDeSelection,
  comparables,
  courtDe,
  decrireExport,
  executerTrace,
  expressionsCommunes,
  expressionsDe,
  geometrie,
  lireValeurs,
  motsDuNom,
  syntheseLatex,
  type ExportComsol,
  type ModePic,
  type Operation,
  type Statistique,
  type TraceComparer,
  type TraceCoupeProfils,
  type TraceProfils,
  type TraceSynthese,
  type TraceTemps,
} from "../../core/graph";
import { getBackend } from "../platform/backend";
import { AtelierApercu } from "./AtelierApercu";
import { calculer } from "./atelierCalcul";
import { Declinaison } from "./Declinaison";
import { ChoixEtape } from "./Instants";
import { useContexteTrace, useLegende, useTrace } from "./hooks";
import { useAtelier } from "./useAtelier";

const fr = (x: number) =>
  String(Number(x.toPrecision(5)))
    .replace(".", ",")
    .replace("-", "−");
const nombre = (t: string) =>
  Number(t.trim().replace(",", ".").replace("−", "-"));
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");

/** Cases à cocher des grandeurs ; `seule` : un choix unique (liste). */
function Grandeurs({
  e,
  liste,
  actives,
  set,
  seule,
}: {
  e: ExportComsol | undefined;
  liste: string[];
  actives: string[];
  set: (v: string[]) => void;
  seule?: boolean;
}) {
  if (seule)
    return (
      <label className="field">
        <span>Grandeur</span>
        <select
          value={actives[0] ?? ""}
          onChange={(x) => set([x.target.value])}
        >
          {liste.map((x) => (
            <option key={x} value={x}>
              {courtDe(e, x)}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <fieldset className="atelier-champ">
      <legend>Grandeurs (une courbe par grandeur cochée)</legend>
      <div className="comsol-expressions">
        {liste.map((x) => (
          <label key={x} className="chip" title={x}>
            <input
              type="checkbox"
              checked={actives.includes(x)}
              onChange={(ev) =>
                set(
                  ev.target.checked
                    ? [...actives, x]
                    : actives.filter((y) => y !== x),
                )
              }
            />
            {courtDe(e, x)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Cases à cocher de fichiers ; `null` = tous. */
function Fichiers({
  titre,
  liste,
  choisis,
  set,
}: {
  titre: string;
  liste: ExportComsol[];
  choisis: string[] | null;
  set: (v: string[] | null) => void;
}) {
  const legende = useLegende();
  const tous = choisis === null;
  return (
    <fieldset className="atelier-champ">
      <legend>{titre}</legend>
      {liste.map((e) => (
        <label key={e.nom} className="chip">
          <input
            type="checkbox"
            checked={tous || choisis.includes(e.nom)}
            onChange={(x) => {
              const actuels = tous ? liste.map((f) => f.nom) : choisis;
              const n = x.target.checked
                ? [...actuels, e.nom]
                : actuels.filter((k) => k !== e.nom);
              set(n.length === liste.length ? null : n);
            }}
          />
          {legende(e)}
        </label>
      ))}
    </fieldset>
  );
}

/** Choix d'un fichier dans une liste, décrit en clair. */
function ChoixFichier({
  libelle,
  liste,
  valeur,
  set,
}: {
  libelle: string;
  liste: ExportComsol[];
  valeur: string | null;
  set: (nom: string) => void;
}) {
  const longueur = useAtelier((s) => s.cadre.longueur);
  const legende = useLegende();
  return (
    <label className="field">
      <span>{libelle}</span>
      <select value={valeur ?? ""} onChange={(x) => set(x.target.value)}>
        {liste.map((e) => (
          <option key={e.nom} value={e.nom}>
            {legende(e)} — {decrireExport(e, longueur).titre}
          </option>
        ))}
      </select>
    </label>
  );
}

function Colonnes({
  options,
  apercu,
}: {
  options: React.ReactNode;
  apercu: React.ReactNode;
}) {
  return (
    <>
      <div className="atelier-reglages">{options}</div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Aperçu
        </h3>
        {apercu}
      </section>
    </>
  );
}

const lignesDe = (es: readonly ExportComsol[]) =>
  es.filter((e) => geometrie(e).genre === "profil");
const plansDe = (es: readonly ExportComsol[]) =>
  es.filter((e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere);

// ---- Comparer des profils ----

export function ModeProfils() {
  const c = useContexteTrace();
  const [t, maj] = useTrace<TraceProfils>("profils");
  const lignes = lignesDe(c.exports);
  const choisies = t.fichiers
    ? lignes.filter((e) => t.fichiers!.includes(e.nom))
    : lignes;
  const enZ =
    choisies.length > 0 &&
    choisies.every((e) =>
      /^z$/i.test(e.coordonnees[geometrie(e).varient[0]!]!),
    );
  return (
    <Colonnes
      options={
        <>
          <ChoixEtape mode="profils" />
          <Fichiers
            titre="Lignes à superposer (une courbe chacune)"
            liste={lignes}
            choisis={t.fichiers}
            set={(fichiers) => maj({ fichiers })}
          />
          <Grandeurs
            e={choisies[0]}
            liste={expressionsCommunes(choisies.length ? choisies : lignes)}
            actives={t.expressions}
            set={(expressions) => maj({ expressions })}
          />
          <fieldset className="atelier-champ">
            <legend>Sens du tracé</legend>
            <label className="chip">
              <input
                type="radio"
                checked={t.orientation === "auto"}
                onChange={() => maj({ orientation: "auto" })}
              />
              Automatique (
              {enZ
                ? "ligne verticale : valeur en abscisse, profondeur en ordonnée"
                : "position en abscisse, valeur en ordonnée"}
              )
            </label>
            <label className="chip">
              <input
                type="radio"
                checked={t.orientation === "verticale"}
                onChange={() => maj({ orientation: "verticale" })}
              />
              Valeur en abscisse, position en ordonnée
            </label>
            <label className="chip">
              <input
                type="radio"
                checked={t.orientation === "horizontale"}
                onChange={() => maj({ orientation: "horizontale" })}
              />
              Position en abscisse, valeur en ordonnée
            </label>
            {enZ && t.orientation !== "horizontale" ? (
              <label className="chip">
                <input
                  type="checkbox"
                  checked={t.profondeur}
                  onChange={(e) => maj({ profondeur: e.target.checked })}
                />
                Profondeur positive, de la surface vers le bas
              </label>
            ) : null}
          </fieldset>
        </>
      }
      apercu={
        <AtelierApercu
          resultat={calculer(() => executerTrace(t, c))}
          trace={t}
          aide={!choisies.length ? "Cochez au moins une ligne." : undefined}
        />
      }
    />
  );
}

// ---- Profils dans une coupe (clic sur la carte) ----

export function ModeCoupeProfils() {
  const c = useContexteTrace();
  const [t, maj] = useTrace<TraceCoupeProfils>("coupe-profils");
  const plans = plansDe(c.exports);
  const p = plans.find((e) => e.nom === t.plan);
  const [saisie, setSaisie] = useState("");
  // segments : premier clic = A (en attente), second clic = B
  const [depart, setDepart] = useState<{ x: number; y: number } | null>(null);
  const g = p ? geometrie(p) : null;
  const [kx, ky] = (g?.varient ?? [0, 1]) as [number, number];
  const nomH = p ? p.coordonnees[kx]!.toLowerCase() : "x";
  const nomV = p ? p.coordonnees[ky]!.toLowerCase() : "z";
  const nomFixe = t.sens === "verticales" ? nomH : nomV;
  const lettre = (i: number) => String.fromCharCode(97 + (i % 26));
  const carte = calculer(() => {
    const d = carteDeSelection(t, c);
    return d ? { doc: d, titre: "" } : null;
  });
  const etendue =
    carte && "doc" in carte
      ? t.sens === "verticales"
        ? carte.doc.carte!.x
        : carte.doc.carte!.y
      : [0, 1];
  const etendueDe = (k: "x" | "y") =>
    carte && "doc" in carte
      ? Math.abs(carte.doc.carte![k].at(-1)! - carte.doc.carte![k][0]!)
      : 1;
  const cliquer = (x: number, y: number) => {
    if (t.sens !== "segments")
      return ajouter([
        arrondirClic(
          t.sens === "verticales" ? x : y,
          etendue.at(-1)! - etendue[0]!,
        ),
      ]);
    const pt = {
      x: arrondirClic(x, etendueDe("x")),
      y: arrondirClic(y, etendueDe("y")),
    };
    if (!depart) return setDepart(pt);
    if (pt.x !== depart.x || pt.y !== depart.y)
      maj({
        segments: [
          ...t.segments,
          { x0: depart.x, y0: depart.y, x1: pt.x, y1: pt.y },
        ],
      });
    setDepart(null);
  };
  const ajouter = (vs: number[]) =>
    maj({
      valeurs: [...t.valeurs, ...vs].filter((x, i, l) => l.indexOf(x) === i),
    });
  const saisir = () => {
    ajouter(lireValeurs(saisie.replace(/−/g, "-")));
    setSaisie("");
  };
  return (
    <Colonnes
      options={
        <>
          <ChoixEtape mode="coupe-profils" />
          <ChoixFichier
            libelle="Plan de coupe"
            liste={plans}
            valeur={t.plan}
            set={(plan) => maj({ plan, expression: null, valeurs: [] })}
          />
          <Grandeurs
            e={p}
            liste={expressionsDe(p)}
            actives={t.expression ? [t.expression] : []}
            set={(v) => maj({ expression: v[0] ?? null })}
            seule
          />
          <fieldset className="atelier-champ">
            <legend>Lignes à placer</legend>
            <label className="chip">
              <input
                type="radio"
                checked={t.sens === "verticales"}
                onChange={() => maj({ sens: "verticales", valeurs: [] })}
              />
              Verticales : à {nomH} fixé (profils le long de {nomV})
            </label>
            <label className="chip">
              <input
                type="radio"
                checked={t.sens === "horizontales"}
                onChange={() => maj({ sens: "horizontales", valeurs: [] })}
              />
              Horizontales : à {nomV} fixé (profils le long de {nomH})
            </label>
            <label className="chip">
              <input
                type="radio"
                checked={t.sens === "segments"}
                onChange={() => maj({ sens: "segments" })}
              />
              Segments quelconques : de A à B, en deux clics (obliques,
              diagonales)
            </label>
          </fieldset>
          {t.sens === "segments" ? (
            <>
              <p className="atelier-consigne">
                <strong>Cliquez sur la carte</strong>{" "}
                {depart
                  ? `le point B (A est en ${nomH} = ${fr(depart.x)}, ${nomV} = ${fr(depart.y)})`
                  : "le point A, puis le point B"}{" "}
                ; profils tracés en fonction de la distance depuis A.
                {depart ? (
                  <button
                    type="button"
                    className="lien"
                    onClick={() => setDepart(null)}
                  >
                    {" "}
                    annuler A
                  </button>
                ) : null}
              </p>
              <div className="atelier-grandeurs">
                {t.segments.map((sg, i) => (
                  <span key={i} className="atelier-puce">
                    {lettre(i)}. ({fr(sg.x0)} ; {fr(sg.y0)}) → ({fr(sg.x1)} ;{" "}
                    {fr(sg.y1)}){" "}
                    <button
                      type="button"
                      className="lien"
                      aria-label="Retirer"
                      onClick={() =>
                        maj({ segments: t.segments.filter((_, j) => j !== i) })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </>
          ) : null}
          {t.sens !== "segments" ? (
            <>
              <p className="atelier-consigne">
                <strong>Cliquez sur la carte</strong> pour placer une ligne, ou
                tapez des valeurs de {nomFixe} ({c.cadre.longueur}) :
              </p>
              <div className="comsol-ligne">
                <input
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  placeholder="700 ; 848 ; 900 ; 967"
                  onKeyDown={(e) => e.key === "Enter" && saisir()}
                />
                <button
                  type="button"
                  disabled={!lireValeurs(saisie).length}
                  onClick={saisir}
                >
                  Ajouter
                </button>
              </div>
              <div className="atelier-grandeurs">
                {t.valeurs.map((v, i) => (
                  <span key={i} className="atelier-puce">
                    {lettre(i)}. {nomFixe} = {fr(v)} {c.cadre.longueur}{" "}
                    <button
                      type="button"
                      className="lien"
                      aria-label="Retirer"
                      onClick={() =>
                        maj({ valeurs: t.valeurs.filter((_, j) => j !== i) })
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
                {t.valeurs.length ? (
                  <button
                    type="button"
                    className="lien"
                    onClick={() => maj({ valeurs: [] })}
                  >
                    tout retirer
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
          {t.sens === "verticales" && /^z$/i.test(nomV) ? (
            <label className="chip">
              <input
                type="checkbox"
                checked={t.profondeur}
                onChange={(e) => maj({ profondeur: e.target.checked })}
              />
              Profondeur positive, de la surface vers le bas
            </label>
          ) : null}
          {t.sens !== "segments" && t.valeurs.length ? (
            <Declinaison t={t} />
          ) : null}
        </>
      }
      apercu={
        <>
          <AtelierApercu
            resultat={carte}
            onClic={cliquer}
            petit
            aide={
              t.sens === "segments"
                ? "Carte : cliquez A puis B pour chaque segment (a, b, c…)."
                : "Carte : cliquez pour placer une ligne (a, b, c…)."
            }
          />
          <AtelierApercu
            resultat={calculer(() => executerTrace(t, c))}
            trace={t}
            aide={
              (t.sens === "segments" ? t.segments.length : t.valeurs.length)
                ? t.sens === "segments"
                  ? "Profils le long des segments :"
                  : "Profils le long des lignes placées :"
                : undefined
            }
          />
        </>
      }
    />
  );
}

// ---- Signal dans le temps ----

export function ModeTemps() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceTemps>("temps");
  const tables = c.exports.filter((e) => e.nature === "table");
  const choisies = t.fichiers
    ? tables.filter((e) => t.fichiers!.includes(e.nom))
    : tables;
  const [valeur, setValeur] = useState(
    t.reference.genre === "valeur" ? fr(t.reference.valeur) : "",
  );
  const texte =
    t.reference.genre === "aucune" ? "Élastique" : t.reference.texte;
  return (
    <Colonnes
      options={
        <>
          <Fichiers
            titre="Signaux à superposer"
            liste={tables}
            choisis={t.fichiers}
            set={(fichiers) => maj({ fichiers })}
          />
          <Grandeurs
            e={choisies[0]}
            liste={expressionsCommunes(choisies.length ? choisies : tables)}
            actives={t.expressions}
            set={(expressions) => maj({ expressions })}
          />
          <fieldset className="atelier-champ">
            <legend>Valeur de référence (trait horizontal)</legend>
            <select
              value={
                t.reference.genre === "fichier"
                  ? `f:${t.reference.fichier}`
                  : t.reference.genre
              }
              onChange={(e) => {
                const v = e.target.value;
                maj({
                  reference:
                    v === "aucune"
                      ? { genre: "aucune" }
                      : v === "valeur"
                        ? {
                            genre: "valeur",
                            valeur: nombre(valeur) || 0,
                            texte,
                          }
                        : { genre: "fichier", fichier: v.slice(2), texte },
                });
              }}
            >
              <option value="aucune">Aucune</option>
              <option value="valeur">Une valeur que je tape</option>
              {c.exports.map((e) =>
                e.colonnes.some((k) => k.expression === t.expressions[0]) ? (
                  <option key={e.nom} value={`f:${e.nom}`}>
                    Le pic de « {legende(e)} » ({sansExt(e.nom)})
                  </option>
                ) : null,
              )}
            </select>
            {t.reference.genre === "valeur" ? (
              <input
                value={valeur}
                onChange={(e) => setValeur(e.target.value)}
                onBlur={() =>
                  Number.isFinite(nombre(valeur)) &&
                  maj({
                    reference: {
                      genre: "valeur",
                      valeur: nombre(valeur),
                      texte,
                    },
                  })
                }
                placeholder="−152"
                aria-label="Valeur"
              />
            ) : null}
            {t.reference.genre !== "aucune" ? (
              <input
                value={texte}
                onChange={(e) =>
                  maj({
                    reference: {
                      ...t.reference,
                      texte: e.target.value,
                    } as TraceTemps["reference"],
                  })
                }
                aria-label="Texte de la référence"
              />
            ) : null}
          </fieldset>
          <label className="field">
            <span>Instant repère, en s (trait vertical ; vide = aucun)</span>
            <input
              defaultValue={t.instant === null ? "" : fr(t.instant)}
              onBlur={(e) =>
                maj({
                  instant:
                    e.target.value.trim() &&
                    Number.isFinite(nombre(e.target.value))
                      ? nombre(e.target.value)
                      : null,
                })
              }
            />
          </label>
          <label className="field">
            <span>
              Pic à annoter (valeur, instant, décalage par rapport à l'instant
              repère)
            </span>
            <select
              value={t.pic ?? ""}
              onChange={(e) =>
                maj({ pic: (e.target.value || null) as ModePic | null })
              }
            >
              <option value="">Aucun</option>
              <option value="abs">Plus grande valeur absolue</option>
              <option value="max">Maximum</option>
              <option value="min">Minimum</option>
            </select>
          </label>
        </>
      }
      apercu={
        <AtelierApercu
          resultat={calculer(() => executerTrace(t, c))}
          trace={t}
        />
      }
    />
  );
}

// ---- Comparer deux cas ----

const EXPLICATIONS: Record<Operation, string> = {
  rapport: "A / B : 1,5 = A vaut une fois et demie B.",
  difference: "A − B, dans l'unité de la grandeur.",
  ecart:
    "(A − B) / |B| en % ; attention au signe pour des compressions (valeurs négatives).",
};

export function ModeComparer() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceComparer>("comparer");
  const A = c.exports.find((e) => e.nom === t.a);
  const B = c.exports.find((e) => e.nom === t.b);
  const raison = A && B ? comparables(A, B) : "Choisissez A et B.";
  const resultat = calculer(() => {
    if (raison) throw new Error(raison);
    return executerTrace(t, c);
  });
  const choixFichier = (
    libelle: string,
    v: string | null,
    set: (nom: string) => void,
    autre?: ExportComsol,
  ) => (
    <label className="field">
      <span>{libelle}</span>
      <select value={v ?? ""} onChange={(e) => set(e.target.value)}>
        {c.exports.map((e) => (
          <option key={e.nom} value={e.nom}>
            {autre === e
              ? "= A : "
              : autre
                ? comparables(autre, e)
                  ? "✗ "
                  : "✓ "
                : ""}
            {legende(e)} ({sansExt(e.nom)})
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <Colonnes
      options={
        <>
          <ChoixEtape mode="comparer" />
          {choixFichier("Cas A", t.a, (a) => maj({ a }))}
          {choixFichier(
            "Cas B (✓ = même grille que A)",
            t.b,
            (b) => maj({ b }),
            A,
          )}
          <fieldset className="atelier-champ">
            <legend>Opération, point par point</legend>
            {(Object.keys(OPERATIONS) as Operation[]).map((o) => (
              <label key={o} className="chip" title={EXPLICATIONS[o]}>
                <input
                  type="radio"
                  checked={t.op === o}
                  onChange={() => maj({ op: o })}
                />
                {OPERATIONS[o]}
              </label>
            ))}
            <p className="muted small">{EXPLICATIONS[t.op]}</p>
          </fieldset>
          {A && B && !raison ? (
            <Grandeurs
              e={A}
              liste={expressionsCommunes([A, B])}
              actives={t.expression ? [t.expression] : []}
              set={(v) => maj({ expression: v[0] ?? null })}
              seule
            />
          ) : null}
          <button
            type="button"
            disabled={!!raison || !A || !B}
            title="Le résultat rejoint la liste des fichiers (et l'étude) : carte, profils dans une coupe, synthèse…"
            onClick={() =>
              A &&
              B &&
              useAtelier
                .getState()
                .garderCalcule({
                  nom: `${legende(A)} ${t.op === "rapport" ? "/" : t.op === "difference" ? "−" : "écart"} ${legende(B)}`,
                  genre: "operation",
                  a: A.nom,
                  b: B.nom,
                  op: t.op,
                  legendeA: legende(A),
                  legendeB: legende(B),
                })
            }
          >
            Garder le résultat dans la liste des fichiers
          </button>
        </>
      }
      apercu={<AtelierApercu resultat={resultat} trace={t} />}
    />
  );
}

// ---- Tableau de synthèse ----

export function ModeSynthese() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceSynthese>("synthese");
  const fichiers = c.exports.filter((e) => (t.fichiers ?? []).includes(e.nom));
  const mots = fichiers.length ? motsDuNom(fichiers[0]!.nom) : [];
  const resultat = calculer(() => executerTrace(t, c));
  const lignes =
    resultat && "lignes" in resultat ? (resultat.lignes ?? []) : [];
  const tex = () =>
    syntheseLatex(lignes, { longueur: c.cadre.longueur, virgule: t.virgule });
  const majBarres = (p: Partial<TraceSynthese["barres"]>) =>
    maj({ barres: { ...t.barres, ...p } });
  return (
    <Colonnes
      options={
        <>
          <ChoixEtape mode="synthese" />
          <fieldset className="atelier-champ">
            <legend>Cas (une ligne du tableau chacun)</legend>
            {c.exports.map((e) => (
              <label key={e.nom} className="chip" title={e.nom}>
                <input
                  type="checkbox"
                  checked={(t.fichiers ?? []).includes(e.nom)}
                  onChange={(x) =>
                    maj({
                      fichiers: x.target.checked
                        ? [...(t.fichiers ?? []), e.nom]
                        : (t.fichiers ?? []).filter((n) => n !== e.nom),
                    })
                  }
                />
                {legende(e)}
              </label>
            ))}
          </fieldset>
          <Grandeurs
            e={fichiers[0]}
            liste={expressionsCommunes(fichiers)}
            actives={t.expressions}
            set={(expressions) => maj({ expressions })}
          />
          <label className="chip">
            <input
              type="checkbox"
              checked={t.virgule}
              onChange={(e) => maj({ virgule: e.target.checked })}
            />
            Virgule décimale dans le LaTeX
          </label>
          <fieldset className="atelier-champ">
            <legend>Diagramme en barres</legend>
            <label className="field">
              <span>Grandeur</span>
              <select
                value={t.barres.expression ?? ""}
                onChange={(e) => majBarres({ expression: e.target.value })}
              >
                {t.expressions.map((x) => (
                  <option key={x} value={x}>
                    {courtDe(fichiers[0], x)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted small">
              Les groupes viennent des mots du nom de fichier (ex. «{" "}
              {fichiers[0] ? sansExt(fichiers[0].nom) : "coupeXZ_R1_VE_het"} »).
            </p>
            <label className="field">
              <span>En abscisse (groupes)</span>
              <select
                value={t.barres.categorie ?? 0}
                onChange={(e) =>
                  majBarres({ categorie: Number(e.target.value) })
                }
              >
                {mots.map((m, i) => (
                  <option key={i} value={i}>
                    mot {i + 1} : « {m} »
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>En couleurs (une barre par)</span>
              <select
                value={t.barres.groupe ?? 0}
                onChange={(e) => majBarres({ groupe: Number(e.target.value) })}
              >
                {mots.map((m, i) => (
                  <option key={i} value={i}>
                    mot {i + 1} : « {m} »
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valeur</span>
              <select
                value={t.barres.statistique}
                onChange={(e) =>
                  majBarres({ statistique: e.target.value as Statistique })
                }
              >
                <option value="abs">
                  Extremum (plus grande valeur absolue)
                </option>
                <option value="max">Maximum</option>
                <option value="min">Minimum</option>
              </select>
            </label>
          </fieldset>
        </>
      }
      apercu={
        <>
          {resultat && "erreur" in resultat ? (
            <p className="banner error">{resultat.erreur}</p>
          ) : null}
          {lignes.length ? (
            <>
              <div className="comsol-synthese">
                <table>
                  <thead>
                    <tr>
                      <th>Cas</th>
                      <th>Grandeur</th>
                      <th>Max</th>
                      <th>à ({c.cadre.longueur})</th>
                      <th>Min</th>
                      <th>à ({c.cadre.longueur})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l, i) => (
                      <tr key={i}>
                        <td title={l.fichier}>{l.legende}</td>
                        <td>
                          {l.libelle.court} ({l.libelle.unite})
                        </td>
                        <td>{fr(l.max)}</td>
                        <td>
                          {Object.entries(l.posMax)
                            .map(([k, v]) => `${k.toLowerCase()} ${fr(v)}`)
                            .join(", ")}
                        </td>
                        <td>{fr(l.min)}</td>
                        <td>
                          {Object.entries(l.posMin)
                            .map(([k, v]) => `${k.toLowerCase()} ${fr(v)}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rangee-boutons">
                <button
                  type="button"
                  onClick={() =>
                    void getBackend().then((b) => b.copyText(tex()))
                  }
                >
                  Copier le tableau LaTeX (booktabs)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void getBackend().then((b) =>
                      b.saveTextAs(tex(), "synthese-comsol.tex", "tex"),
                    )
                  }
                >
                  Exporter .tex…
                </button>
              </div>
              <AtelierApercu
                resultat={resultat}
                trace={t}
                aide="Diagramme en barres :"
              />
            </>
          ) : (
            <div className="atelier-apercu vide">
              Cochez des cas et des grandeurs.
            </div>
          )}
        </>
      }
    />
  );
}
