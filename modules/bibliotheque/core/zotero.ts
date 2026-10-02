/**
 * « Mettre à jour Zotero » (SPEC §9.3) : la bibliothèque de Thèse est la source, Zotero
 * la reçoit par son API web. Sens unique : une fiche crée ou met à jour son entrée Zotero,
 * jamais l'inverse ; rien n'est supprimé dans Zotero.
 *
 * - Chaque fiche garde la clé de son entrée Zotero dans `bibliotheque/zotero.json` : un
 *   deuxième envoi met à jour, il ne duplique pas.
 * - Au premier envoi, les entrées déjà dans Zotero sont reconnues (identifiant Thèse noté
 *   dans « Extra », puis DOI, puis titre et année) ; une fiche qui en reconnaît plusieurs
 *   est laissée de côté, à trancher.
 * - Sur une entrée existante, seuls les champs remplis dans Thèse sont écrits ; les
 *   étiquettes et collections ajoutées dans Zotero sont gardées (les nôtres commencent par
 *   « Thèse »).
 * - Le PDF devient une pièce jointe **liée** (le fichier reste dans l'espace OneDrive) :
 *   chemin `attachments:<nom>`, relatif au « répertoire de base des pièces jointes liées »
 *   de Zotero, réglé sur `Espace\bibliotheque\pdf` sur chaque PC.
 * - Les notes de lecture deviennent une note enfant, réécrite à chaque envoi.
 *
 * Pur : le transport est injecté (Rust dans l'application, serveur factice en test).
 */
import { jsonStable } from "@noyau/stockage";
import { DOSSIER, type FicheLecture, type NotesLecture, type Parametres, type Reference } from "./modele";

export const FICHIER_ZOTERO = `${DOSSIER}/zotero.json`;
export const NOM_COLLECTION = "Thèse";
/** Étiquette posée sur toutes les entrées envoyées ; les autres commencent par « Thèse · ». */
export const ETIQUETTE = "Thèse";
const PAR_LOT = 50;

// ---- Transport ----

export interface RequeteHttp {
  methode: "GET" | "POST" | "PATCH" | "DELETE";
  chemin: string;
  corps?: string;
  version?: number;
}
export interface ReponseHttp {
  code: number | null;
  corps: string;
  version: number | null;
  total: number | null;
  attente: number | null;
  erreur: string;
}
export type Transport = (r: RequeteHttp) => Promise<ReponseHttp>;

export class ErreurZotero extends Error {}

function messageCode(code: number, corps: string): string {
  const detail = corps.trim().slice(0, 200);
  if (code === 403) return "Zotero refuse la clé d'API (elle doit donner accès à la bibliothèque et aux notes, en écriture).";
  if (code === 404) return "Zotero ne trouve pas cette bibliothèque (identifiant d'utilisateur ?).";
  if (code === 412) return "Zotero a été modifié pendant l'envoi : relancez « Préparer ».";
  if (code === 413) return "Zotero refuse l'envoi : bibliothèque pleine (quota).";
  return `Zotero a répondu ${code}${detail ? ` : ${detail}` : ""}.`;
}

