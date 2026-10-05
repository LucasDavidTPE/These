/**
 * Lecture d'un `.docx` (Office Open XML), sans Word et sans DOM : le `.docx` est un zip
 * (fflate, déjà utilisé pour les `.pptx`) et son XML est parcouru par un petit analyseur à
 * balises, assez pour les paragraphes, styles, commentaires et modifications suivies.
 * Pur et testé sous Linux.
 */
import { strFromU8, unzipSync } from "fflate";

/** Pièces d'un `.docx` utiles à la lecture, décompressées (les images ne sont que comptées). */
export interface Paquet {
  fichiers: Record<string, string>;
  /** Noms des images (`word/media/…`). */
  medias: string[];
}

const UTILES = /^(word\/(document|styles|comments|commentsExtended|footnotes|endnotes|numbering)\.xml|docProps\/core\.xml)$/;

export function ouvrirDocx(octets: Uint8Array): Paquet {
  const medias: string[] = [];
  const brut = unzipSync(octets, {
    filter: (f) => {
      if (f.name.startsWith("word/media/") && !f.name.endsWith("/")) medias.push(f.name);
      return UTILES.test(f.name);
    },
  });
  const fichiers: Record<string, string> = {};
  for (const [nom, contenu] of Object.entries(brut)) fichiers[nom] = strFromU8(contenu);
  if (!fichiers["word/document.xml"]) throw new Error("Ce fichier n'est pas un document Word (.docx) : word/document.xml est absent.");
  return { fichiers, medias };
}

// ---- XML ----

export type Evenement =
  | { type: "ouvre"; nom: string; attrs: string; vide: boolean }
  | { type: "ferme"; nom: string }
  | { type: "texte"; texte: string };

const JETON = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s[^>]*?)?)(\/?)>|([^<]+)/g;

export function decoder(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e]!;
  });
}

/** Parcourt le XML ; `rappel` reçoit chaque balise ouvrante (vide ou non), fermante, et chaque texte. */
export function parcourir(xml: string, rappel: (e: Evenement) => void): void {
  JETON.lastIndex = 0;
  for (let m = JETON.exec(xml); m; m = JETON.exec(xml)) {
    if (m[1] !== undefined) rappel({ type: "texte", texte: m[1] });
    else if (m[3] !== undefined) {
      if (m[2]) rappel({ type: "ferme", nom: m[3] });
      else {
        rappel({ type: "ouvre", nom: m[3], attrs: m[4] ?? "", vide: m[5] === "/" });
        if (m[5] === "/") rappel({ type: "ferme", nom: m[3] });
      }
    } else if (m[6] !== undefined) rappel({ type: "texte", texte: decoder(m[6]) });
  }
}

/** Valeur d'un attribut (`w:val`, `w:author`…) dans la chaîne d'attributs d'une balise. */
export function attr(attrs: string, nom: string): string {
  const m = new RegExp(`(?:^|\\s)${nom.replace(":", "\\:")}="([^"]*)"`).exec(attrs);
  return m ? decoder(m[1]!) : "";
}

// ---- Styles ----

export interface Styles {
  /** Identifiant de style → nom (« Heading1 » → « heading 1 »). */
  noms: Map<string, string>;
}

export function lireStyles(xml: string | undefined): Styles {
  const noms = new Map<string, string>();
  if (!xml) return { noms };
  let courant = "";
  parcourir(xml, (e) => {
    if (e.type !== "ouvre") return;
    if (e.nom === "w:style") courant = attr(e.attrs, "w:styleId");
    else if (e.nom === "w:name" && courant) noms.set(courant, attr(e.attrs, "w:val"));
  });
  return { noms };
}

/** Niveau de titre (1 à 9) d'un style : d'après son nom (« heading 1 », « titre 2 »), à défaut son identifiant. */
export function niveauTitre(id: string, styles: Styles): number {
  const nom = styles.noms.get(id) ?? "";
  const m = /^(?:heading|titre) ([1-9])$/i.exec(nom) ?? /^(?:Heading|Titre)([1-9])$/.exec(id);
  return m ? Number(m[1]) : 0;
}

// ---- Document ----

export interface Paragraphe {
  /** Identifiant du style, « » si aucun. */
  style: string;
  /** Texte visible (les suppressions suivies n'y sont pas). */
  texte: string;
  signets: string[];
  /** Instructions de champ (`TOC \\h`, `ZOTERO_ITEM …`). */
  champs: string[];
  /** Commentaires ancrés dans ce paragraphe. */
  commentaires: string[];
  tableau: boolean;
  dessin: boolean;
  /** Fin de section (porte un `w:sectPr`). */
  section: boolean;
}

