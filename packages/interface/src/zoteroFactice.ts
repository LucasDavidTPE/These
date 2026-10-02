/**
 * Un serveur Zotero en mémoire, qui imite ce que l'application utilise de l'API web v3 :
 * clé, collections, entrées (lecture paginée, versions, création et mise à jour par lots de
 * 50, refus des champs inconnus du type), gabarits `/items/new`. Sert aux tests de la
 * synchro et à la démonstration navigateur (aucune requête réseau).
 */
import type { ReponseZotero, RequeteZotero } from "./plateforme";

/** Champs par type, comme le schéma de Zotero (types utilisés par la bibliothèque). */
const COMMUNS = ["title", "abstractNote", "date", "language", "shortTitle", "url", "accessDate", "archive", "archiveLocation", "libraryCatalog", "callNumber", "rights", "extra"];
export const SCHEMA: Record<string, string[]> = {
  journalArticle: [...COMMUNS, "publicationTitle", "volume", "issue", "pages", "series", "seriesTitle", "seriesText", "journalAbbreviation", "DOI", "ISSN", "citationKey"],
  conferencePaper: [...COMMUNS, "proceedingsTitle", "conferenceName", "place", "publisher", "volume", "pages", "series", "DOI", "ISBN", "citationKey"],
  bookSection: [...COMMUNS, "bookTitle", "series", "seriesNumber", "volume", "numberOfVolumes", "edition", "place", "publisher", "pages", "ISBN", "citationKey"],
  book: [...COMMUNS, "series", "seriesNumber", "volume", "numberOfVolumes", "edition", "place", "publisher", "numPages", "ISBN", "citationKey"],
  thesis: [...COMMUNS, "thesisType", "university", "place", "numPages", "citationKey"],
  report: [...COMMUNS, "reportNumber", "reportType", "seriesTitle", "place", "institution", "pages", "citationKey"],
  document: [...COMMUNS, "publisher", "citationKey"],
};
const ENFANTS: Record<string, string[]> = {
  note: ["note", "parentItem"],
  attachment: ["parentItem", "linkMode", "title", "accessDate", "note", "contentType", "charset", "path", "filename", "md5", "mtime", "url"],
};
const STRUCTURE = ["key", "version", "itemType", "creators", "tags", "collections", "relations", "dateAdded", "dateModified", "deleted"];

type Objet = Record<string, unknown> & { key: string; version: number; itemType?: string; parentItem?: string };

export class ZoteroFactice {
  readonly utilisateur = 4242;
  version = 1;
  items = new Map<string, Objet>();
  collections = new Map<string, Objet>();
  requetes: RequeteZotero[] = [];
  /** Fichiers des pièces jointes stockées. */
  fichiers = new Map<string, Uint8Array>();
  private suivant = 0;
  /** `cleValide` : « * » accepte toute clé (démonstration). */
  constructor(
    readonly cleValide = "DEMOCLEZOTERO000000000000",
    readonly droits = { library: true, notes: true, write: true },
  ) {}

  private cle(): string {
    const alpha = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
    let n = ++this.suivant * 7919;
    let s = "";
    for (let i = 0; i < 8; i++) {
      s += alpha[n % alpha.length];
      n = Math.floor(n / alpha.length) + i * 7;
    }
    return s;
  }

  /** Ajoute une entrée « déjà dans Zotero » (avant le premier envoi). */
  ajouter(o: Record<string, unknown>): string {
    const key = this.cle();
    this.items.set(key, { tags: [], collections: [], relations: {}, ...o, key, version: ++this.version });
    return key;
  }

  /** Ajoute un PDF stocké chez Zotero (téléchargeable) à une entrée. */
  ajouterPdf(parent: string, nom: string, octets: Uint8Array | string): string {
    const key = this.ajouter({ itemType: "attachment", parentItem: parent, linkMode: "imported_file", contentType: "application/pdf", filename: nom, title: nom });
    this.fichiers.set(key, typeof octets === "string" ? new TextEncoder().encode(octets) : octets);
    return key;
  }

  /** `GET /users/<id>/items/<key>/file` : le fichier stocké, ou une erreur comme l'application la reçoit. */
  fichier(chemin: string, cle: string): Uint8Array {
    this.requetes.push({ methode: "GET", chemin, cle });
    if (this.cleValide !== "*" && cle !== this.cleValide) throw new Error("accès refusé par Zotero (clé)");
    const m = new RegExp(`^/users/${this.utilisateur}/items/([A-Z0-9]{8})/file$`).exec(chemin);
    const octets = m ? this.fichiers.get(m[1]!) : undefined;
    if (!octets) throw new Error("fichier absent du stockage Zotero");
    return octets;
  }