export class ClientZotero {
  constructor(
    private readonly transport: Transport,
    private readonly attendre: (secondes: number) => Promise<void> = (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
  ) {}

  /** Requête brute ; ralentit quand Zotero le demande (429, 503, Backoff). */
  async brut(r: RequeteHttp): Promise<ReponseHttp> {
    for (let essai = 0; ; essai++) {
      const rep = await this.transport(r);
      if (rep.code === null) throw new ErreurZotero(`Zotero injoignable : ${rep.erreur || "pas de réponse"}.`);
      if ((rep.code === 429 || rep.code === 503) && essai < 3) {
        await this.attendre(Math.min(rep.attente ?? 5 * (essai + 1), 60));
        continue;
      }
      if (rep.attente && rep.code < 400) await this.attendre(Math.min(rep.attente, 60));
      return rep;
    }
  }

  async json<T>(r: RequeteHttp): Promise<{ donnees: T; rep: ReponseHttp }> {
    const rep = await this.brut(r);
    if (rep.code! < 200 || rep.code! >= 300) throw new ErreurZotero(messageCode(rep.code!, rep.corps));
    try {
      return { donnees: JSON.parse(rep.corps) as T, rep };
    } catch {
      throw new ErreurZotero("Réponse de Zotero illisible.");
    }
  }

  /** Toutes les pages d'une liste (100 par requête). */
  async tout<T>(chemin: string): Promise<T[]> {
    const out: T[] = [];
    const sep = chemin.includes("?") ? "&" : "?";
    for (;;) {
      const { donnees, rep } = await this.json<T[]>({ methode: "GET", chemin: `${chemin}${sep}limit=100&start=${out.length}` });
      out.push(...donnees);
      if (!donnees.length || rep.total === null || out.length >= rep.total) return out;
    }
  }
}

// ---- Clé d'API ----

export interface CompteZotero {
  utilisateur: number;
  nom: string;
}

/** Vérifie la clé : bibliothèque personnelle, notes et écriture. */
export async function verifierCle(client: ClientZotero): Promise<CompteZotero> {
  type Cle = { userID?: number; username?: string; access?: { user?: { library?: boolean; notes?: boolean; write?: boolean } } };
  const { donnees } = await client.json<Cle>({ methode: "GET", chemin: "/keys/current" });
  const a = donnees.access?.user ?? {};
  if (typeof donnees.userID !== "number") throw new ErreurZotero("Cette clé n'est liée à aucun compte Zotero.");
  if (!a.library || !a.write) throw new ErreurZotero("La clé doit autoriser l'accès à la bibliothèque personnelle et l'écriture.");
  if (!a.notes) throw new ErreurZotero("La clé doit aussi autoriser l'accès aux notes (pour les notes de lecture).");
  return { utilisateur: donnees.userID, nom: donnees.username ?? "" };
}

// ---- État de la synchro (dans l'espace) ----

export interface LienZotero {
  /** Clé de l'entrée Zotero. */
  item: string;
  /** Version de l'entrée après notre dernier envoi (une version plus haute : modifiée dans Zotero). */
  version: number;
  /** Empreinte de ce qui a été envoyé (vide : envoi inachevé, à reprendre). */
  empreinte: string;
  pdf: string | null;
  note: string | null;
}

export interface EtatZotero {
  version: 1;
  /** « users/123 » : un changement de compte repart de zéro. */
  bibliotheque: string;
  collection: string | null;
  dernierEnvoi: string;
  liens: Record<string, LienZotero>;
}

export const etatVide = (bibliotheque = ""): EtatZotero => ({ version: 1, bibliotheque, collection: null, dernierEnvoi: "", liens: {} });

export function lireEtatZotero(texte: string | null): EtatZotero {
  if (!texte) return etatVide();
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(texte) as Record<string, unknown>;
  } catch {
    return etatVide();
  }
  if (typeof b !== "object" || b === null) return etatVide();
  const liens: Record<string, LienZotero> = {};
  const brut = typeof b.liens === "object" && b.liens !== null ? (b.liens as Record<string, Record<string, unknown>>) : {};
  for (const [id, l] of Object.entries(brut)) {
    if (typeof l?.item !== "string" || !l.item) continue;
    liens[id] = {
      item: l.item,
      version: typeof l.version === "number" ? l.version : 0,
      empreinte: typeof l.empreinte === "string" ? l.empreinte : "",
      pdf: typeof l.pdf === "string" && l.pdf ? l.pdf : null,
      note: typeof l.note === "string" && l.note ? l.note : null,
    };
  }
  return {
    version: 1,
    bibliotheque: typeof b.bibliotheque === "string" ? b.bibliotheque : "",
    collection: typeof b.collection === "string" && b.collection ? b.collection : null,
    dernierEnvoi: typeof b.dernierEnvoi === "string" ? b.dernierEnvoi : "",
    liens,
  };
}

export const ecrireEtatZotero = (e: EtatZotero): string => jsonStable(e);

// ---- Conversion d'une fiche ----

export const TYPES_ZOTERO: Record<string, string> = {
  JOUR: "journalArticle",
  CONF: "conferencePaper",
  CPAPER: "conferencePaper",
  CHAP: "bookSection",
  BOOK: "book",
  THES: "thesis",
  RPRT: "report",
  STAND: "report",
};
export const typeZotero = (typeRis: string) => TYPES_ZOTERO[typeRis.trim().toUpperCase()] ?? "document";

