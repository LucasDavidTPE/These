/** Lecture et écriture des campagnes dans l'espace (un dossier par campagne). */
import { detecterCopieConflit, DejaExistant, joindre, jsonStable, type Fichiers, type Probleme } from "@noyau/stockage";
import { slugifier } from "@noyau/texte";
import type { ApercuEssai } from "../core/courbes";
import { DOSSIER, lireCampagne, lireEssai, type Campagne, type Essai } from "../core/modele";

export interface Note {
  fichier: string;
  date: string;
  titre: string;
  texte: string;
}

export interface CampagneChargee {
  slug: string;
  campagne: Campagne;
  essais: Record<string, Essai>;
  notes: Note[];
  images: string[];
  /** Aperçu du premier essai qui en a un (galerie). */
  apercu: ApercuEssai | null;
}

async function lister(fs: Fichiers, chemin: string) {
  return (await fs.exists(chemin)) ? fs.listDir(chemin) : [];
}

async function lireJson<T>(fs: Fichiers, chemin: string, lire: (b: unknown) => T, problemes: Probleme[]): Promise<T | null> {
  try {
    return lire(JSON.parse(await fs.readText(chemin)));
  } catch (e) {
    problemes.push({ type: "illisible", chemin, detail: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

function conflits(dossier: string, noms: string[], original: string, problemes: Probleme[]) {
  for (const n of noms) {
    const c = detecterCopieConflit(n, [original]);
    if (c) problemes.push({ type: "conflit", dossier, conflit: c });
  }
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function chargerCampagnes(fs: Fichiers): Promise<{ campagnes: CampagneChargee[]; problemes: Probleme[] }> {
  const problemes: Probleme[] = [];
  const campagnes: CampagneChargee[] = [];
  for (const d of (await lister(fs, DOSSIER)).filter((e) => e.kind === "dir" && !e.name.startsWith("."))) {
    const base = joindre(DOSSIER, d.name);
    const fichiers = (await fs.listDir(base)).map((e) => e.name);
    conflits(base, fichiers, "campagne.json", problemes);
    if (!fichiers.includes("campagne.json")) continue;
    const campagne = await lireJson(fs, joindre(base, "campagne.json"), lireCampagne, problemes);
    if (!campagne) continue;
    const essais: Record<string, Essai> = {};
    let apercu: ApercuEssai | null = null;
    for (const e of (await lister(fs, joindre(base, "essais"))).filter((x) => x.kind === "dir")) {
      const dossierEssai = joindre(base, "essais", e.name);
      const noms = (await fs.listDir(dossierEssai)).map((x) => x.name);
      if (!apercu && noms.includes("apercu.json")) apercu = await lireJson(fs, joindre(dossierEssai, "apercu.json"), (b) => b as ApercuEssai, problemes);
      conflits(dossierEssai, noms, "essai.json", problemes);
      essais[e.name] = noms.includes("essai.json") ? ((await lireJson(fs, joindre(dossierEssai, "essai.json"), lireEssai, problemes)) ?? lireEssai({})) : lireEssai({});
    }
    const notes: Note[] = [];
    for (const n of (await lister(fs, joindre(base, "notes"))).filter((x) => x.kind === "file" && x.name.endsWith(".md"))) {
      const texte = await fs.readText(joindre(base, "notes", n.name));
      const titre = /^# (.*)$/m.exec(texte)?.[1] ?? n.name;
      notes.push({ fichier: n.name, date: n.name.slice(0, 10), titre, texte: texte.replace(/^# .*\n+/, "") });
    }
    notes.sort((a, b) => (a.fichier < b.fichier ? 1 : -1));
    const images = (await lister(fs, joindre(base, "images"))).filter((x) => x.kind === "file" && /\.(png|jpe?g|gif|webp|bmp)$/i.test(x.name)).map((x) => x.name);
    campagnes.push({ slug: d.name, campagne, essais, notes, images, apercu });
  }
  return { campagnes, problemes };
}

/** Crée le dossier d'une campagne (nom lisible, rendu unique) et renvoie son slug. */
export async function creerCampagne(fs: Fichiers, c: Campagne, essais: Record<string, Essai> = {}): Promise<string> {
  await fs.ensureDir(DOSSIER);
  const base = slugifier(c.titre) || "campagne";
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    try {
      await fs.createDir(joindre(DOSSIER, slug));
    } catch (e) {
      if (e instanceof DejaExistant || (e as { code?: string }).code === "already-exists") continue;
      throw e;
    }
    await fs.writeTextNew(joindre(DOSSIER, slug, "campagne.json"), jsonStable(c));
    for (const [nom, e] of Object.entries(essais)) await enregistrerEssai(fs, slug, nom, e);
    return slug;
  }
  throw new Error("Impossible de créer le dossier de la campagne.");
}

export const enregistrerCampagne = (fs: Fichiers, slug: string, c: Campagne) => fs.writeTextAtomic(joindre(DOSSIER, slug, "campagne.json"), jsonStable(c));

export async function enregistrerEssai(fs: Fichiers, slug: string, nom: string, e: Essai) {
  const dossier = joindre(DOSSIER, slug, "essais", nom.replace(/[\\/:*?"<>|]/g, "_"));
  await fs.ensureDir(dossier);
  await fs.writeTextAtomic(joindre(dossier, "essai.json"), jsonStable(e));
}

export async function ajouterNote(fs: Fichiers, slug: string, titre: string, texte: string) {
  const dossier = joindre(DOSSIER, slug, "notes");
  await fs.ensureDir(dossier);
  const base = `${aujourdhui()}_${slugifier(titre) || "note"}`;
  for (let i = 1; i < 100; i++) {
    try {
      await fs.writeTextNew(joindre(dossier, `${i === 1 ? base : `${base}-${i}`}.md`), `# ${titre || "Note"}\n\n${texte.trim()}\n`);
      return;
    } catch (e) {
      if (!(e instanceof DejaExistant) && (e as { code?: string }).code !== "already-exists") throw e;
    }
  }
}

export async function ajouterImage(fs: Fichiers, slug: string, nom: string, octets: Uint8Array) {
  const dossier = joindre(DOSSIER, slug, "images");
  await fs.ensureDir(dossier);
  const point = nom.lastIndexOf(".");
  const ext = point > 0 ? nom.slice(point).toLowerCase() : ".png";
  const racine = slugifier(point > 0 ? nom.slice(0, point) : nom) || "image";
  await fs.writeBytesAtomic(joindre(dossier, `${aujourdhui()}_${racine}-${Date.now() % 100000}${ext}`), octets);
}

export async function enregistrerApercu(fs: Fichiers, slug: string, nom: string, a: ApercuEssai) {
  const dossier = joindre(DOSSIER, slug, "essais", nom.replace(/[\\/:*?"<>|]/g, "_"));
  await fs.ensureDir(dossier);
  await fs.writeTextAtomic(joindre(dossier, "apercu.json"), JSON.stringify(a) + "\n");
}
