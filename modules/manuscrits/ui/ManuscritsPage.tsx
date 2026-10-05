/**
 * Manuscrits : le plan de la thèse (parties Word, versions, avancement) et les présentations.
 */
import { useState } from "react";
import { Message, Page } from "@interface/composants";
import { useContexte } from "@interface/contexte";
import { PlanPage } from "./PlanPage";
import { PresentationsPage } from "./PresentationsPage";

export function ManuscritsPage() {
  const ctx = useContexte();
  const [vue, setVue] = useState<"plan" | "presentations">("plan");
  if (!ctx.espace) {
    return (
      <Page titre="Manuscrits">
        <Message niveau="erreur">Le plan, les versions et les présentations sont gardés dans l'espace Thèse : ouvrez-en un d'abord.</Message>
      </Page>
    );
  }
  return (
    <Page titre="Manuscrits" sousTitre="Plan de la thèse, versions des fichiers Word, présentations">
      <nav className="onglets" aria-label="Manuscrits">
        <button type="button" className={vue === "plan" ? "actif" : undefined} onClick={() => setVue("plan")}>
          Plan
        </button>
        <button type="button" className={vue === "presentations" ? "actif" : undefined} onClick={() => setVue("presentations")}>
          Présentations
        </button>
      </nav>
      {vue === "plan" ? <PlanPage /> : <PresentationsPage />}
    </Page>
  );
}
