/**
 * Fusion des parties d'un manuscrit en un seul `.docx` (Office Open XML), sans Word.
 *
 * Comme la procédure manuelle (« Insertion > Objet > Texte d'un fichier »), mais reproductible :
 *  - si le premier document (le maître) contient des repères « ◆ Insérer ici : <fichier>.docx », chaque
 *    partie est insérée à la place de son repère ; sinon les parties sont mises à la suite, dans l'ordre ;
 *  - le nettoyage retire ce qui n'est que consigne d'assemblage (blocs « Instructions d'assemblage »,
 *    « Références du chapitre »…) et, en version propre, les consignes et mini-sommaires ;
 *  - chaque partie garde ses sections (en-têtes, pieds, pagination) ; les sections vides sont écartées ;
 *  - tout ce qui doit rester unique est renuméroté : relations (en-têtes, images, liens), signets, révisions,
 *    commentaires, notes de bas de page et de fin, dessins, listes ; les styles du maître l'emportent et
 *    une divergence est signalée dans le rapport.
 * Les champs (table des matières, listes, Zotero) sont marqués « à mettre à jour » : Word le propose à
 * l'ouverture. Pur : octets en entrée, octets et rapport en sortie.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { decoder } from "./ooxml";
import {
  cheminRelatif,
  cheminRels,
  declarerType,
  decouperCorps,
  dossierDe,
  ecrireRelations,
  idRelationLibre,
  lireRelations,
  lireTypesContenu,
  nomDeChemin,
  REL_TYPE,
  resoudreChemin,
  unirRacines,
  type CorpsDecoupe,
  type Relation,
  type TypesContenu,
} from "./fusionXml";

export interface PartieFusion {
  id: string;
  nom: string;
  genre: "liminaire" | "chapitre" | "bibliographie" | "annexe";
  /** Nom du fichier (pour retrouver le repère « ◆ Insérer ici : <fichier> » du maître). */
  fichier: string;
  octets: Uint8Array;
}

export interface NettoyageFusion {
  /** Blocs retirés dans tous les modes : un titre (début de texte) et les consignes qui le suivent. */
  toujours: string[];
  /** Blocs retirés seulement en version propre. */
  propre: string[];
  /** Styles des consignes (retirées en version propre). */
  consignes: string[];
  /** Styles des mini-sommaires de chapitre (retirés en version propre). */
  miniSommaires: string[];
}

export const NETTOYAGE_PAR_DEFAUT: NettoyageFusion = {
  toujours: ["Procédure de fusion", "Instructions d'assemblage", "Références du chapitre"],
  propre: ["Sommaire du chapitre"],
  consignes: ["Consigne"],
  miniSommaires: ["SommaireChapitre"],
};

export interface OptionsFusion {
  /** « relecture » : consignes et mini-sommaires gardés ; « propre » : retirés. */
  mode: "relecture" | "propre";
  titre: string;
  /** Début des chapitres, annexes et bibliographie : page suivante ou page impaire (recto-verso). */
  saut: "nextPage" | "oddPage";
  nettoyage: NettoyageFusion;
}

export interface Avertissement {
  partie: string;
  message: string;
}

export interface RapportPartie {
  id: string;
  nom: string;
  /** Blocs (paragraphes, tableaux…) repris dans le document. */
  blocs: number;
  /** Blocs retirés par le nettoyage. */
  retires: number;
}

export interface Rapport {
  mode: OptionsFusion["mode"];
  assemblage: "reperes" | "a-la-suite";
  parties: RapportPartie[];
  avertissements: Avertissement[];
  sections: number;
  paragraphes: number;
}

export interface ResultatFusion {
  octets: Uint8Array;
  rapport: Rapport;
}

type Fichiers = Map<string, Uint8Array>;

const CT = {
  footnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml",
  endnotes: "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml",
  comments: "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
  numbering: "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
};

// ---- Outils sur les blocs ----

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
const estParagraphe = (b: string) => /^<w:p(?:[\s>]|\/>)/.test(b);
const porteSection = (b: string) => estParagraphe(b) && b.includes("<w:sectPr");

function texteBloc(b: string): string {
  let t = "";
  for (const m of b.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) t += decoder(m[1]!);
  return t;
}
const styleBloc = (b: string) => (estParagraphe(b) ? (/<w:pStyle\b[^>]*\bw:val="([^"]*)"/.exec(b)?.[1] ?? "") : "");
const REPERE = /^◆\s*Insérer ici\s*:\s*(.+?\.docx)/i;
const repere = (b: string) => (estParagraphe(b) ? (REPERE.exec(texteBloc(b).trim())?.[1]?.trim() ?? null) : null);

function sectDe(b: string): string {
  const i = b.indexOf("<w:sectPr");
  const j = b.lastIndexOf("</w:sectPr>");
  if (i < 0) return "";
  if (j > i) return b.slice(i, j + "</w:sectPr>".length);
  const vide = /<w:sectPr\b[^>]*\/>/.exec(b);
  return vide ? vide[0] : "";
}