export interface Createur {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

export interface ContenuZotero {
  itemType: string;
  /** Champs Zotero (titre, date, DOI…) ; vides = non renseignés dans Thèse. */
  champs: Record<string, string>;
  creators: Createur[];
  /** Nos étiquettes (« Thèse », « Thèse · Axe 2 - … »). */
  tags: string[];
  /** Nos lignes de « Extra » (« Thèse: BIB-003 »…). */
  extra: string[];
}

export function createurs(auteurs: string): Createur[] {
  return auteurs
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const i = a.indexOf(",");
      return i > 0 ? { creatorType: "author", lastName: a.slice(0, i).trim(), firstName: a.slice(i + 1).trim() } : { creatorType: "author", name: a };
    });
}

const estIsbn = (s: string) => /^(97[89][-\s]?)?[\d-\s]{9,}[\dXx]$/.test(s.trim()) && s.replace(/[^\dXx]/g, "").length >= 10;

export function versZotero(id: string, r: Reference, p: Parametres): ContenuZotero {
  const itemType = typeZotero(r.typeRis);
  const c: Record<string, string> = {
    title: r.titre,
    date: r.annee ? String(r.annee) : "",
    url: r.url,
    DOI: r.doi
      .trim()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
      .replace(/^doi:\s*/i, ""),
    volume: r.volume,
    pages: r.pages,
    citationKey: r.cle,
  };
  const ident = r.identifiant.trim();
  switch (itemType) {
    case "journalArticle":
      Object.assign(c, { publicationTitle: r.support, issue: r.numero, ISSN: estIsbn(ident) ? "" : ident });
      break;
    case "conferencePaper":
      Object.assign(c, { proceedingsTitle: r.support, publisher: r.editeur, ISBN: estIsbn(ident) ? ident : "" });
      break;
    case "bookSection":
      Object.assign(c, { bookTitle: r.support, publisher: r.editeur, ISBN: estIsbn(ident) ? ident : "" });
      break;
    case "book":
      Object.assign(c, { series: r.support, publisher: r.editeur, ISBN: estIsbn(ident) ? ident : "" });
      break;
    case "thesis":
      Object.assign(c, { university: r.editeur || r.support });
      break;
    case "report":
      Object.assign(c, { institution: r.editeur || r.support, reportNumber: r.numero });
      break;
    default:
      Object.assign(c, { publisher: r.editeur || r.support });
  }
  const tags = [ETIQUETTE];
  const axe = p.axes.find((a) => a.numero === r.axe);
  if (r.axe !== null) tags.push(`${ETIQUETTE} · Axe ${r.axe}${axe?.intitule ? ` - ${axe.intitule}` : ""}`);
  if (r.priorite) tags.push(`${ETIQUETTE} · ${r.priorite}`);
  if (r.statut) tags.push(`${ETIQUETTE} · ${r.statut}`);
  if (r.tfe) tags.push(`${ETIQUETTE} · TFE`);
  for (const cat of r.categories) tags.push(`${ETIQUETTE} · ${cat}`);
  return { itemType, champs: c, creators: createurs(r.auteurs), tags, extra: [`${ETIQUETTE}: ${id}`] };
}

export const estNotreEtiquette = (t: string) => t === ETIQUETTE || t.startsWith(`${ETIQUETTE} · `);
/** Lignes de « Extra » que nous écrivons (les autres sont gardées). */
const estNotreLigne = (l: string) => /^(Thèse|Citation Key|DOI):/i.test(l.trim());

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paragraphe = (titre: string, texte: string) => (texte.trim() ? `<p><strong>${echapper(titre)} :</strong> ${echapper(texte.trim()).replace(/\n/g, "<br/>")}</p>` : "");

