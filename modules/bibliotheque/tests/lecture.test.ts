import { describe, expect, it } from "vitest";
import {
  avecCellule,
  cleCellule,
  croiser,
  decouperTexte,
  definir,
  delier,
  ecrireReglagesLecture,
  initialiser,
  lier,
  liensDe,
  lireCellule,
  lireReglagesLecture,
  reglagesLectureVides,
  renommerEtiquette,
  synthese,
  texteCellule,
  unirEtiquettes,
  vocabulaire,
  aValider,
  bilanValidation,
  seulementValidees,
  validerArticle,
  validerCase,
  type ObjetRef,
} from "../core/lecture";
import { lireReference } from "../core/modele";

const ref = (id: string, champs: Record<string, unknown>): ObjetRef => ({ id, valeur: lireReference({ titre: id, auteurs: `Auteur${id.slice(-1)}, A.`, annee: 2000 + Number(id.slice(-1)), ...champs }) });

describe("étiquettes et cases", () => {
  it("sans doublon (casse, accents, espaces)", () => {
    expect(unirEtiquettes(["MEF 3D"], ["mef  3d", "Élastique", "elastique", " Burmister "])).toEqual(["MEF 3D", "Élastique", "Burmister"]);
  });

  it("ancien texte libre → étiquettes, le texte long part en note", () => {
    expect(decouperTexte("viscoélastique, 2S2P1D ; mobile")).toEqual({ etiquettes: ["viscoélastique", "2S2P1D", "mobile"], note: "", valide: false });
    expect(decouperTexte("Pneu avion / H40\nla pression de gonflage est supposée uniforme sur toute l'empreinte")).toEqual({
      etiquettes: ["Pneu avion", "H40"],
      note: "la pression de gonflage est supposée uniforme sur toute l'empreinte",
      valide: false,
    });
  });

  it("cellule Excel « a; b | note » aller-retour, forme canonique insensible à l'ordre", () => {
    const c = lireCellule("MEF 3D; Burmister | maillage grossier");
    expect(c).toEqual({ etiquettes: ["MEF 3D", "Burmister"], note: "maillage grossier", valide: false });
    expect(texteCellule(c)).toBe("MEF 3D; Burmister | maillage grossier");
    expect(lireCellule(texteCellule(c))).toEqual(c);
    expect(texteCellule({ etiquettes: [], note: "à voir", valide: true })).toBe("| à voir");
    expect(lireCellule("| à voir")).toEqual({ etiquettes: [], note: "à voir", valide: false });
    expect(cleCellule(lireCellule("Burmister;mef 3d"))).toBe(cleCellule(c).replace("|maillage grossier", "|"));
    expect(cleCellule(lireCellule(""))).toBe("");
    expect(lireCellule("a\nb;  ; c")).toEqual({ etiquettes: ["a", "b", "c"], note: "", valide: false });
  });

  it("une case vide est retirée de la fiche", () => {
    const r = ref("BIB-001", {}).valeur;
    const a = avecCellule(r, "loi", { etiquettes: ["2S2P1D"], note: "", valide: true });
    expect(a.lecture).toEqual({ loi: { etiquettes: ["2S2P1D"], note: "", valide: true } });
    expect(avecCellule(a, "loi", { etiquettes: [], note: " ", valide: true }).lecture).toEqual({});
  });
});

