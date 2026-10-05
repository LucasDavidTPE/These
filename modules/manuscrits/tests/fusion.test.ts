import { readFileSync, readdirSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { elementsDePremierNiveau, decouperCorps, lireRelations, lireTypesContenu, resoudreChemin, cheminRelatif } from "../core/fusionXml";
import { fusionner, nettoyer, NETTOYAGE_PAR_DEFAUT, type PartieFusion } from "../core/fusion";
import { inventorier } from "../core/inventaire";
import { parcourir } from "../core/ooxml";

const DOSSIER = new URL("./fixtures/manuscrit/", import.meta.url);
const lire = (rel: string) => new Uint8Array(readFileSync(new URL(rel, DOSSIER)));

// ---- Vérifications structurelles d'un .docx produit ----

function paquet(octets: Uint8Array): Map<string, string> {
  return new Map(Object.entries(unzipSync(octets)).map(([n, b]) => [n, /\.(xml|rels)$/.test(n) ? strFromU8(b) : `(binaire ${b.length})`]));
}

/** Toute pièce XML est bien formée (balises équilibrées). */
function bienFormee(xml: string): string | null {
  const pile: string[] = [];
  let erreur: string | null = null;
  let videOuverte = false;
  parcourir(xml, (e) => {
    if (erreur) return;
    if (e.type === "ouvre") {
      if (e.vide) videOuverte = true;
      else pile.push(e.nom);
    } else if (e.type === "ferme") {
      if (videOuverte) videOuverte = false;
      else if (pile.pop() !== e.nom) erreur = `fermeture inattendue </${e.nom}>`;
    }
  });
  return erreur ?? (pile.length ? `balise non fermée <${pile[pile.length - 1]}>` : null);
}

function verifier(octets: Uint8Array) {
  const p = paquet(octets);
  const problemes: string[] = [];
  for (const [n, x] of p) if (/\.(xml|rels)$/.test(n) && !x.startsWith("(")) {
    const e = bienFormee(x);
    if (e) problemes.push(`${n} : ${e}`);
  }
  const types = lireTypesContenu(p.get("[Content_Types].xml")!);
  for (const n of p.keys()) {
    if (n === "[Content_Types].xml" || n.endsWith("/")) continue;
    const ext = n.slice(n.lastIndexOf(".") + 1).toLowerCase();
    if (!types.surcharges.has(`/${n}`) && !types.defauts.has(ext)) problemes.push(`${n} : sans type de contenu`);
  }
  for (const surcharge of types.surcharges.keys()) if (!p.has(surcharge.slice(1))) problemes.push(`type de contenu pour une pièce absente : ${surcharge}`);
  // relations : cibles présentes, identifiants utilisés déclarés
  for (const [n, x] of p) {
    if (!n.endsWith(".rels")) continue;
    const dossier = n.replace(/_rels\/[^/]*$/, "").replace(/\/$/, "");
    const rels = lireRelations(x);
    const ids = new Set<string>();
    for (const r of rels) {
      if (ids.has(r.id)) problemes.push(`${n} : identifiant ${r.id} en double`);
      ids.add(r.id);
      if (r.mode !== "External" && !p.has(resoudreChemin(dossier, r.cible))) problemes.push(`${n} : cible absente ${r.cible}`);
    }
    const partie = n.replace(/_rels\/([^/]*)\.rels$/, "$1");
    const xmlPartie = p.get(partie);
    if (xmlPartie && !xmlPartie.startsWith("("))
      for (const m of xmlPartie.matchAll(/\b(?:r:(?:id|embed|link|pict)|o:relid)="([^"]+)"/g)) if (!ids.has(m[1]!)) problemes.push(`${partie} : relation ${m[1]} non déclarée`);
  }
  const doc = p.get("word/document.xml")!;
  const dupl = (motif: RegExp, nom: string) => {
    const vus = new Set<string>();
    for (const m of doc.matchAll(motif)) {
      if (vus.has(m[1]!)) problemes.push(`document.xml : ${nom} ${m[1]} en double`);
      vus.add(m[1]!);
    }
  };
  dupl(/<w:bookmarkStart\b[^>]*?\bw:id="(\d+)"/g, "signet");
  dupl(/<wp:docPr\b[^>]*?\bid="(\d+)"/g, "dessin");
  // les notes et commentaires référencés existent
  for (const [balise, fichier] of [["footnote", "word/footnotes.xml"], ["endnote", "word/endnotes.xml"]] as const) {
    const refs = [...doc.matchAll(new RegExp(`<w:${balise}Reference\\b[^>]*?\\bw:id="(\\d+)"`, "g"))].map((m) => m[1]!);
    const ids = new Set([...(p.get(fichier) ?? "").matchAll(new RegExp(`<w:${balise}\\b[^>]*?\\bw:id="(-?\\d+)"`, "g"))].map((m) => m[1]!));
    for (const r of refs) if (!ids.has(r)) problemes.push(`${balise} ${r} référencée mais absente`);
    if (new Set(refs).size !== refs.length) problemes.push(`${balise} : référence en double`);
  }
  const commentaires = new Set([...(p.get("word/comments.xml") ?? "").matchAll(/<w:comment\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1]!));
  for (const m of doc.matchAll(/<w:commentReference\b[^>]*?\bw:id="(\d+)"/g)) if (!commentaires.has(m[1]!)) problemes.push(`commentaire ${m[1]} référencé mais absent`);
  return problemes;
}

function parties(): PartieFusion[] {
  const noms = readdirSync(new URL("Chapitres/", DOSSIER)).sort();
  return [
    { id: "maitre", nom: "Document maître", genre: "liminaire", fichier: "00_Document_maitre.docx", octets: lire("00_Document_maitre.docx") },
    ...noms.map((n) => ({
      id: n.replace(/\.docx$/, ""),
      nom: n.replace(/\.docx$/, ""),
      genre: /Annexes/.test(n) ? ("annexe" as const) : ("chapitre" as const),
      fichier: n,
      octets: lire(`Chapitres/${n}`),
    })),
  ];
}
const OPT = { mode: "relecture" as const, titre: "Thèse L. David", saut: "nextPage" as const, nettoyage: NETTOYAGE_PAR_DEFAUT };

// ---- Briques ----

describe("découpe du corps", () => {
  it("éléments de premier niveau, balises vides et imbrications", () => {
    expect(elementsDePremierNiveau('<w:p><w:r><w:t>a</w:t></w:r></w:p><w:bookmarkStart w:id="1"/><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>')).toEqual([
      "<w:p><w:r><w:t>a</w:t></w:r></w:p>",
      '<w:bookmarkStart w:id="1"/>',
      "<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>",
    ]);
    const d = decouperCorps('<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p/><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:body></w:document>');
    expect(d.blocs).toEqual(["<w:p/>"]);
    expect(d.sectFinal).toBe('<w:sectPr><w:pgSz w:w="1"/></w:sectPr>');
    expect(d.avant.endsWith("<w:body>")).toBe(true);
    expect(d.apres).toBe("</w:body></w:document>");
    expect(() => decouperCorps("<a/>")).toThrow("corps du document");
  });

  it("relations et chemins", () => {
    expect(lireRelations('<Relationships><Relationship Id="rId1" Type="t/header" Target="header1.xml"/><Relationship Id="rId2" Type="t/hyperlink" Target="https://x.y" TargetMode="External"/></Relationships>')).toEqual([
      { id: "rId1", type: "t/header", cible: "header1.xml", mode: "" },
      { id: "rId2", type: "t/hyperlink", cible: "https://x.y", mode: "External" },
    ]);
    expect(resoudreChemin("word", "../media/a.png")).toBe("media/a.png");
    expect(resoudreChemin("word", "/word/x.xml")).toBe("word/x.xml");
    expect(cheminRelatif("word", "word/media/a.png")).toBe("media/a.png");
    expect(cheminRelatif("word/sous", "word/media/a.png")).toBe("../media/a.png");
  });
});

describe("nettoyage", () => {
  const p = (t: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${t}</w:t></w:r></w:p>`;
  const sect = '<w:p><w:pPr><w:sectPr><w:pgSz w:w="1"/></w:sectPr></w:pPr></w:p>';
  const blocs = [
    p("Titre du chapitre", "Titre1"),
    p("Sommaire du chapitre", "TitreHorsTDM"),
    p("1.1 Un", "SommaireChapitre"),
    p("Mini-sommaire cliquable", "Consigne"),
    p("Du texte."),
    p("À rédiger : plus tard", "Consigne"),
    p("Références du chapitre (version de relecture)", "TitreHorsTDM"),
    p("Bibliographie locale", "Consigne"),
    p("Instructions d'assemblage", "TitreHorsTDM"),
    p("Saut de section : …", "Consigne"),
    sect,
    p("◆ Insérer ici : x.docx", "Consigne"),
  ];

  it("relecture : seuls les blocs d'assemblage partent ; consignes, mini-sommaires et repères restent", () => {
    const r = nettoyer(blocs, "relecture", NETTOYAGE_PAR_DEFAUT);
    expect(r.retires).toBe(4);
    expect(r.blocs).toEqual([blocs[0], blocs[1], blocs[2], blocs[3], blocs[4], blocs[5], sect, blocs[11]]);
  });

  it("propre : en plus les consignes et le mini-sommaire ; le saut de section et les repères restent", () => {
    const r = nettoyer(blocs, "propre", NETTOYAGE_PAR_DEFAUT);
    expect(r.blocs).toEqual([blocs[0], blocs[4], sect, blocs[11]]);
    expect(r.retires).toBe(8);
  });
});

// ---- Fusion de la trame fournie ----

describe("fusion de la trame fournie (maître à repères + dix parties)", () => {
  const trame = inventorier(lire("Trame_complete_fusionnee.docx"));
  const res = fusionner(parties(), OPT);

  it("assemble aux repères, sans avertissement, avec la structure de la trame produite par script", () => {
    expect(res.rapport.assemblage).toBe("reperes");
    expect(res.rapport.avertissements).toEqual([]);
    expect(res.rapport.sections).toBe(12);
    const inv = inventorier(res.octets);
    expect(inv.plan.filter((t) => t.niveau === 1).map((t) => t.texte)).toEqual(trame.plan.filter((t) => t.niveau === 1).map((t) => t.texte));
    expect(inv.plan.map((t) => t.texte)).toEqual(trame.plan.map((t) => t.texte));
    expect(inv.mots).toBe(trame.mots);
    expect(inv.aRediger).toBe(trame.aRediger);
    expect(inv.consignes).toBe(trame.consignes - 1); // la trame du script ajoute une consigne « Aperçu : document généré… »
    expect(inv.sections).toBe(12);
    // le script d'origine gardait un paragraphe vide après le saut de chaque partie : ici écarté (10 parties)
    expect(trame.paragraphes - inv.paragraphes).toBe(10);
  });

  it("le paquet est cohérent : XML bien formé, relations, types, identifiants uniques", () => {
    expect(verifier(res.octets)).toEqual([]);
    const p = paquet(res.octets);
    // 11 sections portent leurs en-têtes et pieds (2 de chaque) : 11 × 4 = 44 pièces + ... aucune partagée
    const rels = lireRelations(p.get("word/_rels/document.xml.rels")!);
    expect(rels.filter((r) => r.type.endsWith("/header")).length).toBeGreaterThanOrEqual(22);
    expect(rels.filter((r) => r.type.endsWith("/footer")).length).toBeGreaterThanOrEqual(22);
    expect(p.get("docProps/core.xml")).toContain("<dc:title>Thèse L. David</dc:title>");
    expect(p.get("word/settings.xml")).toContain("<w:updateFields");
  });

  it("les en-têtes de chaque chapitre sont repris tels quels", () => {
    const p = paquet(res.octets);
    const titres = [...p.entries()].filter(([n]) => /^word\/header\d+(_f\d+)?\.xml$/.test(n)).map(([, x]) => [...x.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(""));
    for (const t of ["Chapitre 1 – État de l&apos;art", "Chapitre 2 – Cadre théorique"]) expect(titres.some((x) => x.includes(t.slice(0, 12)))).toBe(true);
  });

  it("version propre : plus de consignes ni de mini-sommaires, mêmes titres", () => {
    const propre = fusionner(parties(), { ...OPT, mode: "propre" });
    const inv = inventorier(propre.octets);
    expect(inv.consignes).toBe(0);
    expect(inv.aRediger).toBe(0);
    expect(inv.plan.filter((t) => t.niveau <= 3).map((t) => t.texte).filter((t) => !/^Sommaire/.test(t))).toEqual(trame.plan.map((t) => t.texte).filter((t) => !/^Sommaire/.test(t)));
    expect(verifier(propre.octets)).toEqual([]);
    expect(propre.rapport.sections).toBeLessThanOrEqual(12);
  });

  it("déterministe : mêmes parties, mêmes octets", () => {
    expect(fusionner(parties(), OPT).octets).toEqual(res.octets);
  });

  it("saut « page impaire » pour les chapitres, pas pour les liminaires", () => {
    const odd = paquet(fusionner(parties(), { ...OPT, saut: "oddPage" }).octets).get("word/document.xml")!;
    expect((odd.match(/<w:type w:val="oddPage"\/>/g) ?? []).length).toBeGreaterThanOrEqual(10);
    const front = odd.slice(0, odd.indexOf("</w:sectPr>"));
    expect(front).not.toContain("oddPage");
  });
});

describe("fusion à la suite (sans repères)", () => {
  it("les parties sont mises dans l'ordre, un avertissement par repère sans partie", () => {
    const [, ...chapitres] = parties();
    const r = fusionner(chapitres.slice(0, 3), OPT);
    expect(r.rapport.assemblage).toBe("a-la-suite");
    expect(r.rapport.sections).toBe(3);
    const inv = inventorier(r.octets);
    expect(inv.plan.filter((t) => t.niveau === 1).map((t) => t.texte.slice(0, 12))).toEqual(["Introduction", "Chapitre 1 –", "Chapitre 2 –"]);
    expect(verifier(r.octets)).toEqual([]);
  });

  it("repère vers une partie absente : avertissement et repère retiré ; partie sans repère : ajoutée à la fin", () => {
    const [maitre, intro, ch1] = parties();
    const r = fusionner([maitre!, ch1!, intro!], OPT);
    const msgs = r.rapport.avertissements.map((a) => a.message);
    expect(msgs.some((m) => m.includes("02_Chapitre2_Cadre_theorique.docx") && m.includes("aucune partie"))).toBe(true);
    expect(r.rapport.assemblage).toBe("reperes");
    expect(verifier(r.octets)).toEqual([]);
  });

  it("refuse une liste vide ou un fichier qui n'est pas un .docx", () => {
    expect(() => fusionner([], OPT)).toThrow("Aucune partie");
    expect(() => fusionner([{ id: "a", nom: "A", genre: "chapitre", fichier: "a.docx", octets: strToU8("pas un zip") }], OPT)).toThrow("pas un fichier Word valide");
    expect(() => fusionner([{ id: "a", nom: "A", genre: "chapitre", fichier: "a.docx", octets: zipSync({ "x.txt": strToU8("x") }) }], OPT)).toThrow("word/document.xml");
  });
});

// ---- Documents « enregistrés par Word » : images, notes, commentaires, listes, liens, styles ----

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

interface Options {
  titre: string;
  /** Contenu de la partie (hors images et notes, ajoutés ci-dessous). */
  corps?: string;
  extraNs?: string;
  styles?: string;
  listes?: boolean;
  image?: string;
  notes?: boolean;
  commentaire?: boolean;
  lien?: string;
  zotero?: boolean;
  signet?: number;
}

const octetsImage = (graine: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, graine, graine + 1, graine + 2]);

function docxWord(o: Options): Uint8Array {
  const f: Record<string, Uint8Array | string> = {};
  const ns = `${W} ${o.extraNs ?? ""}`;
  const dessin = o.image
    ? `<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Image 1"/><a:graphic><a:graphicData uri="p"><pic:pic><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    : "";
  const liste = o.listes ? '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>point un</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>point deux</w:t></w:r></w:p>' : "";
  const notes = o.notes ? '<w:p><w:r><w:t>Texte avec note</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:endnoteReference w:id="1"/></w:r></w:p>' : "";
  const commentaire = o.commentaire ? '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Passage commenté</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>' : "";
  const lien = o.lien ? `<w:p><w:hyperlink r:id="rId10"><w:r><w:t>lien</w:t></w:r></w:hyperlink></w:p>` : "";
  const signet = `<w:bookmarkStart w:id="${o.signet ?? 1}" w:name="SIGNET_${o.titre.replace(/\W/g, "")}"/><w:bookmarkEnd w:id="${o.signet ?? 1}"/>`;
  const suivi = '<w:p><w:ins w:id="3" w:author="A" w:date="2026-01-01T00:00:00Z"><w:r><w:t>ajout</w:t></w:r></w:ins></w:p>';
  const corps =
    `<w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>${o.titre}</w:t></w:r></w:p>${signet}${o.corps ?? ""}${dessin}${liste}${notes}${commentaire}${lien}${suivi}` +
    '<w:p><w:pPr><w:sectPr><w:headerReference w:type="default" r:id="rId8"/><w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:p><w:p/>' +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';
  f["word/document.xml"] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${corps}</w:body></w:document>`;
  f["word/styles.xml"] = `<w:styles ${W}><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr></w:pPr></w:style>${o.styles ?? ""}</w:styles>`;
  f["word/numbering.xml"] =
    `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:nsid w:val="AAAAAAAA"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:pStyle w:val="Titre1"/><w:lvlText w:val="%1"/></w:lvl></w:abstractNum>` +
    `<w:abstractNum w:abstractNumId="1"><w:nsid w:val="BBBBBBBB"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum>` +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>';
  f["word/settings.xml"] = `<w:settings ${W}><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="x" w:val="15"/></w:compat></w:settings>`;
  const rels = [
    `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/>`,
    `<Relationship Id="rId3" Type="${REL}/settings" Target="settings.xml"/>`,
    `<Relationship Id="rId8" Type="${REL}/header" Target="header1.xml"/>`,
  ];
  f["word/header1.xml"] = `<w:hdr ${W}><w:p><w:r><w:t>En-tête ${o.titre}</w:t></w:r></w:p>${o.image ? '<w:p><w:r><w:drawing><wp:inline><wp:docPr id="7" name="logo"/><a:graphic><a:graphicData uri="p"><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' : ""}</w:hdr>`;
  if (o.image) {
    f["word/_rels/header1.xml.rels"] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/image" Target="media/logo.png"/></Relationships>`;
    f["word/media/logo.png"] = octetsImage(40);
    rels.push(`<Relationship Id="rId9" Type="${REL}/image" Target="media/image1.png"/>`);
    f["word/media/image1.png"] = octetsImage(o.image === "A" ? 1 : 2);
  }
  if (o.lien) rels.push(`<Relationship Id="rId10" Type="${REL}/hyperlink" Target="${o.lien}" TargetMode="External"/>`);
  let ct = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
  ct += '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>';
  ct += '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>';
  ct += '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>';
  ct += '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>';
  ct += '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>';
  if (o.image) ct += '<Default Extension="png" ContentType="image/png"/>';
  if (o.notes) {
    f["word/footnotes.xml"] = `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:hyperlink r:id="rId1"><w:r><w:t>Note de ${o.titre}</w:t></w:r></w:hyperlink></w:p></w:footnote></w:footnotes>`;
    f["word/_rels/footnotes.xml.rels"] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/hyperlink" Target="https://exemple.fr/${o.titre.replace(/\W/g, "")}" TargetMode="External"/></Relationships>`;
    f["word/endnotes.xml"] = `<w:endnotes ${W}><w:endnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:endnote><w:endnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:endnote><w:endnote w:id="1"><w:p><w:r><w:t>Fin de ${o.titre}</w:t></w:r></w:p></w:endnote></w:endnotes>`;
    rels.push(`<Relationship Id="rId4" Type="${REL}/footnotes" Target="footnotes.xml"/>`, `<Relationship Id="rId5" Type="${REL}/endnotes" Target="endnotes.xml"/>`);
    ct += '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>';
    f["word/settings.xml"] = `<w:settings ${W}><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr><w:compat/></w:settings>`;
  }
  if (o.commentaire) {
    f["word/comments.xml"] = `<w:comments ${W}><w:comment w:id="0" w:author="Sergio" w:date="2026-01-01T00:00:00Z"><w:p><w:r><w:t>Commentaire de ${o.titre}</w:t></w:r></w:p></w:comment></w:comments>`;
    rels.push(`<Relationship Id="rId6" Type="${REL}/comments" Target="comments.xml"/>`);
    ct += '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>';
  }
  f["word/_rels/document.xml.rels"] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`;
  f["_rels/.rels"] = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`;
  f["docProps/core.xml"] = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${o.titre}</dc:title></cp:coreProperties>`;
  if (o.zotero) f["docProps/custom.xml"] = '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="x"><property fmtid="{D5CDD505}" pid="2" name="ZOTERO_PREF_1"><vt:lpwstr>style</vt:lpwstr></property></Properties>';
  f["[Content_Types].xml"] = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct}</Types>`;
  return zipSync(Object.fromEntries(Object.entries(f).map(([n, c]) => [n, typeof c === "string" ? strToU8(c) : c])));
}

const partie = (id: string, o: Options, genre: PartieFusion["genre"] = "chapitre"): PartieFusion => ({ id, nom: id, genre, fichier: `${id}.docx`, octets: docxWord(o) });

describe("fusion de documents riches", () => {
  const A = partie("a", { titre: "Alpha", image: "A", notes: true, commentaire: true, lien: "https://a.example", listes: true, signet: 1, extraNs: 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"' }, "liminaire");
  const B = partie("b", { titre: "Beta", image: "B", notes: true, commentaire: true, lien: "https://a.example", listes: true, signet: 1, zotero: true, extraNs: 'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"' });
  const C = partie("c", { titre: "Gamma", notes: true, signet: 1 });

  const r = fusionner([A, B, C], OPT);
  const p = paquet(r.octets);
  const doc = p.get("word/document.xml")!;

  it("le paquet est cohérent (relations, types, identifiants, notes, commentaires)", () => {
    expect(verifier(r.octets)).toEqual([]);
    expect(r.rapport.assemblage).toBe("a-la-suite");
    expect(r.rapport.sections).toBe(3);
  });

  it("les images sont copiées sous des noms distincts, avec leurs en-têtes et leurs relations", () => {
    const medias = [...p.keys()].filter((n) => n.startsWith("word/media/"));
    expect(medias.length).toBe(4); // image1, logo × A et B
    expect(new Set(medias).size).toBe(4);
    const ids = [...doc.matchAll(/<wp:docPr\b[^>]*?\bid="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const entetes = [...p.keys()].filter((n) => /^word\/header\d+(_f\d+)?\.xml$/.test(n));
    expect(entetes.length).toBe(3);
    expect(doc.match(/<w:headerReference\b/g)?.length).toBe(3);
  });

  it("les notes de bas de page et de fin sont renumérotées et gardent leurs liens", () => {
    expect([...doc.matchAll(/<w:footnoteReference\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    expect([...doc.matchAll(/<w:endnoteReference\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1])).toEqual(["1", "2", "3"]);
    const notes = p.get("word/footnotes.xml")!;
    expect(notes).toContain("Note de Alpha");
    expect(notes).toContain("Note de Beta");
    expect(notes).toContain("Note de Gamma");
    expect(p.get("word/_rels/footnotes.xml.rels")).toContain("https://exemple.fr/Beta");
    expect(p.get("word/endnotes.xml")).toContain("Fin de Gamma");
  });

  it("les commentaires, signets et révisions restent uniques", () => {
    expect([...doc.matchAll(/<w:commentReference\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1])).toEqual(["0", "1"]);
    expect(p.get("word/comments.xml")).toContain("Commentaire de Alpha");
    expect(p.get("word/comments.xml")).toContain("Commentaire de Beta");
    const signets = [...doc.matchAll(/<w:bookmarkStart\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(signets).size).toBe(3);
    const revisions = [...doc.matchAll(/<w:ins\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(revisions).size).toBe(3);
  });

  it("un lien externe identique n'est déclaré qu'une fois", () => {
    const rels = lireRelations(p.get("word/_rels/document.xml.rels")!).filter((x) => x.mode === "External" && x.cible === "https://a.example");
    expect(rels.length).toBe(1);
  });

  it("listes : chaque partie repart de 1, les titres numérotés par le style restent une seule liste", () => {
    const num = p.get("word/numbering.xml")!;
    expect((num.match(/<w:abstractNum\b/g) ?? []).length).toBe(3); // titres + liste de A + liste de B
    const nsid = [...num.matchAll(/<w:nsid w:val="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(nsid).size).toBe(nsid.length);
    const numIds = [...doc.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]);
    expect(new Set(numIds).size).toBe(2); // liste de A, liste de B (Titre1 passe par le style : numId 1)
    expect(p.get("word/styles.xml")!.match(/<w:numId w:val="1"\/>/g)?.length).toBe(1);
  });

  it("espaces de noms ajoutés, préférences Zotero reprises, mise à jour des champs demandée", () => {
    expect(doc.slice(0, doc.indexOf("<w:body>"))).toContain("xmlns:wp14=");
    expect(doc.slice(0, doc.indexOf("<w:body>"))).toContain("xmlns:w14=");
    expect(p.get("docProps/custom.xml")).toContain("ZOTERO_PREF_1");
    expect(r.rapport.avertissements.some((a) => a.message.includes("Zotero"))).toBe(true);
    expect(p.get("word/settings.xml")).toContain("<w:updateFields");
    expect(verifier(r.octets)).toEqual([]);
  });

  it("un style absent du maître est repris, un style qui diffère est signalé (celui du maître est gardé)", () => {
    const maitre = partie("m", { titre: "Maître", styles: '<w:style w:type="paragraph" w:styleId="Encadre"><w:name w:val="Encadré"/><w:pPr><w:jc w:val="left"/></w:pPr></w:style>' }, "liminaire");
    const autre = partie("x", {
      titre: "X",
      corps: '<w:p><w:pPr><w:pStyle w:val="Encadre"/></w:pPr><w:r><w:t>a</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Marge"/></w:pPr><w:r><w:t>b</w:t></w:r></w:p>',
      styles: '<w:style w:type="paragraph" w:styleId="Encadre"><w:name w:val="Encadré"/><w:pPr><w:jc w:val="right"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Marge"><w:name w:val="Marge"/><w:basedOn w:val="Titre1"/></w:style>',
    });
    const s = fusionner([maitre, autre], OPT);
    const msgs = s.rapport.avertissements.map((a) => a.message);
    expect(msgs).toContain("Le style « Encadre » est défini autrement que dans le document maître (celui du maître est gardé).");
    expect(msgs).toContain("Le style « Marge » n'existe pas dans le document maître : repris de cette partie.");
    const styles = paquet(s.octets).get("word/styles.xml")!;
    expect(styles).toContain('<w:jc w:val="left"/>');
    expect(styles).not.toContain('<w:jc w:val="right"/>');
    expect(styles).toContain('w:styleId="Marge"');
    expect(verifier(s.octets)).toEqual([]);
  });

  it("notes et commentaires dans une partie alors que le maître n'en a pas : les pièces sont créées", () => {
    const sans = partie("s", { titre: "Sans" }, "liminaire");
    const avec = partie("w", { titre: "Avec", notes: true, commentaire: true });
    const s = fusionner([sans, avec], OPT);
    const q = paquet(s.octets);
    expect(q.get("word/footnotes.xml")).toContain("Note de Avec");
    expect(q.get("word/footnotes.xml")).toContain('w:type="separator"');
    expect(q.get("word/settings.xml")).toContain("<w:footnotePr>");
    expect(q.get("word/comments.xml")).toContain("Commentaire de Avec");
    expect(verifier(s.octets)).toEqual([]);
  });

  it("deux sections vides de suite : la seconde est écartée ; un dernier saut devient la section du document", () => {
    const x = partie("x", { titre: "X" });
    const s = fusionner([x], OPT);
    const d = paquet(s.octets).get("word/document.xml")!;
    // la partie seule : son saut (avec en-tête) devient la section finale du document, plus de saut en cours de corps
    expect(d.slice(d.indexOf("<w:body>"), d.lastIndexOf("<w:sectPr"))).not.toContain("<w:sectPr");
    expect(d.slice(d.lastIndexOf("<w:sectPr"))).toContain("<w:headerReference");
  });
});
