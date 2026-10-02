import { describe, expect, it } from "vitest";
import { ZoteroFactice } from "@interface/zoteroFactice";
import { versRis } from "../core/exports";
import { lireReference, PARAMETRES_PAR_DEFAUT, type Parametres, type Reference } from "../core/modele";
import {
  ClientZotero,
  compter,
  envoyer,
  etatVide,
  lireEtatZotero,
  lireZotero,
  noteZotero,
  planifier,
  verifierCle,
  versZotero,
  type EtatZotero,
  type FicheAEnvoyer,
} from "../core/zotero";

const P: Parametres = { ...PARAMETRES_PAR_DEFAUT, axes: [{ numero: 2, intitule: "Contact pneu-chaussée" }] };
const PREFIXE = "/users/4242";

const ref = (b: Record<string, unknown>): Reference => lireReference(b);
const olard = ref({
  cle: "olard2003general",
  titre: "General 2S2P1D model and relation between the linear viscoelastic behaviours of bituminous binders and mixes",
  auteurs: "Olard, F.; Di Benedetto, H.",
  annee: 2003,
  typeRis: "JOUR",
  support: "Road Materials and Pavement Design",
  volume: "4",
  numero: "2",
  pages: "185-224",
  doi: "https://doi.org/10.1080/14680629.2003.9689946",
  axe: 2,
  priorite: "INCONTOURNABLE",
  statut: "Lu",
  fichierPdf: "BIB-020_Olard-DiBenedetto_2003_General-2S2P1D-model.pdf",
  contribution: "Le modèle 2S2P1D.",
  notes: { apport: "Liant et enrobé <même> modèle." },
});
const burmister = ref({ cle: "burmister1945", titre: "The general theory of stresses and displacements in layered systems", auteurs: "Burmister, D. M.", annee: 1945, typeRis: "JOUR" });
const tielking = ref({ cle: "tielking1989", titre: "Aircraft tire pavement pressure distribution", auteurs: "Tielking, J. T.", annee: 1989, typeRis: "RPRT", editeur: "Texas A&M", doi: "10.1000/tielking", fichierPdf: "absent.pdf" });
const double = ref({ cle: "x", titre: "A study of rutting in airfield pavements", auteurs: "Doe, J.", annee: 2010, typeRis: "CONF" });
const thèse = ref({ cle: "david2026", titre: "Chaussées aéronautiques", auteurs: "David, L.", annee: 2026, typeRis: "THES", editeur: "ENTPE" });

const FICHES: FicheAEnvoyer[] = [
  { id: "BIB-020", ref: olard },
  { id: "BIB-065", ref: burmister },
  { id: "BIB-003", ref: tielking },
  { id: "BIB-100", ref: double },
  { id: "BIB-101", ref: thèse },
];
const PDF = new Set([olard.fichierPdf]);

function monde() {
  const z = new ZoteroFactice();
  const client = new ClientZotero((r) => z.traiter({ ...r, cle: z.cleValide }), async () => {});
  // Déjà dans Zotero : Burmister (titre, avec une étiquette perso et son PDF), Tielking (DOI), deux homonymes.
  const kBurmister = z.ajouter({ itemType: "journalArticle", title: "The General Theory of Stresses and Displacements in Layered Systems", date: "1945-02", tags: [{ tag: "multicouche" }], extra: "Lu en master" });
  z.items.set("PDFBURMI", { key: "PDFBURMI", version: 2, itemType: "attachment", parentItem: kBurmister, linkMode: "imported_file", contentType: "application/pdf", filename: "burmister.pdf" });
  const kTielking = z.ajouter({ itemType: "report", title: "Tire pressure (old title)", DOI: "10.1000/TIELKING" });
  z.ajouter({ itemType: "conferencePaper", title: "A study of rutting in airfield pavements", date: "2010" });
  z.ajouter({ itemType: "conferencePaper", title: "A Study of Rutting in Airfield Pavements", date: "2010" });
  let etat: EtatZotero = etatVide();
  const sauver = async (e: EtatZotero) => void (etat = structuredClone(e));
  const passe = async () => {
    const inst = await lireZotero(client, PREFIXE);
    const plan = planifier(FICHES, P, etat, inst, "users/4242", PDF);
    const rapport = await envoyer({ client, prefixe: PREFIXE, fiches: FICHES, parametres: P, plan, instantane: inst, etat, pdfPresents: PDF, sauver, maintenant: "2026-10-02T10:00:00Z" });
    return { plan, rapport };
  };
  return { z, client, passe, kBurmister, kTielking, etat: () => etat };
}

