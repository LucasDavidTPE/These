import { describe, expect, it } from "vitest";
import { analyserMarkdown, enLigne } from "./markdown";

describe("petit Markdown des cartes", () => {
  it("en ligne : gras, italique, code, lien, citation", () => {
    expect(enLigne("un **gras** et *ital* `x = 2` [site](https://a.fr) [@BIB-020, p. 3] fin")).toEqual([
      { type: "texte", texte: "un " },
      { type: "texte", texte: "gras", gras: true },
      { type: "texte", texte: " et " },
      { type: "texte", texte: "ital", italique: true },
      { type: "texte", texte: " " },
      { type: "code", texte: "x = 2" },
      { type: "texte", texte: " " },
      { type: "lien", texte: "site", url: "https://a.fr" },
      { type: "texte", texte: " " },
      { type: "cite", brut: "[@BIB-020, p. 3]" },
      { type: "texte", texte: " fin" },
    ]);
  });

  it("un lien non web (javascript:, fichier) reste du texte", () => {
    expect(enLigne("[x](javascript:alert(1))").every((e) => e.type === "texte")).toBe(true);
  });

  it("blocs : titres, paragraphes sur plusieurs lignes, listes", () => {
    const b = analyserMarkdown("## Titre\nligne 1\nligne 2\n\n- a\n- b\n  suite de b\n1. un\n2. deux\n\nfin");
    expect(b.map((x) => x.type)).toEqual(["titre", "paragraphe", "liste", "liste", "paragraphe"]);
    expect(b[1]).toEqual({ type: "paragraphe", contenu: [{ type: "texte", texte: "ligne 1 ligne 2" }] });
    expect(b[2]).toMatchObject({ ordonnee: false, elements: [[{ texte: "a" }], [{ texte: "b suite de b" }]] });
    expect(b[3]).toMatchObject({ ordonnee: true });
  });

  it("cases à cocher, avec leur ligne", () => {
    const b = analyserMarkdown("titre\n\n- [ ] à faire\n- [x] fait\n- normal");
    expect(b[1]).toMatchObject({ type: "liste", taches: [false, true, null], lignes: [2, 3, 4], elements: [[{ texte: "à faire" }], [{ texte: "fait" }], [{ texte: "normal" }]] });
  });
});
