/** Présentations et modèles dans l'espace : `presentations/<nom>.md` et `presentations/modeles/<nom>.json`. */
import type { Contexte } from "@interface/contexte";
import { joindre, type Fichiers } from "@noyau/stockage";
import { DOSSIER_MODELES, DOSSIER_PRESENTATIONS, lireModele, MODELES_DE_BASE, slugModele, type ModelePresentation } from "../core/modele";
import { dimensionsImage, type ImageChargee } from "../core/pptx";
import { imagesDe, type Presentation } from "../core/presentation";

export async function listerPresentations(fs: Fichiers): Promise<string[]> {
  if (!(await fs.exists(DOSSIER_PRESENTATIONS))) return [];
  return (await fs.listDir(DOSSIER_PRESENTATIONS))
    .filter((e) => e.kind === "file" && e.name.endsWith(".md"))
    .map((e) => e.name.replace(/\.md$/, ""))
    .sort((a, b) => a.localeCompare(b, "fr"));
}

export async function enregistrerPresentation(fs: Fichiers, nom: string, texte: string): Promise<void> {
  await fs.ensureDir(DOSSIER_PRESENTATIONS);
  await fs.writeTextAtomic(joindre(DOSSIER_PRESENTATIONS, `${nom}.md`), texte.endsWith("\n") ? texte : `${texte}\n`);
}

/** Modèles de base, puis ceux de l'utilisateur (un fichier illisible est ignoré). */
export async function chargerModeles(fs: Fichiers): Promise<ModelePresentation[]> {
  const perso: ModelePresentation[] = [];
  if (await fs.exists(DOSSIER_MODELES)) {
    for (const e of await fs.listDir(DOSSIER_MODELES)) {
      if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
      try {
        perso.push(lireModele(JSON.parse(await fs.readText(joindre(DOSSIER_MODELES, e.name)))));
      } catch {
        // modèle illisible : on garde les autres
      }
    }
  }
  perso.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return [...MODELES_DE_BASE, ...perso.filter((m) => !MODELES_DE_BASE.some((b) => slugModele(b.nom) === slugModele(m.nom)))];
}

export async function enregistrerModele(fs: Fichiers, m: ModelePresentation): Promise<void> {
  await fs.ensureDir(DOSSIER_MODELES);
  await fs.writeTextAtomic(joindre(DOSSIER_MODELES, `${slugModele(m.nom) || "modele"}.json`), JSON.stringify(m, null, 2) + "\n");
}

/**
 * Les images de la présentation : « figure:FIG-0001 » par la bibliothèque de Figures (action du
 * registre), sinon un chemin relatif à l'espace. Celles qu'on ne trouve pas sont listées.
 */
export async function resoudreImages(ctx: Contexte, p: Presentation): Promise<{ images: Map<string, ImageChargee>; manquantes: string[] }> {
  const images = new Map<string, ImageChargee>();
  const manquantes: string[] = [];
  for (const src of imagesDe(p)) {
    let octets: Uint8Array | null = null;
    try {
      if (src.startsWith("figure:")) {
        if (ctx.registre.aAction("figures.image")) {
          const r = (await ctx.registre.executer("figures.image", { ctx, id: src.slice("figure:".length).trim() })) as { octets: Uint8Array | null } | null;
          octets = r?.octets ?? null;
        }
      } else if (ctx.espace && (await ctx.espace.fichiers.exists(src))) octets = await ctx.espace.fichiers.readBytes(src);
    } catch {
      octets = null;
    }
    const d = octets ? dimensionsImage(octets) : null;
    if (octets && d) images.set(src, { octets, ...d });
    else manquantes.push(src);
  }
  return { images, manquantes };
}
