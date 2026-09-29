import { describe, expect, it } from "vitest";
import { auteursCourts, lireReglageCitations, referenceComplete, resoudre } from "../core/citations";
import { lireReference } from "../core/modele";

const olard = lireReference({ cle: "olard2003general", titre: "General \"2S2P1D\" model.", auteurs: "Olard, F.; Di Benedetto, H.", annee: 2003, support: "Road Materials and Pavement Design", volume: "4", numero: "2", pages: "185-224", doi: "https://doi.org/10.1080/14680629.2003.9689946" });

describe("citations de la Bibliothèque", () => {
  it("noms courts", () => {
    expect(auteursCourts("Burmister, D. M.")).toBe("Burmister");
    expect(auteursCourts("Olard, F.; Di Benedetto, H.")).toBe("Olard & Di Benedetto");
    expect(auteursCourts("Chupin, O.; Chabot, A.; Piau, J.-M.")).toBe("Chupin et al.");
    expect(auteursCourts("")).toBe("Anonyme");
  });

  it("référence complète, DOI normalisé", () => {
    expect(referenceComplete(olard)).toBe('Olard, F., Di Benedetto, H. (2003). General "2S2P1D" model. Road Materials and Pavement Design, 4(2), 185-224. https://doi.org/10.1080/14680629.2003.9689946');
  });

  it("résout par identifiant ou par clé, ignore l'inconnu", () => {
    const r = resoudre([{ id: "BIB-020", valeur: olard }], ["BIB-020", "olard2003general", "BIB-999"]);
    expect(Object.keys(r)).toEqual(["BIB-020", "olard2003general"]);
    expect(r["olard2003general"]).toMatchObject({ id: "BIB-020", auteurs: "Olard & Di Benedetto", annee: "2003" });
  });

  it("réglage : actif par défaut, coupé seulement sur demande", () => {
    expect(lireReglageCitations(null).actives).toBe(true);
    expect(lireReglageCitations({ actives: false }).actives).toBe(false);
  });
});
