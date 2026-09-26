import { describe, expect, it } from "vitest";
import { diagnostiquer, niveauGlobal } from "./diagnostic";
import { MODULES, PRODUITS, produitDepuisEnv } from "./produits";
import { Registre } from "./registre";

describe("produits", () => {
  it("Thèse par défaut, et une erreur claire pour un nom inconnu", () => {
    expect(produitDepuisEnv(undefined).id).toBe("these");
    expect(produitDepuisEnv(" figurine ").modules).toEqual(["figures"]);
    expect(() => produitDepuisEnv("figurin")).toThrow("THESE_PRODUIT inconnu");
  });

  it("des identifiants distincts, et seulement des modules connus", () => {
    expect(new Set(PRODUITS.map((p) => p.identifiant)).size).toBe(PRODUITS.length);
    for (const p of PRODUITS) for (const m of p.modules) expect(MODULES).toContain(m);
    expect(produitDepuisEnv("these").modules).toEqual(MODULES);
  });
});

describe("registre", () => {
  it("exécute une action présente, refuse clairement une action absente", async () => {
    const r = new Registre([
      { id: "figures", actions: { "figures.enregistrer": (c: unknown) => `enregistré : ${String(c)}` } },
      { id: "campagnes" },
    ]);
    expect(r.aAction("figures.enregistrer")).toBe(true);
    expect(r.aAction("traitement.ouvrir")).toBe(false);
    expect(await r.executer("figures.enregistrer", "courbe")).toBe("enregistré : courbe");
    await expect(r.executer("traitement.ouvrir")).rejects.toThrow("Action indisponible");
    expect(r.module("campagnes")?.id).toBe("campagnes");
  });

  it("refuse les doublons et les actions mal nommées ou usurpées", () => {
    expect(() => new Registre([{ id: "a" }, { id: "a" }])).toThrow("deux fois");
    expect(() => new Registre([{ id: "a", actions: { ouvrir: () => 0 } }])).toThrow("invalide");
    expect(() => new Registre([{ id: "a", actions: { "b.ouvrir": () => 0 } }])).toThrow("autre module");
  });
});

describe("diagnostic", () => {
  const base = { produit: "Thèse", version: "0.1.0", poste: "PC-TRAVAIL", aRegler: 0 };

  it("tout va bien", () => {
    const c = diagnostiquer({
      ...base,
      espace: { chemin: "C:\\E", etat: { etat: "ok", info: { format: 1, cree: "", creePar: "PC-TRAVAIL" } } },
      racines: [{ nom: "essais", chemin: "E:\\", existe: true }],
    });
    expect(niveauGlobal(c)).toBe("ok");
    expect(c.map((x) => x.titre)).toEqual(["Application", "Espace Thèse", "Racine « essais »", "À régler"]);
  });

  it("une racine absente est une attention, pas une erreur (le PC perso n'a pas les données)", () => {
    const c = diagnostiquer({
      ...base,
      aRegler: 2,
      espace: { chemin: "C:\\E", etat: { etat: "ok", info: { format: 1, cree: "", creePar: "" } } },
      racines: [{ nom: "essais", chemin: "E:\\", existe: false }],
    });
    expect(niveauGlobal(c)).toBe("attention");
    expect(c.find((x) => x.titre === "À régler")?.detail).toBe("2 points à régler (voir l'Accueil).");
  });

  it("un espace manquant ou trop récent est une erreur", () => {
    expect(niveauGlobal(diagnostiquer({ ...base, espace: { chemin: null, etat: null }, racines: [] }))).toBe("erreur");
    expect(niveauGlobal(diagnostiquer({ ...base, espace: { chemin: "C:\\E", etat: { etat: "trop-recent", format: 3 } }, racines: [] }))).toBe("erreur");
  });

  it("un produit sans espace ne parle ni d'espace ni de racines", () => {
    const c = diagnostiquer({ ...base, espace: null, racines: [] });
    expect(c.map((x) => x.titre)).toEqual(["Application"]);
  });
});
