import { IconePlanning } from "@interface/icones";
import type { Contexte } from "@interface/contexte";
import type { Manifeste } from "@interface/manifeste";
import { barresDepuis, cetteSemaine } from "./core/gantt";
import { chargerPlanning, renduGantt } from "./ui/donnees";
import { PlanningPage } from "./ui/PlanningPage";

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function semaine(ctx: Contexte) {
  const p = await chargerPlanning(ctx);
  if (!p) return [];
  const actives = new Set(p.categories.filter((c) => c.active).map((c) => c.id));
  return cetteSemaine([...barresDepuis(p.elements), ...p.externes], aujourdhui()).filter((b) => actives.has(b.categorie) || !b.categorie);
}

const planning: Manifeste = {
  id: "planning",
  titre: "Planning",
  resume: "Gantt de la thèse, partagé entre les deux PC",
  Icone: IconePlanning,
  Page: PlanningPage,
  etat: async (ctx) => {
    const s = await semaine(ctx);
    return s.length ? `Cette semaine : ${s.map((b) => b.titre).slice(0, 2).join(", ")}${s.length > 2 ? "…" : ""}` : "Rien d'inscrit cette semaine";
  },
  problemes: async (ctx) => (await chargerPlanning(ctx))?.problemes ?? [],
  actions: {
    /** Pour l'Accueil : ce qui est en cours ou arrive dans les 7 jours. */
    "planning.cette-semaine": (ctx) => semaine(ctx as Contexte),
    /** Refait la figure « Planning de la thèse » (Figures) avec le planning d'aujourd'hui. */
    "planning.regenerer-figure": async (charge) => {
      const { ctx } = charge as { ctx: Contexte };
      const p = await chargerPlanning(ctx);
      if (!p) throw new Error("Le planning vit dans l'espace Thèse : aucun espace n'est ouvert.");
      return renduGantt(p);
    },
  },
};

export default planning;
