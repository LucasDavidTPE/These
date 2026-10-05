/**
 * Corrections reçues (relectures de directeurs, de collègues) : un fichier `.docx` (commentaires,
 * modifications suivies) ou un PDF annoté, copié dans l'espace avec ses remarques extraites.
 *
 *   manuscrits/<manuscrit>/retours/<id>/retour.json    qui, quand, pour quelle partie, les remarques et leur état
 *   manuscrits/<manuscrit>/retours/<id>/<fichier reçu> la copie, sous son nom d'origine
 *
 * Un retour est un objet à part : ce n'est pas une version de la partie, c'est ce qu'on a reçu d'un
 * relecteur. Les remarques portent l'état de leur traitement, partagé entre les deux PC.
 */
import { jsonStable } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import { lireCommentaires, lireDocument, lireNumerotation, lireStyles, niveauTitre, numeroter, ouvrirDocx } from "./ooxml";
import { dossierProjet } from "./plan";

export const FICHIER_RETOUR = "retour.json";
export const dossierRetours = (projet: string) => `${dossierProjet(projet)}/retours`;
export const dossierRetour = (projet: string, id: string) => `${dossierRetours(projet)}/${id}`;

export const ETATS_REMARQUE = [
  ["a-traiter", "À traiter"],
  ["traitee", "Traitée"],
  ["refusee", "Refusée"],
] as const;
export type EtatRemarque = (typeof ETATS_REMARQUE)[number][0];

export type GenreRemarque = "commentaire" | "insertion" | "suppression" | "modification" | "surlignage" | "souligne" | "barre";

export const LIBELLE_GENRE: Record<GenreRemarque, string> = {
  commentaire: "Commentaire",
  insertion: "Ajout",
  suppression: "Suppression",
  modification: "Remplacement",
  surlignage: "Surlignage",
  souligne: "Souligné",
  barre: "Barré",
};

export interface Remarque {
  /** Identifiant dans le retour : `c3` (commentaire Word), `m2` (modification suivie), `p4-1` (annotation PDF, page 4). */
  id: string;
  genre: GenreRemarque;
  auteur: string;
  /** ISO 8601, « » si inconnue. */
  date: string;
  /** Le commentaire, ou le texte ajouté / supprimé. */
  texte: string;
  /** Passage concerné : texte du paragraphe commenté, ou texte couvert par le surlignage. */
  ancre: string;
  /** Titre sous lequel se trouve la remarque (« 1.2 Modèles rhéologiques »), « » pour un PDF. */
  titre: string;
  /** Page (PDF), null pour un `.docx`. */
  page: number | null;
  etat: EtatRemarque;
  /** Note de traitement (« reformulé », « refusé : voir chap. 3 »). */
  note: string;
}

export interface Retour {
  id: string;
  /** Partie du manuscrit concernée ; null = le manuscrit entier ou inconnue. */
  partie: string | null;
  /** Qui a envoyé les corrections. */
  de: string;
  /** Date de réception, « AAAA-MM-JJ ». */
  recu: string;
  note: string;
  /** Nom du fichier copié dans le dossier du retour. */
  fichier: string;
  type: "docx" | "pdf";
  taille: number;
  empreinte: string;
  /** Version de la partie sur laquelle portent les corrections (nom de fichier de la version), « » si inconnue. */
  base: string;
  /** Ajouté dans l'appli (ISO) et depuis quel poste. */
  ajoute: string;
  poste: string;
  remarques: Remarque[];
}

const txt = (v: unknown) => (typeof v === "string" ? v : "");
const ETATS = ETATS_REMARQUE.map((e) => e[0]) as string[];
const GENRES = Object.keys(LIBELLE_GENRE);

