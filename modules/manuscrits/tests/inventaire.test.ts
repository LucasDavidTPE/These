import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { inventorier } from "../core/inventaire";
import { attr, decoder, lireStyles, niveauTitre, ouvrirDocx, parcourir } from "../core/ooxml";

const DOSSIER = new URL("./fixtures/manuscrit/", import.meta.url);
const lire = (rel: string) => new Uint8Array(readFileSync(new URL(rel, DOSSIER)));

/** Un .docx minimal : le corps `body` (XML de paragraphes) et des pièces facultatives. */
function docx(body: string, extra: Record<string, string> = {}): Uint8Array {
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
  const fichiers: Record<string, Uint8Array> = {
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${ns}><w:body>${body}</w:body></w:document>`),
    "word/styles.xml": strToU8(`<w:styles ${ns}><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Consigne"><w:name w:val="Consigne"/></w:style></w:styles>`),
  };
  for (const [n, c] of Object.entries(extra)) fichiers[n] = strToU8(c.replace("<w:comments", `<w:comments ${ns}`).replace("<w15:commentsEx", `<w15:commentsEx ${ns}`));
  return zipSync(fichiers);
}
const p = (texte: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${texte}</w:t></w:r></w:p>`;

describe("analyse XML", () => {
  it("balises, attributs, entités", () => {
    const evts: string[] = [];
    parcourir('<?xml version="1.0"?><a x="1"><b y="&amp;"/>t &lt; u<!-- c --></a>', (e) => evts.push(e.type === "texte" ? `t:${e.texte}` : e.type === "ouvre" ? `o:${e.nom}${e.vide ? "/" : ""}` : `f:${e.nom}`));
    expect(evts).toEqual(["o:a", "o:b/", "f:b", "t:t < u", "f:a"]);
    expect(attr('w:id="3" w:author="L. &amp; D."', "w:author")).toBe("L. & D.");
    expect(attr('w:xid="3"', "w:id")).toBe("");
    expect(decoder("&#233;&#x20AC;")).toBe("é€");
  });

  it("niveau de titre par le nom du style, à défaut par son identifiant", () => {
    const s = lireStyles('<w:styles><w:style w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Corps"><w:name w:val="Body"/></w:style></w:styles>');
    expect(niveauTitre("Titre1", s)).toBe(1);
    expect(niveauTitre("Corps", s)).toBe(0);
    expect(niveauTitre("Heading3", s)).toBe(3);
  });
});

describe("inventaire d'un .docx", () => {
  it("plan, mots hors consignes, consignes à rédiger, signets, sections", () => {
    const inv = inventorier(
      docx(
        '<w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:bookmarkStart w:id="1" w:name="CHAP_1"/><w:r><w:t>Chapitre 1 – État</w:t></w:r></w:p>' +
          p("Un deux trois quatre.") +
          p("À rédiger : annonce le plan.", "Consigne") +
          p("a rédiger plus tard", "Consigne") +
          p("Une autre consigne", "Consigne") +
          p("1.1 Sous-titre", "Titre2") +
          p("Cinq six.") +
          "<w:sectPr/>",
      ),
    );
    expect(inv.titre).toBe("Chapitre 1 – État");
    expect(inv.plan).toEqual([
      { niveau: 1, texte: "Chapitre 1 – État", signet: "CHAP_1" },
      { niveau: 2, texte: "1.1 Sous-titre", signet: "" },
    ]);
    expect(inv.mots).toBe(4 + 4 + 2 + 2);
    expect(inv.consignes).toBe(3);
    expect(inv.aRediger).toBe(2);
    expect(inv.sections).toBe(1);
    expect(inv.paragraphes).toBe(7);
  });

  it("commentaires (auteur, ancre, titre, résolu) et modifications suivies", () => {
    const body =
      '<w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>Chapitre 2</w:t></w:r></w:p>' +
      '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Phrase commentée par Sergio.</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>' +
      '<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Autre passage.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Avant </w:t></w:r><w:ins w:id="5" w:author="Sergio" w:date="2026-09-01T10:00:00Z"><w:r><w:t>ajouté</w:t></w:r></w:ins>' +
      '<w:del w:id="6" w:author="Sergio" w:date="2026-09-01T10:00:00Z"><w:r><w:delText>supprimé</w:delText></w:r></w:del><w:r><w:t xml:space="preserve"> après.</w:t></w:r></w:p>';
    const comments =
      '<w:comments><w:comment w:id="0" w:author="Sergio" w:date="2026-09-01T09:00:00Z"><w:p w14:paraId="AAA"><w:r><w:t>À reformuler</w:t></w:r></w:p></w:comment>' +
      '<w:comment w:id="1" w:author="Anne" w:date="2026-09-02T09:00:00Z"><w:p w14:paraId="BBB"><w:r><w:t>Source ?</w:t></w:r></w:p><w:p w14:paraId="CCC"><w:r><w:t>Voir Olard.</w:t></w:r></w:p></w:comment></w:comments>';
    const ext = '<w15:commentsEx><w15:commentEx w15:paraId="AAA" w15:done="1"/><w15:commentEx w15:paraId="CCC" w15:done="0"/></w15:commentsEx>';
    const inv = inventorier(docx(body, { "word/comments.xml": comments, "word/commentsExtended.xml": ext }));
    expect(inv.commentaires).toEqual([
      { id: "0", auteur: "Sergio", date: "2026-09-01T09:00:00Z", texte: "À reformuler", resolu: true, ancre: "Phrase commentée par Sergio.", titre: "Chapitre 2" },
      { id: "1", auteur: "Anne", date: "2026-09-02T09:00:00Z", texte: "Source ?\nVoir Olard.", resolu: false, ancre: "Autre passage.", titre: "Chapitre 2" },
    ]);
    expect(inv.modifications).toEqual([
      { genre: "insertion", auteur: "Sergio", date: "2026-09-01T10:00:00Z", texte: "ajouté", titre: "Chapitre 2" },
      { genre: "suppression", auteur: "Sergio", date: "2026-09-01T10:00:00Z", texte: "supprimé", titre: "Chapitre 2" },
    ]);
    // le texte supprimé n'est pas compté dans les mots
    expect(inv.mots).toBe(2 + 4 + 2 + 3); // « Chapitre 2 », « Phrase commentée par Sergio. », « Autre passage. », « Avant ajouté après. »
  });

  it("champs : citations et bibliographie Zotero, figures, tableaux, contenu de repli ignoré", () => {
    const champ = (instr: string) =>
      `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>(Olard, 2003)</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
    const body =
      `<w:p>${champ('ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"x"}')}${champ("ADDIN ZOTERO_ITEM CSL_CITATION {}")}</w:p>` +
      `<w:p>${champ("ADDIN ZOTERO_BIBL {} CSL_BIBLIOGRAPHY")}</w:p>` +
      '<w:p><w:r><w:drawing/></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cellule</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<mc:AlternateContent><mc:Choice><w:p><w:r><w:t>boite</w:t></w:r></w:p></mc:Choice><mc:Fallback><w:p><w:r><w:t>repli</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent>';
    const inv = inventorier(docx(body));
    expect(inv.citations).toBe(2);
    expect(inv.bibliographie).toBe(true);
    expect(inv.figures).toBe(1);
    expect(inv.tableaux).toBe(1);
    expect(inv.mots).toBe(3 + 2 + 1 + 1); // deux citations collées (3 mots), bibliographie (2), cellule, zone de texte (le repli est ignoré)
  });

  it("refuse un fichier qui n'est pas un .docx", () => {
    expect(() => inventorier(zipSync({ "a.txt": strToU8("x") }))).toThrow("word/document.xml");
  });
});

