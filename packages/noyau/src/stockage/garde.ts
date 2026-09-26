/**
 * Garde contre les écrasements entre les deux PC. Scénario : le PC A affiche un objet,
 * le PC B le modifie, OneDrive synchronise, puis A enregistre sa version (périmée) :
 * sans garde, la modification de B serait perdue sans bruit. Ici, avant d'écrire un
 * fichier déjà lu, on vérifie qu'il n'a pas changé sur le disque depuis ; sinon on refuse.
 */
import type { Fichiers } from "./fichiers";

export class ModifieAilleurs extends Error {
  constructor(public chemin: string) {
    super(`« ${chemin} » a été modifié ailleurs (l'autre PC, via OneDrive) depuis son affichage. Rien n'a été écrasé : rechargez la page pour voir la version à jour, puis refaites votre modification.`);
    this.name = "ModifieAilleurs";
  }
}

export function avecGarde(fs: Fichiers): Fichiers {
  /** Dernier contenu connu (lu ou écrit par ce PC), par chemin. */
  const connus = new Map<string, string>();
  return {
    ...fs,
    listDir: (c) => fs.listDir(c),
    exists: (c) => fs.exists(c),
    readBytes: (c) => fs.readBytes(c),
    writeBytesAtomic: (c, o) => fs.writeBytesAtomic(c, o),
    createDir: (c) => fs.createDir(c),
    ensureDir: (c) => fs.ensureDir(c),
    readText: async (c) => {
      const t = await fs.readText(c);
      connus.set(c, t);
      return t;
    },
    writeTextAtomic: async (c, contenu) => {
      const connu = connus.get(c);
      if (connu !== undefined && (await fs.exists(c)) && (await fs.readText(c)) !== connu) throw new ModifieAilleurs(c);
      await fs.writeTextAtomic(c, contenu);
      connus.set(c, contenu);
    },
    writeTextNew: async (c, contenu) => {
      await fs.writeTextNew(c, contenu);
      connus.set(c, contenu);
    },
    rename: async (de, vers) => {
      await fs.rename(de, vers);
      connus.delete(de);
      connus.delete(vers);
    },
  };
}
