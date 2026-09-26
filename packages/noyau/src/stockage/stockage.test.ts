import { describe, expect, it } from "vitest";
import {
  absolu,
  chargerCollection,
  creerObjet,
  DejaExistant,
  detecterCopieConflit,
  enregistrerObjet,
  estCheminRelatifSur,
  etatVerrou,
  FichiersMemoire,
  idSuivant,
  lireId,
  lireVerrou,
  planResolution,
  resoudreConflit,
  type DefinitionCollection,
} from "./index";

interface Phase {
  titre: string;
}

const PHASES: DefinitionCollection<Phase> = {
  dossier: "planning",
  format: { prefixe: "PH-", chiffres: 4 },
  lire(brut) {
    if (typeof brut.titre !== "string") throw new Error("Champ « titre » manquant.");
    return { titre: brut.titre };
  },
};

describe("chemins", () => {
  it("refuse tout ce qui sort de la racine", () => {
    for (const ok of ["a.json", "bibliotheque/references/BIB-001.json", "Dossier é/x"]) expect(estCheminRelatifSur(ok)).toBe(true);
    for (const ko of ["", "/a", "\\a", "C:/a", "../a", "a/../b", "a//b", "a/./b"]) expect(estCheminRelatifSur(ko)).toBe(false);
  });

  it("construit un chemin absolu avec le séparateur de la racine", () => {
    expect(absolu("C:\\Users\\DAVID\\OneDrive\\", "planning/PH-0001.json")).toBe("C:\\Users\\DAVID\\OneDrive\\planning\\PH-0001.json");
    expect(absolu("E:/", "tsrst")).toBe("E:/tsrst");
    expect(absolu("/home/l", "")).toBe("/home/l");
  });
});

describe("identifiants", () => {
  const f = { prefixe: "BIB-", chiffres: 3 };
  it("lit, formate et incrémente", () => {
    expect(lireId(f, "BIB-007")).toBe(7);
    expect(lireId(f, "BIB-1000")).toBe(1000);
    for (const ko of ["BIB-07", "BIB-000", "bib-007", "PH-0007", "BIB-007x"]) expect(lireId(f, ko)).toBeNull();
    expect(idSuivant(f, ["BIB-001", "BIB-179", "n'importe quoi"])).toBe("BIB-180");
    expect(idSuivant(f, [])).toBe("BIB-001");
    expect(idSuivant(f, ["BIB-999"])).toBe("BIB-1000");
  });
});

describe("conflits OneDrive", () => {
  const originaux = ["BIB-001.json", "BIB-0010.json"];
  it("reconnaît les copies de OneDrive et de l'Explorateur", () => {
    expect(detecterCopieConflit("BIB-001-PC-MAISON.json", originaux)).toEqual({ original: "BIB-001.json", copie: "BIB-001-PC-MAISON.json", etiquette: "PC-MAISON" });
    expect(detecterCopieConflit("BIB-001-LGCB-AA03956-2.json", originaux)?.etiquette).toBe("LGCB-AA03956-2");
    expect(detecterCopieConflit("BIB-001 (2).json", originaux)?.etiquette).toBe("(2)");
    expect(detecterCopieConflit("BIB-001 - Copie.json", originaux)?.etiquette).toBe("Copie");
  });

  it("ne confond pas un autre objet avec une copie", () => {
    expect(detecterCopieConflit("BIB-0010.json", originaux)).toBeNull();
    expect(detecterCopieConflit("BIB-0010-PC.json", originaux)?.original).toBe("BIB-0010.json");
    expect(detecterCopieConflit("BIB-001.md", originaux)).toBeNull();
  });

  it("planifie les trois résolutions sans jamais rien supprimer", () => {
    const c = { original: "PH-0001.json", copie: "PH-0001-PC.json", etiquette: "PC" };
    expect(planResolution("planning", c, "original", "2026-09-26T10:00:00", false)).toEqual([
      { op: "mkdir", path: "planning/.conflits" },
      { op: "rename", from: "planning/PH-0001-PC.json", to: "planning/.conflits/2026-09-26T10-00-00_PH-0001-PC.json" },
    ]);
    expect(planResolution("planning", c, "copie", "t", true)).toEqual([
      { op: "rename", from: "planning/PH-0001.json", to: "planning/.conflits/t_PH-0001.json" },
      { op: "rename", from: "planning/PH-0001-PC.json", to: "planning/PH-0001.json" },
    ]);
    expect(planResolution("planning", c, "les-deux", "t", true, "PH-0007.json")).toEqual([
      { op: "rename", from: "planning/PH-0001-PC.json", to: "planning/PH-0007.json" },
    ]);
  });
});

