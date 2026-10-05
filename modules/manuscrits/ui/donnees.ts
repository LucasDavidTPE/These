/** Plan, versions et lecture des .docx : tout ce que la page Manuscrits lit et écrit. */
import { joindre, Introuvable, type Fichiers } from "@noyau/stockage";
import { dossierManuscrit, dossierVersions, empreinte, lireVersion, nomVersion, type Version } from "../core/versions";
import { DOSSIER_MANUSCRITS, ecrireManuscrit, FICHIER_PLAN, fichierPlan, dossierProjet, lireManuscrit, TYPES_DOCUMENT, type Manuscrit, type TypeDocument } from "../core/plan";
import { dossierRetour, dossierRetours, ecrireRetour, FICHIER_RETOUR, lireRetour, type Retour } from "../core/retours";

export interface Projet {
  id: string;
  titre: string;
  type: TypeDocument;
}

/** Les documents de l'espace (thèse, articles, rapports) : les dossiers de `manuscrits/` qui contiennent un `manuscrit.json`, thèse d'abord. */
export async function listerProjets(espace: Fichiers): Promise<Projet[]> {
  if (!(await espace.exists(DOSSIER_MANUSCRITS))) return [];
  const projets: Projet[] = [];
  for (const e of await espace.listDir(DOSSIER_MANUSCRITS)) {
    if (e.kind !== "dir" || e.name.startsWith(".")) continue;
    const m = await chargerPlan(espace, e.name);
    if (m) projets.push({ id: e.name, titre: m.titre, type: m.type });
  }
  const rang = (t: TypeDocument) => TYPES_DOCUMENT.findIndex((x) => x[0] === t);
  return projets.sort((a, b) => rang(a.type) - rang(b.type) || a.titre.localeCompare(b.titre, "fr"));
}

export async function chargerPlan(espace: Fichiers, projet: string): Promise<Manuscrit | null> {
  try {
    return lireManuscrit(JSON.parse(await espace.readText(fichierPlan(projet))));
  } catch (e) {
    if (e instanceof Introuvable || (e as { code?: string }).code === "not-found") return null;
    if (e instanceof SyntaxError) throw new Error(`${fichierPlan(projet)} est illisible (JSON abîmé).`, { cause: e });
    throw e;
  }
}

export async function ecrirePlan(espace: Fichiers, projet: string, m: Manuscrit): Promise<void> {
  await espace.ensureDir(dossierProjet(projet));
  await espace.writeTextAtomic(`${dossierProjet(projet)}/${FICHIER_PLAN}`, ecrireManuscrit(m));
}

/** Les `.docx` d'un dossier et de ses sous-dossiers (jusqu'à `profondeur`), chemins relatifs, sans les « ~$… » de Word. */
export async function listerDocx(fs: Fichiers, profondeur = 3): Promise<string[]> {
  const r: string[] = [];
  const parcourir = async (dossier: string, niveau: number) => {
    for (const e of await fs.listDir(dossier).catch(() => [])) {
      const chemin = joindre(dossier, e.name);
      if (e.kind === "file" && /\.docx$/i.test(e.name) && !e.name.startsWith("~$")) r.push(chemin);
      else if (e.kind === "dir" && !e.name.startsWith(".") && niveau < profondeur) await parcourir(chemin, niveau + 1);
    }
  };
  await parcourir("", 1);
  return r;
}

export interface VersionLue extends Version {
  /** Dossier de la copie dans l'espace. */
  dossier: string;
}

async function lireDossierVersions(espace: Fichiers, dossier: string): Promise<VersionLue[]> {
  if (!(await espace.exists(dossier))) return [];
  const noms = (await espace.listDir(dossier)).map((e) => e.name);
  const versions: VersionLue[] = [];
  for (const n of noms.filter((x) => x.endsWith(".json"))) {
    const docx = n.replace(/\.json$/, ".docx");
    if (!noms.includes(docx)) continue;
    try {
      versions.push({ ...lireVersion(JSON.parse(await espace.readText(joindre(dossier, n))), docx), dossier });
    } catch {
      /* fiche illisible : la version reste accessible dans le dossier */
    }
  }
  return versions;
}