export interface Modification {
  genre: "insertion" | "suppression";
  auteur: string;
  date: string;
  texte: string;
  /** Titre (Heading) sous lequel se trouve la modification. */
  titre: string;
}

export interface Document {
  paragraphes: Paragraphe[];
  modifications: Modification[];
  /** Nombre de `w:sectPr` (sections). */
  sections: number;
  tableaux: number;
  dessins: number;
}

/**
 * Parcourt `word/document.xml`. Les paragraphes imbriqués (zones de texte) sont lus à part ; le
 * contenu de repli (`mc:Fallback`) est ignoré pour ne pas compter deux fois une zone de texte.
 */
export function lireDocument(xml: string, styles: Styles): Document {
  const doc: Document = { paragraphes: [], modifications: [], sections: 0, tableaux: 0, dessins: 0 };
  const pile: Paragraphe[] = [];
  const nouveau = (): Paragraphe => ({ style: "", texte: "", signets: [], champs: [], commentaires: [], tableau: false, dessin: false, section: false });
  let repli = 0;
  let tableau = 0;
  let champ: { instr: string; dans: boolean } | null = null;
  let suivi: { genre: Modification["genre"]; auteur: string; date: string; texte: string; profondeur: number } | null = null;
  let titre = "";
  let enTexte = "";
  let lit: "t" | "del" | "instr" | null = null;
  const profondeurs: string[] = [];

  parcourir(xml, (e) => {
    if (e.type === "ouvre") profondeurs.push(e.nom);
    else if (e.type === "ferme") profondeurs.pop();
    if (e.type === "ouvre" && e.nom === "mc:Fallback" && !e.vide) repli++;
    if (e.type === "ferme" && e.nom === "mc:Fallback") repli--;
    if (repli > 0) return;
    const p = pile[pile.length - 1];

    if (e.type === "ouvre") {
      switch (e.nom) {
        case "w:p":
          pile.push(nouveau());
          break;
        case "w:tbl":
          if (tableau++ === 0) doc.tableaux++;
          break;
        case "w:pStyle":
          if (p) p.style = attr(e.attrs, "w:val");
          break;
        case "w:bookmarkStart": {
          const n = attr(e.attrs, "w:name");
          if (p && n && n !== "_GoBack") p.signets.push(n);
          break;
        }
        case "w:commentRangeStart":
          if (p) p.commentaires.push(attr(e.attrs, "w:id"));
          break;
        case "w:drawing":
        case "w:pict":
          if (p) p.dessin = true;
          doc.dessins++;
          break;
        case "w:sectPr":
          doc.sections++;
          if (p) p.section = true;
          break;
        case "w:fldChar": {
          const t = attr(e.attrs, "w:fldCharType");
          if (t === "begin") champ = { instr: "", dans: true };
          else if (t === "separate" || t === "end") {
            if (champ && champ.instr && p) p.champs.push(champ.instr.trim());
            champ = null;
          }
          break;
        }
        case "w:ins":
        case "w:moveTo":
        case "w:del":
        case "w:moveFrom":
          if (!suivi && !e.vide) suivi = { genre: e.nom === "w:ins" || e.nom === "w:moveTo" ? "insertion" : "suppression", auteur: attr(e.attrs, "w:author"), date: attr(e.attrs, "w:date"), texte: "", profondeur: profondeurs.length };
          break;
        case "w:t":
          if (!e.vide) lit = "t";
          break;
        case "w:delText":
          if (!e.vide) lit = "del";
          break;
        case "w:instrText":
          if (!e.vide) lit = "instr";
          break;
        case "w:tab":
          if (p && !suivi && !attr(e.attrs, "w:pos")) p.texte += "\t";
          break;
        case "w:br":
          break;
      }
      enTexte = "";
    } else if (e.type === "texte") {
      if (lit === "t") enTexte += e.texte;
      else if (lit === "del") enTexte += e.texte;
      else if (lit === "instr") enTexte += e.texte;
    } else {
      switch (e.nom) {
        case "w:t":
        case "w:delText":
        case "w:instrText":
          if (p) {
            if (lit === "instr") {
              if (champ) champ.instr += enTexte;
              else p.champs.push(enTexte.trim());
            } else if (suivi) suivi.texte += enTexte;
            if (lit === "t" && !(suivi && suivi.genre === "suppression")) p.texte += enTexte;
          }
          lit = null;
          enTexte = "";
          break;
        case "w:tbl":
          tableau--;
          break;
        case "w:ins":
        case "w:moveTo":
        case "w:del":
        case "w:moveFrom":
          if (suivi && profondeurs.length + 1 === suivi.profondeur) {
            if (suivi.texte.trim()) doc.modifications.push({ genre: suivi.genre, auteur: suivi.auteur, date: suivi.date, texte: suivi.texte, titre });
            suivi = null;
          }
          break;
        case "w:p": {
          const fini = pile.pop();
          if (fini) {
            if (tableau > 0) fini.tableau = true;
            doc.paragraphes.push(fini);
            if (niveauTitre(fini.style, styles) > 0 && fini.texte.trim()) titre = fini.texte.trim();
          }
          break;
        }
      }
    }
  });
  return doc;
}