const LIBELLES_FICHE: [keyof FicheLecture, string][] = [
  ["objectif", "Objectif"],
  ["methode", "Méthode"],
  ["resultats", "Résultats annoncés"],
  ["limites", "Limites"],
  ["pourThese", "Pour la thèse"],
  ["aVerifier", "À vérifier"],
  ["pneu", "Pneu"],
  ["contact", "Contact"],
  ["loi", "Loi de comportement"],
  ["methodeCategorie", "Méthode (catégorie)"],
  ["chargement", "Chargement"],
  ["cible", "Cible"],
  ["validation", "Validation"],
];
const LIBELLES_NOTES: [keyof NotesLecture, string][] = [
  ["apport", "Apport central"],
  ["lien", "Lien avec mes travaux"],
  ["equations", "Équations, valeurs, figures"],
  ["chapitre", "Chapitre visé"],
  ["aCiter", "À citer"],
];

/** Note enfant (HTML de Zotero) ; vide s'il n'y a rien à noter. */
export function noteZotero(id: string, r: Reference): string {
  const fiche = LIBELLES_FICHE.map(([k, l]) => paragraphe(l, r.fiche[k])).join("");
  const notes = LIBELLES_NOTES.map(([k, l]) => paragraphe(l, r.notes[k])).join("");
  const resume = paragraphe("Contribution", r.contribution) + paragraphe("Commentaire", r.commentaire);
  if (!fiche && !notes && !resume) return "";
  const statut = paragraphe("Statut", [r.statut, r.dateLecture].filter(Boolean).join(", lu le "));
  return (
    `<h1>Notes de lecture — ${echapper(id)}</h1>` +
    statut +
    resume +
    (notes ? `<h2>Notes</h2>${notes}` : "") +
    (fiche ? `<h2>Fiche de lecture</h2>${fiche}` : "") +
    `<p><em>Écrite par l'application Thèse et remplacée à chaque mise à jour : modifiez-la dans Thèse.</em></p>`
  );
}

/** Chemin Zotero d'un PDF lié, relatif au répertoire de base (`Espace\bibliotheque\pdf`). */
export const cheminPdfZotero = (fichierPdf: string) => `attachments:${fichierPdf.replace(/\\/g, "/")}`;

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** Empreinte de tout ce qu'on enverrait pour une fiche : rien de changé, rien à envoyer. */
export function empreinte(contenu: ContenuZotero, note: string, pdf: string | null, collection: string | null): string {
  return fnv(JSON.stringify([contenu, note, pdf, collection]));
}

// ---- Ce qui est dans Zotero ----

export interface ItemZotero {
  key: string;
  version: number;
  itemType: string;
  parentItem?: string;
  title?: string;
  date?: string;
  DOI?: string;
  extra?: string;
  linkMode?: string;
  contentType?: string;
  path?: string;
  tags?: { tag: string; type?: number }[];
  collections?: string[];
  [champ: string]: unknown;
}

export interface Instantane {
  /** Entrées de premier niveau (ni notes ni pièces jointes enfants). */
  items: ItemZotero[];
  /** Pièces jointes (pour savoir si une entrée a déjà un PDF). */
  pieces: ItemZotero[];
  /** Version de chaque objet de la bibliothèque (hors corbeille). */
  versions: Record<string, number>;
  collections: { key: string; name: string; parentCollection: string | false }[];
}

export async function lireZotero(client: ClientZotero, prefixe: string): Promise<Instantane> {
  type Brut = { key: string; version: number; data: ItemZotero & { name?: string; parentCollection?: string | false } };
  const [items, pieces, versions, collections] = await Promise.all([
    client.tout<Brut>(`${prefixe}/items/top?format=json`),
    client.tout<Brut>(`${prefixe}/items?itemType=attachment&format=json`),
    client.json<Record<string, number>>({ methode: "GET", chemin: `${prefixe}/items?format=versions` }).then((r) => r.donnees),
    client.tout<Brut>(`${prefixe}/collections`),
  ]);
  return {
    items: items.map((i) => ({ ...i.data, key: i.key, version: i.version })).filter((i) => i.itemType !== "attachment" && i.itemType !== "note"),
    pieces: pieces.map((i) => ({ ...i.data, key: i.key, version: i.version })),
    versions,
    collections: collections.map((c) => ({ key: c.key, name: c.data.name ?? "", parentCollection: c.data.parentCollection ?? false })),
  };
}

// ---- Plan ----