  async traiter(r: RequeteZotero): Promise<ReponseZotero> {
    this.requetes.push(r);
    const rep = (code: number, corps: unknown, extra: Partial<ReponseZotero> = {}): ReponseZotero => ({
      code,
      corps: typeof corps === "string" ? corps : JSON.stringify(corps),
      version: this.version,
      total: null,
      attente: null,
      erreur: "",
      ...extra,
    });
    if (this.cleValide !== "*" && r.cle !== this.cleValide) return rep(403, "Forbidden");
    const url = new URL(`https://api.zotero.org${r.chemin}`);
    const q = url.searchParams;
    const chemin = url.pathname;
    if (chemin === "/keys/current") return rep(200, { key: r.cle, userID: this.utilisateur, username: "demo", access: { user: this.droits } });
    if (chemin === "/items/new") {
      const champs = SCHEMA[q.get("itemType") ?? ""];
      if (!champs) return rep(400, "Invalid itemType");
      return rep(200, { itemType: q.get("itemType"), ...Object.fromEntries(champs.map((c) => [c, ""])), creators: [{ creatorType: "author", firstName: "", lastName: "" }], tags: [], collections: [], relations: {} });
    }
    const prefixe = `/users/${this.utilisateur}`;
    if (!chemin.startsWith(prefixe)) return rep(404, "Not found");
    const reste = chemin.slice(prefixe.length);
    const paginer = (liste: Objet[]) => {
      const debut = Number(q.get("start") ?? 0),
        limite = Number(q.get("limit") ?? 25);
      return rep(
        200,
        liste.slice(debut, debut + limite).map((o) => ({ key: o.key, version: o.version, data: o })),
        { total: liste.length },
      );
    };
    if (r.methode === "GET") {
      if (reste === "/collections") return paginer([...this.collections.values()]);
      if (reste === "/items" && q.get("format") === "versions") return rep(200, Object.fromEntries([...this.items.values()].map((o) => [o.key, o.version])));
      if (reste === "/items/top") return paginer([...this.items.values()].filter((o) => !o.parentItem));
      if (reste === "/items") return paginer([...this.items.values()].filter((o) => !q.get("itemType") || o.itemType === q.get("itemType")));
      return rep(404, "Not found");
    }
    if (r.methode !== "POST") return rep(405, "Method not allowed");
    let lot: Record<string, unknown>[];
    try {
      lot = JSON.parse(r.corps ?? "") as Record<string, unknown>[];
    } catch {
      return rep(400, "Invalid JSON");
    }
    if (!Array.isArray(lot) || lot.length > 50) return rep(413, "Too many objects");
    const collection = reste === "/collections";
    if (!collection && reste !== "/items") return rep(404, "Not found");
    const magasin = collection ? this.collections : this.items;
    const version = this.version + 1;
    const resultat = { successful: {} as Record<string, unknown>, success: {} as Record<string, string>, unchanged: {} as Record<string, string>, failed: {} as Record<string, unknown> };
    lot.forEach((o, i) => {
      const k = String(i);
      const echec = (code: number, message: string) => (resultat.failed[k] = { key: o.key, code, message });
      const ancien = typeof o.key === "string" ? magasin.get(o.key) : undefined;
      if (typeof o.key === "string" && !ancien) return echec(404, "Item not found");
      if (ancien && o.version !== ancien.version) return echec(412, "Item has been modified since specified version");
      if (!collection) {
        const type = String(o.itemType ?? ancien?.itemType ?? "");
        const permis = SCHEMA[type] ?? ENFANTS[type];
        if (!permis) return echec(400, `Invalid itemType '${type}'`);
        for (const c of Object.keys(o)) if (!STRUCTURE.includes(c) && !permis.includes(c)) return echec(400, `'${c}' is not a valid field for type '${type}'`);
        const parent = o.parentItem;
        if (parent !== undefined && (typeof parent !== "string" || !this.items.has(parent))) return echec(400, "Parent item not found");
        if (type === "attachment" && o.linkMode === "linked_file" && typeof o.path === "string" && !o.path) return echec(400, "path is required");
      }
      const key = ancien?.key ?? this.cle();
      const nouveau: Objet = { ...(ancien ?? {}), ...o, key, version } as Objet;
      if (JSON.stringify({ ...ancien, version: 0 }) === JSON.stringify({ ...nouveau, version: 0 })) return void (resultat.unchanged[k] = key);
      magasin.set(key, nouveau);
      // Comme Zotero peut le faire : un enfant ajouté change la version de son parent.
      const parent = !ancien && typeof nouveau.parentItem === "string" ? this.items.get(nouveau.parentItem) : undefined;
      if (parent) parent.version = version;
      resultat.successful[k] = { key, version, data: nouveau };
      resultat.success[k] = key;
    });
    if (Object.keys(resultat.success).length) this.version = version;
    return rep(200, resultat);
  }
}
