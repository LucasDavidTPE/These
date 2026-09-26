import { describe, expect, it } from "vitest";
import { chargerCollection, creerObjet, FichiersMemoire } from "@noyau/stockage";
import { barresDepuis, cetteSemaine, echelle, graduations, grouper, x, type Barre } from "../core/gantt";
import { CATEGORIES_PAR_DEFAUT, ELEMENTS, lireCategories, lireElement } from "../core/modele";
import { versPgfgantt } from "../core/pgfgantt";

const b = (id: string, categorie: string, debut: string, fin = ""): Barre => ({ id, titre: id, categorie, debut, fin, avancement: 0 });

describe("éléments", () => {
  it("valide les dates, un jalon n'a pas de fin, actif par défaut", () => {
    expect(lireElement({ titre: "Comité de suivi", debut: "2027-03-15" })).toMatchObject({ fin: "", actif: true, avancement: 0 });
    expect(lireElement({ titre: "x", debut: "2026-10-01", fin: "2026-09-01" }).fin).toBe("");
    expect(lireElement({ titre: "x", debut: "2026-10-01", avancement: 250, actif: false })).toMatchObject({ avancement: 100, actif: false });
    expect(() => lireElement({ titre: "x", debut: "demain" })).toThrow("Date de début");
  });

  it("s'enregistre un fichier par élément", async () => {
    const fs = new FichiersMemoire();
    const id = await creerObjet(fs, ELEMENTS, lireElement({ titre: "Campagne TSRST", categorie: "essais", debut: "2026-06-22", fin: "2026-06-25" }));
    expect(id).toBe("PH-0001");
    expect((await chargerCollection(fs, ELEMENTS)).objets[0]!.valeur.titre).toBe("Campagne TSRST");
  });

  it("catégories : défauts si le fichier est absent ou abîmé, couleur contrôlée", () => {
    expect(lireCategories(null)).toBe(CATEGORIES_PAR_DEFAUT);
    expect(lireCategories([{ id: "a", nom: "A", couleur: "rouge", active: false }])).toEqual([{ id: "a", nom: "A", couleur: "#777777", active: false }]);
  });
});

describe("Gantt", () => {
  it("désactiver une phase masque aussi ses tâches ; une tâche hérite de la catégorie de sa phase", () => {
    const e = (titre: string, extra: object) => lireElement({ titre, debut: "2026-10-01", ...extra });
    const barres = barresDepuis([
      { id: "PH-0001", valeur: e("Biblio", { categorie: "biblio" }) },
      { id: "PH-0002", valeur: e("Mois 1", { parent: "PH-0001" }) },
      { id: "PH-0003", valeur: e("Essais", { categorie: "essais", actif: false }) },
      { id: "PH-0004", valeur: e("Éprouvettes", { parent: "PH-0003" }) },
    ]);
    expect(barres.map((x) => [x.id, x.titre, x.categorie])).toEqual([
      ["PH-0001", "Biblio", "biblio"],
      ["PH-0002", "Biblio › Mois 1", "biblio"],
    ]);
  });

  it("groupe par catégorie active, dans l'ordre des catégories, dates croissantes", () => {
    const cats = CATEGORIES_PAR_DEFAUT.map((c) => (c.id === "congres" ? { ...c, active: false } : c));
    const g = grouper([b("r2", "redaction", "2027-05-01"), b("r1", "redaction", "2027-01-01"), b("bib", "biblio", "2026-10-01"), b("c", "congres", "2027-06-01"), b("?", "inconnue", "2026-12-01")], cats);
    expect(g.map((x) => [x.categorie.nom, x.barres.map((y) => y.id)])).toEqual([
      ["Bibliographie", ["bib"]],
      ["Rédaction", ["r1", "r2"]],
      ["Sans catégorie", ["?"]],
    ]);
  });

  it("échelle et graduations mensuelles", () => {
    const e = echelle([b("a", "biblio", "2026-10-01", "2027-03-31")], "2026-09-26", "mois", 100);
    expect(e.pxParJour).toBe(5);
    expect(x(e, "2026-09-26") - x(e, "2026-09-25")).toBe(5);
    const g = graduations(e, "mois");
    expect(g.map((t) => t.libelle).slice(0, 5)).toEqual(["oct.", "nov.", "déc.", "2027", "févr."]);
    expect(g.find((t) => t.libelle === "2027")?.majeure).toBe(true);
  });

  it("« Cette semaine » : en cours, ou qui commence dans les 7 jours", () => {
    const s = cetteSemaine([b("en-cours", "", "2026-09-01", "2026-10-31"), b("passe", "", "2026-09-01", "2026-09-20"), b("bientot", "", "2026-10-01"), b("loin", "", "2026-11-01")], "2026-09-26");
    expect(s.map((x) => x.id)).toEqual(["en-cours", "bientot"]);
  });

  it("export pgfgantt", () => {
    const g = grouper([b("Lecture 1_2", "biblio", "2026-10-01", "2026-10-31"), b("Comité", "reunion", "2027-03-15")], CATEGORIES_PAR_DEFAUT);
    const t = versPgfgantt(g, "2026-10-01", "2027-06-30");
    expect(t).toContain("\\begin{ganttchart}");
    expect(t).toContain("\\ganttbar[bar/.append style={fill={[HTML]2F5F8A}}]{Lecture 1\\_2}{2026-10-01}{2026-10-01} \\\\");
    expect(t).toContain("\\ganttmilestone[milestone/.append style={fill={[HTML]8A5A00}}]{Comité}{2027-03-01}\n\\end{ganttchart}");
  });
});
