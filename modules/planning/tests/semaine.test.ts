import { describe, expect, it } from "vitest";
import type { Barre } from "../core/gantt";
import { elementVide, lireElement } from "../core/modele";
import { bande, creneauLibre, decaler, disposer, dureeLecture, heure, jours, lundiDe, minutes, placer, titreSemaine } from "../core/semaine";

const h = (id: string, date: string, de: string, a: string): Barre => ({ id, titre: id, categorie: "", debut: date, fin: date, avancement: 0, heureDebut: de, heureFin: a });
const p = (id: string, debut: string, fin = ""): Barre => ({ id, titre: id, categorie: "", debut, fin, avancement: 0 });

describe("éléments horaires", () => {
  it("horaires gardés seulement sur un jour, fin après début ; lien lu", () => {
    expect(lireElement({ titre: "x", debut: "2026-10-07", fin: "2026-10-07", heureDebut: "09:00", heureFin: "10:30" })).toMatchObject({ heureDebut: "09:00", heureFin: "10:30", lien: null });
    expect(lireElement({ titre: "x", debut: "2026-10-07", fin: "2026-10-08", heureDebut: "09:00", heureFin: "10:30" })).toMatchObject({ heureDebut: "", heureFin: "" });
    expect(lireElement({ titre: "x", debut: "2026-10-07", fin: "2026-10-07", heureDebut: "11:00", heureFin: "10:30" }).heureDebut).toBe("");
    expect(lireElement({ titre: "x", debut: "2026-10-07", heureDebut: "25:00", heureFin: "26:00" }).heureDebut).toBe("");
    expect(lireElement({ titre: "x", debut: "2026-10-07", lien: { module: "bibliotheque", id: "BIB-020" } }).lien).toEqual({ module: "bibliotheque", id: "BIB-020" });
    expect(lireElement({ titre: "x", debut: "2026-10-07", lien: { module: "", id: 3 } }).lien).toBeNull();
    // Les anciens fichiers (sans horaires ni lien) se relisent.
    expect(lireElement({ titre: "x", debut: "2026-10-07", fin: "2026-10-30" })).toMatchObject({ heureDebut: "", heureFin: "", lien: null });
  });
});

describe("semaine", () => {
  it("lundi, jours, titre", () => {
    expect(lundiDe("2026-10-07")).toBe("2026-10-05");
    expect(lundiDe("2026-10-05")).toBe("2026-10-05");
    expect(lundiDe("2026-10-11")).toBe("2026-10-05");
    expect(jours("2026-10-05", 3)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(titreSemaine("2026-10-05")).toBe("5 – 11 oct. 2026");
    expect(titreSemaine("2026-09-28")).toBe("28 sept. – 4 oct. 2026");
    expect(titreSemaine("2026-12-28")).toBe("28 déc. 2026 – 3 janv. 2027");
    expect([minutes("09:30"), heure(570), heure(-5), heure(2000)]).toEqual([570, "09:30", "00:00", "23:59"]);
  });

  it("bande : périodes coupées à la semaine, rangées en lignes sans chevauchement", () => {
    const b = bande([p("long", "2026-09-01", "2026-12-31"), p("a", "2026-10-06", "2026-10-07"), p("b", "2026-10-08", "2026-10-09"), p("c", "2026-10-07", "2026-10-08"), p("jalon", "2026-10-09"), p("hors", "2026-10-20", "2026-10-21"), h("horaire", "2026-10-06", "09:00", "10:00")], "2026-10-05");
    const r = Object.fromEntries(b.map((x) => [x.barre.id, [x.de, x.a, x.ligne]]));
    expect(r).toEqual({ long: [0, 6, 0], a: [1, 2, 1], c: [2, 3, 2], b: [3, 4, 1], jalon: [4, 4, 2] });
    expect(b.find((x) => x.barre.id === "long")).toMatchObject({ coupeAvant: true, coupeApres: true });
  });

  it("disposer : colonnes pour les chevauchements, groupes indépendants", () => {
    const d = disposer([h("a", "2026-10-06", "09:00", "11:00"), h("b", "2026-10-06", "10:00", "12:00"), h("c", "2026-10-06", "11:00", "11:30"), h("d", "2026-10-06", "14:00", "15:00"), h("autre jour", "2026-10-07", "09:00", "10:00")], "2026-10-06");
    expect(d.map((x) => [x.barre.id, x.debut, x.colonne, x.colonnes])).toEqual([
      ["a", 540, 0, 2],
      ["b", 600, 1, 2],
      ["c", 660, 0, 2],
      ["d", 840, 0, 1],
    ]);
  });

  it("créneau libre : saute les occupations, le soir, le week-end", () => {
    const occ = [h("r", "2026-10-07", "09:00", "10:00"), h("s", "2026-10-07", "10:30", "12:00")];
    // Mercredi 7, 8 h : 9 h-10 h pris, 10 h-10 h 30 trop court pour 1 h → 12 h.
    expect(creneauLibre(occ, { date: "2026-10-07", minute: 8 * 60 }, 60)).toEqual({ date: "2026-10-07", debut: 720, fin: 780 });
    expect(creneauLibre(occ, { date: "2026-10-07", minute: 8 * 60 }, 30)).toEqual({ date: "2026-10-07", debut: 600, fin: 630 });
    // Vendredi 17 h 40 : plus la place, le week-end est sauté → lundi 9 h.
    expect(creneauLibre([], { date: "2026-10-09", minute: 17 * 60 + 40 }, 60)).toEqual({ date: "2026-10-12", debut: 540, fin: 600 });
    expect(creneauLibre([], { date: "2026-10-07", minute: 9 * 60 + 10 }, 60)).toEqual({ date: "2026-10-07", debut: 570, fin: 630 });
  });

  it("placer, décaler, durée d'une lecture", () => {
    const e = elementVide("2026-10-01", { titre: "Lire", fin: "2026-10-03" });
    expect(placer(e, "2026-10-08", 600, 690)).toMatchObject({ debut: "2026-10-08", fin: "2026-10-08", heureDebut: "10:00", heureFin: "11:30" });
    expect(placer(e, "2026-10-08", 1430, 1500)).toMatchObject({ heureDebut: "23:45", heureFin: "23:59" });
    expect(decaler(e, 2)).toMatchObject({ debut: "2026-10-03", fin: "2026-10-05" });
    expect(decaler({ ...e, fin: "" }, -1)).toMatchObject({ debut: "2026-09-30", fin: "" });
    expect([dureeLecture(0.2), dureeLecture(1.6), dureeLecture(9), dureeLecture(0)]).toEqual([30, 90, 240, 60]);
  });
});