describe("collections", () => {
  it("charge un dossier absent comme une collection vide", async () => {
    expect(await chargerCollection(new FichiersMemoire(), PHASES)).toEqual({ objets: [], problemes: [] });
  });

  it("crée sous l'ID suivant, enregistre et relit", async () => {
    const fs = new FichiersMemoire();
    expect(await creerObjet(fs, PHASES, { titre: "Bibliographie" })).toBe("PH-0001");
    expect(await creerObjet(fs, PHASES, { titre: "Campagne TSRST" })).toBe("PH-0002");
    await enregistrerObjet(fs, PHASES, "PH-0001", { titre: "Bibliographie (6 mois)" });
    expect(fs.lire("planning/PH-0001.json")).toBe('{\n  "id": "PH-0001",\n  "titre": "Bibliographie (6 mois)"\n}\n');
    const { objets, problemes } = await chargerCollection(fs, PHASES);
    expect(problemes).toEqual([]);
    expect(objets.map((o) => [o.id, o.valeur.titre])).toEqual([
      ["PH-0001", "Bibliographie (6 mois)"],
      ["PH-0002", "Campagne TSRST"],
    ]);
  });

  it("passe au numéro suivant si l'autre PC a pris l'ID entre le scan et l'écriture", async () => {
    const fs = new FichiersMemoire({ "planning/PH-0001.json": '{"titre":"a"}' });
    const ecrire = fs.writeTextNew.bind(fs);
    let premier = true;
    fs.writeTextNew = async (p, c) => {
      if (premier) {
        premier = false;
        fs.poser("planning/PH-0002.json", '{"titre":"créé sur l\'autre PC"}');
        throw new DejaExistant(p);
      }
      return ecrire(p, c);
    };
    expect(await creerObjet(fs, PHASES, { titre: "b" })).toBe("PH-0003");
  });

  it("trie par numéro, et le nom du fichier fait foi sur le champ id", async () => {
    const fs = new FichiersMemoire({
      "planning/PH-0010.json": '{"id":"PH-0010","titre":"dix"}',
      "planning/PH-0002.json": '{"id":"PH-9999","titre":"deux"}',
    });
    const { objets } = await chargerCollection(fs, PHASES);
    expect(objets.map((o) => o.id)).toEqual(["PH-0002", "PH-0010"]);
  });

  it("signale sans les perdre les fichiers illisibles, les copies de conflit et les écritures interrompues", async () => {
    const fs = new FichiersMemoire({
      "planning/PH-0001.json": '{"titre":"ok"}',
      "planning/PH-0001-PC-MAISON.json": '{"titre":"version maison"}',
      "planning/PH-0002.json": "{ abîmé",
      "planning/PH-0003.json": '{"autre":1}',
      "planning/PH-0004.json": "[1,2]",
      "planning/PH-0005.json.tmp": "{",
      "planning/notes.md": "rien à voir",
    });
    const { objets, problemes } = await chargerCollection(fs, PHASES);
    expect(objets.map((o) => o.id)).toEqual(["PH-0001"]);
    expect(problemes.map((p) => p.type).sort()).toEqual(["conflit", "illisible", "illisible", "illisible", "temporaire"]);
    const illisible = problemes.find((p) => p.type === "illisible" && p.chemin.endsWith("PH-0003.json"));
    expect(illisible).toMatchObject({ detail: "Champ « titre » manquant." });
  });

  it("résout un conflit en gardant les deux objets", async () => {
    const fs = new FichiersMemoire({
      "planning/PH-0001.json": '{"titre":"créé au travail"}',
      "planning/PH-0002.json": '{"titre":"autre"}',
      "planning/PH-0001-PC-MAISON.json": '{"titre":"créé à la maison, hors ligne"}',
    });
    const conflit = { original: "PH-0001.json", copie: "PH-0001-PC-MAISON.json", etiquette: "PC-MAISON" };
    await resoudreConflit(fs, PHASES, conflit, "les-deux", "t");
    const { objets, problemes } = await chargerCollection(fs, PHASES);
    expect(problemes).toEqual([]);
    expect(objets.map((o) => [o.id, o.valeur.titre])).toEqual([
      ["PH-0001", "créé au travail"],
      ["PH-0002", "autre"],
      ["PH-0003", "créé à la maison, hors ligne"],
    ]);
  });

  it("résout un conflit en gardant la copie ; l'original est archivé", async () => {
    const fs = new FichiersMemoire({
      "planning/PH-0001.json": '{"titre":"travail"}',
      "planning/PH-0001-PC.json": '{"titre":"maison"}',
    });
    await resoudreConflit(fs, PHASES, { original: "PH-0001.json", copie: "PH-0001-PC.json", etiquette: "PC" }, "copie", "2026-09-26T10:00:00");
    expect(fs.instantane()).toEqual({
      "planning/.conflits/2026-09-26T10-00-00_PH-0001.json": '{"titre":"travail"}',
      "planning/PH-0001.json": '{"titre":"maison"}',
    });
  });
});