describe("Zotero : conversion d'une fiche", () => {
  it("article : champs, auteurs, étiquettes, DOI nu, identifiant Thèse dans Extra", () => {
    const c = versZotero("BIB-020", olard, P);
    expect(c.itemType).toBe("journalArticle");
    expect(c.champs).toMatchObject({ title: olard.titre, date: "2003", publicationTitle: "Road Materials and Pavement Design", issue: "2", DOI: "10.1080/14680629.2003.9689946", citationKey: "olard2003general" });
    expect(c.creators).toEqual([
      { creatorType: "author", lastName: "Olard", firstName: "F." },
      { creatorType: "author", lastName: "Di Benedetto", firstName: "H." },
    ]);
    expect(c.tags).toEqual(["Thèse", "Thèse · Axe 2 - Contact pneu-chaussée", "Thèse · INCONTOURNABLE", "Thèse · Lu"]);
    expect(c.extra).toEqual(["Thèse: BIB-020"]);
    expect(versZotero("BIB-1", ref({ titre: "x", typeRis: "ELEC", auteurs: "Airbus S.A.S." }), P)).toMatchObject({ itemType: "document", creators: [{ creatorType: "author", name: "Airbus S.A.S." }] });
  });

  it("note : échappée, vide quand il n'y a rien à noter", () => {
    const n = noteZotero("BIB-020", olard);
    expect(n).toContain("<h1>Notes de lecture — BIB-020</h1>");
    expect(n).toContain("Liant et enrobé &lt;même&gt; modèle.");
    expect(noteZotero("BIB-065", burmister)).toBe("");
  });

  it("état : lecture tolérante", () => {
    expect(lireEtatZotero(null)).toEqual(etatVide());
    expect(lireEtatZotero("{")).toEqual(etatVide());
    const e = lireEtatZotero(JSON.stringify({ bibliotheque: "users/1", collection: "C", liens: { "BIB-001": { item: "K", version: 3, pdf: "" }, "BIB-002": { item: 4 } } }));
    expect(e.liens).toEqual({ "BIB-001": { item: "K", version: 3, empreinte: "", pdf: null, note: null } });
  });
});