export const normDoi = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
export const normTitre = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const anneeDe = (s: string | undefined) => /\b(1[89]|20)\d{2}\b/.exec(s ?? "")?.[0] ?? "";
const ligneExtra = (extra: string | undefined, cle: string) =>
  (extra ?? "")
    .split(/\r?\n/)
    .map((l) => /^([^:]+):\s*(.*)$/.exec(l.trim()))
    .find((m) => m && m[1]!.trim().toLowerCase() === cle.toLowerCase())?.[2]
    ?.trim() ?? "";

export type Action =
  | { genre: "creer"; id: string }
  | { genre: "recreer"; id: string }
  | { genre: "associer"; id: string; item: string; par: "identifiant" | "DOI" | "titre" }
  | { genre: "maj"; id: string; item: string; ecrase: boolean }
  | { genre: "inchangee"; id: string; item: string }
  | { genre: "douteuse"; id: string; candidats: { key: string; titre: string; date: string }[] };

export interface FicheAEnvoyer {
  id: string;
  ref: Reference;
}

export interface Plan {
  bibliotheque: string;
  actions: Action[];
  /** PDF nommés dans une fiche mais absents de l'espace : pas de pièce jointe. */
  pdfAbsents: string[];
  /** L'état venait d'un autre compte Zotero : on repart de l'appariement. */
  autreCompte: boolean;
}

export function compter(plan: Plan): Record<Action["genre"], number> {
  const c = { creer: 0, recreer: 0, associer: 0, maj: 0, inchangee: 0, douteuse: 0 };
  for (const a of plan.actions) c[a.genre]++;
  return c;
}

export function planifier(
  fiches: readonly FicheAEnvoyer[],
  p: Parametres,
  etatBrut: EtatZotero,
  z: Instantane,
  bibliotheque: string,
  pdfPresents: ReadonlySet<string>,
): Plan {
  const autreCompte = etatBrut.bibliotheque !== "" && etatBrut.bibliotheque !== bibliotheque && Object.keys(etatBrut.liens).length > 0;
  const etat = autreCompte ? etatVide(bibliotheque) : etatBrut;
  const pris = new Set(Object.values(etat.liens).map((l) => l.item));
  const libres = () => z.items.filter((i) => !pris.has(i.key));
  const collection = etat.collection && z.collections.some((c) => c.key === etat.collection) ? etat.collection : null;
  const actions: Action[] = [];
  const pdfAbsents: string[] = [];

  for (const { id, ref } of fiches) {
    const pdf = ref.fichierPdf.trim();
    if (pdf && !pdfPresents.has(pdf)) pdfAbsents.push(id);
    const lien = etat.liens[id];
    if (lien) {
      const v = z.versions[lien.item];
      if (v === undefined) {
        actions.push({ genre: "recreer", id });
        continue;
      }
      const attendu = empreinte(versZotero(id, ref, p), noteZotero(id, ref), pdf && pdfPresents.has(pdf) ? cheminPdfZotero(pdf) : null, collection);
      const enfantsLa = (!lien.pdf || z.versions[lien.pdf] !== undefined) && (!lien.note || z.versions[lien.note] !== undefined);
      if (attendu === lien.empreinte && v === lien.version && enfantsLa && collection) actions.push({ genre: "inchangee", id, item: lien.item });
      else actions.push({ genre: "maj", id, item: lien.item, ecrase: v > lien.version && lien.empreinte !== "" });
      continue;
    }
    // Premier envoi de cette fiche : est-elle déjà dans Zotero ?
    const parId = libres().filter((i) => ligneExtra(i.extra, ETIQUETTE) === id);
    const doi = normDoi(ref.doi);
    const parDoi = doi ? libres().filter((i) => normDoi(String(i.DOI ?? "") || ligneExtra(i.extra, "DOI")) === doi) : [];
    const titre = normTitre(ref.titre);
    const annee = ref.annee ? String(ref.annee) : "";
    const parTitre =
      titre.length >= 8 ? libres().filter((i) => normTitre(String(i.title ?? "")) === titre && (!annee || !anneeDe(i.date) || anneeDe(i.date) === annee)) : [];
    const [trouves, par] = parId.length ? [parId, "identifiant" as const] : parDoi.length ? [parDoi, "DOI" as const] : [parTitre, "titre" as const];
    if (trouves.length === 1) {
      pris.add(trouves[0]!.key);
      actions.push({ genre: "associer", id, item: trouves[0]!.key, par });
    } else if (trouves.length > 1) {
      actions.push({ genre: "douteuse", id, candidats: trouves.map((i) => ({ key: i.key, titre: String(i.title ?? ""), date: String(i.date ?? "") })) });
    } else actions.push({ genre: "creer", id });
  }
  return { bibliotheque, actions, pdfAbsents, autreCompte };
}

