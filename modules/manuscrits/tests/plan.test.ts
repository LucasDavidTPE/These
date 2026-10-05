import { describe, expect, it } from "vitest";
import { ajouterParties, deplacerPartie, libelleGenre, libelleType, dossierSorties, ecrireManuscrit, FUSION_PAR_DEFAUT, genreProbable, idPartie, idProjet, lireManuscrit, manuscritVide, modifierPartie, nomLisible, nomSortie, ordreFusion, ordreNaturel, retirerPartie } from "../core/plan";
import { FichiersMemoire } from "@noyau/stockage";
import { chercherFichier, dossierOneDrive, estIntrouvable, partagerSources, RACINE_ESPACE, rattacher, relierFichier, sourcePartagee, racineProposee, resoudreSource, scinder, versSource } from "../core/sources";
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
    expect(nomSortie(m)).toBe("these-l-david.docx");
    expect(nomSortie({ ...m, titre: "…" })).toBe("document.docx");
    expect(dossierSorties("these")).toBe("manuscrits/these/sorties");
  });

  it("types de document : thèse par défaut, article et rapport nommés autrement", () => {
    expect(lireManuscrit({ titre: "Ancien plan" }).type).toBe("these");
    expect(lireManuscrit({ type: "bateau" }).type).toBe("these");
    const a = lireManuscrit(JSON.parse(ecrireManuscrit(manuscritVide("Article Prony", "article"))));
    expect(a.type).toBe("article");
    expect(libelleType(a.type)).toBe("Article");
    expect(libelleGenre("these", "chapitre")).toBe("Chapitre");
    expect(libelleGenre("article", "chapitre")).toBe("Section");
    expect(libelleGenre("rapport", "liminaire")).toBe("Titre et résumé");
    // les anciens plans portaient « propre » dans le nettoyage : ignoré
    expect(lireManuscrit({ fusion: { nettoyage: { propre: ["X"] } } }).fusion.nettoyage).not.toHaveProperty("propre");
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

describe("sources communes aux deux PC (espace, OneDrive)", () => {
  // le même OneDrive sur deux PC : seul le nom d'utilisateur change
  const espacePc1 = "C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Thèse\\Espace";
  const espacePc2 = "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Espace";

  it("dossier OneDrive de l'espace", () => {
    expect(dossierOneDrive(espacePc1)).toBe("C:\\Users\\lucas.david\\OneDrive - entpe.fr");
    expect(dossierOneDrive("/home/l/OneDrive/These/Espace")).toBe("/home/l/OneDrive");
    expect(dossierOneDrive("D:\\Thèse\\Espace")).toBeNull();
    expect(dossierOneDrive(null)).toBeNull();
  });

  it("un fichier dans OneDrive a la même source sur les deux PC et s'y résout sans réglage", () => {
    const pc1 = versSource("C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Thèse\\Rédaction\\00_Intro.docx", espacePc1, {});
    expect(pc1).toBe("onedrive:Thèse/Rédaction/00_Intro.docx");
    expect(resoudreSource(pc1!, espacePc2, {})).toMatchObject({ ok: true, absolu: "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Rédaction\\00_Intro.docx" });
  });

  it("l'espace et OneDrive passent avant une racine du poste, même plus longue (cause de la panne du 05/10)", () => {
    const racines = { manuscrits: "C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Thèse\\Espace\\manuscrits\\Manuscrit", redaction: "C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Thèse\\Rédaction" };
    expect(versSource(`${racines.manuscrits}\\00_Intro.docx`, espacePc1, racines)).toBe("espace:manuscrits/Manuscrit/00_Intro.docx");
    expect(versSource(`${racines.redaction}\\ch1.docx`, espacePc1, racines)).toBe("onedrive:Thèse/Rédaction/ch1.docx");
    // un dossier local (hors OneDrive) reste une racine du poste
    expect(versSource("C:\\Users\\lucas.david\\Desktop\\x.docx", espacePc1, { bureau: "C:\\Users\\lucas.david\\Desktop" })).toBe("bureau:x.docx");
    // rattacher n'invente plus de racine pour un fichier de OneDrive
    expect(rattacher(["C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Articles\\a.docx"], espacePc1, {}).nouvellesRacines).toEqual({});
  });

  it("une racine du poste nommée « onedrive » ou « espace » ne détourne pas les sources communes", () => {
    expect(resoudreSource("onedrive:a.docx", espacePc2, { onedrive: "Z:\\faux" })).toMatchObject({ ok: true, absolu: "C:\\Users\\DAVID\\OneDrive - entpe.fr\\a.docx" });
    expect(resoudreSource("onedrive:a.docx", "D:\\Espace", {})).toMatchObject({ ok: false });
  });

  it("conversion des anciennes sources : seulement les parties réellement lues dans OneDrive ou l'espace", () => {
    let m = manuscritVide("Thèse");
    m = { ...m, parties: [
      { id: "intro", nom: "Intro", source: "manuscrits:00_Intro.docx", genre: "chapitre", statut: "redaction", objectifMots: null },
      { id: "ch1", nom: "Ch1", source: "bureau:ch1.docx", genre: "chapitre", statut: "redaction", objectifMots: null },
      { id: "ch2", nom: "Ch2", source: "manuscrits:ch2.docx", genre: "chapitre", statut: "redaction", objectifMots: null },
      { id: "ch3", nom: "Ch3", source: "onedrive:Thèse/ch3.docx", genre: "chapitre", statut: "redaction", objectifMots: null },
    ] };
    const lues = new Map([
      ["intro", `${espacePc1}\\manuscrits\\Manuscrit\\00_Intro.docx`],
      ["ch1", "C:\\Users\\lucas.david\\Desktop\\ch1.docx"],
      // ch2 : introuvable sur ce PC, donc non lue : sa source n'est pas touchée
      ["ch3", "C:\\Users\\lucas.david\\OneDrive - entpe.fr\\Thèse\\ch3.docx"],
    ]);
    const r = partagerSources(m, lues, espacePc1);
    expect(r.converties).toBe(1);
    expect(r.m.parties.map((p) => p.source)).toEqual(["espace:manuscrits/Manuscrit/00_Intro.docx", "bureau:ch1.docx", "manuscrits:ch2.docx", "onedrive:Thèse/ch3.docx"]);
    expect(partagerSources(r.m, lues, espacePc1).converties).toBe(0);
    expect(sourcePartagee("D:\\x.docx", espacePc1)).toBeNull();
  });
});

describe("relier une partie à un fichier retrouvé", () => {
  const espace = "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Espace";
  it("dans OneDrive : source commune, aucun réglage du poste", () => {
    expect(relierFichier("manuscrits:00_Intro.docx", "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Rédaction\\00_Intro.docx", espace, {})).toEqual({ source: "onedrive:Thèse/Rédaction/00_Intro.docx" });
  });
  it("hors OneDrive, même chemin sous la racine locale : on règle seulement le dossier de ce PC", () => {
    expect(relierFichier("bureau:Thèse/ch1.docx", "D:\\Copie\\Thèse\\ch1.docx", espace, { bureau: "C:\\faux" })).toEqual({ source: "bureau:Thèse/ch1.docx", racine: ["bureau", "D:\\Copie"] });
  });
  it("hors OneDrive, fichier renommé : nouvelle source et nouvelle racine", () => {
    expect(relierFichier("bureau:ch1.docx", "D:\\Autre\\chapitre1.docx", espace, {})).toEqual({ source: "autre:chapitre1.docx", racine: ["autre", "D:\\Autre"] });
  });
});

describe("retrouver un fichier Word sur ce PC", () => {
  const fs = new FichiersMemoire({
    "These/Espace/manuscrits/these/parties/00_Introduction_generale.docx": "",
    "These/Redaction/00_INTRODUCTION_GENERALE.docx": "",
    "These/Redaction/01_Chapitre1.docx": "",
    "These/.cache/00_Introduction_generale.docx": "",
    "Autre/un/deux/trois/quatre/cinq/00_Introduction_generale.docx": "",
  });

  it("dossiers qui le contiennent, casse ignorée, dossiers cachés et profondeur au-delà de la limite ignorés", async () => {
    expect(await chercherFichier(fs, "00_Introduction_generale.docx", 5)).toEqual(["These/Redaction", "These/Espace/manuscrits/these/parties"]);
    expect(await chercherFichier(fs, "01_Chapitre1.docx", 1)).toEqual([]);
    expect(await chercherFichier(fs, "absent.docx")).toEqual([]);
  });

  it("limite de dossiers visités", async () => {
    expect(await chercherFichier(fs, "01_Chapitre1.docx", 5, 2)).toEqual([]);
  });

  it("erreur « absent » reconnue", async () => {
    await expect(fs.readBytes("nope.docx")).rejects.toSatisfy(estIntrouvable);
    expect(estIntrouvable(new Error("Accès refusé"))).toBe(false);
  });
});
