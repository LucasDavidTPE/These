import { describe, expect, it } from "vitest";
import { ajouterParties, deplacerPartie, dossierSorties, ecrireManuscrit, FUSION_PAR_DEFAUT, genreProbable, idPartie, idProjet, lireManuscrit, manuscritVide, modifierPartie, nomLisible, nomSortie, ordreFusion, ordreNaturel, retirerPartie } from "../core/plan";
import { RACINE_ESPACE, rattacher, racineProposee, resoudreSource, scinder, versSource } from "../core/sources";
import { dossierVersions } from "../core/versions";

describe("plan d'un manuscrit", () => {
  it("noms, genres, identifiants", () => {
    expect(nomLisible("01_Chapitre1_Etat_de_l_art.docx")).toBe("Chapitre1 Etat de l art");
    expect(nomLisible("00_Document_maitre.docx")).toBe("Document maitre");
    expect(genreProbable("00_Document_maitre.docx")).toBe("liminaire");
    expect(genreProbable("09_Annexes.docx")).toBe("annexe");
    expect(genreProbable("10_Bibliographie.docx")).toBe("bibliographie");
    expect(genreProbable("04_Chapitre4_Code_semi-analytique.docx")).toBe("chapitre");
    expect(idPartie("01_Chapitre1_Etat_de_l_art.docx", new Set())).toBe("chapitre1-etat-de-l-art");
    expect(idPartie("a.docx", new Set(["a"]))).toBe("a-2");
    expect(idProjet("Thèse L. David")).toBe("these-l-david");
    expect(dossierVersions("these", "chapitre1")).toBe("manuscrits/these/versions/chapitre1");
  });

  it("tri naturel : 2 avant 10", () => {
    expect(["10_x.docx", "2_x.docx", "01_x.docx"].sort(ordreNaturel)).toEqual(["01_x.docx", "2_x.docx", "10_x.docx"]);
  });

  it("ajout (sans doublon), modification, déplacement, retrait", () => {
    let m = manuscritVide("Thèse");
    m = ajouterParties(m, [
      { fichier: "00_Introduction_generale.docx", source: "recherche:These/00_Introduction_generale.docx" },
      { fichier: "01_Chapitre1.docx", source: "espace:manuscrits/these/01_Chapitre1.docx" },
    ]);
    m = ajouterParties(m, [{ fichier: "00_Introduction_generale.docx", source: "RECHERCHE:these/00_introduction_generale.docx" }]);
    expect(m.parties.map((p) => p.id)).toEqual(["introduction-generale", "chapitre1"]);
    expect(m.parties[0]).toMatchObject({ genre: "chapitre", statut: "squelette", objectifMots: null, nom: "Introduction generale" });
    m = modifierPartie(m, "chapitre1", { statut: "redaction", objectifMots: 12000 });
    expect(m.parties[1]).toMatchObject({ statut: "redaction", objectifMots: 12000 });
    m = deplacerPartie(m, "chapitre1", -1);
    expect(m.parties.map((p) => p.id)).toEqual(["chapitre1", "introduction-generale"]);
    expect(deplacerPartie(m, "chapitre1", -1)).toBe(m);
    expect(retirerPartie(m, "chapitre1").parties.map((p) => p.id)).toEqual(["introduction-generale"]);
  });

  it("ordre de la fusion : le document maître d'abord, sorties nommées d'après le titre", () => {
    let m = manuscritVide("Thèse L. David");
    m = ajouterParties(m, [
      { fichier: "01_Chapitre1.docx", source: "x:01.docx" },
      { fichier: "00_Document_maitre.docx", source: "x:00.docx" },
      { fichier: "09_Annexes.docx", source: "x:09.docx" },
    ]);
    expect(ordreFusion(m).map((p) => p.id)).toEqual(["document-maitre", "chapitre1", "annexes"]);
    expect(ordreFusion({ ...m, parties: m.parties.slice(0, 1) }).map((p) => p.id)).toEqual(["chapitre1"]);
    expect(nomSortie(m, "propre")).toBe("these-l-david-propre.docx");
    expect(nomSortie({ ...m, titre: "…" }, "relecture")).toBe("manuscrit-relecture.docx");
    expect(dossierSorties("these")).toBe("manuscrits/these/sorties");
  });

  it("lecture tolérante et écriture stable", () => {
    expect(lireManuscrit(null)).toEqual(manuscritVide("Manuscrit"));
    const m = lireManuscrit({
      titre: "T",
      parties: [{ id: "a", source: "x:a.docx", genre: "inconnu", statut: "fige", objectifMots: 5000.4 }, { id: "a", source: "x:b.docx" }, { id: "", source: "x:c.docx" }, { id: "d" }, 3],
      lecture: { consignes: ["Note"], miniSommaires: [] },
    });
    expect(m.parties).toEqual([{ id: "a", nom: "a", source: "x:a.docx", genre: "chapitre", statut: "fige", objectifMots: 5000 }]);
    expect(m.lecture).toEqual({ consignes: ["Note"], miniSommaires: ["SommaireChapitre"], debutARediger: "À rédiger" });
    expect(m.fusion).toEqual(FUSION_PAR_DEFAUT);
    expect(lireManuscrit({ fusion: { saut: "oddPage", nettoyage: { toujours: ["X"] } } }).fusion).toEqual({
      saut: "oddPage",
      nettoyage: { ...FUSION_PAR_DEFAUT.nettoyage, toujours: ["X"] },
    });
    expect(lireManuscrit(JSON.parse(ecrireManuscrit(m)))).toEqual(m);
  });
});

