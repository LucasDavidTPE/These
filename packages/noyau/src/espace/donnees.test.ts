import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "../stockage/memoire";
import { cheminCopie, donneesCopiees, estDansEspace, fichiersManquants, importerFichier, rangement } from "./donnees";

const texte = (o: Uint8Array) => new TextDecoder().decode(o);

describe("données brutes copiées dans l'espace", () => {
  it("range la copie sous sa racine", () => {
    expect(cheminCopie("essais:tsrst-lucas/Essai1")).toBe("donnees/essais/tsrst-lucas/Essai1");
    expect(cheminCopie("essais:")).toBe("donnees/essais");
    expect(cheminCopie("C:/Users/x.csv")).toBeNull();
  });

  it("copie un fichier à la lecture, puis la copie suffit sans la source", async () => {
    const espace = new FichiersMemoire();
    const source = new FichiersMemoire({ "Essai1/mesure.csv": "t;F\n0;1\n", "Essai2/mesure.csv": "t;F\n" });
    const vue = donneesCopiees(espace, "donnees/essais/tsrst", source);
    expect((await vue.listDir("")).map((e) => e.name)).toEqual(["Essai1", "Essai2"]);
    expect(await vue.readText("Essai1/mesure.csv")).toBe("t;F\n0;1\n");
    expect(texte(await espace.readBytes("donnees/essais/tsrst/Essai1/mesure.csv"))).toBe("t;F\n0;1\n");

    // Autre PC : pas de source, seuls les fichiers déjà copiés sont là.
    const ailleurs = donneesCopiees(espace, "donnees/essais/tsrst", null);
    expect((await ailleurs.listDir("")).map((e) => e.name)).toEqual(["Essai1"]);
    expect(await ailleurs.readText("Essai1/mesure.csv")).toBe("t;F\n0;1\n");
    expect(await ailleurs.exists("Essai2/mesure.csv")).toBe(false);
    await expect(ailleurs.readText("Essai2/mesure.csv")).rejects.toThrow();
  });

  it("suit la source quand elle change, sans jamais l'écrire", async () => {
    const espace = new FichiersMemoire();
    const source = new FichiersMemoire({ "a.csv": "1\n" });
    const vue = donneesCopiees(espace, "donnees/x", source);
    await vue.readText("a.csv");
    source.poser("a.csv", "1\n2\n");
    expect(await vue.readText("a.csv")).toBe("1\n2\n");
    expect(texte(await espace.readBytes("donnees/x/a.csv"))).toBe("1\n2\n");
    await expect(vue.writeTextAtomic("a.csv", "")).rejects.toThrow(/lecture seule/);
  });

  it("range un fichier ouvert : sous sa racine, sinon dans « importes »", () => {
    const racines = { essais: "E:\\" };
    expect(rangement("E:\\tsrst\\Essai1\\m.csv", racines)).toEqual({ source: "essais:tsrst/Essai1/m.csv", copie: "donnees/essais/tsrst/Essai1/m.csv" });
    expect(rangement("C:\\Users\\DAVID\\Bureau\\m.csv", racines)).toEqual({ source: "donnees/importes/m.csv", copie: "donnees/importes/m.csv" });
    expect(estDansEspace("donnees/importes/m.csv")).toBe(true);
    expect(estDansEspace("essais:tsrst/m.csv")).toBe(false);
    expect(estDansEspace("C:\\Users\\m.csv")).toBe(false);
    expect(estDansEspace("/home/lucas/m.csv")).toBe(false);
  });

  it("importe sans écraser un autre fichier du même nom", async () => {
    const espace = new FichiersMemoire();
    const a = new TextEncoder().encode("a"),
      b = new TextEncoder().encode("b");
    expect(await importerFichier(espace, "m.csv", a)).toBe("donnees/importes/m.csv");
    expect(await importerFichier(espace, "m.csv", a)).toBe("donnees/importes/m.csv");
    expect(await importerFichier(espace, "m.csv", b)).toBe("donnees/importes/m-2.csv");
  });

  it("vérifie une copie : ce qui manque à la destination", async () => {
    const a = new FichiersMemoire({ "BIB-001.pdf": "x", "sous/BIB-002.pdf": "y", "x.json.tmp": "", ".lock": "" });
    const b = new FichiersMemoire({ "BIB-001.pdf": "x" });
    expect(await fichiersManquants(a, b)).toEqual(["sous/BIB-002.pdf"]);
    b.poser("sous/BIB-002.pdf", "y");
    expect(await fichiersManquants(a, b)).toEqual([]);
  });
});