describe("réglages et initialisation", () => {
  it("lecture tolérante et aller-retour", () => {
    expect(lireReglagesLecture(null)).toEqual(reglagesLectureVides());
    const r = { ...reglagesLectureVides(), definitions: { loi: { "2S2P1D": "Modèle de Di Benedetto" } } };
    expect(lireReglagesLecture(JSON.parse(ecrireReglagesLecture(r)))).toEqual(r);
    expect(lireReglagesLecture({ criteres: [{ id: "a" }, { id: "a" }, {}], croisements: [["a", "b"], ["x"]] })).toMatchObject({ criteres: [{ id: "a", nom: "a" }], croisements: [["a", "b"]] });
  });

  it("depuis la fiche et la Matrice croisée ; idempotent ; ne touche pas aux articles déjà remplis", () => {
    const refs = [
      ref("BIB-001", { fiche: { loi: "viscoélastique, 2S2P1D", methodeCategorie: "MEF 3D" }, categories: ["Pneu / Avion", "Échelle / Structure"] }),
      ref("BIB-002", { fiche: { loi: "élastique" }, lecture: { loi: { etiquettes: ["Huet-Sayegh"] } } }),
      ref("BIB-003", {}),
    ];
    const { reglages, modifiees } = initialiser(refs, null);
    expect(reglages.criteres.map((c) => c.id)).toEqual(["pneu", "contact", "loi", "methode", "chargement", "cible", "validation", "echelle"]);
    expect(modifiees.map((m) => m.id)).toEqual(["BIB-001"]);
    expect(modifiees[0]!.valeur.lecture).toEqual({
      loi: { etiquettes: ["viscoélastique", "2S2P1D"], note: "", valide: false },
      methode: { etiquettes: ["MEF 3D"], note: "", valide: false },
      pneu: { etiquettes: ["Avion"], note: "", valide: false },
      echelle: { etiquettes: ["Structure"], note: "", valide: false },
    });
    // la fiche d'origine est intacte
    expect(modifiees[0]!.valeur.fiche.loi).toBe("viscoélastique, 2S2P1D");
    const encore = initialiser([modifiees[0]!, refs[1]!, refs[2]!], reglages);
    expect(encore.modifiees).toEqual([]);
    expect(encore.reglages).toEqual(reglages);
  });
});

describe("vocabulaire, renommage, définitions", () => {
  const refs = [
    ref("BIB-001", { lecture: { methode: { etiquettes: ["MEF 3D", "Burmister"] } } }),
    ref("BIB-002", { lecture: { methode: { etiquettes: ["mef 3D"] } } }),
    ref("BIB-003", { lecture: { methode: { etiquettes: ["MEF 3D"] } } }),
  ];

  it("forme la plus fréquente, les plus courantes d'abord, définitions incluses", () => {
    const r = definir(reglagesLectureVides(), "methode", "Semi-analytique", "Transformée de Fourier + couches");
    const v = vocabulaire(refs, "methode", r);
    expect(v.map((e) => [e.etiquette, e.ids.length])).toEqual([
      ["MEF 3D", 3],
      ["Burmister", 1],
      ["Semi-analytique", 0],
    ]);
    expect(v[2]!.definition).toBe("Transformée de Fourier + couches");
    expect(definir(r, "methode", "semi-analytique", "").definitions).toEqual({});
  });

  it("renommer = fusionner, et retirer", () => {
    const m = renommerEtiquette(refs, "methode", "mef 3d", "Burmister");
    expect(m.map((x) => [x.id, x.valeur.lecture.methode!.etiquettes])).toEqual([
      ["BIB-001", ["Burmister"]],
      ["BIB-002", ["Burmister"]],
      ["BIB-003", ["Burmister"]],
    ]);
    expect(renommerEtiquette(refs, "methode", "Burmister", "")[0]!.valeur.lecture.methode!.etiquettes).toEqual(["MEF 3D"]);
  });
});

