import { describe, expect, it } from "vitest";
import { parseClipboardHtml, sourceFromOrigin } from "./clipboardHtml";

/** Forme typique de ce que Chrome / Edge déposent (en-têtes CF_HTML + fragment). */
const CHROME = [
  "Version:0.9",
  "StartHTML:0000000105",
  "EndHTML:0000000400",
  "StartFragment:0000000141",
  "EndFragment:0000000364",
  "SourceURL:https://www.example.org/articles/chaussees.html",
  "<html><body>",
  "<!--StartFragment--><img src=\"/images/structure.png?w=800&amp;h=600\" alt=\"Structure\"><!--EndFragment-->",
  "</body></html>",
].join("\r\n");

describe("parseClipboardHtml", () => {
  it("lit SourceURL et rend l'image absolue", () => {
    expect(parseClipboardHtml(CHROME)).toEqual({
      pageUrl: "https://www.example.org/articles/chaussees.html",
      imageUrl: "https://www.example.org/images/structure.png?w=800&h=600",
    });
  });

  it("gère les guillemets simples et l'absence de SourceURL (Word)", () => {
    const html = "Version:1.0\r\nStartHTML:1\r\n<img width=10 src='https://cdn.example.org/a.jpg'>";
    expect(parseClipboardHtml(html)).toEqual({ imageUrl: "https://cdn.example.org/a.jpg" });
  });

  it("ignore data:, file: et les src relatifs sans page", () => {
    expect(parseClipboardHtml('SourceURL:https://a.org/\r\n<img src="data:image/png;base64,AAAA">')).toEqual({
      pageUrl: "https://a.org/",
    });
    expect(parseClipboardHtml('<img src="file:///C:/x.png">')).toEqual({});
    expect(parseClipboardHtml('<img src="x.png">')).toEqual({});
    expect(parseClipboardHtml("SourceURL:about:blank\r\n")).toEqual({});
  });

  it("vide ou absent", () => {
    expect(parseClipboardHtml(null)).toEqual({});
    expect(parseClipboardHtml("")).toEqual({});
  });
});

describe("sourceFromOrigin", () => {
  it("cite la page et note l'image", () => {
    expect(sourceFromOrigin(parseClipboardHtml(CHROME))).toEqual({
      type: "web",
      url: "https://www.example.org/articles/chaussees.html",
      note: "Image : https://www.example.org/images/structure.png?w=800&h=600",
    });
  });

  it("à défaut, l'image seule ; sinon rien", () => {
    expect(sourceFromOrigin({ imageUrl: "https://a.org/i.png" })).toEqual({ type: "web", url: "https://a.org/i.png" });
    expect(sourceFromOrigin({})).toBeUndefined();
  });
});