// ---- Envoi ----

export interface Rapport {
  crees: number;
  misesAJour: number;
  associees: number;
  inchangees: number;
  douteuses: number;
  pdfLies: number;
  /** Fiches dont l'entrée Zotero avait déjà un PDF (pas de deuxième pièce jointe). */
  pdfDejaLa: string[];
  notes: number;
  echecs: { id: string; message: string }[];
  /** Fiches désormais dans Zotero (pour cocher « Dans Zotero »). */
  envoyees: string[];
}

/** Champs que Zotero accepte pour un type (gabarit `/items/new`). */
async function gabarits(client: ClientZotero, types: Iterable<string>): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  for (const t of new Set(types)) {
    const { donnees } = await client.json<Record<string, unknown>>({ methode: "GET", chemin: `/items/new?itemType=${encodeURIComponent(t)}` });
    out.set(t, new Set(Object.keys(donnees).filter((k) => !["itemType", "creators", "tags", "collections", "relations"].includes(k))));
  }
  return out;
}

const HORS_CHAMPS = new Set(["key", "version", "itemType", "creators", "tags", "collections", "relations", "dateAdded", "dateModified", "parentItem", "deleted"]);

/** Objet à envoyer pour une entrée : nouvelle, ou fusionnée avec l'existante. */
export function objetItem(contenu: ContenuZotero, valides: Set<string>, collection: string, existant?: ItemZotero, version?: number): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  const extra = [...contenu.extra];
  if (existant) {
    o.key = existant.key;
    o.version = version ?? existant.version;
    for (const [k, v] of Object.entries(existant)) if (!HORS_CHAMPS.has(k) && valides.has(k) && k !== "extra") o[k] = v;
    if (existant.relations) o.relations = existant.relations;
  }
  o.itemType = contenu.itemType;
  for (const [k, v] of Object.entries(contenu.champs)) {
    if (!v.trim()) continue;
    if (valides.has(k)) o[k] = v.trim();
    else if (k === "DOI") extra.push(`DOI: ${v.trim()}`);
    else if (k === "citationKey") extra.push(`Citation Key: ${v.trim()}`);
  }
  const autres = (existant?.extra ?? "").split(/\r?\n/).filter((l) => l.trim() && !estNotreLigne(l));
  o.extra = [...autres, ...extra].join("\n");
  o.creators = contenu.creators.length || !existant ? contenu.creators : existant.creators;
  o.tags = [...(existant?.tags ?? []).filter((t) => !estNotreEtiquette(t.tag)), ...contenu.tags.map((tag) => ({ tag }))];
  o.collections = [...new Set([...(existant?.collections ?? []), collection])];
  return o;
}

/** Un objet lu, renvoyé tel quel : Zotero date lui-même la modification. */
function sansDates(i: ItemZotero): Record<string, unknown> {
  const o: Record<string, unknown> = { ...i };
  delete o.dateModified;
  return o;
}

type Reponse = {
  successful?: Record<string, { key: string; version: number }>;
  success?: Record<string, string>;
  unchanged?: Record<string, string>;
  failed?: Record<string, { key?: string; code?: number; message?: string }>;
};

/** POST par lots de 50 ; résultat par position : clé et version, ou message d'échec. */
async function ecrireLots(client: ClientZotero, chemin: string, objets: Record<string, unknown>[]): Promise<({ key: string; version: number } | { echec: string })[]> {
  const out: ({ key: string; version: number } | { echec: string })[] = [];
  for (let i = 0; i < objets.length; i += PAR_LOT) {
    const lot = objets.slice(i, i + PAR_LOT);
    const { donnees: r, rep } = await client.json<Reponse>({ methode: "POST", chemin, corps: JSON.stringify(lot) });
    lot.forEach((o, j) => {
      const k = String(j);
      const ok = r.successful?.[k];
      if (ok) out.push({ key: ok.key, version: ok.version ?? rep.version ?? 0 });
      else if (r.success?.[k]) out.push({ key: r.success[k]!, version: rep.version ?? 0 });
      else if (r.unchanged?.[k]) out.push({ key: r.unchanged[k]!, version: Number(o.version ?? rep.version ?? 0) });
      else out.push({ echec: r.failed?.[k]?.message ?? "refusé par Zotero" });
    });
  }
  return out;
}