describe("verrous", () => {
  const maintenant = new Date("2026-09-26T12:00:00Z");
  it("interprète la règle des 12 h", () => {
    expect(etatVerrou(null, "PC-TRAVAIL", maintenant)).toBe("libre");
    expect(etatVerrou({ host: "pc-travail", since: "2026-09-26T11:00:00Z" }, "PC-TRAVAIL", maintenant)).toBe("moi");
    expect(etatVerrou({ host: "PC-MAISON", since: "2026-09-26T11:00:00Z" }, "PC-TRAVAIL", maintenant)).toBe("autre");
    expect(etatVerrou({ host: "PC-MAISON", since: "2026-09-25T20:00:00Z" }, "PC-TRAVAIL", maintenant)).toBe("perime");
    expect(etatVerrou({ host: "PC-MAISON", since: "2026-09-26T13:00:00Z" }, "PC-TRAVAIL", maintenant)).toBe("autre");
  });

  it("traite un verrou abîmé comme illisible", () => {
    expect(lireVerrou('{"host":"PC","since":"2026-09-26T11:00:00+02:00"}')).toEqual({ host: "PC", since: "2026-09-26T11:00:00+02:00" });
    for (const ko of ["", "{", '{"host":"","since":"2026-09-26T11:00:00Z"}', '{"host":"PC","since":"hier"}']) expect(lireVerrou(ko)).toBeNull();
  });
});

describe("comparaison de deux versions", () => {
  it("liste les champs qui diffèrent, imbriqués compris", async () => {
    const { comparerJson } = await import("./comparaison");
    expect(
      comparerJson(
        '{"id":"BIB-001","titre":"A","lecture":{"statut":"Lu","date":"2026-10-02"},"auteurs":["X","Y"]}',
        '{"id":"BIB-001","titre":"A","lecture":{"statut":"En cours"},"auteurs":["X"],"note":3}',
      ),
    ).toEqual([
      { champ: "auteurs[1]", a: "Y", b: undefined },
      { champ: "lecture.date", a: "2026-10-02", b: undefined },
      { champ: "lecture.statut", a: "Lu", b: "En cours" },
      { champ: "note", a: undefined, b: "3" },
    ]);
    expect(comparerJson('{"a":1}', '{"a":1}')).toEqual([]);
    expect(comparerJson("{", "}")).toEqual([{ champ: "(contenu)", a: "{", b: "}" }]);
  });
});
