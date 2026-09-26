import { describe, expect, it } from "vitest";
import { newMeta } from "./meta";
import { formToMeta, metaToForm, parseList } from "./metaForm";

const base = newMeta({ id: "FIG-0001", title: "Titre", kind: "image", now: "2026-09-25T10:00:00Z", host: "PC" });

describe("parseList", () => {
  it("nettoie vides et doublons", () => {
    expect(parseList(" a, b ,, a ; c", /[,;]/)).toEqual(["a", "b", "c"]);
    expect(parseList("", /,/)).toEqual([]);
  });
});

describe("formulaire de métadonnées", () => {
  it("aller-retour sans modification", () => {
    const meta = { ...base, tags: ["x", "y"], source: { type: "article" as const, author: "Huang", year: 2004 }, license: "CC-BY" };
    const r = formToMeta(meta, metaToForm(meta));
    expect(r).toEqual({ ok: true, meta });
  });

  it("convertit les champs texte", () => {
    const r = formToMeta(base, {
      ...metaToForm(base),
      title: "  Nouveau titre ",
      tags: "chaussée, TFE",
      sourceType: "web",
      url: "https://example.org",
      year: "1997",
      usedIn: "Article 2027\n\nManuscrit ch. 2\n",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.title).toBe("Nouveau titre");
      expect(r.meta.tags).toEqual(["chaussée", "TFE"]);
      expect(r.meta.source).toEqual({ type: "web", url: "https://example.org", year: 1997 });
      expect(r.meta.used_in).toEqual(["Article 2027", "Manuscrit ch. 2"]);
      expect("license" in r.meta).toBe(false);
    }
  });

  it("source vide = pas de source", () => {
    const meta = { ...base, source: { type: "web" as const } };
    const r = formToMeta(meta, { ...metaToForm(meta), sourceType: "" });
    expect(r.ok && "source" in r.meta).toBe(false);
  });

  it("renvoie les erreurs par champ", () => {
    const r = formToMeta(base, { ...metaToForm(base), title: " ", sourceType: "article", year: "97a", bib: "42" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toEqual(["title", "source.bib", "source.year"]);
  });
});