// ---- Commentaires, notes, propriétés ----

export interface Commentaire {
  id: string;
  auteur: string;
  date: string;
  texte: string;
  /** Résolu dans Word (commentsExtended). */
  resolu: boolean;
  /** Début du texte commenté (paragraphe où le commentaire est ancré). */
  ancre: string;
  /** Titre sous lequel il se trouve. */
  titre: string;
}

export function lireCommentaires(paquet: Paquet, doc: Document, styles: Styles): Commentaire[] {
  const xml = paquet.fichiers["word/comments.xml"];
  if (!xml) return [];
  const resolus = new Set<string>();
  const ext = paquet.fichiers["word/commentsExtended.xml"];
  if (ext) parcourir(ext, (e) => e.type === "ouvre" && e.nom === "w15:commentEx" && attr(e.attrs, "w15:done") === "1" && resolus.add(attr(e.attrs, "w15:paraId")));
  const bruts: { id: string; auteur: string; date: string; texte: string; paraId: string }[] = [];
  let c: { id: string; auteur: string; date: string; paras: string[]; paraId: string } | null = null;
  let para = "";
  let lit = false;
  parcourir(xml, (e) => {
    if (e.type === "ouvre") {
      if (e.nom === "w:comment") c = { id: attr(e.attrs, "w:id"), auteur: attr(e.attrs, "w:author"), date: attr(e.attrs, "w:date"), paras: [], paraId: "" };
      else if (e.nom === "w:p" && c) {
        para = "";
        c.paraId = attr(e.attrs, "w14:paraId");
      } else if (e.nom === "w:t") lit = true;
    } else if (e.type === "texte") {
      if (lit) para += e.texte;
    } else if (e.nom === "w:t") lit = false;
    else if (e.nom === "w:p" && c) c.paras.push(para);
    else if (e.nom === "w:comment" && c) {
      bruts.push({ id: c.id, auteur: c.auteur, date: c.date, texte: c.paras.join("\n").trim(), paraId: c.paraId });
      c = null;
    }
  });
  let titre = "";
  const ancres = new Map<string, { ancre: string; titre: string }>();
  for (const p of doc.paragraphes) {
    if (niveauTitre(p.style, styles) > 0 && p.texte.trim()) titre = p.texte.trim();
    for (const id of p.commentaires) if (!ancres.has(id)) ancres.set(id, { ancre: p.texte.trim().slice(0, 160), titre });
  }
  return bruts
    .filter((b) => b.texte !== "" || ancres.has(b.id))
    .map((b) => ({ id: b.id, auteur: b.auteur, date: b.date, texte: b.texte, resolu: resolus.has(b.paraId), ancre: ancres.get(b.id)?.ancre ?? "", titre: ancres.get(b.id)?.titre ?? "" }));
}

/** Nombre de notes de bas de page ou de fin (hors séparateurs). */
export function compterNotes(paquet: Paquet): number {
  let n = 0;
  for (const [nom, balise] of [["word/footnotes.xml", "w:footnote"], ["word/endnotes.xml", "w:endnote"]] as const) {
    const xml = paquet.fichiers[nom];
    if (xml) parcourir(xml, (e) => e.type === "ouvre" && e.nom === balise && !attr(e.attrs, "w:type") && n++ >= 0);
  }
  return n;
}

export interface Proprietes {
  titre: string;
  auteur: string;
  modifiePar: string;
  modifie: string;
}

export function lireProprietes(paquet: Paquet): Proprietes {
  const xml = paquet.fichiers["docProps/core.xml"] ?? "";
  const val = (balise: string) => {
    const m = new RegExp(`<${balise}[^>]*>([^<]*)</${balise}>`).exec(xml);
    return m ? decoder(m[1]!) : "";
  };
  return { titre: val("dc:title"), auteur: val("dc:creator"), modifiePar: val("cp:lastModifiedBy"), modifie: val("dcterms:modified") };
}
