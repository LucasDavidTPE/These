/** Lecture et écriture des versions dans l'espace ; lecture des .docx dans leur dossier. */
import { joindre, type Fichiers } from "@noyau/stockage";
import { IGNORES, type Source } from "../core/latex";
import { dossierManuscrit, empreinte, lireVersion, nomVersion, type Version } from "../core/versions";

/** Les .docx du dossier des manuscrits et de ses sous-dossiers directs (pas les « ~$… » de Word). */
export async function listerManuscrits(fs: Fichiers): Promise<string[]> {
  const docx = (n: string) => /\.docx$/i.test(n) && !n.startsWith("~$");
  const r: string[] = [];
  for (const e of await fs.listDir("")) {
    if (e.kind === "file" && docx(e.name)) r.push(e.name);
    else if (e.kind === "dir" && !e.name.startsWith(".")) {
      for (const f of await fs.listDir(e.name).catch(() => [])) if (f.kind === "file" && docx(f.name)) r.push(`${e.name}/${f.name}`);
    }
  }
  return r.sort((a, b) => a.localeCompare(b, "fr"));
}

const nomSeul = (chemin: string) => chemin.split("/").pop()!;

/** Versions d'un manuscrit, la plus récente d'abord. */
export async function chargerVersions(espace: Fichiers, chemin: string): Promise<Version[]> {
  const dossier = dossierManuscrit(nomSeul(chemin));
  if (!(await espace.exists(dossier))) return [];
  const noms = (await espace.listDir(dossier)).map((e) => e.name);
  const versions: Version[] = [];
  for (const n of noms.filter((x) => x.endsWith(".json"))) {
    const docx = n.replace(/\.json$/, ".docx");
    if (!noms.includes(docx)) continue;
    try {
      versions.push(lireVersion(JSON.parse(await espace.readText(joindre(dossier, n))), docx));
    } catch {
      /* fiche illisible : la version reste accessible dans le dossier */
    }
  }
  return versions.sort((a, b) => (a.fichier < b.fichier ? 1 : -1));
}

export async function enregistrerVersion(espace: Fichiers, octets: Uint8Array, chemin: string, note: string, poste: string, date: string): Promise<Version> {
  const dossier = dossierManuscrit(nomSeul(chemin));
  await espace.ensureDir(dossier);
  let base = nomVersion(date, note);
  for (let i = 2; await espace.exists(joindre(dossier, `${base}.json`)); i++) base = `${nomVersion(date, note)}-${i}`;
  const v: Version = { fichier: `${base}.docx`, date, poste, note: note.trim(), taille: octets.length, empreinte: empreinte(octets) };
  await espace.writeBytesAtomic(joindre(dossier, v.fichier), octets);
  const fiche = { source: chemin, date: v.date, poste: v.poste, note: v.note, taille: v.taille, empreinte: v.empreinte };
  await espace.writeTextNew(joindre(dossier, `${base}.json`), JSON.stringify(fiche, null, 2) + "\n");
  return v;
}

/** Toutes les sources .tex sous la racine « latex », et les autres fichiers utiles (images, PDF). */
export async function parcourirLatex(fs: Fichiers, limite = 2000): Promise<{ sources: Source[]; autres: string[] }> {
  const sources: Source[] = [];
  const autres: string[] = [];
  const parcourir = async (dossier: string) => {
    for (const e of await fs.listDir(dossier).catch(() => [])) {
      const chemin = dossier ? `${dossier}/${e.name}` : e.name;
      if (e.kind === "dir") {
        if (!e.name.startsWith(".") && !IGNORES.includes(e.name.toLowerCase())) await parcourir(chemin);
      } else if (/\.tex$/i.test(e.name)) {
        if (sources.length < limite) sources.push({ chemin, texte: await fs.readText(chemin).catch(() => "") });
      } else if (/\.(pdf|png|jpe?g|eps|svg)$/i.test(e.name)) autres.push(chemin);
    }
  };
  await parcourir("");
  return { sources, autres };
}
