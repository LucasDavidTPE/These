import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { lireAnnotations } from "../core/lirePdf";
import {
  aTraiterParPartie,
  auteursDe,
  bilan,
  dateIsoPdf,
  ecrireRetour,
  idRetour,
  lireRetour,
  modifierRemarque,
  nomFichierSur,
  partieProbable,
  remarquesDocx,
  remarquesPdf,
  typeDe,
  type Retour,
} from "../core/retours";

// ---- un .docx relu : commentaires, modifications suivies, titres numérotés ----

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"';
const p = (t: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const ins = (id: number, auteur: string, date: string, t: string) => `<w:ins w:id="${id}" w:author="${auteur}" w:date="${date}"><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:ins>`;
const del = (id: number, auteur: string, date: string, t: string) => `<w:del w:id="${id}" w:author="${auteur}" w:date="${date}"><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;

function docxRelu(): Uint8Array {
  const corps =
    p("Contexte", "Titre1") +
    p("Cadre", "Titre2") +
    '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Le modèle 2S2P1D décrit le comportement.</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>' +
    '<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Phrase déjà reprise.</w:t></w:r><w:commentRangeEnd w:id="1"/></w:p>' +
    `<w:p><w:r><w:t xml:space="preserve">Avant </w:t></w:r>${del(5, "Sergio", "2026-09-30T10:00:00Z", "ancien")}${ins(6, "Sergio", "2026-09-30T10:00:30Z", "nouveau")}<w:r><w:t xml:space="preserve"> après.</w:t></w:r></w:p>` +
    `<w:p>${ins(7, "Sergio", "2026-09-30T10:00:10Z", "Ajout seul.")}</w:p>` +
    `<w:p><w:r><w:t xml:space="preserve">Reste </w:t></w:r>${del(8, "Anne", "2026-09-30T12:00:00Z", "supprimé")}</w:p>` +
    `<w:p><w:r><w:t xml:space="preserve">Deux </w:t></w:r>${ins(9, "Sergio", "2026-09-30T10:00:00Z", "a")}<w:r><w:t xml:space="preserve"> et </w:t></w:r>${ins(10, "Sergio", "2026-09-30T14:00:00Z", "b")}</w:p>`;
  const styles =
    '<w:styles><w:style w:styleId="Titre1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style><w:style w:styleId="Titre2"><w:name w:val="heading 2"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style></w:styles>';
  const numbering =
    '<w:numbering><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';
  const comments =
    '<w:comments><w:comment w:id="0" w:author="Anne" w:date="2026-09-30T09:00:00Z"><w:p w14:paraId="A1"><w:r><w:t>Citer Olard.</w:t></w:r></w:p></w:comment><w:comment w:id="1" w:author="Sergio" w:date="2026-09-29T09:00:00Z"><w:p w14:paraId="B1"><w:r><w:t>OK ?</w:t></w:r></w:p></w:comment></w:comments>';
  const ext = '<w15:commentsEx><w15:commentEx w15:paraId="B1" w15:done="1"/></w15:commentsEx>';
  const avecNs = (x: string) => x.replace(/^<(\w+:\w+)/, `<$1 ${NS}`);
  return zipSync({
    "word/document.xml": strToU8(`<w:document ${NS}><w:body>${corps}</w:body></w:document>`),
    "word/styles.xml": strToU8(avecNs(styles)),
    "word/numbering.xml": strToU8(avecNs(numbering)),
    "word/comments.xml": strToU8(avecNs(comments)),
    "word/commentsExtended.xml": strToU8(avecNs(ext)),
  });
}

describe("remarques d'un .docx relu", () => {
  const { remarques, auteurs } = remarquesDocx(docxRelu());

  it("commentaires et modifications, dans l'ordre du document, avec titre numéroté et passage commenté", () => {
    expect(remarques.map((r) => [r.id, r.genre, r.auteur, r.texte])).toEqual([
      ["c0", "commentaire", "Anne", "Citer Olard."],
      ["c1", "commentaire", "Sergio", "OK ?"],
      ["m0", "modification", "Sergio", "« ancien » → « nouveau »"],
      ["m1", "insertion", "Sergio", "Ajout seul."],
      ["m2", "suppression", "Anne", "supprimé"],
      ["m3", "insertion", "Sergio", "a"],
      ["m4", "insertion", "Sergio", "b"],
    ]);
    expect(remarques[0]).toMatchObject({ titre: "1.1 Cadre", ancre: "Le modèle 2S2P1D décrit le comportement.", page: null, date: "2026-09-30T09:00:00Z" });
    expect(remarques[2]!.ancre).toBe("Avant nouveau après.");
  });

  it("un commentaire résolu dans Word est déjà traité ; le reste est à traiter", () => {
    expect(remarques.map((r) => r.etat)).toEqual(["a-traiter", "traitee", "a-traiter", "a-traiter", "a-traiter", "a-traiter", "a-traiter"]);
  });

  it("auteurs classés par nombre de remarques", () => {
    expect(auteurs).toEqual(["Sergio", "Anne"]);
    expect(auteursDe([])).toEqual([]);
  });
});

// ---- PDF annoté, lu par pdf.js ----

function pdfAnnote(): Uint8Array {
  const flux = "BT /F1 12 Tf 60 700 Td (Bonjour) Tj 90 0 Td (tout) Tj 90 0 Td (le monde) Tj ET";
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> /Annots [6 0 R 7 0 R 8 0 R 9 0 R] >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Annot /Subtype /Text /Rect [300 700 320 720] /Contents (A reformuler) /T (Sergio) /M (D:20260930100000+02'00') /Name /Comment /F 4 >>",
    "<< /Type /Annot /Subtype /Highlight /Rect [148 696 192 714] /QuadPoints [150 712 190 712 150 698 190 698] /C [1 1 0] /Contents (Verifier) /T (Anne) /M (D:20260930110000Z) /F 4 >>",
    "<< /Type /Annot /Subtype /StrikeOut /Rect [238 696 300 714] /QuadPoints [240 712 300 712 240 698 300 698] /C [1 0 0] /T (Anne) /F 4 >>",
    "<< /Type /Annot /Subtype /Link /Rect [10 10 20 20] /Border [0 0 0] >>",
  ];
  let s = "%PDF-1.4\n";
  const pos: number[] = [];
  objets.forEach((o, i) => {
    pos.push(s.length);
    s += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = s.length;
  s += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((q) => `${String(q).padStart(10, "0")} 00000 n \n`).join("")}`;
  return new TextEncoder().encode(s + `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`);
}