describe("Zotero : envoi", () => {
  it("premier envoi : reconnaît l'existant, crée le reste, lie le PDF, garde ce qui est à l'utilisateur", async () => {
    const m = monde();
    const { plan, rapport } = await m.passe();
    expect(compter(plan)).toMatchObject({ creer: 2, associer: 2, douteuse: 1 });
    expect(plan.actions.find((a) => a.id === "BIB-065")).toMatchObject({ genre: "associer", item: m.kBurmister, par: "titre" });
    expect(plan.actions.find((a) => a.id === "BIB-003")).toMatchObject({ genre: "associer", item: m.kTielking, par: "DOI" });
    expect(plan.pdfAbsents).toEqual(["BIB-003"]);
    expect(rapport).toMatchObject({ crees: 2, associees: 2, douteuses: 1, pdfLies: 1, notes: 1, echecs: [], pdfDejaLa: [] });
    expect(rapport.envoyees.sort()).toEqual(["BIB-003", "BIB-020", "BIB-065", "BIB-101"]);

    const items = [...m.z.items.values()];
    const coll = [...m.z.collections.values()];
    expect(coll.map((c) => c.name)).toEqual(["Thèse"]);
    const b = m.z.items.get(m.kBurmister)!;
    expect(b.tags).toEqual([{ tag: "multicouche" }, { tag: "Thèse" }, { tag: "Thèse · À lire" }]);
    expect(b.extra).toBe("Lu en master\nThèse: BIB-065");
    expect(b.collections).toEqual([coll[0]!.key]);
    expect(b.citationKey).toBe("burmister1945");
    expect(m.z.items.get(m.kTielking)).toMatchObject({ title: tielking.titre, institution: "Texas A&M", DOI: "10.1000/TIELKING" });
    const pdf = items.find((i) => i.linkMode === "linked_file")!;
    expect(pdf).toMatchObject({ path: "attachments:BIB-020_Olard-DiBenedetto_2003_General-2S2P1D-model.pdf", contentType: "application/pdf" });
    const olardZ = m.z.items.get(String(pdf.parentItem))!;
    expect(olardZ).toMatchObject({ itemType: "journalArticle", DOI: "10.1080/14680629.2003.9689946", extra: "Thèse: BIB-020" });
    expect(items.filter((i) => i.itemType === "note")).toHaveLength(1);
    expect(m.z.items.get(String(items.find((i) => i.title === "Chaussées aéronautiques")!.key))).toMatchObject({ itemType: "thesis", university: "ENTPE" });
    // Le PDF déjà stocké de Burmister n'est pas doublé (Burmister n'a pas de PDF dans Thèse de toute façon).
    expect(items.filter((i) => i.parentItem === m.kBurmister)).toHaveLength(1);
  });

  it("deuxième envoi : rien ne bouge ; une fiche modifiée est mise à jour sans doublon", async () => {
    const m = monde();
    await m.passe();
    const avant = m.z.items.size;
    const deux = await m.passe();
    expect(compter(deux.plan)).toMatchObject({ inchangee: 4, douteuse: 1, maj: 0, creer: 0 });
    expect(m.z.items.size).toBe(avant);

    olard.notes.apport = "Changé.";
    olard.annee = 2004;
    try {
      const trois = await m.passe();
      expect(compter(trois.plan)).toMatchObject({ maj: 1, inchangee: 3 });
      expect(trois.plan.actions.find((a) => a.id === "BIB-020")).toMatchObject({ genre: "maj", ecrase: false });
      expect(m.z.items.size).toBe(avant);
      const note = [...m.z.items.values()].find((i) => i.itemType === "note")!;
      expect(note.note).toContain("Changé.");
    } finally {
      olard.notes.apport = "Liant et enrobé <même> modèle.";
      olard.annee = 2003;
    }
  });

  it("une entrée modifiée dans Zotero est signalée (écrasée) ; une entrée supprimée est recréée", async () => {
    const m = monde();
    await m.passe();
    const b = m.z.items.get(m.kBurmister)!;
    m.z.items.set(m.kBurmister, { ...b, title: "Modifié dans Zotero", version: ++m.z.version });
    const k = m.etat().liens["BIB-101"]!.item;
    m.z.items.delete(k);
    const { plan, rapport } = await m.passe();
    expect(plan.actions.find((a) => a.id === "BIB-065")).toMatchObject({ genre: "maj", ecrase: true });
    expect(plan.actions.find((a) => a.id === "BIB-101")).toMatchObject({ genre: "recreer" });
    expect(rapport.crees).toBe(1);
    expect(m.z.items.get(m.kBurmister)!.title).toBe(burmister.titre);
  });

  it("un envoi interrompu ne duplique rien à la reprise", async () => {
    const m = monde();
    const inst = await lireZotero(m.client, PREFIXE);
    const plan = planifier(FICHES, P, etatVide(), inst, "users/4242", PDF);
    let etat = etatVide();
    let appels = 0;
    // Le transport tombe après l'écriture des entrées (au moment des PDF et notes).
    const fragile = new ClientZotero(async (r) => {
      if (r.methode === "POST" && r.corps?.includes('"parentItem"') && appels++ === 0) return { code: null, corps: "", version: null, total: null, attente: null, erreur: "connexion perdue" };
      return m.z.traiter({ ...r, cle: m.z.cleValide });
    }, async () => {});
    await expect(
      envoyer({ client: fragile, prefixe: PREFIXE, fiches: FICHES, parametres: P, plan, instantane: inst, etat, pdfPresents: PDF, sauver: async (e) => void (etat = structuredClone(e)) }),
    ).rejects.toThrow("connexion perdue");
    const entrees = m.z.items.size;
    const reprise = planifier(FICHES, P, etat, await lireZotero(m.client, PREFIXE), "users/4242", PDF);
    expect(compter(reprise)).toMatchObject({ creer: 0, maj: 4 });
    await envoyer({ client: m.client, prefixe: PREFIXE, fiches: FICHES, parametres: P, plan: reprise, instantane: await lireZotero(m.client, PREFIXE), etat, pdfPresents: PDF, sauver: async (e) => void (etat = structuredClone(e)) });
    expect(m.z.items.size).toBe(entrees + 2); // le PDF lié et la note, une seule fois
  });

  it("clé : refusée, ou sans les droits nécessaires", async () => {
    const z = new ZoteroFactice();
    await expect(verifierCle(new ClientZotero((r) => z.traiter({ ...r, cle: "MAUVAISE" })))).rejects.toThrow("refuse la clé");
    const sansNotes = new ZoteroFactice("K", { library: true, notes: false, write: true });
    await expect(verifierCle(new ClientZotero((r) => sansNotes.traiter({ ...r, cle: "K" })))).rejects.toThrow("notes");
    await expect(verifierCle(new ClientZotero((r) => z.traiter({ ...r, cle: z.cleValide })))).resolves.toEqual({ utilisateur: 4242, nom: "demo" });
  });

  it("un autre compte Zotero : on repart de l'appariement", async () => {
    const m = monde();
    const inst = await lireZotero(m.client, PREFIXE);
    const ancien: EtatZotero = { ...etatVide("users/1"), liens: { "BIB-020": { item: "ZZZZZZZZ", version: 1, empreinte: "x", pdf: null, note: null } } };
    const plan = planifier(FICHES, P, ancien, inst, "users/4242", PDF);
    expect(plan.autreCompte).toBe(true);
    expect(plan.actions.find((a) => a.id === "BIB-020")).toMatchObject({ genre: "creer" });
  });
});

describe("RIS avec les PDF", () => {
  it("L1 seulement quand un chemin est fourni ; sinon l'export reste celui de la macro", () => {
    const sans = versRis([olard], P);
    expect(sans).not.toContain("L1  -");
    const avec = versRis([olard], P, (r) => (r.fichierPdf ? `C:\\Espace\\bibliotheque\\pdf\\${r.fichierPdf}` : null));
    expect(avec).toContain(`L1  - C:\\Espace\\bibliotheque\\pdf\\${olard.fichierPdf}\r\nER  - `);
    expect(avec.replace(/L1 {2}- [^\r]*\r\n/, "")).toBe(sans);
  });
});
