import { describe, expect, it } from "vitest";
import { chercher, chercherCommandes, type EntreeRecherche } from "./recherche";

const e = (id: string, titre: string, detail = "", mots = ""): EntreeRecherche => ({ id, module: "m", genre: "Référence", titre, detail, mots });

const CORPUS = [
  e("1", "Viscoelastic response of asphalt pavements", "Lee, S.; Kim, J. · 2019"),
  e("2", "Spectral method for layered media", "David, L. · 2024", "chaussée multicouche"),
  e("3", "Essai TSRST 3", "Campagne TSRST Lucas · terminé"),
  e("4", "Essai module complexe", "Campagne 2S2P1D · en cours"),
];

describe("recherche globale", () => {
  it("ignore casse et accents", () => {
    expect(chercher(CORPUS, "CHAUSSEE").map((x) => x.id)).toEqual(["2"]);
    expect(chercher(CORPUS, "viscoélastique").length).toBe(0);
    expect(chercher(CORPUS, "viscoelastic").map((x) => x.id)).toEqual(["1"]);
  });

  it("exige tous les mots, dans n'importe quel ordre", () => {
    expect(chercher(CORPUS, "tsrst essai").map((x) => x.id)).toEqual(["3"]);
    expect(chercher(CORPUS, "essai zzz")).toEqual([]);
  });

  it("classe le titre avant le détail", () => {
    const c = [e("a", "Autre chose", "essai en détail"), e("b", "Essai propre", "rien")];
    expect(chercher(c, "essai").map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("préfère un début de mot", () => {
    const c = [e("a", "Constructeur"), e("b", "Structure A340")];
    expect(chercher(c, "struct").map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("requête vide : rien ; limite respectée", () => {
    expect(chercher(CORPUS, "  ")).toEqual([]);
    expect(chercher(CORPUS, "e", 2)).toHaveLength(2);
  });

  it("commandes : toutes sans requête, filtrées avec", () => {
    const cmds = [
      { id: "reglages", titre: "Réglages du poste", mots: "parametres racines" },
      { id: "diag", titre: "Diagnostic" },
    ];
    expect(chercherCommandes(cmds, "")).toHaveLength(2);
    expect(chercherCommandes(cmds, "param").map((c) => c.id)).toEqual(["reglages"]);
    expect(chercherCommandes(cmds, "xyz")).toEqual([]);
  });
});