describe("PDF annoté", () => {
  it("dates PDF → ISO", () => {
    expect(dateIsoPdf("D:20260930100000+02'00'")).toBe("2026-09-30T10:00:00+02:00");
    expect(dateIsoPdf("D:20260930110000Z")).toBe("2026-09-30T11:00:00Z");
    expect(dateIsoPdf("D:2026")).toBe("2026-01-01T00:00:00Z");
    expect(dateIsoPdf(null)).toBe("");
    expect(dateIsoPdf("hier")).toBe("");
  });

  it("annotations lues par pdf.js : commentaire, surlignage avec le mot marqué, barré ; le lien est ignoré", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: pdfAnnote(), verbosity: 0 }).promise;
    const brutes = await lireAnnotations(doc as never);
    await doc.destroy();
    expect(brutes.map((a) => [a.sousType, a.contenu, a.auteur, a.couvert])).toEqual([
      ["Text", "A reformuler", "Sergio", ""],
      ["Highlight", "Verifier", "Anne", "tout"],
      ["StrikeOut", "", "Anne", "le monde"],
      ["Link", "", "", ""],
    ]);
    const r = remarquesPdf(brutes);
    expect(r.map((x) => [x.id, x.genre, x.auteur, x.texte, x.ancre, x.page])).toEqual([
      ["p1-1", "commentaire", "Sergio", "A reformuler", "", 1],
      ["p1-2", "surlignage", "Anne", "Verifier", "tout", 1],
      ["p1-3", "barre", "Anne", "", "le monde", 1],
    ]);
    expect(r[0]!.date).toBe("2026-09-30T10:00:00+02:00");
    expect(r.every((x) => x.etat === "a-traiter" && x.titre === "")).toBe(true);
  });

  it("un marquage sans texte ni commentaire, ou une annotation inconnue, n'est pas une remarque", () => {
    expect(
      remarquesPdf([
        { page: 2, sousType: "Highlight", contenu: "", auteur: "A", date: "", couvert: "  " },
        { page: 2, sousType: "Widget", contenu: "x", auteur: "A", date: "", couvert: "" },
        { page: 2, sousType: "FreeText", contenu: "À revoir", auteur: "A", date: "", couvert: "" },
      ]).map((x) => x.id),
    ).toEqual(["p2-1"]);
  });
});

