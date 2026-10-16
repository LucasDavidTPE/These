/**
 * « Vue d'ensemble » de l'atelier COMSOL : la même grandeur pour tous les cas, en petites cartes (ou petits
 * profils) à la même échelle, rangées en matrice d'après les noms ; le pic sous chaque case ; un clic ouvre le
 * cas en grand dans la tuile correspondante.
 */
import { useMemo, useState } from "react";
import {
  casEnsemble,
  courtDe,
  expressionParDefaut,
  expressionsCommunes,
  exportGraphSvg,
  geometrie,
  motsVariables,
  traceVide,
  vueEnsemble,
  type TraceCarte,
  type TraceProfils,
} from "../../core/graph";
import { useContexteTrace, useLegende } from "./hooks";
import { useAtelier } from "./useAtelier";

const fr = (x: number) =>
  String(Number(x.toPrecision(4)))
    .replace(".", ",")
    .replace("-", "−");

export function VueEnsemble({ fermer }: { fermer: () => void }) {
  const c = useContexteTrace();
  const legende = useLegende();
  const plans = c.exports.filter(
    (e) => geometrie(e).genre === "coupe" && geometrie(e).reguliere,
  );
  const lignes = c.exports.filter((e) => geometrie(e).genre === "profil");
  const [genre, setGenre] = useState<"coupe" | "profil">(
    plans.length ? "coupe" : "profil",
  );
  const base = genre === "coupe" ? plans : lignes;
  const dispo = expressionsCommunes(base);
  const [choix, setChoix] = useState<string | null>(null);
  const expression =
    choix && dispo.includes(choix) ? choix : expressionParDefaut(dispo);
  const variables = motsVariables(base.map((e) => e.nom));
  const [ligne, setLigne] = useState<number | null | undefined>(undefined);
  const [colonne, setColonne] = useState<number | null | undefined>(undefined);
  const { exports, longueur, interfaces, couches } = {
    exports: c.exports,
    longueur: c.cadre.longueur,
    interfaces: c.interfaces,
    couches: c.cadre.couches,
  };
  const vue = useMemo<
    { ok: ReturnType<typeof vueEnsemble> } | { erreur: string } | null
  >(() => {
    if (!expression) return null;
    try {
      return {
        ok: vueEnsemble(exports, genre, expression, {
          longueur,
          ligne,
          colonne,
          interfaces: couches ? interfaces : undefined,
          legende,
        }),
      };
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : String(e) };
    }
    // la légende change avec les exports et les réglages déjà en dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    exports,
    genre,
    expression,
    longueur,
    ligne,
    colonne,
    interfaces,
    couches,
  ]);
  const svgs = useMemo(
    () =>
      vue && "ok" in vue
        ? new Map(
            [...vue.ok.cases].map(([k, x]) => [
              k,
              exportGraphSvg(x.doc).replace(/<\?xml[^>]*>/, ""),
            ]),
          )
        : new Map<string, string>(),
    [vue],
  );
  const ouvrir = (nom: string) => {
    const a = useAtelier.getState();
    if (!expression) return;
    if (genre === "coupe") {
      const t = (a.traces.carte ?? traceVide("carte")) as TraceCarte;
      a.majTrace("carte", { ...t, plan: nom, expression });
      a.set({ mode: "carte" });
    } else {
      const t = (a.traces.profils ?? traceVide("profils")) as TraceProfils;
      a.majTrace("profils", {
        ...t,
        fichiers: [nom],
        expressions: [expression],
      });
      a.set({ mode: "profils" });
    }
    fermer();
  };
  const mot = (
    v: number | null | undefined,
    set: (k: number | null) => void,
    defaut: number | null,
  ) => (
    <select
      value={
        (v === undefined ? defaut : v) === null
          ? ""
          : String(v === undefined ? defaut : v)
      }
      onChange={(e) =>
        set(e.target.value === "" ? null : Number(e.target.value))
      }
    >
      <option value="">(une seule)</option>
      {variables.map((x) => (
        <option key={x.k} value={x.k}>
          mot {x.k + 1} : {x.valeurs.slice(0, 4).join(", ")}
          {x.valeurs.length > 4 ? "…" : ""}
        </option>
      ))}
    </select>
  );
  const m = vue && "ok" in vue ? vue.ok.matrice : null;
  return (
    <section className="atelier-colonne atelier-ensemble">
      <div className="atelier-ensemble-barre">
        <strong>Vue d'ensemble</strong>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value as "coupe" | "profil")}
          aria-label="Genre de cas"
        >
          {plans.length ? (
            <option value="coupe">Coupes ({plans.length})</option>
          ) : null}
          {lignes.length ? (
            <option value="profil">Lignes ({lignes.length})</option>
          ) : null}
        </select>
        <select
          value={expression ?? ""}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Grandeur"
        >
          {dispo.map((x) => (
            <option key={x} value={x}>
              {courtDe(base[0], x)}
            </option>
          ))}
        </select>
        <span className="small">lignes</span>
        {mot(ligne, setLigne, variables.length >= 2 ? variables[0]!.k : null)}
        <span className="small">colonnes</span>
        {mot(
          colonne,
          setColonne,
          variables.length >= 2 ? variables[1]!.k : (variables[0]?.k ?? null),
        )}
        <span className="grow" />
        <button type="button" onClick={fermer}>
          Fermer
        </button>
      </div>
      {vue && "erreur" in vue ? (
        <p className="banner error">{vue.erreur}</p>
      ) : null}
      {m && vue && "ok" in vue ? (
        <table className="atelier-ensemble-grille">
          {m.colonnes.some(Boolean) ? (
            <thead>
              <tr>
                {m.lignes.some(Boolean) ? <th /> : null}
                {m.colonnes.map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {m.cases.map((l, i) => (
              <tr key={i}>
                {m.lignes.some(Boolean) ? <th>{m.lignes[i]}</th> : null}
                {l.map((nom, j) => {
                  const x = nom ? vue.ok.cases.get(nom) : undefined;
                  return (
                    <td key={j}>
                      {x && nom ? (
                        <button
                          type="button"
                          className="atelier-ensemble-case"
                          onClick={() => ouvrir(nom)}
                          title={`${legende(c.exports.find((e) => e.nom === nom)!)} — ouvrir en grand`}
                        >
                          <span
                            className="atelier-svg"
                            dangerouslySetInnerHTML={{
                              __html: svgs.get(nom) ?? "",
                            }}
                          />
                          <span className="small">
                            {legende(c.exports.find((e) => e.nom === nom)!)}
                            {x.pic ? ` — pic ${fr(x.pic.y)}` : ""}
                          </span>
                        </button>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {casEnsemble(c.exports, genre, expression ?? "").length ? null : (
        <p className="muted">Aucun cas avec cette grandeur.</p>
      )}
    </section>
  );
}