/** Versions d'une partie, la plus récente d'abord ; celles d'avant 1.13 (un dossier par nom de fichier) sont reprises. */
export async function chargerVersions(espace: Fichiers, projet: string, partie: string, nomFichier: string): Promise<VersionLue[]> {
  const [nouvelles, anciennes] = await Promise.all([lireDossierVersions(espace, dossierVersions(projet, partie)), lireDossierVersions(espace, dossierManuscrit(nomFichier))]);
  return [...nouvelles, ...anciennes].sort((a, b) => (a.fichier < b.fichier ? 1 : -1));
}

export async function enregistrerVersion(espace: Fichiers, projet: string, partie: string, source: string, octets: Uint8Array, note: string, poste: string, date: string): Promise<VersionLue> {
  const dossier = dossierVersions(projet, partie);
  await espace.ensureDir(dossier);
  let base = nomVersion(date, note);
  for (let i = 2; await espace.exists(joindre(dossier, `${base}.json`)); i++) base = `${nomVersion(date, note)}-${i}`;
  const v: Version = { fichier: `${base}.docx`, date, poste, note: note.trim(), taille: octets.length, empreinte: empreinte(octets) };
  await espace.writeBytesAtomic(joindre(dossier, v.fichier), octets);
  const fiche = { source, date: v.date, poste: v.poste, note: v.note, taille: v.taille, empreinte: v.empreinte };
  await espace.writeTextNew(joindre(dossier, `${base}.json`), JSON.stringify(fiche, null, 2) + "\n");
  return { ...v, dossier };
}

// ---- Retours reçus ----

/** Retours d'un manuscrit, le plus récemment reçu d'abord. Un dossier sans `retour.json` lisible est ignoré. */
export async function listerRetours(espace: Fichiers, projet: string): Promise<Retour[]> {
  const dossier = dossierRetours(projet);
  if (!(await espace.exists(dossier))) return [];
  const retours: Retour[] = [];
  for (const e of await espace.listDir(dossier)) {
    if (e.kind !== "dir" || e.name.startsWith(".")) continue;
    try {
      const r = lireRetour(JSON.parse(await espace.readText(joindre(dossier, e.name, FICHIER_RETOUR))));
      if (r) retours.push({ ...r, id: e.name });
    } catch {
      /* dossier incomplet (ajout interrompu) ou fiche abîmée : ignoré */
    }
  }
  return retours.sort((a, b) => (a.recu === b.recu ? (a.id < b.id ? 1 : -1) : a.recu < b.recu ? 1 : -1));
}

/** Copie le fichier reçu puis écrit la fiche : un ajout interrompu ne laisse pas de retour à moitié écrit. */
export async function enregistrerRetour(espace: Fichiers, projet: string, retour: Retour, octets: Uint8Array): Promise<void> {
  const dossier = dossierRetour(projet, retour.id);
  await espace.ensureDir(dossier);
  await espace.writeBytesAtomic(joindre(dossier, retour.fichier), octets);
  await espace.writeTextAtomic(joindre(dossier, FICHIER_RETOUR), ecrireRetour(retour));
}

export async function majRetour(espace: Fichiers, projet: string, retour: Retour): Promise<void> {
  await espace.writeTextAtomic(joindre(dossierRetour(projet, retour.id), FICHIER_RETOUR), ecrireRetour(retour));
}

/** Range un retour dans `retours/.supprimes/` (rien n'est effacé). */
export async function retirerRetour(espace: Fichiers, projet: string, id: string): Promise<void> {
  const rebut = joindre(dossierRetours(projet), ".supprimes");
  await espace.ensureDir(rebut);
  let cible = joindre(rebut, id);
  for (let i = 2; await espace.exists(cible); i++) cible = joindre(rebut, `${id}-${i}`);
  await espace.rename(dossierRetour(projet, id), cible);
}