// ---- le retour lui-même ----

describe("retour reçu", () => {
  const base: Retour = {
    id: "2026-10-05_sergio_chapitre1",
    partie: "chapitre1",
    de: "Sergio",
    recu: "2026-10-05",
    note: "",
    fichier: "Chapitre 1 relu.docx",
    type: "docx",
    taille: 10,
    empreinte: "abcd1234",
    base: "",
    ajoute: "2026-10-05T10:00:00+02:00",
    poste: "PC",
    remarques: [
      { id: "c0", genre: "commentaire", auteur: "Anne", date: "", texte: "x", ancre: "", titre: "", page: null, etat: "a-traiter", note: "" },
      { id: "c1", genre: "commentaire", auteur: "Anne", date: "", texte: "y", ancre: "", titre: "", page: null, etat: "traitee", note: "" },
    ],
  };

  it("écriture / lecture, lecture tolérante", () => {
    expect(lireRetour(JSON.parse(ecrireRetour(base)))).toEqual(base);
    expect(lireRetour(null)).toBeNull();
    expect(lireRetour({ id: "a" })).toBeNull();
    const r = lireRetour({ id: "a", fichier: "f.pdf", type: "pdf", partie: "", remarques: [{ id: "x", genre: "?", etat: "?" }, { genre: "commentaire" }] })!;
    expect(r).toMatchObject({ partie: null, type: "pdf", remarques: [{ id: "x", genre: "commentaire", etat: "a-traiter", page: null }] });
    expect(r.remarques).toHaveLength(1);
  });

  it("états, bilan, remarques à traiter par partie", () => {
    const r = modifierRemarque(base, "c0", { etat: "refusee", note: "voir chap. 3" });
    expect(r.remarques[0]).toMatchObject({ etat: "refusee", note: "voir chap. 3" });
    expect(bilan(base)).toEqual({ "a-traiter": 1, traitee: 1, refusee: 0, total: 2 });
    const autre: Retour = { ...base, id: "b", partie: null };
    expect([...aTraiterParPartie([base, r, autre]).entries()]).toEqual([
      ["chapitre1", 1],
      ["", 1],
    ]);
  });

  it("identifiants et noms de fichier", () => {
    expect(idRetour("2026-10-05", "Sergio B.", "chapitre1", new Set())).toBe("2026-10-05_sergio-b_chapitre1");
    expect(idRetour("2026-10-05", "", null, new Set(["2026-10-05_manuscrit"]))).toBe("2026-10-05_manuscrit-2");
    expect(nomFichierSur("C:\\Users\\x\\Chapitre 1: relu?.docx")).toBe("Chapitre 1_ relu_.docx");
    expect(typeDe("a.DOCX")).toBe("docx");
    expect(typeDe("a.pdf")).toBe("pdf");
    expect(typeDe("a.doc")).toBeNull();
  });

  it("partie probable d'après le nom du fichier", () => {
    const parties = [
      { id: "introduction-generale", nom: "Introduction generale" },
      { id: "chapitre1-etat-de-l-art", nom: "Chapitre1 Etat de l art" },
      { id: "chapitre3-modelisation-ef", nom: "Chapitre3 Modelisation EF" },
    ];
    expect(partieProbable("Chapitre3_relu_Sergio.docx", parties)).toBe("chapitre3-modelisation-ef");
    expect(partieProbable("Etat de l'art - retours Anne.pdf", parties)).toBe("chapitre1-etat-de-l-art");
    expect(partieProbable("Introduction générale v2.docx", parties)).toBe("introduction-generale");
    expect(partieProbable("notes.docx", parties)).toBeNull();
  });
});
