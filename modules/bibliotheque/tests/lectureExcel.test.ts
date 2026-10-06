import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readXlsx } from "@noyau/formats/xlsx";
import { lier, reglagesLectureVides, definir, type ObjetRef } from "../core/lecture";
import { appliquer, COMMENTAIRE, construireClasseur, empreinte, etatAppli, fusionner, lireClasseur, lireSynchro, ecrireSynchro, trancherConflits, type Etat } from "../core/lectureExcel";
import { lireReference } from "../core/modele";

const ref = (id: string, champs: Record<string, unknown>): ObjetRef => ({ id, valeur: lireReference({ titre: `Titre ${id}`, cle: id.toLowerCase(), auteurs: `Nom${id.slice(-1)}, A.`, annee: 2010, ...champs }) });
const reglages = definir(reglagesLectureVides(), "loi", "2S2P1D", "Modèle de Di Benedetto");
const depart = (): ObjetRef[] => {
  const refs = [
    ref("BIB-001", { lecture: { loi: { etiquettes: ["2S2P1D"] }, methode: { etiquettes: ["MEF 3D"], note: "maillage fin" } }, commentaire: "Article clé" }),
    ref("BIB-002", { lecture: { loi: { etiquettes: ["Élastique"] } } }),
    ref("BIB-003", {}),
  ];
  refs[1] = { id: "BIB-002", valeur: lier(refs[1]!, { vers: "BIB-001", type: "etend", note: "ajoute le contact" }) };
  return refs;
};

/** Modifie le classeur « comme Excel » : remplace des cellules de la feuille `n` (texte), par référence A1. */
function editer(octets: Uint8Array, n: number, cellules: Record<string, string | null>, lignesSupprimees: number[] = []): Uint8Array {
  const f = unzipSync(octets);
  let xml = strFromU8(f[`xl/worksheets/sheet${n}.xml`]!);
  for (const r of lignesSupprimees) xml = xml.replace(new RegExp(`<row r="${r}">[\\s\\S]*?</row>`), "");
  for (const [ref, v] of Object.entries(cellules)) {
    const ligne = /\d+/.exec(ref)![0];
    const cellule = v === null ? "" : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
    const existante = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
    if (existante.test(xml)) xml = xml.replace(existante, cellule);
    else if (new RegExp(`<row r="${ligne}">`).test(xml)) xml = xml.replace(`<row r="${ligne}">`, `<row r="${ligne}">${cellule}`);
    else xml = xml.replace("</sheetData>", `<row r="${ligne}">${cellule}</row></sheetData>`);
  }
  f[`xl/worksheets/sheet${n}.xml`] = strToU8(xml);
  return zipSync(f);
}

/** Colonne (lettre) d'un titre dans la feuille Grille. */
const col = (octets: Uint8Array, titre: string, feuille = 0) => String.fromCharCode(65 + readXlsx(octets)[feuille]!.rows[0]!.indexOf(titre));