describe("fixture : la trame fournie", () => {
  const parties = readdirSync(new URL("Chapitres/", DOSSIER)).sort();

  it("dix parties, chacune avec son titre, son plan et ses consignes", () => {
    expect(parties).toHaveLength(10);
    const inv = parties.map((n) => inventorier(lire(`Chapitres/${n}`)));
    expect(inv.map((i) => i.titre.slice(0, 12))).toEqual(["Introduction", "Chapitre 1 –", "Chapitre 2 –", "Chapitre 3 –", "Chapitre 4 –", "Chapitre 5 –", "Chapitre 6 –", "Chapitre 7 –", "Conclusion g", "Annexes"]);
    expect(inv.map((i) => i.aRediger)).toEqual([4, 18, 16, 17, 15, 11, 14, 9, 3, 3]);
    expect(inv.reduce((a, i) => a + i.aRediger, 0)).toBe(110);
    expect(inv.every((i) => i.sections === 2 && i.figures === 0 && i.tableaux === 0 && i.citations === 0)).toBe(true);
    const ch1 = inv[1]!;
    expect(ch1.plan.filter((t) => t.niveau === 1)).toHaveLength(1);
    expect(ch1.plan.filter((t) => t.niveau === 2)).toHaveLength(6);
    expect(ch1.plan.filter((t) => t.niveau === 3)).toHaveLength(12);
    expect(ch1.plan[0]!.signet).toBe("CHAP_1");
    expect(ch1.plan.find((t) => t.texte.startsWith("1.1.1"))!.signet).toBe("C1_1_1");
  });

  it("le mini-sommaire et les consignes ne comptent pas dans les mots", () => {
    const ch1 = inventorier(lire("Chapitres/01_Chapitre1_Etat_de_l_art.docx"));
    const titres = ch1.plan.reduce((a, t) => a + t.texte.split(/\s+/).length, 0);
    expect(ch1.mots).toBeGreaterThanOrEqual(titres);
    expect(ch1.mots).toBeLessThan(titres + 40); // seuls restent « Sommaire du chapitre » et les blocs finaux
  });

  it("le document maître : liminaires, procédure et repères", () => {
    const m = inventorier(lire("00_Document_maitre.docx"));
    expect(m.plan.some((t) => t.texte === "Références bibliographiques")).toBe(true);
    expect(m.sections).toBe(3);
  });

  it("la trame fusionnée : 10 parties, 12 sections", () => {
    const f = inventorier(lire("Trame_complete_fusionnee.docx"));
    expect(f.plan.filter((t) => t.niveau === 1).map((t) => t.texte.slice(0, 12))).toEqual(["Introduction", "Chapitre 1 –", "Chapitre 2 –", "Chapitre 3 –", "Chapitre 4 –", "Chapitre 5 –", "Chapitre 6 –", "Chapitre 7 –", "Conclusion g", "Références b", "Annexes"]);
    expect(f.sections).toBe(12);
    expect(f.paragraphes).toBe(519);
  });

  it("ouvre aussi le modèle .dotx", () => {
    expect(ouvrirDocx(lire("Modele/Modele_These.dotx")).fichiers["word/document.xml"]).toContain("<w:body>");
  });
});
