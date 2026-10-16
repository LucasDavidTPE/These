/**
 * Tuile « Carte d'une coupe » : la carte en couleurs d'un plan, avec
 *  - la **sonde** : au survol, la valeur au même point dans tous les plans comparables (EL, VE, autres
 *    empreintes), interpolée dans la maille, à l'instant choisi ;
 *  - les **épingles** : un clic écrit la valeur du point sur la carte (recalculée à chaque régénération) ;
 *  - pour un export à plusieurs instants, le **signal au cours du temps** en un point épinglé (fichier calculé,
 *    tracé dans « Signal dans le temps ») et la **déclinaison sur les instants** (planche cas × instants).
 */
import { useMemo, useState } from "react";
import {
  ETIQUETTES,
  FACTEUR_LONGUEUR,
  LIBELLES_PALETTES,
  PALETTES_CARTE,
  arrondirClic,
  courtDe,
  executerTrace,
  expressionsDe,
  geometrie,
  grilleCoupe,
  libelleColonne,
  lireValeurs,
  parametresVariables,
  valeurCarte,
  vueEtape,
  type ExportComsol,
  type Matrice,
  type PaletteCarte,
  type StyleEtiquette,
  type TraceCarte,
} from "../../core/graph";
import { useNavigation } from "../navigation";
import { usePlanche } from "../planche/usePlanche";
import { AnimationInstants } from "./Animation";
import { AtelierApercu } from "./AtelierApercu";
import { calculer } from "./atelierCalcul";
import { Declinaison } from "./Declinaison";
import { useContexteTrace, useLegende, useTrace } from "./hooks";
import { ChoixEtape } from "./Instants";
import { ecrireDeclinaison } from "./lot";
import { useAtelier } from "./useAtelier";

const fr = (x: number) =>
  String(Number(x.toPrecision(5)))
    .replace(".", ",")
    .replace("-", "−");