describe("liens, croisement, synthèse", () => {
  const types = reglagesLectureVides().typesLiens;
  let refs = [
    ref("BIB-001", { lecture: { loi: { etiquettes: ["2S2P1D"] }, methode: { etiquettes: ["MEF 3D"], note: "maillage fin" } } }),
    ref("BIB-002", { lecture: { loi: { etiquettes: ["2S2P1D", "Élastique"] }, methode: { etiquettes: ["Burmister"] } } }),
    ref("BIB-003", { lecture: { loi: { etiquettes: ["Élastique"] } } }),
    ref("BIB-004", { statut: "Écarté", lecture: { methode: { etiquettes: ["MEF 3D"] } } }),
  ];
  refs = refs.map((r) => (r.id === "BIB-002" ? { id: r.id, valeur: lier(r, { vers: "BIB-001", type: "etend", note: "ajoute le contact" }) } : r));

  it("liens : sortants et entrants, sans lien vers soi, retrait", () => {
    expect(liensDe(refs, "BIB-001", types)).toEqual([{ id: "BIB-002", type: "etend", libelle: "est étendu par", note: "ajoute le contact", sens: "entrant" }]);
    expect(liensDe(refs, "BIB-002", types)[0]).toMatchObject({ id: "BIB-001", libelle: "étend", sens: "sortant" });
    expect(lier(refs[0]!, { vers: "BIB-001", type: "etend", note: "" })).toBe(refs[0]!.valeur);
    expect(delier(refs[1]!.valeur, "BIB-001", "etend").liens).toEqual([]);
  });

  it("croisement : cases pleines et trous", () => {
    const c = croiser(refs, "loi", "methode");
    expect(c.lignes.map((e) => e.etiquette)).toEqual(["2S2P1D", "Élastique"]);
    expect(c.colonnes.map((e) => e.etiquette)).toEqual(["MEF 3D", "Burmister"]);
    expect(Object.fromEntries(c.cases)).toEqual({ "2s2p1d|mef 3d": ["BIB-001"], "2s2p1d|burmister": ["BIB-002"], "elastique|burmister": ["BIB-002"] });
    expect(c.renseignes).toBe(2);
    // un critère avec lui-même : co-occurrences, sans la diagonale
    expect(Object.fromEntries(croiser(refs, "loi", "loi").cases)).toEqual({ "2s2p1d|elastique": ["BIB-002"], "elastique|2s2p1d": ["BIB-002"] });
  });

  it("synthèse Markdown citable", () => {
    const md = synthese(refs, reglagesLectureVides(), "methode", (id) => `Titre ${id}`);
    expect(md).toContain("## MEF 3D (2)");
    expect(md).toContain("- [@BIB-001] *Titre BIB-001* — maillage fin");
    expect(md).toContain("*1 article(s) non renseigné(s) pour ce critère.*");
  });

});

describe("validation des cases", () => {
  const avec = () => [
    ref("BIB-001", { lecture: { loi: { etiquettes: ["2S2P1D"] }, methode: { etiquettes: ["MEF 3D"], valide: true } } }),
    ref("BIB-002", { lecture: { loi: { etiquettes: ["Élastique"], valide: true } } }),
    ref("BIB-003", {}),
  ];
  const reglages = reglagesLectureVides();

  it("relue : à valider par défaut (anciennes fiches), validée si enregistrée comme telle", () => {
    const [a, b] = avec();
    expect(a!.valeur.lecture.loi!.valide).toBe(false);
    expect(a!.valeur.lecture.methode!.valide).toBe(true);
    expect(aValider(a!.valeur, reglages)).toEqual(["loi"]);
    expect(aValider(b!.valeur, reglages)).toEqual([]);
  });

  it("valider une case, un article ; compter ; ne garder que le validé", () => {
    const refs = avec();
    expect(bilanValidation(refs, reglages)).toEqual({ cases: 3, validees: 2, articlesAValider: 1 });
    const v = validerCase(refs[0]!.valeur, "loi");
    expect(v.lecture.loi).toEqual({ etiquettes: ["2S2P1D"], note: "", valide: true });
    expect(validerCase(v, "loi")).toBe(v);
    expect(validerCase(v, "absent")).toBe(v);
    expect(validerCase(v, "loi", false).lecture.loi!.valide).toBe(false);
    const tout = validerArticle(refs[0]!.valeur);
    expect(Object.values(tout.lecture).every((c) => c.valide)).toBe(true);
    expect(validerArticle(tout)).toBe(tout);
    const filtres = seulementValidees(refs);
    expect(Object.keys(filtres[0]!.valeur.lecture)).toEqual(["methode"]);
    expect(filtres[1]).toBe(refs[1]);
  });

  it("les reprises automatiques sont à valider ; le nettoyage et le renommage gardent l'état", () => {
    const { modifiees } = initialiser([ref("BIB-001", { fiche: { loi: "viscoélastique" } })], null);
    expect(modifiees[0]!.valeur.lecture.loi!.valide).toBe(false);
    const refs = avec();
    const r = renommerEtiquette(refs, "methode", "MEF 3D", "Éléments finis 3D");
    expect(r[0]!.valeur.lecture.methode).toEqual({ etiquettes: ["Éléments finis 3D"], note: "", valide: true });
    const r2 = renommerEtiquette(refs, "loi", "2S2P1D", "Viscoélastique");
    expect(r2[0]!.valeur.lecture.loi!.valide).toBe(false);
  });
});

