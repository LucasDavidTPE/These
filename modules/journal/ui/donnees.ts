/** Notes du journal dans l'espace : lecture, création du jour (avec report des tâches), écriture. */
import type { Fichiers } from "@noyau/stockage";
import { cheminJour, DOSSIER_JOURNAL, estJour, nouvelleNote, precedent } from "../core/journal";

export async function listerJours(fs: Fichiers): Promise<string[]> {
  if (!(await fs.exists(DOSSIER_JOURNAL))) return [];
  return (await fs.listDir(DOSSIER_JOURNAL))
    .filter((e) => e.kind === "file" && e.name.endsWith(".md") && estJour(e.name.slice(0, -3)))
    .map((e) => e.name.slice(0, -3))
    .sort();
}

export async function lireNote(fs: Fichiers, jour: string): Promise<string | null> {
  return (await fs.exists(cheminJour(jour))) ? fs.readText(cheminJour(jour)) : null;
}

/** La note d'un jour qui n'existe pas encore : titre et tâches non faites de la note précédente. */
export async function brouillon(fs: Fichiers, jour: string): Promise<string> {
  const p = precedent(await listerJours(fs), jour);
  return nouvelleNote(jour, p ? await lireNote(fs, p) : null);
}

export async function ecrireNote(fs: Fichiers, jour: string, md: string): Promise<void> {
  await fs.ensureDir(DOSSIER_JOURNAL);
  await fs.writeTextAtomic(cheminJour(jour), md.endsWith("\n") ? md : `${md}\n`);
}

/** La note du jour, créée (avec le report) si elle n'existe pas. */
export async function noteDuJour(fs: Fichiers, jour: string): Promise<string> {
  const n = await lireNote(fs, jour);
  if (n !== null) return n;
  const b = await brouillon(fs, jour);
  await ecrireNote(fs, jour, b);
  return b;
}
