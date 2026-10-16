/**
 * Tuile « Critères de dimensionnement » : pour chaque cas, εt à la base des couches liées et εz au sommet des
 * couches non liées, cycles admissibles d'après les lois réglées (pour toute la bibliothèque), dommage pour un
 * trafic, critère dimensionnant ; tableau booktabs et barres (cycles en échelle log, déformations, ou relatif
 * à un cas de référence).
 */
import { useState } from "react";
import {
  avecCote,
  criteresLatex,
  critereDimensionnant,
  type AffichageCriteres,
  type Critere,
  type Evaluation,
  type TraceCriteres,
} from "../../core/graph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { getBackend } from "../platform/backend";
import { AtelierApercu } from "./AtelierApercu";
import { ChoixEtape } from "./Instants";
import { useContexteTrace, useLegende, useTrace, useResultat } from "./hooks";

const fr = (x: number, ch = 3) =>
  String(Number(x.toPrecision(ch)))
    .replace(".", ",")
    .replace("-", "−");
const nombre = (t: string) =>
  Number(t.trim().replace(/\s/g, "").replace(",", ".").replace("−", "-"));
/** « 1,2·10⁶ » lisible pour les grands nombres de cycles. */
function cycles(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n < 1e4) return fr(n);
  const e = Math.floor(Math.log10(n));
  const exp = String(e)
    .split("")
    .map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)])
    .join("");
  return `${fr(n / 10 ** e)}·10${exp}`;
}

