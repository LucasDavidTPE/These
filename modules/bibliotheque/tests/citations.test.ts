import { describe, expect, it } from "vitest";
import { auteursCourts, completionCitation, insererCitation, lireReglageCitations, referenceComplete, resoudre } from "../core/citations";
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

describe("saisie assistée des citations", () => {
  const burmister = lireReference({ cle: "burmister1945", titre: "The general theory of stresses and displacements in layered systems", auteurs: "Burmister, D. M.", annee: 1945 });
  const chupin = lireReference({ cle: "chupin2013", titre: "Effect of the 2S2P1D model on pavement response", auteurs: "Chupin, O.; Chabot, A.; Piau, J.-M.", annee: 2013 });
  const refs = [
    { id: "BIB-065", valeur: burmister },
    { id: "BIB-020", valeur: olard },
    { id: "BIB-100", valeur: chupin },
  ];
  const ids = (c: ReturnType<typeof completionCitation>) => c?.suggestions.map((s) => s.id);

  it("« [@ » propose tout, trié par identifiant ; la suite de la saisie filtre (accents, casse, mots)", () => {
    const t = "À voir : [@";
    expect(ids(completionCitation(t, t.length, refs))).toEqual(["BIB-020", "BIB-065", "BIB-100"]);
    expect(ids(completionCitation("[@olard", 7, refs))).toEqual(["BIB-020"]);
    expect(ids(completionCitation("[@DI benedetto 2003", 19, refs))).toEqual(["BIB-020"]);
    expect(ids(completionCitation("[@2s2p1d", 8, refs))).toEqual(["BIB-020", "BIB-100"]);
    expect(ids(completionCitation("[@layered", 9, refs))).toEqual(["BIB-065"]);
    expect(completionCitation("[@zzz", 5, refs)).toBeNull();
  });

  it("pas de proposition hors d'une citation en cours : adresse e-mail, crochet fermé, curseur avant le @", () => {
    expect(completionCitation("écrire à lucas@entpe.fr", 23, refs)).toBeNull();
    expect(completionCitation("[@BIB-020] puis du texte", 24, refs)).toBeNull();
    expect(completionCitation("pas de citation", 15, refs)).toBeNull();
    expect(completionCitation("[@ol", 1, refs)).toBeNull();
  });

  it("une référence exclue (la fiche elle-même) n'est pas proposée", () => {
    expect(ids(completionCitation("[@", 2, refs, "BIB-020"))).toEqual(["BIB-065", "BIB-100"]);
  });

  it("insère « [@BIB-020] » à la place de la saisie et place le curseur après", () => {
    const t = "Voir [@ol et la suite";
    const c = completionCitation(t, 9, refs)!;
    expect(c.debut).toBe(5);
    expect(insererCitation(t, 9, c, "BIB-020")).toEqual({ texte: "Voir [@BIB-020] et la suite", curseur: 15 });
    // un « ] » déjà présent n'est pas doublé
    const t2 = "Voir [@ol] fin";
    const c2 = completionCitation(t2, 9, refs)!;
    expect(insererCitation(t2, 9, c2, "BIB-020").texte).toBe("Voir [@BIB-020] fin");
    // un « @ » seul, après un espace
    const t3 = "voir @bur";
    expect(insererCitation(t3, 9, completionCitation(t3, 9, refs)!, "BIB-065").texte).toBe("voir [@BIB-065]");
  });

  it("dans un groupe déjà ouvert, « ; @… » ajoute une clé sans nouveau crochet", () => {
    const t = "[@BIB-020; @bur";
    const c = completionCitation(t, t.length, refs)!;
    expect(ids(c)).toEqual(["BIB-065"]);
    expect(insererCitation(t, t.length, c, "BIB-065")).toEqual({ texte: "[@BIB-020; @BIB-065", curseur: 19 });
  });
});