function sansSection(b: string): string {
  const s = sectDe(b);
  return s ? b.replace(s, "").replace(/<w:pPr>\s*<\/w:pPr>/, "") : b;
}

/** Vrai si le bloc n'affiche rien (paragraphe vide, signet) : une section qui n'en contient que est vide. */
function estVide(b: string): boolean {
  if (/^<w:bookmark(Start|End)\b/.test(b)) return true;
  if (!estParagraphe(b)) return false;
  if (texteBloc(b).trim()) return false;
  return !/<w:(drawing|pict|object|fldChar|fldSimple|sdt)\b|<w:br\b[^>]*w:type="page"/.test(b);
}

const paragrapheDeSection = (sect: string) => `<w:p><w:pPr>${sect}</w:pPr></w:p>`;

function typeDeSaut(sect: string, saut: string): string {
  if (/<w:type\b[^>]*\/>/.test(sect)) return sect.replace(/<w:type\b[^>]*\/>/, `<w:type w:val="${saut}"/>`);
  return sect.includes("<w:pgSz") ? sect.replace("<w:pgSz", `<w:type w:val="${saut}"/><w:pgSz`) : sect;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).toUpperCase().padStart(8, "0");
}

/** Insère `contenu` juste avant la première occurrence de `balise` (sans interpréter les « $ » du contenu). */
const avant = (xml: string, balise: string | RegExp, contenu: string) => xml.replace(balise, (m) => contenu + m);

const normaliser = (xml: string) => xml.replace(/>\s+</g, "><").trim();

// ---- Nettoyage ----

/** Retire les blocs d'assemblage (toujours) et les consignes / mini-sommaires (version propre). */
export function nettoyer(blocs: readonly string[], mode: OptionsFusion["mode"], n: NettoyageFusion): { blocs: string[]; retires: number } {
  const titres = (mode === "propre" ? [...n.toujours, ...n.propre] : n.toujours).map(sansAccent);
  const consignes = new Set(n.consignes);
  const mini = new Set(n.miniSommaires);
  const textuel = (b: string) => estParagraphe(b) && !porteSection(b) && repere(b) === null;
  const out: string[] = [];
  let retires = 0;
  for (let i = 0; i < blocs.length; i++) {
    const b = blocs[i]!;
    if (textuel(b)) {
      const t = sansAccent(texteBloc(b));
      if (t && titres.some((x) => t.startsWith(x))) {
        retires++;
        while (i + 1 < blocs.length && textuel(blocs[i + 1]!) && (consignes.has(styleBloc(blocs[i + 1]!)) || mini.has(styleBloc(blocs[i + 1]!)))) {
          i++;
          retires++;
        }
        continue;
      }
      if (mode === "propre" && (consignes.has(styleBloc(b)) || mini.has(styleBloc(b)))) {
        retires++;
        continue;
      }
    }
    out.push(b);
  }
  return { blocs: out, retires };
}

// ---- Contexte de fusion ----

interface Source {
  p: PartieFusion;
  k: number;
  f: Fichiers;
  ct: TypesContenu;
  doc: CorpsDecoupe;
}

interface Compteurs {
  signet: number;
  revision: number;
  dessin: number;
  commentaire: number;
  note: number;
  noteFin: number;
  abstrait: number;
  num: number;
}

interface Contexte {
  out: Fichiers;
  ct: string;
  rels: Map<string, Relation[]>;
  cache: Map<string, string>;
  avert: Avertissement[];
  c: Compteurs;
}

const lire = (f: Fichiers, nom: string): string | undefined => (f.has(nom) ? strFromU8(f.get(nom)!) : undefined);
const ecrire = (f: Fichiers, nom: string, xml: string) => void f.set(nom, strToU8(xml));
const maxId = (xml: string, motif: RegExp) => [...xml.matchAll(motif)].reduce((m, x) => Math.max(m, Number(x[1])), -1);

function relationsDe(ctx: Contexte, chemin: string): Relation[] {
  let r = ctx.rels.get(chemin);
  if (!r) {
    r = lireRelations(lire(ctx.out, chemin));
    ctx.rels.set(chemin, r);
  }
  return r;
}

function declarer(ctx: Contexte, chemin: string, type: string, surcharge: boolean) {
  ctx.ct = declarerType(ctx.ct, chemin, type, surcharge);
}

