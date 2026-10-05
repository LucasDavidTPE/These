/**
 * Manuscrits : le plan de la thèse (parties Word, versions, avancement), les corrections reçues,
 * et les présentations.
 */
import { useEffect, useMemo, useState } from "react";
import { Message, Page } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { bilan, type Retour } from "../core/retours";
import { listerRetours } from "./donnees";
import { PlanPage } from "./PlanPage";
import { PresentationsPage } from "./PresentationsPage";
import { RetoursPage } from "./RetoursPage";
import { useManuscrit } from "./useManuscrit";

type Vue = "plan" | "retours" | "presentations";

function Contenu() {
  const ctx = useContexte();
  const ms = useManuscrit(ctx);
  const [vue, setVue] = useState<Vue>("plan");
  const [partie, setPartie] = useState("");
  const [retours, setRetours] = useState<Retour[]>([]);
  const espace = ctx.espace!;
  const { projet } = ms;

  useEffect(() => {
    if (!projet) return;
    let annule = false;
    listerRetours(espace.fichiers, projet)
      .then((r) => !annule && setRetours(r))
      .catch(() => !annule && setRetours([]));
    return () => {
      annule = true;
    };
  }, [espace, projet, ctx.revision]);

  const aTraiter = useMemo(() => retours.reduce((n, r) => n + bilan(r)["a-traiter"], 0), [retours]);

  return (
    <Page titre="Manuscrits" sousTitre="Plan de la thèse, versions et corrections reçues, présentations">
      <nav className="onglets" aria-label="Manuscrits">
        <button type="button" className={vue === "plan" ? "actif" : undefined} onClick={() => setVue("plan")}>
          Plan
        </button>
        <button type="button" className={vue === "retours" ? "actif" : undefined} onClick={() => setVue("retours")}>
          Retours
          {aTraiter ? <span className="compteur">{aTraiter}</span> : null}
        </button>
        <button type="button" className={vue === "presentations" ? "actif" : undefined} onClick={() => setVue("presentations")}>
          Présentations
        </button>
      </nav>
      {vue === "plan" ? (
        <PlanPage
          ms={ms}
          retours={retours}
          voirRetours={(p) => {
            setPartie(p);
            setVue("retours");
          }}
        />
      ) : vue === "retours" ? (
        <RetoursPage key={partie} ms={ms} retours={retours} setRetours={setRetours} partieInitiale={partie} />
      ) : (
        <PresentationsPage />
      )}
    </Page>
  );
}

export function ManuscritsPage() {
  const ctx = useContexte();
  if (!ctx.espace) {
    return (
      <Page titre="Manuscrits">
        <Message niveau="erreur">Le plan, les versions, les corrections reçues et les présentations sont gardés dans l'espace Thèse : ouvrez-en un d'abord.</Message>
      </Page>
    );
  }
  return <Contenu />;
}
