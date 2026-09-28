import { describe, expect, it } from "vitest";
import { dossierFigures, horsEspace, lireReference, racinesEffectives, referenceDepuisChemin, resoudre } from "./racines";
import { ecrireReglages, espacePropose, lireReglages, REGLAGES_PAR_DEFAUT } from "./reglages";

describe("réglages du poste", () => {
  it("donne les défauts pour un fichier absent ou abîmé", () => {
    for (const t of [null, "", "{", "[]", "42"]) expect(lireReglages(t)).toEqual(REGLAGES_PAR_DEFAUT);
  });

  it("garde ce qui est valide et écarte le reste", () => {
    const r = lireReglages(
      JSON.stringify({ espace: " C:\\OneDrive\\Thèse\\Espace ", figures: "", racines: { essais: "E:\\", "Mauvais nom": "D:\\", vide: "  ", "biblio-pdf": "C:\\BIBLIO" } }),
    );
    expect(r).toEqual({ version: 1, espace: "C:\\OneDrive\\Thèse\\Espace", figures: null, racines: { essais: "E:\\", "biblio-pdf": "C:\\BIBLIO" } });
  });

  it("écrit un fichier stable, racines triées", () => {
    const texte = ecrireReglages({ version: 1, espace: "C:\\E", figures: null, racines: { recherche: "C:\\R", essais: "E:\\" } });
    expect(texte).toBe('{\n  "version": 1,\n  "espace": "C:\\\\E",\n  "figures": null,\n  "racines": {\n    "essais": "E:\\\\",\n    "recherche": "C:\\\\R"\n  }\n}\n');
    expect(lireReglages(texte).racines).toEqual({ essais: "E:\\", recherche: "C:\\R" });
  });

  it("propose l'espace dans le OneDrive", () => {
    expect(espacePropose("C:\\Users\\DAVID\\OneDrive - entpe.fr")).toBe("C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Espace");
  });
});

describe("racines de données", () => {
  const racines = { essais: "E:\\", recherche: "C:\\Users\\DAVID\\Desktop\\Recherche" };

  it("lit les références", () => {
    expect(lireReference("essais:tsrst-lucas/Essai1")).toEqual({ racine: "essais", chemin: "tsrst-lucas/Essai1" });
    expect(lireReference("essais:")).toEqual({ racine: "essais", chemin: "" });
    expect(lireReference("recherche:Sergio CM test Bio\\Essai1")).toEqual({ racine: "recherche", chemin: "Sergio CM test Bio/Essai1" });
    for (const ko of ["essais", ":x", "E:/x", "essais:../x", "Essais:x"]) expect(lireReference(ko)).toBeNull();
  });

  it("résout sur ce poste, ou dit pourquoi pas", () => {
    expect(resoudre("essais:tsrst-lucas/Essai1", racines)).toEqual({ ok: true, chemin: "E:\\tsrst-lucas\\Essai1" });
    expect(resoudre("recherche:", racines)).toEqual({ ok: true, chemin: "C:\\Users\\DAVID\\Desktop\\Recherche" });
    expect(resoudre("comsol:a", racines)).toMatchObject({ ok: false, raison: "racine-inconnue" });
    expect(resoudre("n'importe quoi", racines)).toMatchObject({ ok: false, raison: "reference-invalide" });
  });

  it("retrouve la référence d'un dossier choisi, sans tenir compte de la casse", () => {
    expect(referenceDepuisChemin("E:\\tsrst-lucas\\Essai1", racines)).toBe("essais:tsrst-lucas/Essai1");
    expect(referenceDepuisChemin("c:\\users\\david\\desktop\\recherche\\B2C4", racines)).toBe("recherche:B2C4");
    expect(referenceDepuisChemin("C:\\Users\\DAVID\\Desktop\\RechercheBis", racines)).toBeNull();
    expect(referenceDepuisChemin("D:\\x", racines)).toBeNull();
  });
});

describe("ce qui vit dans l'espace", () => {
  const espace = "C:\\OneDrive\\Thèse\\Espace";
  it("place les PDF et les figures dans l'espace, quoi que dise le poste", () => {
    expect(racinesEffectives({ essais: "E:\\", "biblio-pdf": "C:\\BIBLIO" }, espace)).toEqual({ essais: "E:\\", "biblio-pdf": "C:\\OneDrive\\Thèse\\Espace\\bibliotheque\\pdf" });
    expect(racinesEffectives({ essais: "E:\\" }, null)).toEqual({ essais: "E:\\" });
    expect(dossierFigures("C:\\Figures", espace)).toBe("C:\\OneDrive\\Thèse\\Espace\\figures");
    expect(dossierFigures("C:\\Figures", null)).toBe("C:\\Figures");
  });

  it("liste les anciens emplacements à rapatrier", () => {
    expect(horsEspace({ racines: { "biblio-pdf": "C:\\BIBLIO" }, figures: "C:\\Figures" }, espace)).toEqual([
      { quoi: "biblio-pdf", chemin: "C:\\BIBLIO" },
      { quoi: "figures", chemin: "C:\\Figures" },
    ]);
    expect(horsEspace({ racines: {}, figures: "c:/onedrive/thèse/espace/figures/" }, espace)).toEqual([]);
    expect(horsEspace({ racines: { "biblio-pdf": "C:\\BIBLIO" }, figures: null }, null)).toEqual([]);
  });
});
