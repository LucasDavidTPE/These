import { describe, expect, it } from "vitest";
import { citationAuteurAnnee, clesCitees, remplacerCitations, type ReferenceCitee } from "./citations";

const REFS = new Map<string, ReferenceCitee>([
  ["BIB-020", { id: "BIB-020", auteurs: "Olard & Di Benedetto", annee: "2003", complete: "…" }],
  ["BIB-065", { id: "BIB-065", auteurs: "Burmister", annee: "1945", complete: "…" }],
]);
const rendre = (t: string) => remplacerCitations(t, (c) => citationAuteurAnnee(c, REFS));

describe("citations", () => {
  it("repère les clés, dans l'ordre, sans doublon", () => {
    expect(clesCitees("A [@BIB-020] puis [@BIB-065; @BIB-020, p. 3] et [@olard2003general]")).toEqual(["BIB-020", "BIB-065", "olard2003general"]);
    expect(clesCitees("un [lien](x) et [note] ne sont pas des citations")).toEqual([]);
  });

  it("rend en auteur-année, avec précision et groupes", () => {
    expect(rendre("Le modèle [@BIB-020] généralise")).toBe("Le modèle (Olard & Di Benedetto, 2003) généralise");
    expect(rendre("[@BIB-065, p. 12; @BIB-020]")).toBe("(Burmister, 1945, p. 12 ; Olard & Di Benedetto, 2003)");
  });

  it("laisse tel quel un groupe dont une clé est inconnue, et le texte entre crochets ordinaire", () => {
    expect(rendre("voir [@BIB-999] et [@BIB-020; @BIB-999]")).toBe("voir [@BIB-999] et [@BIB-020; @BIB-999]");
    expect(rendre("[crochets] et [@ mal formé]")).toBe("[crochets] et [@ mal formé]");
  });
});