/** Lecture tolérante d'un `retour.json` ; null si ce n'en est pas un. */
export function lireRetour(brut: unknown): Retour | null {
  if (typeof brut !== "object" || brut === null) return null;
  const b = brut as Record<string, unknown>;
  const id = txt(b.id);
  const fichier = txt(b.fichier);
  if (!id || !fichier) return null;
  const remarques: Remarque[] = [];
  for (const r of Array.isArray(b.remarques) ? b.remarques : []) {
    const o = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    if (!txt(o.id)) continue;
    remarques.push({
      id: txt(o.id),
      genre: GENRES.includes(txt(o.genre)) ? (txt(o.genre) as GenreRemarque) : "commentaire",
      auteur: txt(o.auteur),
      date: txt(o.date),
      texte: txt(o.texte),
      ancre: txt(o.ancre),
      titre: txt(o.titre),
      page: typeof o.page === "number" ? o.page : null,
      etat: ETATS.includes(txt(o.etat)) ? (txt(o.etat) as EtatRemarque) : "a-traiter",
      note: txt(o.note),
    });
  }
  return {
    id,
    partie: txt(b.partie) || null,
    de: txt(b.de),
    recu: txt(b.recu),
    note: txt(b.note),
    fichier,
    type: b.type === "pdf" ? "pdf" : "docx",
    taille: typeof b.taille === "number" ? b.taille : 0,
    empreinte: txt(b.empreinte),
    base: txt(b.base),
    ajoute: txt(b.ajoute),
    poste: txt(b.poste),
    remarques,
  };
}

export const ecrireRetour = (r: Retour): string => jsonStable(r);

/** Identifiant libre : « 2026-10-05_sergio_chapitre1-etat-de-l-art ». */
export function idRetour(recu: string, de: string, partie: string | null, pris: ReadonlySet<string>): string {
  const base = [recu || "sans-date", slugifier(de), partie ?? "manuscrit"].filter(Boolean).join("_");
  let id = base;
  for (let i = 2; pris.has(id); i++) id = `${base}-${i}`;
  return id;
}

/** Nom de fichier sûr (le nom d'origine, sans chemin ni caractère interdit sous Windows). */
export function nomFichierSur(nom: string): string {
  const n = [...nom.replace(/^.*[\\/]/, "")]
    .map((c) => (c.charCodeAt(0) < 32 || '<>:"|?*'.includes(c) ? "_" : c))
    .join("")
    .trim();
  return n || "retour";
}

export const typeDe = (nom: string): "docx" | "pdf" | null => (/\.docx$/i.test(nom) ? "docx" : /\.pdf$/i.test(nom) ? "pdf" : null);

// ---- Extraction ----

const iso = (s: string) => (/^\d{4}-\d{2}-\d{2}T/.test(s) ? s : "");

/** Titre numéroté (« 1.2 Modèles ») du dernier titre au plus tôt à l'indice `i`. */
function titreA(titres: { i: number; texte: string }[], i: number): string {
  let t = "";
  for (const x of titres) {
    if (x.i > i) break;
    t = x.texte;
  }
  return t;
}

export interface ExtractionDocx {
  remarques: Remarque[];
  /** Auteurs, du plus fréquent au moins fréquent. */
  auteurs: string[];
}