const sansExt = (n: string) => n.replace(/\.(txt|csv|dat)$/i, "");
const plansDe = (es: readonly ExportComsol[]) =>
  es.filter((e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere);
const axesDe = (e: ExportComsol) =>
  geometrie(e)
    .varient.map((k) => e.coordonnees[k])
    .join();
const lettre = (i: number) => String.fromCharCode(97 + (i % 26));

export function ModeCarte() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceCarte>("carte");
  const plans = plansDe(c.exports);
  const p = plans.find((e) => e.nom === t.plan);
  const [iso, setIso] = useState(t.isolignes.map(fr).join(" ; "));
  const [survol, setSurvol] = useState<{ x: number; y: number } | null>(null);
  const L = c.cadre.longueur;
  const exports = c.exports;
  const { expression, etape } = t;
  // plans comparables (mêmes axes, même grandeur), vus à l'instant choisi : ce que la sonde interroge
  const grilles = useMemo(() => {
    const ref = exports.find((e) => e.nom === t.plan);
    if (!ref || !expression) return [];
    return plansDe(exports)
      .filter(
        (e) =>
          axesDe(e) === axesDe(ref) &&
          e.colonnes.some((k) => k.expression === expression),
      )
      .flatMap((e) => {
        try {
          return [{ e, g: grilleCoupe(vueEtape(e, etape), expression, L) }];
        } catch {
          return [];
        }
      });
  }, [exports, t.plan, expression, etape, L]);
  const nomX = grilles[0]?.g.nomX ?? "x";
  const nomY = grilles[0]?.g.nomY ?? "z";
  const unite =
    p && t.expression
      ? libelleColonne(p.colonnes.find((k) => k.expression === t.expression)!)
          .unite
      : "";
  const u = unite === "-" ? "" : ` ${unite}`;
  const ici = grilles.find((x) => x.e.nom === t.plan)?.g;
  const etendue = (k: "x" | "y") =>
    ici ? Math.abs(ici[k].at(-1)! - ici[k][0]!) : 1;
  const epingler = (x: number, y: number) =>
    maj({
      epingles: [
        ...t.epingles,
        { x: arrondirClic(x, etendue("x")), y: arrondirClic(y, etendue("y")) },
      ],
    });
  const instants = p ? parametresVariables(p) : [];
  // signal au cours du temps au point épinglé, pour chaque plan comparable qui a des instants
  const signal = (pin: { x: number; y: number }) => {
    const a = useAtelier.getState();
    const crees: string[] = [];
    for (const { e } of grilles) {
      const param = parametresVariables(e)[0];
      if (!param) continue;
      const [kx, ky] = geometrie(e).varient as [number, number];
      const f = FACTEUR_LONGUEUR[L]! / (FACTEUR_LONGUEUR[e.uniteLongueur] ?? 1);
      const nom = `${sansExt(e.nom)} @ ${nomX}=${fr(pin.x)} ${nomY}=${fr(pin.y)}.txt`;
      if (a.exports.some((x) => x.nom === nom)) continue;
      a.garderCalcule({
        nom,
        genre: "signal",
        fichier: e.nom,
        point: e.coordonnees.map((_, k) =>
          k === kx ? pin.x / f : k === ky ? pin.y / f : null,
        ),
        parametre: param.nom,
        etape: t.etape ?? null,
        legende: `${legende(e)} — ${nomX} = ${fr(pin.x)}, ${nomY} = ${fr(pin.y)} ${L}`,
      });
      crees.push(legende(e));
    }
    useAtelier
      .getState()
      .set({
        avis: {
          niveau: "info",
          texte: crees.length
            ? `Signal au cours du temps ajouté pour ${crees.join(", ")} : tuile « Signal dans le temps ».`
            : "Ces signaux sont déjà dans la liste.",
        },
      });
  };
  return (
    <>
      <div className="atelier-reglages">
        <ChoixEtape mode="carte" />
        <label className="field">
          <span>Plan de coupe</span>
          <select
            value={t.plan ?? ""}
            onChange={(e) => maj({ plan: e.target.value, expression: null })}
          >
            {plans.map((e) => (
              <option key={e.nom} value={e.nom}>
                {legende(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Grandeur</span>
          <select
            value={t.expression ?? ""}
            onChange={(e) => maj({ expression: e.target.value })}
          >
            {expressionsDe(p).map((x) => (
              <option key={x} value={x}>
                {courtDe(p, x)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Couleurs</span>
          <select
            value={t.palette}
            onChange={(e) =>
              maj({ palette: e.target.value as PaletteCarte | "auto" })
            }
          >
            <option value="auto">
              Automatique (rouge-bleu si le signe change, sinon viridis)
            </option>
            {PALETTES_CARTE.map((x) => (
              <option key={x} value={x}>
                {LIBELLES_PALETTES[x]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Isolignes (valeurs séparées par ;, facultatif)</span>
          <input
            value={iso}
            onChange={(e) => setIso(e.target.value)}
            onBlur={() =>
              maj({ isolignes: lireValeurs(iso.replace(/−/g, "-")) })
            }
            placeholder="−200 ; −100 ; 0"
          />
        </label>
        <label className="chip">
          <input
            type="checkbox"
            checked={t.egalite}
            onChange={(e) => maj({ egalite: e.target.checked })}
          />
          Vraies proportions (1 m = 1 m)
        </label>
        <label className="field">
          <span>Lissage (nœuds interpolés entre ceux de la grille)</span>
          <select value={t.lissage} onChange={(e) => maj({ lissage: Number(e.target.value) })}>
            <option value={1}>aucun : une cellule par nœud exporté</option>
            <option value={2}>× 2</option>
            <option value={4}>× 4 (rendu lisse, fichier pgfplots plus lourd)</option>
          </select>
        </label>
        <fieldset className="atelier-champ">
          <legend>Valeurs épinglées (clic sur la carte)</legend>
          {t.epingles.length ? (
            <div className="atelier-epingles">
              {t.epingles.map((pin, i) => {
                const v = ici ? valeurCarte(ici, pin.x, pin.y) : null;
                return (
                  <div key={i} className="comsol-ligne small">
                    <span>
                      {lettre(i)}. {nomX} = {fr(pin.x)}, {nomY} = {fr(pin.y)}{" "}
                      {L} →{" "}
                      <strong>
                        {v === null ? "hors carte" : `${fr(v)}${u}`}
                      </strong>
                    </span>
                    {instants.length ? (
                      <button
                        type="button"
                        className="small-btn"
                        title="Signal au cours du temps en ce point, pour chaque cas à plusieurs instants (fichier calculé, gardé dans l'étude)"
                        onClick={() => signal(pin)}
                      >
                        ∿ signal
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="small-btn"
                      aria-label="Retirer"
                      onClick={() =>
                        maj({ epingles: t.epingles.filter((_, j) => j !== i) })
                      }
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                className="lien"
                onClick={() => maj({ epingles: [] })}
              >
                tout retirer
              </button>
            </div>
          ) : (
            <p className="muted small">
              Cliquez sur la carte : la valeur du point y est écrite, et suivra
              les nouveaux calculs.
            </p>
          )}
        </fieldset>
        <p className="muted small">
          Bornes des couleurs, contour d'empreinte, annotations, taille : dans
          Graphes, après « Continuer ».
        </p>
        <Declinaison t={t} />
        {p && instants.length ? (
          <DeclinaisonInstants
            key={p.nom}
            t={t}
            plan={p}
            comparables={grilles
              .map((x) => x.e)
              .filter((e) => parametresVariables(e).length)}
          />
        ) : null}
        {p && instants.length ? <AnimationInstants key={`a-${p.nom}`} t={t} plan={p} /> : null}
      </div>
      <section className="atelier-colonne atelier-resultat">
        <h3>
          <span className="atelier-etape">3</span> Aperçu
        </h3>
        <AtelierApercu
          resultat={calculer(() => executerTrace(t, c))}
          trace={t}
          onClic={epingler}
          onSurvol={setSurvol}
        />
        <div className="atelier-sonde" aria-live="polite">
          {survol && grilles.length ? (
            <>
              <div className="small">
                <strong>Sonde</strong> — {nomX} = {fr(survol.x)}, {nomY} ={" "}
                {fr(survol.y)} {L}
              </div>
              <table>
                <tbody>
                  {grilles.map(({ e, g }) => {
                    const v = valeurCarte(g, survol.x, survol.y);
                    return (
                      <tr
                        key={e.nom}
                        className={e.nom === t.plan ? "actif" : undefined}
                      >
                        <td>{legende(e)}</td>
                        <td>{v === null ? "—" : `${fr(v)}${u}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted small">
              Survolez la carte : la valeur au même point dans{" "}
              {grilles.length > 1
                ? `les ${grilles.length} plans comparables`
                : "ce plan"}
              {instants.length ? ", à l'instant choisi" : ""}. Cliquez : la
              valeur est épinglée.
            </p>
          )}
        </div>
      </section>
    </>
  );
}

/** Une figure par cas et par instant, rangées en planche (lignes = cas, colonnes = instants). */
function DeclinaisonInstants({
  t,
  plan,
  comparables,
}: {
  t: TraceCarte;
  plan: ExportComsol;
  comparables: ExportComsol[];
}) {
  const c = useContexteTrace();
  const legende = useLegende();
  const param = parametresVariables(plan)[0]!;
  const valeurs = param.valeurs.map((v) => v.texte);
  const defaut =
    valeurs.length <= 6
      ? valeurs
      : [0, 1, 2, 3, 4].map(
          (i) => valeurs[Math.round((i * (valeurs.length - 1)) / 4)]!,
        );
  const [instants, setInstants] = useState<string[]>(defaut);
  const [cas, setCas] = useState<string[]>([plan.nom]);
  const [memeEchelle, setMemeEchelle] = useState(true);
  const [etiquettes, setEtiquettes] = useState<StyleEtiquette>("(a)");
  const [etat, setEtat] = useState<string | null>(null);
  const [planche, setPlanche] = useState<string | null>(null);
  const choisis = valeurs.filter((v) => instants.includes(v));
  const lignes = comparables.filter((e) => cas.includes(e.nom));
  const titreInstant = (v: string) => `${param.nom} = ${v}`;
  const n = choisis.length * lignes.length;

  async function creer() {
    setPlanche(null);
    try {
      setEtat("Calcul des figures…");
      const figures = lignes.flatMap((e) =>
        choisis.map((v) => {
          const trace: TraceCarte = {
            ...t,
            plan: e.nom,
            etape: { ...(t.etape ?? {}), [param.nom]: { valeur: v } },
          };
          const r = executerTrace(trace, c);
          if (!r)
            throw new Error(
              `${legende(e)}, ${titreInstant(v)} : rien à tracer.`,
            );
          return { cle: `${e.nom}|${v}`, trace, ...r };
        }),
      );
      const ids = await useAtelier
        .getState()
        .sauverRecettes(figures.map((x) => ({ nom: x.titre, trace: x.trace })));
      const matrice: Matrice = {
        lignes: lignes.length > 1 ? lignes.map(legende) : [""],
        colonnes: choisis.map(titreInstant),
        cases: lignes.map((e) => choisis.map((v) => `${e.nom}|${v}`)),
      };
      const titreEtude = useAtelier.getState().etude?.titre ?? "COMSOL";
      const r = await ecrireDeclinaison(
        figures.map((x, i) => ({
          plan: x.cle,
          titre: x.titre,
          doc: ids
            ? {
                ...x.doc,
                origine: { etude: ids.etude, recette: ids.recettes[i]! },
              }
            : x.doc,
        })),
        {
          matrice,
          titrePlanche: `${courtDe(plan, t.expression ?? "")} au cours de ${param.nom} — ${titreEtude}`,
          tags: ["comsol", titreEtude],
          correspondances: c.correspondances,
          memeEchelle,
          etiquettes,
          tailleCommune: true,
        },
        (i, k) => setEtat(`Écriture des figures : ${i} / ${k}…`),
      );
      setPlanche(r.planche?.dossier ?? null);
      setEtat(
        `${r.figures.length} figure(s) créée(s)${r.planche ? ` et la planche ${r.planche.id}` : ""}.${r.erreurs.length ? `\nProblèmes :\n${r.erreurs.join("\n")}` : ""}${ids ? "" : "\nL'étude n'a pas pu être enregistrée : ces figures ne se régénéreront pas."}`,
      );
    } catch (e) {
      setEtat(`Échec : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <details className="atelier-champ atelier-declinaison">
      <summary>
        <strong>Décliner sur les instants</strong>{" "}
        <span className="muted small">
          (une carte par instant, planche cas × instants)
        </span>
      </summary>
      <div className="small">Instants (6 au plus par ligne de planche) :</div>
      <div className="atelier-grandeurs">
        {valeurs.map((v) => (
          <label key={v} className="chip">
            <input
              type="checkbox"
              checked={instants.includes(v)}
              disabled={!instants.includes(v) && choisis.length >= 6}
              onChange={(x) =>
                setInstants(
                  x.target.checked
                    ? [...instants, v]
                    : instants.filter((y) => y !== v),
                )
              }
            />
            {v}
          </label>
        ))}
      </div>
      {comparables.length > 1 ? (
        <>
          <div className="small">Cas (une ligne de planche chacun) :</div>
          <div className="atelier-grandeurs">
            {comparables.map((e) => (
              <label key={e.nom} className="chip">
                <input
                  type="checkbox"
                  checked={cas.includes(e.nom)}
                  onChange={(x) =>
                    setCas(
                      x.target.checked
                        ? [...cas, e.nom]
                        : cas.filter((y) => y !== e.nom),
                    )
                  }
                />
                {legende(e)}
              </label>
            ))}
          </div>
        </>
      ) : null}
      <label className="chip">
        <input
          type="checkbox"
          checked={memeEchelle}
          onChange={(e) => setMemeEchelle(e.target.checked)}
        />
        Même échelle de couleurs (indispensable pour comparer les instants)
      </label>
      <label className="field">
        <span>Étiquettes</span>
        <select
          value={etiquettes}
          onChange={(e) => setEtiquettes(e.target.value as StyleEtiquette)}
        >
          {ETIQUETTES.map((x) => (
            <option key={x} value={x}>
              {x === "aucune" ? "Aucune" : x}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="primary"
        disabled={!n || (etat?.endsWith("…") ?? false)}
        onClick={() => void creer()}
      >
        Créer {n} figure{n > 1 ? "s" : ""}
        {n >= 2 ? " + la planche" : ""}
      </button>
      {etat ? (
        <p className="small" style={{ whiteSpace: "pre-line" }}>
          {etat}
        </p>
      ) : null}
      {planche ? (
        <button
          type="button"
          onClick={() => {
            useNavigation.getState().goTo("planches");
            void usePlanche.getState().openFromLibrary(planche);
          }}
        >
          Ouvrir la planche →
        </button>
      ) : null}
    </details>
  );
}