/** Copie un fichier du paquet source dans le paquet de sortie (avec ses relations), sous un nom libre. */
function importerFichier(ctx: Contexte, src: Source, chemin: string): string {
  const cle = `${src.k}|${chemin}`;
  const deja = ctx.cache.get(cle);
  if (deja) return deja;
  const octets = src.f.get(chemin);
  if (!octets) {
    ctx.avert.push({ partie: src.p.nom, message: `Fichier référencé introuvable dans le document : ${chemin}.` });
    ctx.cache.set(cle, chemin);
    return chemin;
  }
  const point = chemin.lastIndexOf(".");
  const racine = chemin.slice(0, point);
  const ext = chemin.slice(point);
  let nouveau = `${racine}_f${src.k}${ext}`;
  for (let i = 2; ctx.out.has(nouveau); i++) nouveau = `${racine}_f${src.k}_${i}${ext}`;
  ctx.cache.set(cle, nouveau);
  ctx.out.set(nouveau, octets);
  const surcharge = src.ct.surcharges.get(`/${chemin}`);
  if (surcharge) declarer(ctx, nouveau, surcharge, true);
  else {
    const defaut = src.ct.defauts.get(ext.slice(1).toLowerCase());
    if (defaut) declarer(ctx, nouveau, defaut, false);
  }
  const relsSource = lireRelations(lire(src.f, cheminRels(chemin)));
  if (relsSource.length) {
    const dossierS = dossierDe(chemin);
    const dossierN = dossierDe(nouveau);
    const relsNouvelles = relsSource.map((r) => {
      if (r.mode === "External") return r;
      return { ...r, cible: cheminRelatif(dossierN, importerFichier(ctx, src, resoudreChemin(dossierS, r.cible))) };
    });
    ctx.out.set(cheminRels(nouveau), strToU8(ecrireRelations(relsNouvelles)));
  }
  return nouveau;
}

/**
 * Fonction qui traduit un identifiant de relation de la source en identifiant de la sortie : la
 * cible est copiée (images, en-têtes, pieds) ou, pour une adresse externe, reprise telle quelle.
 */
function traducteurRelations(ctx: Contexte, src: Source, relsSource: string, relsCible: string, dossier: string): (id: string) => string {
  const sources = new Map(lireRelations(lire(src.f, relsSource)).map((r) => [r.id, r]));
  const faits = new Map<string, string>();
  return (ancien) => {
    const deja = faits.get(ancien);
    if (deja) return deja;
    const r = sources.get(ancien);
    if (!r) return ancien;
    const cible = relationsDe(ctx, relsCible);
    let nouvelle: string;
    const existante = r.mode === "External" ? cible.find((x) => x.type === r.type && x.cible === r.cible && x.mode === r.mode) : undefined;
    if (existante) nouvelle = existante.id;
    else {
      nouvelle = idRelationLibre(cible);
      const nouvelleCible = r.mode === "External" ? r.cible : cheminRelatif(dossier, importerFichier(ctx, src, resoudreChemin(dossier, r.cible)));
      cible.push({ id: nouvelle, type: r.type, cible: nouvelleCible, mode: r.mode });
    }
    faits.set(ancien, nouvelle);
    return nouvelle;
  };
}

// ---- Réécriture des identifiants ----

interface Cartes {
  relation(id: string): string;
  note: Map<string, string>;
  noteFin: Map<string, string>;
  commentaire: Map<string, string>;
  num: Map<string, string>;
  decalageSignet: number;
  decalageRevision: number;
  decalageDessin: number;
}

const REVISIONS = "ins|del|moveFrom|moveTo|moveFromRangeStart|moveToRangeStart|moveFromRangeEnd|moveToRangeEnd|rPrChange|pPrChange|sectPrChange|tblPrChange|trPrChange|tcPrChange|tblGridChange|numberingChange|cellIns|cellDel|cellMerge";

