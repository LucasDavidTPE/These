import { describe, expect, it } from "vitest";
import { estDoc, estWord, sansDoublonsDoc, versDocx } from "../core/word";

describe("anciens documents Word (.doc)", () => {
  it("reconnaît .doc et .docx, pas les fichiers verrous de Word", () => {
    expect(estDoc("Chapitre 1.DOC")).toBe(true);
    expect(estDoc("ch1.docx")).toBe(false);
    expect(estWord("ch1.doc") && estWord("a/ch1.docx")).toBe(true);
    expect(estWord("a/~$ch1.doc")).toBe(false);
    expect(estWord("ch1.docm")).toBe(false);
  });

  it("donne le .docx du même nom", () => {
    expect(versDocx("C:\\Thèse\\Chapitre 1.DOC")).toBe("C:\\Thèse\\Chapitre 1.docx");
  });

  it("écarte un .doc déjà converti", () => {
    expect(sansDoublonsDoc(["a/ch1.doc", "a/ch1.docx", "a/ch2.doc", "b/ch1.doc"])).toEqual(["a/ch1.docx", "a/ch2.doc", "b/ch1.doc"]);
  });
});