describe("sources des parties", () => {
  const racines = { recherche: "C:\\Users\\DAVID\\Desktop\\Recherche", redaction: "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Rédaction" };
  const espace = "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Espace";

  it("chemin absolu ↔ source, dans une racine ou dans l'espace", () => {
    expect(versSource("C:\\Users\\DAVID\\Desktop\\Recherche\\These\\ch1.docx", espace, racines)).toBe("recherche:These/ch1.docx");
    expect(versSource("c:/users/david/onedrive - entpe.fr/thèse/espace/manuscrits/these/ch2.docx", espace, racines)).toBe("espace:manuscrits/these/ch2.docx");
    expect(versSource("D:\\ailleurs\\x.docx", espace, racines)).toBeNull();
    expect(resoudreSource("recherche:These/ch1.docx", espace, racines)).toEqual({
      ok: true,
      racine: "recherche",
      chemin: "These/ch1.docx",
      dossier: racines.recherche,
      absolu: "C:\\Users\\DAVID\\Desktop\\Recherche\\These\\ch1.docx",
    });
    expect(resoudreSource(`${RACINE_ESPACE}:manuscrits/a.docx`, espace, racines)).toMatchObject({ ok: true, absolu: `${espace}\\manuscrits\\a.docx` });
  });

  it("racine absente sur ce PC, source invalide, pas d'espace", () => {
    expect(resoudreSource("e:ch.docx", espace, racines)).toEqual({ ok: false, racine: "e", message: "Le dossier « e » n'est pas réglé sur ce PC." });
    expect(resoudreSource("espace:a.docx", null, racines)).toMatchObject({ ok: false, message: "Aucun espace n'est ouvert." });
    expect(resoudreSource("pas une source", espace, racines)).toMatchObject({ ok: false });
  });

  it("racine proposée : nom du dossier, unique, valide", () => {
    expect(scinder("C:\\a\\Thèse Lucas\\ch1.docx")).toEqual({ dossier: "C:\\a\\Thèse Lucas", nom: "ch1.docx" });
    expect(racineProposee("C:\\a\\Thèse Lucas", new Set())).toBe("these-lucas");
    expect(racineProposee("C:\\a\\Thèse Lucas", new Set(["these-lucas"]))).toBe("these-lucas-2");
    expect(racineProposee("C:\\a\\2024", new Set())).toBe("manuscrit");
    expect(racineProposee("C:\\a\\espace", new Set())).toBe("espace-2");
  });

  it("rattacher : une nouvelle racine par dossier hors des racines connues", () => {
    const r = rattacher(
      ["D:\\Mes docs\\Thèse\\ch1.docx", "D:\\Mes docs\\Thèse\\ch2.docx", "D:\\Autre\\ch3.docx", "C:\\Users\\DAVID\\Desktop\\Recherche\\ch4.docx"],
      espace,
      racines,
    );
    expect(r.nouvellesRacines).toEqual({ these: "D:\\Mes docs\\Thèse", autre: "D:\\Autre" });
    expect(r.sources.map((s) => s.source)).toEqual(["these:ch1.docx", "these:ch2.docx", "autre:ch3.docx", "recherche:ch4.docx"]);
  });
});