export function ModeCriteres() {
  const c = useContexteTrace();
  const legende = useLegende();
  const [t, maj] = useTrace<TraceCriteres>("criteres");
  const tous = c.criteres ?? [];
  const cas = avecCote(c.exports);
  const actifs = t.criteres
    ? tous.filter((x) => t.criteres!.includes(x.id))
    : tous;
  const resultat = useResultat(t);
  const tableau =
    resultat && "tableau" in resultat ? resultat.tableau : undefined;
  const tex = () =>
    tableau
      ? criteresLatex(tableau, { virgule: t.virgule, trafic: t.trafic })
      : "";
  const basculer = <K extends "fichiers" | "criteres">(
    cle: K,
    liste: string[],
    id: string,
    oui: boolean,
  ) => {
    const actuels = t[cle] ?? liste;
    const n = oui ? [...actuels, id] : actuels.filter((x) => x !== id);
    maj({
      [cle]: n.length === liste.length ? null : n,
    } as Partial<TraceCriteres>);
  };
  return (
    <>
      <div className="atelier-reglages">
        <ChoixEtape mode="criteres" />
        <fieldset className="atelier-champ">
          <legend>Cas évalués (coupes contenant z, profils verticaux)</legend>
          {cas.map((e) => (
            <label key={e.nom} className="chip">
              <input
                type="checkbox"
                checked={!t.fichiers || t.fichiers.includes(e.nom)}
                onChange={(x) =>
                  basculer(
                    "fichiers",
                    cas.map((f) => f.nom),
                    e.nom,
                    x.target.checked,
                  )
                }
              />
              {legende(e)}
            </label>
          ))}
        </fieldset>
        <fieldset className="atelier-champ">
          <legend>Critères</legend>
          {tous.map((k) => (
            <label
              key={k.id}
              className="chip"
              title={`${k.genre === "traction" ? "Traction" : "Compression"} ${k.cote} de z = ${fr(k.z)} m ; ${k.variables.join(", ")}`}
            >
              <input
                type="checkbox"
                checked={!t.criteres || t.criteres.includes(k.id)}
                onChange={(x) =>
                  basculer(
                    "criteres",
                    tous.map((y) => y.id),
                    k.id,
                    x.target.checked,
                  )
                }
              />
              {k.nom}
            </label>
          ))}
          <EditeurCriteres />
        </fieldset>
        <label className="field">
          <span>
            Trafic de calcul, en cycles (facultatif : déformations admissibles
            et dommage)
          </span>
          <input
            defaultValue={t.trafic === null ? "" : String(t.trafic)}
            placeholder="ex. 2e6"
            onBlur={(e) =>
              maj({
                trafic:
                  e.target.value.trim() && nombre(e.target.value) > 0
                    ? nombre(e.target.value)
                    : null,
              })
            }
          />
        </label>
        <label className="field">
          <span>Diagramme</span>
          <select
            value={t.affichage}
            onChange={(e) =>
              maj({ affichage: e.target.value as AffichageCriteres })
            }
          >
            <option value="cycles">Cycles admissibles (échelle log)</option>
            <option value="deformation">Déformations critiques (µdef)</option>
            <option value="relatif">
              Cycles admissibles rapportés à un cas de référence (%)
            </option>
          </select>
        </label>
        {t.affichage === "relatif" ? (
          <label className="field">
            <span>Cas de référence</span>
            <select
              value={t.reference ?? ""}
              onChange={(e) => maj({ reference: e.target.value })}
            >
              {cas.map((e) => (
                <option key={e.nom} value={e.nom}>
                  {legende(e)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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
          <span className="atelier-etape">3</span> Résultats
        </h3>
        {resultat && "erreur" in resultat ? (
          <p className="banner error">{resultat.erreur}</p>
        ) : null}
        {tableau ? (
          <>
            <div className="comsol-synthese">
              <table>
                <thead>
                  <tr>
                    <th>Cas</th>
                    {actifs.map((k) => (
                      <th key={k.id}>{k.nom}</th>
                    ))}
                    <th>Dimensionnant</th>
                  </tr>
                </thead>
                <tbody>
                  {tableau.lignes.map((l) => {
                    const d = critereDimensionnant(l, tableau.criteres);
                    return (
                      <tr key={l.fichier}>
                        <td title={l.fichier}>{l.legende}</td>
                        {l.cases.map((x, k) => (
                          <td
                            key={k}
                            className={
                              d?.critere.id === tableau.criteres[k]!.id
                                ? "atelier-critique"
                                : undefined
                            }
                            title={
                              "raison" in x
                                ? x.raison
                                : detail(x, tableau.criteres[k]!)
                            }
                          >
                            {"raison" in x ? (
                              <span className="muted">—</span>
                            ) : (
                              <>
                                {fr(x.valeur)} µdef
                                <br />
                                {x.cycles === null ? (
                                  <span className="small muted">
                                    {tableau.criteres[k]!.genre === "traction"
                                      ? "pas de traction"
                                      : "pas de compression"}
                                  </span>
                                ) : (
                                  <span className="small">
                                    N = {cycles(x.cycles)}
                                  </span>
                                )}
                                {x.dommage !== null ? (
                                  <span
                                    className={`small ${x.dommage > 1 ? "atelier-avert" : "atelier-suivi"}`}
                                  >
                                    {" "}
                                    · D = {fr(x.dommage, 2)}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </td>
                        ))}
                        <td>
                          {d ? `${d.critere.nom} (${cycles(d.cycles)})` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              Case surlignée : le critère dimensionnant du cas (le moins de
              cycles admissibles). Survol : position, variable et cote évaluée.
              {t.trafic
                ? ` D = trafic / N (Miner) : > 1, la structure ne tient pas ${cycles(t.trafic)} cycles.`
                : ""}
            </p>
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
                  void getBackend().then((b) =>
                    b.saveTextAs(tex(), "criteres-comsol.tex", "tex"),
                  )
                }
              >
                Exporter .tex…
              </button>
            </div>
            <AtelierApercu resultat={resultat} trace={t} aide="Diagramme :" />
          </>
        ) : !(resultat && "erreur" in resultat) ? (
          <div className="atelier-apercu vide">
            Cochez des cas et des critères.
          </div>
        ) : null}
      </section>
    </>
  );
}

function detail(x: Evaluation, k: Critere): string {
  const pos = Object.entries(x.position)
    .map(([c, v]) => `${c.toLowerCase()} = ${fr(v, 5)}`)
    .join(", ");
  return `${x.variable} ${k.genre === "traction" ? "en traction" : "en compression"}, ligne z = ${fr(x.zEvalue, 5)} ; ${pos}${x.admissible !== null ? ` ; admissible pour le trafic : ${fr(x.admissible)} µdef` : ""}`;
}

/** Critères et lois, réglés pour toute la bibliothèque (avec les interfaces et les correspondances). */
function EditeurCriteres() {
  const reg = useReglagesComsol();
  const [ouvert, setOuvert] = useState(false);
  const [brouillon, setBrouillon] = useState<Critere[]>(reg.reglages.criteres);
  const [vu, setVu] = useState(reg.reglages.criteres);
  if (vu !== reg.reglages.criteres) {
    setVu(reg.reglages.criteres);
    setBrouillon(reg.reglages.criteres);
  }
  const maj = (i: number, p: Partial<Critere>) =>
    setBrouillon(brouillon.map((c, k) => (k === i ? { ...c, ...p } : c)));
  const modifie =
    JSON.stringify(brouillon) !== JSON.stringify(reg.reglages.criteres);
  const num = (v: number, set: (n: number) => void, titre: string) => (
    <input
      defaultValue={String(v).replace(".", ",")}
      onBlur={(e) =>
        Number.isFinite(nombre(e.target.value)) && set(nombre(e.target.value))
      }
      aria-label={titre}
      title={titre}
    />
  );
  return (
    <div>
      <button
        type="button"
        className="lien"
        aria-expanded={ouvert}
        onClick={() => setOuvert(!ouvert)}
      >
        {ouvert ? "▾" : "▸"} Régler les critères et les lois…
      </button>
      {ouvert ? (
        <div className="atelier-criteres-edition">
          {brouillon.map((c, i) => (
            <div key={c.id} className="atelier-critere">
              <div className="comsol-ligne">
                <input
                  value={c.nom}
                  onChange={(e) => maj(i, { nom: e.target.value })}
                  aria-label="Nom"
                />
                <button
                  type="button"
                  className="small-btn"
                  aria-label="Retirer"
                  onClick={() =>
                    setBrouillon(brouillon.filter((_, k) => k !== i))
                  }
                >
                  ×
                </button>
              </div>
              <div className="comsol-ligne small">
                <select
                  value={c.genre}
                  onChange={(e) =>
                    maj(
                      i,
                      e.target.value === "traction"
                        ? {
                            genre: "traction",
                            loi: {
                              genre: "fatigue",
                              epsilon6: 100,
                              b: -0.2,
                              k: 1,
                            },
                          }
                        : {
                            genre: "compression",
                            loi: { genre: "sol", A: 0.012, exposant: 0.222 },
                          },
                    )
                  }
                >
                  <option value="traction">traction max</option>
                  <option value="compression">compression max</option>
                </select>
                <select
                  value={c.cote}
                  onChange={(e) =>
                    maj(i, { cote: e.target.value as Critere["cote"] })
                  }
                >
                  <option value="dessus">au-dessus de</option>
                  <option value="dessous">en dessous de</option>
                </select>
                <span>z =</span>
                {num(
                  c.z,
                  (z) => maj(i, { z }),
                  "Cote de l'interface (m, négative)",
                )}
                <span>m</span>
              </div>
              <div className="comsol-ligne small">
                <span>parmi</span>
                <input
                  defaultValue={c.variables.join(", ")}
                  onBlur={(e) =>
                    maj(i, {
                      variables: e.target.value
                        .split(/[,;\s]+/)
                        .filter(Boolean),
                    })
                  }
                  aria-label="Variables"
                  title="Noms des colonnes (exx, eyy, ezz, e1…)"
                />
                <span>décalage</span>
                {num(
                  c.decalage,
                  (decalage) => maj(i, { decalage }),
                  "Décalage dans la couche (m)",
                )}
                <span>m</span>
              </div>
              {c.loi.genre === "fatigue" ? (
                <div
                  className="comsol-ligne small"
                  title="εt,adm = ε6 · k · (N/10⁶)^b"
                >
                  <span>ε6</span>
                  {num(
                    c.loi.epsilon6,
                    (epsilon6) =>
                      maj(i, {
                        loi: {
                          ...(c.loi as Extract<
                            Critere["loi"],
                            { genre: "fatigue" }
                          >),
                          epsilon6,
                        },
                      }),
                    "ε6 (µdef)",
                  )}
                  <span>b</span>
                  {num(
                    c.loi.b,
                    (b) =>
                      maj(i, {
                        loi: {
                          ...(c.loi as Extract<
                            Critere["loi"],
                            { genre: "fatigue" }
                          >),
                          b,
                        },
                      }),
                    "pente b (négative)",
                  )}
                  <span>k</span>
                  {num(
                    c.loi.k,
                    (k) =>
                      maj(i, {
                        loi: {
                          ...(c.loi as Extract<
                            Critere["loi"],
                            { genre: "fatigue" }
                          >),
                          k,
                        },
                      }),
                    "k = kc·kr·ks·kθ",
                  )}
                </div>
              ) : (
                <div className="comsol-ligne small" title="εz,adm = A · N^(−e)">
                  <span>A</span>
                  {num(
                    c.loi.A,
                    (A) =>
                      maj(i, {
                        loi: {
                          ...(c.loi as Extract<
                            Critere["loi"],
                            { genre: "sol" }
                          >),
                          A,
                        },
                      }),
                    "A (sans unité, 0,012 ou 0,016)",
                  )}
                  <span>e</span>
                  {num(
                    c.loi.exposant,
                    (exposant) =>
                      maj(i, {
                        loi: {
                          ...(c.loi as Extract<
                            Critere["loi"],
                            { genre: "sol" }
                          >),
                          exposant,
                        },
                      }),
                    "exposant (0,222)",
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="rangee-boutons">
            <button
              type="button"
              className="small-btn"
              onClick={() =>
                setBrouillon([
                  ...brouillon,
                  {
                    id: `critere-${Date.now().toString(36)}`,
                    nom: "Nouveau critère",
                    genre: "traction",
                    z: -0.1,
                    cote: "dessus",
                    decalage: 0,
                    variables: ["exx", "eyy"],
                    loi: { genre: "fatigue", epsilon6: 100, b: -0.2, k: 1 },
                  },
                ])
              }
            >
              + Critère
            </button>
            <button
              type="button"
              className="primary"
              disabled={!modifie}
              onClick={() =>
                void reg.enregistrer({ ...reg.reglages, criteres: brouillon })
              }
            >
              Enregistrer
            </button>
          </div>
          <p className="muted small">
            Fatigue : εt,adm = ε6·k·(N/10⁶)^b ; sol : εz,adm = A·N^(−e). Valeurs
            de départ indicatives : à remplacer par celles des matériaux de
            l'étude.
          </p>
        </div>
      ) : null}
    </div>
  );
}