/** Auteurs classés par nombre de remarques décroissant. */
export function auteursDe(remarques: readonly { auteur: string }[]): string[] {
  const n = new Map<string, number>();
  for (const r of remarques) if (r.auteur) n.set(r.auteur, (n.get(r.auteur) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr")).map(([a]) => a);
}

/** Écart maximal (secondes) entre deux modifications suivies d'un même paragraphe pour n'en faire qu'une remarque. */
const FUSION_SECONDES = 120;

/**
 * Remarques d'un `.docx` : les commentaires (résolus dans Word = déjà traités) et les modifications
 * suivies, regroupées par paragraphe, auteur et moment (un remplacement = une suppression + un ajout).
 */
export function remarquesDocx(octets: Uint8Array): ExtractionDocx {
  const paquet = ouvrirDocx(octets);
  const styles = lireStyles(paquet.fichiers["word/styles.xml"]);
  const doc = lireDocument(paquet.fichiers["word/document.xml"]!, styles);
  const numeros = numeroter(doc.paragraphes, styles, lireNumerotation(paquet.fichiers["word/numbering.xml"]));
  const titres: { i: number; texte: string }[] = [];
  for (const [i, p] of doc.paragraphes.entries()) {
    if (niveauTitre(p.style, styles) > 0 && p.texte.trim()) titres.push({ i, texte: [numeros[i], p.texte.trim()].filter(Boolean).join(" ") });
  }
  const ancre = (i: number) => (doc.paragraphes[i]?.texte.trim() ?? "").slice(0, 160);
  const liste: { pos: number; r: Remarque }[] = [];

  for (const c of lireCommentaires(paquet, doc, styles)) {
    liste.push({
      pos: c.paragraphe,
      r: {
      id: `c${c.id}`,
      genre: "commentaire",
      auteur: c.auteur,
      date: iso(c.date),
      texte: c.texte,
      ancre: c.ancre,
      titre: c.paragraphe >= 0 ? titreA(titres, c.paragraphe) : c.titre,
      page: null,
      etat: c.resolu ? "traitee" : "a-traiter",
      note: "",
      },
    });
  }

  let n = 0;
  let groupe: { paragraphe: number; auteur: string; date: string; ajoute: string[]; supprime: string[] } | null = null;
  const fermer = () => {
    if (!groupe) return;
    const a = groupe.ajoute.join(" ").trim();
    const s = groupe.supprime.join(" ").trim();
    liste.push({
      pos: groupe.paragraphe,
      r: {
        id: `m${n++}`,
        genre: a && s ? "modification" : a ? "insertion" : "suppression",
        auteur: groupe.auteur,
        date: iso(groupe.date),
        texte: a && s ? `« ${s} » → « ${a} »` : a || s,
        ancre: ancre(groupe.paragraphe),
        titre: titreA(titres, groupe.paragraphe),
        page: null,
        etat: "a-traiter",
        note: "",
      },
    });
    groupe = null;
  };
  for (const m of doc.modifications) {
    const t = Date.parse(m.date);
    const proche = groupe && groupe.paragraphe === m.paragraphe && groupe.auteur === m.auteur && Math.abs(t - Date.parse(groupe.date)) <= FUSION_SECONDES * 1000;
    if (!proche) {
      fermer();
      groupe = { paragraphe: m.paragraphe, auteur: m.auteur, date: m.date, ajoute: [], supprime: [] };
    }
    (m.genre === "insertion" ? groupe!.ajoute : groupe!.supprime).push(m.texte.trim());
  }
  fermer();

  // Dans l'ordre du document (à position égale, commentaires avant modifications).
  const remarques = liste.sort((a, b) => a.pos - b.pos).map((x) => x.r);
  return { remarques, auteurs: auteursDe(remarques) };
}

/** Annotation PDF telle que la donne pdf.js (champs utiles seulement). */
export interface AnnotationPdf {
  page: number;
  sousType: string;
  contenu: string;
  auteur: string;
  /** Date PDF brute (« D:20260930100000+02'00' »). */
  date: string;
  /** Texte de la page sous une annotation de marquage (surlignage, souligné, barré). */
  couvert: string;
}

/** « D:20260930100000+02'00' » → « 2026-09-30T10:00:00+02:00 » ; « » si la date est illisible. */
export function dateIsoPdf(brut: string | null | undefined): string {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?(?:\d{2}'?)?)?/.exec(brut ?? "");
  if (!m) return "";
  const p = (x: string | undefined, d: string) => x ?? d;
  let zone = "Z";
  if (m[7] && m[7] !== "Z") {
    const z = /^([+-])(\d{2})'?(\d{2})?/.exec(m[7])!;
    zone = `${z[1]}${z[2]}:${z[3] ?? "00"}`;
  }
  return `${m[1]}-${p(m[2], "01")}-${p(m[3], "01")}T${p(m[4], "00")}:${p(m[5], "00")}:${p(m[6], "00")}${zone}`;
}

const MARQUAGES: Record<string, GenreRemarque> = { Highlight: "surlignage", Underline: "souligne", Squiggly: "souligne", StrikeOut: "barre" };
const TEXTES = new Set(["Text", "FreeText", "Caret", "Ink", "Line", "Square", "Circle", "Polygon", "PolyLine", "Stamp"]);

/** Remarques d'un PDF annoté : commentaires, zones de texte, marquages (avec le texte marqué). */
export function remarquesPdf(annotations: readonly AnnotationPdf[]): Remarque[] {
  const remarques: Remarque[] = [];
  const parPage = new Map<number, number>();
  for (const a of annotations) {
    const marquage = MARQUAGES[a.sousType];
    const contenu = a.contenu.trim();
    const couvert = a.couvert.replace(/\s+/g, " ").trim();
    if (!marquage && !TEXTES.has(a.sousType)) continue;
    if (!contenu && !(marquage && couvert)) continue;
    const k = (parPage.get(a.page) ?? 0) + 1;
    parPage.set(a.page, k);
    remarques.push({
      id: `p${a.page}-${k}`,
      genre: marquage ?? "commentaire",
      auteur: a.auteur,
      date: dateIsoPdf(a.date),
      texte: contenu,
      ancre: couvert.slice(0, 160),
      titre: "",
      page: a.page,
      etat: "a-traiter",
      note: "",
    });
  }
  return remarques;
}

// ---- Suivi ----

export function modifierRemarque(r: Retour, id: string, champs: Partial<Pick<Remarque, "etat" | "note">>): Retour {
  return { ...r, remarques: r.remarques.map((x) => (x.id === id ? { ...x, ...champs } : x)) };
}

export function bilan(r: Pick<Retour, "remarques">): Record<EtatRemarque, number> & { total: number } {
  const b = { "a-traiter": 0, traitee: 0, refusee: 0, total: r.remarques.length };
  for (const x of r.remarques) b[x.etat]++;
  return b;
}

/** Nombre de remarques à traiter par partie (clé « » pour les retours sans partie). */
export function aTraiterParPartie(retours: readonly Retour[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of retours) m.set(r.partie ?? "", (m.get(r.partie ?? "") ?? 0) + bilan(r)["a-traiter"]);
  return m;
}

/** Partie la plus probable pour un fichier reçu, d'après son nom (« Chapitre3_relu_Sergio.docx » → chapitre 3). */
export function partieProbable(nomFichier: string, parties: readonly { id: string; nom: string }[]): string | null {
  const mots = (s: string) => slugifier(s.replace(/\.(docx|pdf)$/i, "")).split("-").filter((m) => m.length > 2 || /^\d+$/.test(m));
  const fichier = new Set(mots(nomFichier));
  const chiffres = [...fichier].filter((m) => /^\d+$/.test(m));
  let meilleur: { id: string; score: number } | null = null;
  for (const p of parties) {
    const motsP = mots(`${p.nom} ${p.id}`);
    // « chapitre3 » dans le fichier ↔ « chapitre1 » dans la partie : le numéro compte plus que le mot.
    const num = (m: string) => /^([a-z]+)(\d+)$/.exec(m);
    let score = 0;
    for (const m of motsP) {
      if (fichier.has(m)) score += 1;
      const a = num(m);
      if (a) for (const f of fichier) if (num(f)?.[1] === a[1] && num(f)?.[2] === a[2]) score += 2;
    }
    for (const c of chiffres) if (motsP.includes(c) || motsP.some((m) => num(m)?.[2] === c)) score += 1;
    if (score > 0 && (!meilleur || score > meilleur.score)) meilleur = { id: p.id, score };
  }
  return meilleur?.id ?? null;
}