describe("classeur de lecture croisée", () => {
  it("cinq feuilles, la grille relue donne l'état de l'appli", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const cl = readXlsx(o);
    expect(cl.map((f) => f.name)).toEqual(["Grille", "Liens", "Vocabulaire", "Croisement", "Mode d'emploi"]);
    expect(cl[0]!.rows[0]!.slice(0, 7)).toEqual(["ID", "Référence", "Titre", "Année", "Statut", "Pneu", "Contact"]);
    expect(cl[0]!.rows[1]![cl[0]!.rows[0]!.indexOf("Méthode")]).toBe("MEF 3D | maillage fin");
    expect(cl[1]!.rows[1]).toEqual(["BIB-002", "Nom2 (2010)", "étend", "BIB-001", "Nom1 (2010)", "ajoute le contact"]);
    expect(cl[2]!.rows).toContainEqual(["Loi de comportement", "2S2P1D", 1, "Modèle de Di Benedetto"]);
    const lu = lireClasseur(o, refs, reglages);
    expect(lu.avertissements).toEqual([]);
    const a = etatAppli(refs, reglages);
    expect({ cases: lu.cases, liens: lu.liens, definitions: lu.definitions }).toEqual(a);
    // styles, listes déroulantes, filtres présents ; déterministe
    const f = unzipSync(o);
    expect(f["xl/styles.xml"]).toBeDefined();
    expect(strFromU8(f["xl/worksheets/sheet2.xml"]!)).toContain('<dataValidation type="list"');
    expect(construireClasseur(refs, reglages)).toEqual(o);
  });

  it("synchro : Excel modifié seul → repris ; appli modifiée seule → écrite ; rien n'est perdu", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const base = etatAppli(refs, reglages);
    const cMethode = col(o, "Méthode");
    const cLoi = col(o, "Loi de comportement");
    const cCom = col(o, "Commentaire");
    // dans Excel : BIB-002 reçoit une méthode, BIB-003 un commentaire, un lien est ajouté, une définition aussi
    let x = editer(o, 1, { [`${cMethode}3`]: "Burmister; mef 3D", [`${cCom}4`]: "À relire" });
    x = editer(x, 2, { A3: "BIB-003", C3: "se compare à", D3: "BIB-001", F3: "même essai" });
    x = editer(x, 3, { A20: "Méthode", B20: "Burmister", D20: "Multicouche élastique linéaire" });
    // dans l'appli : BIB-001 change de loi
    const appli = depart().map((r) => (r.id === "BIB-001" ? { id: r.id, valeur: { ...r.valeur, lecture: { ...r.valeur.lecture, loi: { etiquettes: ["Huet-Sayegh"], note: "" } } } } : r));
    const f = fusionner(base, etatAppli(appli, reglages), lireClasseur(x, appli, reglages), reglages);
    expect(f.conflits).toEqual([]);
    expect(f.depuisExcel).toBe(4);
    expect(f.versExcel).toBe(1);
    expect(f.etat.cases["BIB-002"]!.methode).toBe("Burmister; mef 3D");
    expect(f.etat.cases["BIB-003"]![COMMENTAIRE]).toBe("À relire");
    expect(f.etat.cases["BIB-001"]!.loi).toBe("Huet-Sayegh");
    expect(f.etat.liens["BIB-003|compare|BIB-001"]).toBe("même essai");
    const r = appliquer(appli, reglages, f.etat);
    expect(r.modifiees.map((m) => m.id)).toEqual(["BIB-002", "BIB-003"]);
    expect(r.modifiees[0]!.valeur.lecture.methode).toEqual({ etiquettes: ["Burmister", "mef 3D"], note: "" });
    expect(r.modifiees[1]!.valeur.liens).toEqual([{ vers: "BIB-001", type: "compare", note: "même essai" }]);
    expect(r.reglages.definitions.methode).toEqual({ Burmister: "Multicouche élastique linéaire" });
    // le nouveau classeur porte la loi changée dans l'appli
    const nouveau = readXlsx(construireClasseur(appli, r.reglages, f.etat));
    expect(nouveau[0]!.rows[1]![nouveau[0]!.rows[0]!.indexOf("Loi de comportement")]).toBe("Huet-Sayegh");
    void cLoi;
  });

  it("même case modifiée des deux côtés → conflit, tranché par l'utilisateur ; même valeur des deux côtés → pas de conflit", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const base = etatAppli(refs, reglages);
    const cLoi = col(o, "Loi de comportement");
    const x = editer(o, 1, { [`${cLoi}2`]: "Huet-Sayegh", [`${cLoi}3`]: "élastique; 2S2P1D" });
    const appli = depart().map((r) =>
      r.id === "BIB-001" ? { id: r.id, valeur: { ...r.valeur, lecture: { ...r.valeur.lecture, loi: { etiquettes: ["Burgers"], note: "" } } } } : r.id === "BIB-002" ? { id: r.id, valeur: { ...r.valeur, lecture: { loi: { etiquettes: ["2S2P1D", "Elastique"], note: "" } } } } : r,
    );
    const f = fusionner(base, etatAppli(appli, reglages), lireClasseur(x, appli, reglages), reglages);
    expect(f.conflits).toEqual([{ cle: "case|BIB-001|loi", libelle: "BIB-001 · Loi de comportement", appli: "Burgers", excel: "Huet-Sayegh" }]);
    expect(f.etat.cases["BIB-001"]!.loi).toBe("Burgers");
    expect(trancherConflits(f, { "case|BIB-001|loi": "excel" }).cases["BIB-001"]!.loi).toBe("Huet-Sayegh");
  });

  it("lien supprimé dans Excel → supprimé ; ligne d'article supprimée dans Excel → rien n'est effacé", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const base = etatAppli(refs, reglages);
    let x = editer(o, 2, {}, [2]);
    x = editer(x, 1, {}, [2]);
    const f = fusionner(base, etatAppli(refs, reglages), lireClasseur(x, refs, reglages), reglages);
    expect(f.etat.liens).toEqual({});
    expect(f.etat.cases["BIB-001"]!.methode).toBe("MEF 3D | maillage fin");
    expect(appliquer(refs, reglages, f.etat).modifiees.map((m) => [m.id, m.valeur.liens])).toEqual([["BIB-002", []]]);
  });

  it("première synchro avec un classeur déjà rempli (sans base) : le vide prend la valeur de l'autre, deux valeurs différentes = conflit", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const cPneu = col(o, "Pneu");
    const cLoi = col(o, "Loi de comportement");
    const x = editer(o, 1, { [`${cPneu}2`]: "Avion", [`${cLoi}3`]: "Burgers" });
    const f = fusionner(null, etatAppli(refs, reglages), lireClasseur(x, refs, reglages), reglages);
    expect(f.etat.cases["BIB-001"]!.pneu).toBe("Avion");
    expect(f.conflits.map((c) => c.cle)).toEqual(["case|BIB-002|loi"]);
  });

  it("lignes et colonnes inconnues signalées, colonnes déplacées sans effet", () => {
    const refs = depart();
    const o = construireClasseur(refs, reglages);
    const x = editer(o, 1, { A6: "BIB-999", [`${col(o, "Pneu")}1`]: "Pneumatique" });
    const lu = lireClasseur(x, refs, reglages);
    expect(lu.avertissements.join("\n")).toMatch(/BIB-999/);
    expect(lu.avertissements.join("\n")).toMatch(/Pneumatique/);
    expect(lu.avertissements.join("\n")).toMatch(/absente.*Pneu/);
    // la colonne absente n'efface rien
    const f = fusionner(etatAppli(refs, reglages), etatAppli(refs, reglages), lu, reglages);
    expect(f.depuisExcel).toBe(0);
  });

  it("état de synchro : aller-retour, empreinte", () => {
    const e: Etat = etatAppli(depart(), reglages);
    const s = { empreinte: empreinte(new Uint8Array([1, 2, 3])), date: "2026-10-06", etat: e };
    expect(lireSynchro(JSON.parse(ecrireSynchro(s)))).toEqual(s);
    expect(lireSynchro({})).toBeNull();
    expect(empreinte(new Uint8Array([1, 2, 3]))).not.toBe(empreinte(new Uint8Array([1, 2, 4])));
  });
});