export interface Envoi {
  client: ClientZotero;
  prefixe: string;
  fiches: readonly FicheAEnvoyer[];
  parametres: Parametres;
  plan: Plan;
  instantane: Instantane;
  etat: EtatZotero;
  pdfPresents: ReadonlySet<string>;
  /** Appelé après chaque étape : l'état est écrit au fur et à mesure (un envoi interrompu ne duplique rien). */
  sauver(etat: EtatZotero): Promise<void>;
  progression?(fait: number, total: number, etape: string): void;
  maintenant?: string;
}

export async function envoyer(e: Envoi): Promise<Rapport> {
  const { client, prefixe, plan, instantane: z } = e;
  const etat: EtatZotero = plan.autreCompte ? etatVide(plan.bibliotheque) : { ...e.etat, bibliotheque: plan.bibliotheque, liens: { ...e.etat.liens } };
  const rapport: Rapport = { crees: 0, misesAJour: 0, associees: 0, inchangees: 0, douteuses: 0, pdfLies: 0, pdfDejaLa: [], notes: 0, echecs: [], envoyees: [] };
  const fiche = new Map(e.fiches.map((f) => [f.id, f.ref]));
  const items = new Map(z.items.map((i) => [i.key, i]));

  // 1. La collection « Thèse ».
  let collection = etat.collection && z.collections.some((c) => c.key === etat.collection) ? etat.collection : null;
  collection ??= z.collections.find((c) => c.name === NOM_COLLECTION && !c.parentCollection)?.key ?? null;
  if (!collection) {
    const [r] = await ecrireLots(client, `${prefixe}/collections`, [{ name: NOM_COLLECTION }]);
    if (!r || "echec" in r) throw new ErreurZotero(`Création de la collection « ${NOM_COLLECTION} » refusée : ${r && "echec" in r ? r.echec : "?"}`);
    collection = r.key;
  }
  etat.collection = collection;

  // 2. Les entrées.
  const aEcrire = plan.actions.filter((a) => a.genre !== "inchangee" && a.genre !== "douteuse");
  rapport.inchangees = plan.actions.filter((a) => a.genre === "inchangee").length;
  rapport.douteuses = plan.actions.filter((a) => a.genre === "douteuse").length;
  const contenus = new Map(aEcrire.map((a) => [a.id, versZotero(a.id, fiche.get(a.id)!, e.parametres)]));
  e.progression?.(0, aEcrire.length, "Types d'entrées");
  const valides = await gabarits(client, [...contenus.values()].map((c) => c.itemType));
  const objets = aEcrire.map((a) => {
    const c = contenus.get(a.id)!;
    const existant = a.genre === "associer" || a.genre === "maj" ? items.get(a.item) : undefined;
    return objetItem(c, valides.get(c.itemType)!, collection, existant, existant ? z.versions[existant.key] : undefined);
  });
  const resultats: ({ key: string; version: number } | { echec: string })[] = [];
  for (let i = 0; i < objets.length; i += PAR_LOT) {
    e.progression?.(i, objets.length, "Entrées");
    const lot = await ecrireLots(client, `${prefixe}/items`, objets.slice(i, i + PAR_LOT));
    lot.forEach((r, j) => {
      const a = aEcrire[i + j]!;
      resultats.push(r);
      if ("echec" in r) return void rapport.echecs.push({ id: a.id, message: r.echec });
      const ancien = a.genre === "recreer" ? undefined : etat.liens[a.id];
      etat.liens[a.id] = { item: r.key, version: r.version, empreinte: "", pdf: ancien?.pdf ?? null, note: ancien?.note ?? null };
      if (a.genre === "creer" || a.genre === "recreer") rapport.crees++;
      else if (a.genre === "associer") rapport.associees++;
      else rapport.misesAJour++;
      rapport.envoyees.push(a.id);
    });
    await e.sauver(etat);
  }

  // 3. Les enfants : PDF liés et notes.
  type Enfant = { id: string; genre: "pdf" | "note"; objet: Record<string, unknown> };
  const enfants: Enfant[] = [];
  const pdfsDe = (parent: string) => z.pieces.filter((p) => p.parentItem === parent && (p.contentType === "application/pdf" || /\.pdf$/i.test(String(p.path ?? p.filename ?? ""))));
  aEcrire.forEach((a, i) => {
    const r = resultats[i]!;
    if ("echec" in r) return;
    const ref = fiche.get(a.id)!;
    const lien = etat.liens[a.id]!;
    const pdf = ref.fichierPdf.trim();
    if (pdf && e.pdfPresents.has(pdf)) {
      const chemin = cheminPdfZotero(pdf);
      const titre = "PDF (espace Thèse)";
      const notre = lien.pdf ? z.pieces.find((p) => p.key === lien.pdf) : undefined;
      if (notre) {
        if (notre.path !== chemin) enfants.push({ id: a.id, genre: "pdf", objet: { ...sansDates(notre), version: z.versions[notre.key] ?? notre.version, path: chemin, title: titre } });
      } else if (a.genre === "associer" && pdfsDe(r.key).length) rapport.pdfDejaLa.push(a.id);
      else enfants.push({ id: a.id, genre: "pdf", objet: { itemType: "attachment", parentItem: r.key, linkMode: "linked_file", title: titre, contentType: "application/pdf", charset: "", path: chemin, tags: [], relations: {} } });
    }
    const note = noteZotero(a.id, ref);
    if (note) {
      const v = lien.note ? z.versions[lien.note] : undefined;
      if (lien.note && v !== undefined) enfants.push({ id: a.id, genre: "note", objet: { key: lien.note, version: v, itemType: "note", parentItem: r.key, note, tags: [], relations: {} } });
      else enfants.push({ id: a.id, genre: "note", objet: { itemType: "note", parentItem: r.key, note, tags: [], relations: {} } });
    }
  });
  const echecsEnfants = new Set<string>();
  for (let i = 0; i < enfants.length; i += PAR_LOT) {
    e.progression?.(i, enfants.length, "PDF et notes");
    const lot = enfants.slice(i, i + PAR_LOT);
    const res = await ecrireLots(client, `${prefixe}/items`, lot.map((x) => x.objet));
    res.forEach((r, j) => {
      const x = lot[j]!;
      if ("echec" in r) {
        echecsEnfants.add(x.id);
        rapport.echecs.push({ id: x.id, message: `${x.genre === "pdf" ? "PDF lié" : "note"} : ${r.echec}` });
        return;
      }
      const lien = etat.liens[x.id]!;
      if (x.genre === "pdf") {
        lien.pdf = r.key;
        rapport.pdfLies++;
      } else {
        lien.note = r.key;
        rapport.notes++;
      }
    });
    await e.sauver(etat);
  }

  // 4. Empreintes : une fiche entièrement envoyée ne sera plus renvoyée tant qu'elle ne change pas.
  // Les versions sont relues : ajouter un enfant peut changer celle du parent.
  const apres = await client.json<Record<string, number>>({ methode: "GET", chemin: `${prefixe}/items?format=versions` }).then((r) => r.donnees);
  aEcrire.forEach((a, i) => {
    const r = resultats[i]!;
    if ("echec" in r || echecsEnfants.has(a.id)) return;
    const ref = fiche.get(a.id)!;
    const pdf = ref.fichierPdf.trim();
    const lien = etat.liens[a.id]!;
    lien.version = apres[lien.item] ?? lien.version;
    lien.empreinte = empreinte(contenus.get(a.id)!, noteZotero(a.id, ref), pdf && e.pdfPresents.has(pdf) ? cheminPdfZotero(pdf) : null, collection);
  });
  etat.dernierEnvoi = e.maintenant ?? new Date().toISOString();
  await e.sauver(etat);
  e.progression?.(1, 1, "Terminé");
  return rapport;
}
