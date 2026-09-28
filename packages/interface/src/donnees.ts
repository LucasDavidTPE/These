/**
 * Données brutes vues par les modules (SPEC §4.1) : toujours à travers leur copie dans
 * l'espace. La source (disque de données du poste) n'est qu'un point d'entrée, jamais écrit.
 */
import { cheminCopie, donneesCopiees, estDansEspace, importerFichier, rangement } from "@noyau/espace/donnees";
import { lireReference, referenceDepuisChemin, resoudre } from "@noyau/poste/racines";
import type { Fichiers } from "@noyau/stockage";
import type { Contexte } from "./contexte";

type Ctx = Pick<Contexte, "espace" | "plateforme" | "racines">;

/** « essais:tsrst » + « Essai1 » → « essais:tsrst/Essai1 ». */
export function sousReference(reference: string, sous: string): string {
  return reference.endsWith(":") ? reference + sous : `${reference}/${sous}`;
}

/**
 * Dossier de données (référence de racine) : lister, lire. Un fichier lu est copié dans
 * l'espace ; sur un poste sans la source, les fichiers déjà copiés restent lisibles.
 */
export function fichiersDonnees(ctx: Ctx, reference: string): Fichiers {
  const copie = cheminCopie(reference);
  if (!copie) throw new Error(`Référence de données invalide : « ${reference} ».`);
  const r = resoudre(reference, ctx.racines);
  const source = r.ok ? ctx.plateforme.fichiers(r.chemin) : null;
  if (ctx.espace) return donneesCopiees(ctx.espace.fichiers, copie, source);
  if (!source) throw new Error(r.ok ? "" : r.message);
  return source;
}

/**
 * Fichier que l'utilisateur vient d'ouvrir (chemin absolu, contenu lu) : copié dans l'espace.
 * Renvoie ce qu'il faut garder pour le relire plus tard, depuis n'importe quel poste : une
 * référence de racine (« essais:… ») ou un chemin de l'espace (« donnees/importes/… »).
 */
export async function garderDansEspace(ctx: Ctx, chemin: string, octets: Uint8Array): Promise<string> {
  if (!ctx.espace) return referenceDepuisChemin(chemin, ctx.racines) ?? chemin;
  const fs = ctx.espace.fichiers;
  const { source, copie } = rangement(chemin, ctx.racines);
  if (!lireReference(source)) return importerFichier(fs, copie.slice(copie.lastIndexOf("/") + 1), octets);
  await fs.ensureDir(copie.slice(0, copie.lastIndexOf("/")));
  await fs.writeBytesAtomic(copie, octets);
  return source;
}

/**
 * Relit un fichier de mesure enregistré avec un dépouillement : par sa copie dans l'espace,
 * ou par sa source si elle est là. Un ancien chemin absolu est relu puis copié dans
 * l'espace : `source` est alors la nouvelle forme à garder.
 */
export async function lireFichierDonnees(ctx: Ctx, source: string): Promise<{ octets: Uint8Array; fichier: string; source: string }> {
  const fichier = source.slice(Math.max(source.lastIndexOf("/"), source.lastIndexOf("\\"), source.indexOf(":")) + 1);
  if (ctx.espace && estDansEspace(source)) return { octets: await ctx.espace.fichiers.readBytes(source), fichier, source };
  const ref = lireReference(source);
  if (ref) {
    const i = ref.chemin.lastIndexOf("/");
    const dossier = `${ref.racine}:${i < 0 ? "" : ref.chemin.slice(0, i)}`;
    try {
      return { octets: await fichiersDonnees(ctx, dossier).readBytes(fichier), fichier, source };
    } catch {
      throw new Error(`Le fichier de mesure ${source} n'est ni dans l'espace, ni sur ce poste (racine « ${ref.racine} »).`);
    }
  }
  // Ancien enregistrement : chemin absolu d'un poste.
  const i = Math.max(source.lastIndexOf("/"), source.lastIndexOf("\\"));
  const dossier = source.slice(0, i);
  if (i <= 0 || !(await ctx.plateforme.dossierExiste(dossier))) throw new Error(`Le fichier de mesure n'est pas sur ce poste (${source}).`);
  const octets = await ctx.plateforme.fichiers(dossier).readBytes(fichier);
  return { octets, fichier, source: await garderDansEspace(ctx, source, octets) };
}