function reecrire(xml: string, c: Cartes): string {
  return xml
    .replace(/\b(r:(?:id|embed|link|pict|dm|lo|qs|cs|href)|o:relid)="([^"]+)"/g, (_, a: string, v: string) => `${a}="${c.relation(v)}"`)
    .replace(/(<w:footnoteReference\b[^>]*?\bw:id=")(-?\d+)"/g, (_, a: string, v: string) => `${a}${c.note.get(v) ?? v}"`)
    .replace(/(<w:endnoteReference\b[^>]*?\bw:id=")(-?\d+)"/g, (_, a: string, v: string) => `${a}${c.noteFin.get(v) ?? v}"`)
    .replace(/(<w:comment(?:RangeStart|RangeEnd|Reference)\b[^>]*?\bw:id=")(\d+)"/g, (_, a: string, v: string) => `${a}${c.commentaire.get(v) ?? v}"`)
    .replace(/(<w:bookmark(?:Start|End)\b[^>]*?\bw:id=")(\d+)"/g, (_, a: string, v: string) => `${a}${Number(v) + c.decalageSignet}"`)
    .replace(new RegExp(`(<w:(?:${REVISIONS})\\b[^>]*?\\bw:id=")(\\d+)"`, "g"), (_, a: string, v: string) => `${a}${Number(v) + c.decalageRevision}"`)
    .replace(/(<wp:docPr\b[^>]*?\bid=")(\d+)"/g, (_, a: string, v: string) => `${a}${Number(v) + c.decalageDessin}"`)
    .replace(/(<w:numId\b[^>]*?\bw:val=")(\d+)"/g, (_, a: string, v: string) => `${a}${c.num.get(v) ?? v}"`);
}

// ---- Styles ----

function stylesDe(xml: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of xml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)) {
    const id = /\bw:styleId="([^"]*)"/.exec(x[0])?.[1];
    if (id) m.set(id, x[0]);
  }
  return m;
}

/** Styles utilisés par la partie : ceux qui manquent au maître sont ajoutés, ceux qui diffèrent sont signalés. */
function fusionnerStyles(ctx: Contexte, src: Source, xmlUtilise: string): string[] {
  const nomBase = "word/styles.xml";
  const base = lire(ctx.out, nomBase);
  const part = lire(src.f, nomBase);
  if (!base || !part) return [];
  const sBase = stylesDe(base);
  const sPart = stylesDe(part);
  const utilises = new Set([...xmlUtilise.matchAll(/<w:(?:pStyle|rStyle|tblStyle)\b[^>]*\bw:val="([^"]*)"/g)].map((m) => m[1]!));
  const ajoutes: string[] = [];
  const ajouter = (id: string) => {
    const x = sPart.get(id);
    if (!x || sBase.has(id)) return;
    sBase.set(id, x);
    ajoutes.push(x);
    for (const dep of x.matchAll(/<w:(?:basedOn|link|next)\b[^>]*\bw:val="([^"]*)"/g)) ajouter(dep[1]!);
  };
  for (const id of utilises) {
    const x = sPart.get(id);
    if (!x) continue;
    if (!sBase.has(id)) {
      ajouter(id);
      ctx.avert.push({ partie: src.p.nom, message: `Le style « ${id} » n'existe pas dans le document maître : repris de cette partie.` });
    } else if (normaliser(sBase.get(id)!) !== normaliser(x)) {
      ctx.avert.push({ partie: src.p.nom, message: `Le style « ${id} » est défini autrement que dans le document maître (celui du maître est gardé).` });
    }
  }
  return ajoutes;
}

// ---- Numérotation (listes) ----

function numerotationDe(xml: string) {
  const abstraits = new Map<string, string>();
  const nums = new Map<string, string>();
  for (const m of xml.matchAll(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g)) abstraits.set(/\bw:abstractNumId="(\d+)"/.exec(m[0])![1]!, m[0]);
  for (const m of xml.matchAll(/<w:num\b[^>]*\bw:numId="(\d+)"[^>]*>[\s\S]*?<\/w:num>/g)) nums.set(m[1]!, m[0]);
  return { abstraits, nums };
}
const signature = (abstrait: string, num: string) =>
  normaliser(abstrait.replace(/\sw:abstractNumId="\d+"/, "").replace(/<w:nsid\b[^>]*\/>/, "").replace(/<w:tmpl\b[^>]*\/>/, "")) + "|" + normaliser((num.match(/<w:lvlOverride\b[\s\S]*?<\/w:lvlOverride>/g) ?? []).join(""));
const abstraitDe = (num: string) => /<w:abstractNumId\b[^>]*\bw:val="(\d+)"/.exec(num)?.[1] ?? "";

/**
 * Listes de la partie : les numéros de liste portés par les styles du maître (titres numérotés) sont
 * partagés quand leur définition est identique, les autres listes sont copiées pour repartir de 1.
 */
function fusionnerNumerotation(ctx: Contexte, src: Source, ids: ReadonlySet<string>): Map<string, string> {
  const carte = new Map<string, string>();
  const utiles = [...ids].filter((i) => i !== "0");
  const part = lire(src.f, "word/numbering.xml");
  if (!utiles.length) return carte;
  if (!part) {
    ctx.avert.push({ partie: src.p.nom, message: "Des listes numérotées sont utilisées mais ce document n'a pas de définition de numérotation." });
    return carte;
  }
  const nomBase = "word/numbering.xml";
  let base = lire(ctx.out, nomBase);
  if (!base) {
    base = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>`;
    relationsDe(ctx, "word/_rels/document.xml.rels").push({ id: idRelationLibre(relationsDe(ctx, "word/_rels/document.xml.rels")), type: REL_TYPE("numbering"), cible: "numbering.xml", mode: "" });
    declarer(ctx, nomBase, CT.numbering, true);
  }
  const sp = numerotationDe(part);
  const lies = new Set([...(lire(ctx.out, "word/styles.xml") ?? "").matchAll(/<w:numId\b[^>]*\bw:val="(\d+)"/g)].map((m) => m[1]!));
  for (const n of utiles) {
    const numXml = sp.nums.get(n);
    const abstrait = sp.abstraits.get(abstraitDe(numXml ?? ""));
    if (!numXml || !abstrait) continue;
    const sig = signature(abstrait, numXml);
    const sb = numerotationDe(base);
    const commun = [...sb.nums.entries()].find(([id, x]) => lies.has(id) && signature(sb.abstraits.get(abstraitDe(x)) ?? "", x) === sig);
    if (commun) {
      carte.set(n, commun[0]);
      continue;
    }
    const nouvelAbstrait = ++ctx.c.abstrait;
    const nouveauNum = ++ctx.c.num;
    const copieAbstrait = abstrait
      .replace(/(\bw:abstractNumId=")\d+"/, `$1${nouvelAbstrait}"`)
      .replace(/(<w:nsid\b[^>]*\bw:val=")[0-9A-Fa-f]+"/, `$1${fnv(`${src.k}:${n}:${nouvelAbstrait}`)}"`);
    const copieNum = numXml.replace(/(\bw:numId=")\d+"/, `$1${nouveauNum}"`).replace(/(<w:abstractNumId\b[^>]*\bw:val=")\d+"/, `$1${nouvelAbstrait}"`);
    const premierNum = base.search(/<w:num\b/);
    base = premierNum >= 0 ? base.slice(0, premierNum) + copieAbstrait + base.slice(premierNum) : avant(base, /<w:numIdMacAtCleanup\b|<\/w:numbering>/, copieAbstrait);
    base = avant(base, /<w:numIdMacAtCleanup\b|<\/w:numbering>/, copieNum);
    carte.set(n, String(nouveauNum));
  }
  ecrire(ctx.out, nomBase, base);
  return carte;
}

// ---- Notes de bas de page, de fin, commentaires ----

const SQUELETTE = (balise: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:${balise} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"></w:${balise}>`;

function dansReglages(ctx: Contexte, fragment: string, cibles: string[]) {
  const nom = "word/settings.xml";
  const x = lire(ctx.out, nom);
  if (!x || x.includes(fragment.slice(0, fragment.indexOf(">") + 1))) return;
  for (const a of cibles) {
    const i = x.indexOf(a);
    if (i >= 0) return ecrire(ctx.out, nom, x.slice(0, i) + fragment + x.slice(i));
  }
  ecrire(ctx.out, nom, avant(x, "</w:settings>", fragment));
}

type TypeNote = "footnote" | "endnote" | "comment";

/** Copie dans la sortie les notes (ou commentaires) référencés par la partie ; renvoie ancien id → nouvel id. */
function fusionnerNotes(ctx: Contexte, src: Source, xmlBlocs: string, genre: TypeNote): Map<string, string> {
  const carte = new Map<string, string>();
  const motif = genre === "comment" ? /<w:commentReference\b[^>]*?\bw:id="(\d+)"/g : new RegExp(`<w:${genre}Reference\\b[^>]*?\\bw:id="(-?\\d+)"`, "g");
  const refs = [...new Set([...xmlBlocs.matchAll(motif)].map((m) => m[1]!))];
  const debut = genre === "comment" ? [...xmlBlocs.matchAll(/<w:commentRangeStart\b[^>]*?\bw:id="(\d+)"/g)].map((m) => m[1]!) : [];
  for (const d of debut) if (!refs.includes(d)) refs.push(d);
  if (!refs.length) return carte;
  const fichier = genre === "comment" ? "word/comments.xml" : `word/${genre}s.xml`;
  const balise = genre === "comment" ? "comments" : `${genre}s`;
  const element = genre === "comment" ? "comment" : genre;
  const part = lire(src.f, fichier);
  if (!part) {
    ctx.avert.push({ partie: src.p.nom, message: `Des ${genre === "comment" ? "commentaires" : "notes"} sont référencés mais « ${fichier} » est absent de ce document.` });
    return carte;
  }
  if (!ctx.out.has(fichier)) {
    ecrire(ctx.out, fichier, SQUELETTE(balise));
    const rels = relationsDe(ctx, "word/_rels/document.xml.rels");
    rels.push({ id: idRelationLibre(rels), type: REL_TYPE(genre === "comment" ? "comments" : `${genre}s`), cible: nomDeChemin(fichier), mode: "" });
    declarer(ctx, fichier, CT[balise as keyof typeof CT], true);
    if (genre !== "comment") {
      const separateurs = [...part.matchAll(new RegExp(`<w:${element}\\b[^>]*\\bw:type="[^"]*"[\\s\\S]*?</w:${element}>`, "g"))].map((m) => m[0]);
      ecrire(ctx.out, fichier, avant(SQUELETTE(balise), `</w:${balise}>`, separateurs.join("")));
      dansReglages(ctx, `<w:${element}Pr><w:${element} w:id="-1"/><w:${element} w:id="0"/></w:${element}Pr>`, genre === "footnote" ? ["<w:endnotePr", "<w:compat"] : ["<w:compat"]);
    }
  }
  const traduire = traducteurRelations(ctx, src, cheminRels(fichier), cheminRels(fichier), "word");
  const elements = new Map<string, string>();
  for (const m of part.matchAll(new RegExp(`<w:${element}\\b[^>]*>[\\s\\S]*?</w:${element}>`, "g"))) {
    const id = /\bw:id="(-?\d+)"/.exec(m[0])?.[1];
    if (id !== undefined && !(genre !== "comment" && /\bw:type="/.test(m[0].slice(0, m[0].indexOf(">"))))) elements.set(id, m[0]);
  }
  let cible = lire(ctx.out, fichier)!;
  for (const id of refs) {
    const x = elements.get(id);
    if (!x) continue;
    const nouveau = String(genre === "comment" ? ++ctx.c.commentaire : genre === "footnote" ? ++ctx.c.note : ++ctx.c.noteFin);
    carte.set(id, nouveau);
    const corrige = x
      .replace(/(\bw:id=")-?\d+"/, `$1${nouveau}"`)
      .replace(/\b(r:(?:id|embed|link|pict))="([^"]+)"/g, (_, a: string, v: string) => `${a}="${traduire(v)}"`);
    cible = avant(cible, `</w:${balise}>`, corrige);
  }
  ecrire(ctx.out, fichier, cible);
  if (genre === "comment" && (src.f.has("word/commentsExtended.xml") || src.f.has("word/commentsIds.xml"))) {
    ctx.avert.push({ partie: src.p.nom, message: "L'état « résolu » des commentaires n'est pas repris dans le document fusionné (les commentaires le sont)." });
  }
  return carte;
}

// ---- Propriétés Zotero (préférences du document) ----

function fusionnerZotero(ctx: Contexte, sources: readonly Source[]) {
  const nom = "docProps/custom.xml";
  const base = lire(ctx.out, nom);
  if (base?.includes("ZOTERO_PREF")) return;
  for (const s of sources.slice(1)) {
    const x = lire(s.f, nom);
    const props = x ? [...x.matchAll(/<property\b[^>]*\bname="ZOTERO_PREF[^"]*"[^>]*>[\s\S]*?<\/property>/g)].map((m) => m[0]) : [];
    if (!props.length) continue;
    const squelette = base ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"></Properties>`;
    let pid = Math.max(1, ...[...squelette.matchAll(/\bpid="(\d+)"/g)].map((m) => Number(m[1]) + 1));
    const copies = props.map((p) => p.replace(/\bpid="\d+"/, `pid="${pid++}"`)).join("");
    ecrire(ctx.out, nom, avant(squelette, "</Properties>", copies));
    if (!base) {
      const rels = relationsDe(ctx, "_rels/.rels");
      rels.push({ id: idRelationLibre(rels), type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties", cible: nom, mode: "" });
      declarer(ctx, nom, "application/vnd.openxmlformats-officedocument.custom-properties+xml", true);
    }
    ctx.avert.push({ partie: s.p.nom, message: "Les préférences Zotero du document (style de citation) ont été reprises de cette partie : le maître n'en avait pas." });
    return;
  }
}

// ---- Fusion ----

interface Preparee {
  p: PartieFusion;
  blocs: string[];
  sect: string | null;
  retires: number;
}

export function fusionner(parties: readonly PartieFusion[], options: OptionsFusion): ResultatFusion {
  if (!parties.length) throw new Error("Aucune partie à fusionner.");
  const sources: Source[] = parties.map((p, k) => {
    let f: Fichiers;
    try {
      f = new Map(Object.entries(unzipSync(p.octets)));
    } catch (e) {
      throw new Error(`« ${p.nom} » n'est pas un fichier Word valide : ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
    const xml = lire(f, "word/document.xml");
    if (!xml) throw new Error(`« ${p.nom} » n'est pas un document Word (.docx) : word/document.xml est absent.`);
    return { p, k, f, ct: lireTypesContenu(lire(f, "[Content_Types].xml") ?? ""), doc: decouperCorps(xml) };
  });
  const base = sources[0]!;
  const ctx: Contexte = {
    out: new Map(base.f),
    ct: lire(base.f, "[Content_Types].xml") ?? "",
    rels: new Map(),
    cache: new Map(),
    avert: [],
    c: { signet: 0, revision: 0, dessin: 0, commentaire: 0, note: 0, noteFin: 0, abstrait: 0, num: 0 },
  };
  const xmlBase = base.doc.blocs.join("") + (base.doc.sectFinal ?? "");
  const texteNotes = (n: string) => lire(base.f, n) ?? "";
  const bornes = {
    signet: maxId(xmlBase, /<w:bookmarkStart\b[^>]*?\bw:id="(\d+)"/g),
    revision: maxId(xmlBase, new RegExp(`<w:(?:${REVISIONS})\\b[^>]*?\\bw:id="(\\d+)"`, "g")),
    dessin: maxId(xmlBase, /<wp:docPr\b[^>]*?\bid="(\d+)"/g),
  };
  ctx.c.commentaire = Math.max(-1, maxId(texteNotes("word/comments.xml"), /<w:comment\b[^>]*?\bw:id="(\d+)"/g));
  ctx.c.note = Math.max(0, maxId(texteNotes("word/footnotes.xml"), /<w:footnote\b[^>]*?\bw:id="(\d+)"/g));
  ctx.c.noteFin = Math.max(0, maxId(texteNotes("word/endnotes.xml"), /<w:endnote\b[^>]*?\bw:id="(\d+)"/g));
  const nb = numerotationDe(texteNotes("word/numbering.xml"));
  ctx.c.abstrait = Math.max(-1, ...[...nb.abstraits.keys()].map(Number));
  ctx.c.num = Math.max(0, ...[...nb.nums.keys()].map(Number));
  let avantBase = base.doc.avant;

  // 1. Chaque partie : nettoyage, puis réécriture des identifiants pour qu'ils restent uniques.
  const preparees = new Map<string, Preparee>();
  for (const src of sources) {
    const { blocs: propres, retires } = nettoyer(src.doc.blocs, options.mode, options.nettoyage);
    let blocs = propres;
    let sect = src.doc.sectFinal;
    if (src.k > 0) {
      const xml = blocs.join("") + (sect ?? "");
      const u = unirRacines(avantBase, src.doc.avant);
      avantBase = u.avant;
      for (const p of u.conflits) ctx.avert.push({ partie: src.p.nom, message: `L'espace de noms « ${p} » est déclaré avec une autre adresse que dans le maître.` });
      const ajoutes = fusionnerStyles(ctx, src, xml);
      const idsNum = new Set([...(xml + ajoutes.join("")).matchAll(/<w:numId\b[^>]*\bw:val="(\d+)"/g)].map((m) => m[1]!));
      const num = fusionnerNumerotation(ctx, src, idsNum);
      if (ajoutes.length) {
        const styles = lire(ctx.out, "word/styles.xml")!;
        ecrire(ctx.out, "word/styles.xml", avant(styles, "</w:styles>", ajoutes.map((x) => x.replace(/(<w:numId\b[^>]*\bw:val=")(\d+)"/g, (_, a: string, v: string) => `${a}${num.get(v) ?? v}"`)).join("")));
      }
      const cartes: Cartes = {
        relation: traducteurRelations(ctx, src, "word/_rels/document.xml.rels", "word/_rels/document.xml.rels", "word"),
        note: fusionnerNotes(ctx, src, xml, "footnote"),
        noteFin: fusionnerNotes(ctx, src, xml, "endnote"),
        commentaire: fusionnerNotes(ctx, src, xml, "comment"),
        num,
        decalageSignet: bornes.signet + 1,
        decalageRevision: bornes.revision + 1,
        decalageDessin: bornes.dessin + 1,
      };
      blocs = blocs.map((b) => reecrire(b, cartes));
      sect = sect === null ? null : reecrire(sect, cartes);
      const apres = blocs.join("") + (sect ?? "");
      bornes.signet = Math.max(bornes.signet, maxId(apres, /<w:bookmarkStart\b[^>]*?\bw:id="(\d+)"/g));
      bornes.revision = Math.max(bornes.revision, maxId(apres, new RegExp(`<w:(?:${REVISIONS})\\b[^>]*?\\bw:id="(\\d+)"`, "g")));
      bornes.dessin = Math.max(bornes.dessin, maxId(apres, /<wp:docPr\b[^>]*?\bid="(\d+)"/g));
    }
    // Les paragraphes vides qui suivent le dernier saut de section appartiennent à une section sans contenu : écartés.
    const dernierSaut = blocs.map(porteSection).lastIndexOf(true);
    if (dernierSaut >= 0 && blocs.slice(dernierSaut + 1).every(estVide)) blocs = blocs.slice(0, dernierSaut + 1);
    if (src.p.genre !== "liminaire") {
      blocs = blocs.map((b) => (porteSection(b) ? b.replace(sectDe(b), typeDeSaut(sectDe(b), options.saut)) : b));
      if (sect) sect = typeDeSaut(sect, options.saut);
    }
    preparees.set(src.p.id, { p: src.p, blocs, sect, retires });
  }

  // 2. Assemblage : repères du maître, sinon à la suite.
  const parFichier = new Map(sources.slice(1).map((s) => [s.p.fichier.toLowerCase(), s.p.id]));
  const maitre = preparees.get(base.p.id)!;
  const reperes = maitre.blocs.map(repere).filter((r): r is string => r !== null);
  const utilisees = new Set<string>([base.p.id]);
  const flux: string[] = [];
  const avertir = (partie: string, message: string) => ctx.avert.push({ partie, message });

  const ouverte = () => {
    for (let i = flux.length - 1; i >= 0; i--) {
      if (porteSection(flux[i]!)) return false;
      if (!estVide(flux[i]!)) return true;
    }
    return false;
  };
  let derniereSect: string | null = null;
  const emettre = (p: Preparee, profondeur: number) => {
    if (profondeur > 8) return avertir(p.p.nom, "Repères imbriqués trop profondément : ignorés.");
    for (const b of p.blocs) {
      const r = repere(b);
      if (r === null) {
        flux.push(b);
        continue;
      }
      const id = parFichier.get(r.toLowerCase());
      if (!id) {
        avertir(p.p.nom, `Le repère « ${r} » ne correspond à aucune partie du plan : retiré.`);
        continue;
      }
      if (utilisees.has(id)) {
        avertir(p.p.nom, `La partie « ${preparees.get(id)!.p.nom} » est déjà insérée : le repère « ${r} » est ignoré.`);
        continue;
      }
      utilisees.add(id);
      if (ouverte() && p.sect) flux.push(paragrapheDeSection(p.sect));
      emettre(preparees.get(id)!, profondeur + 1);
    }
    if (ouverte() && p.sect) flux.push(paragrapheDeSection(p.sect));
    if (p.sect) derniereSect = p.sect;
  };
  const assemblage = reperes.length ? "reperes" : "a-la-suite";
  emettre(maitre, 0);
  for (const s of sources.slice(1)) {
    if (utilisees.has(s.p.id)) continue;
    if (reperes.length) avertir(s.p.nom, "Aucun repère « ◆ Insérer ici » ne désigne cette partie dans le document maître : elle est ajoutée à la fin.");
    utilisees.add(s.p.id);
    emettre(preparees.get(s.p.id)!, 0);
  }

  // 3. Sections : écarter les sections vides, le dernier saut devient la section finale du document.
  const propre: string[] = [];
  let contenu = false;
  for (const b of flux) {
    if (porteSection(b)) {
      if (!contenu && estVide(sansSection(b))) continue;
      propre.push(b);
      contenu = false;
    } else {
      propre.push(b);
      if (!estVide(b)) contenu = true;
    }
  }
  let sectFinal: string | null = derniereSect ?? base.doc.sectFinal;
  const dernier = propre[propre.length - 1];
  if (dernier !== undefined && porteSection(dernier)) {
    sectFinal = sectDe(dernier);
    if (estVide(sansSection(dernier))) propre.pop();
    else propre[propre.length - 1] = sansSection(dernier);
  }

  // 4. Document.xml, paquet et rapport.
  const corps = propre.join("");
  ecrire(ctx.out, "word/document.xml", `${avantBase}${corps}${sectFinal ?? ""}${base.doc.apres}`);
  for (const [chemin, rels] of ctx.rels) if (rels.length || ctx.out.has(chemin)) ecrire(ctx.out, chemin, ecrireRelations(rels));
  fusionnerZotero(ctx, sources);
  const reglages = lire(ctx.out, "word/settings.xml");
  if (reglages && !/<w:updateFields\b/.test(reglages)) {
    const cibles = ["<w:hdrShapeDefaults", "<w:footnotePr", "<w:endnotePr", "<w:compat"];
    const i = cibles.map((c) => reglages.indexOf(c)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
    ecrire(ctx.out, "word/settings.xml", i === undefined ? avant(reglages, "</w:settings>", '<w:updateFields w:val="true"/>') : `${reglages.slice(0, i)}<w:updateFields w:val="true"/>${reglages.slice(i)}`);
  }
  const noyau = lire(ctx.out, "docProps/core.xml");
  if (noyau && options.titre) ecrire(ctx.out, "docProps/core.xml", noyau.replace(/(<dc:title>)[^<]*(<\/dc:title>)/, (_, a: string, b: string) => `${a}${options.titre.replace(/&/g, "&amp;").replace(/</g, "&lt;")}${b}`));
  ecrire(ctx.out, "[Content_Types].xml", ctx.ct);

  const entrees: Record<string, Uint8Array> = {};
  const noms = [...ctx.out.keys()].sort((a, b) => (a === "[Content_Types].xml" ? -1 : b === "[Content_Types].xml" ? 1 : a === "_rels/.rels" ? -1 : b === "_rels/.rels" ? 1 : a < b ? -1 : a > b ? 1 : 0));
  for (const n of noms) entrees[n] = ctx.out.get(n)!;
  const octets = zipSync(entrees, { level: 6, mtime: new Date(2020, 0, 1, 12, 0, 0) });

  const finale = `${corps}${sectFinal ?? ""}`;
  const signets = [...finale.matchAll(/<w:bookmarkStart\b[^>]*?\bw:name="([^"]*)"/g)].map((m) => m[1]!);
  const vus = new Set<string>();
  for (const n of signets) {
    if (n !== "_GoBack" && vus.has(n)) avertir("(document)", `Le signet « ${n} » existe en double : un renvoi vers lui peut viser le mauvais endroit.`);
    vus.add(n);
  }
  return {
    octets,
    rapport: {
      mode: options.mode,
      assemblage,
      parties: sources.map((s) => ({ id: s.p.id, nom: s.p.nom, blocs: preparees.get(s.p.id)!.blocs.length, retires: preparees.get(s.p.id)!.retires })),
      avertissements: ctx.avert,
      sections: (finale.match(/<w:sectPr\b/g) ?? []).length,
      paragraphes: (corps.match(/<w:p[\s>]/g) ?? []).length,
    },
  };
}
