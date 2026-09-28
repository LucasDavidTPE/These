/**
 * Données brutes copiées dans l'espace (SPEC §4.1) : l'espace se suffit à lui-même.
 *
 * Les disques de données (sorties machine, `E:\`…) ne sont que des points d'entrée, jamais
 * modifiés. Un fichier ouvert pour une analyse est copié dans l'espace, et c'est la copie
 * qui sert ensuite, sur n'importe quel poste :
 *
 *   essais:tsrst-lucas/Essai1/mesure.csv  →  donnees/essais/tsrst-lucas/Essai1/mesure.csv
 *   fichier hors de toute racine          →  donnees/importes/mesure.csv
 *
 * Tant que la source est là, la copie la suit (un essai en cours dont le fichier s'allonge
 * est recopié) ; quand elle n'est pas là (autre PC, disque débranché), la copie suffit.
 */
import { lireReference, referenceDepuisChemin } from "../poste/racines";
import { joindre, nomDe } from "../stockage/chemins";
import type { Entree, Fichiers } from "../stockage/fichiers";

export const DOSSIER_DONNEES = "donnees";
export const DOSSIER_IMPORTES = `${DOSSIER_DONNEES}/importes`;

/** Dossier de l'espace où vit la copie d'une référence de racine (« essais:a/b » → « donnees/essais/a/b »). */
export function cheminCopie(reference: string): string | null {
  const r = lireReference(reference);
  return r ? joindre(DOSSIER_DONNEES, r.racine, r.chemin) : null;
}

function egaux(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const lectureSeule = async (): Promise<never> => {
  throw new Error("Données brutes : lecture seule (elles ne sont jamais modifiées).");
};

/**
 * Dossier de données vu à travers sa copie : `espace` et `copie` (dossier dans l'espace)
 * d'un côté, la source (`null` si absente de ce poste) de l'autre.
 * - lister : les fichiers de la source et ceux déjà copiés ;
 * - lire : la source si elle est là (et la copie est mise à jour au passage), sinon la copie.
 */
export function donneesCopiees(espace: Fichiers, copie: string, source: Fichiers | null): Fichiers {
  const dansCopie = (p: string) => joindre(copie, p);
  async function depuisSource<T>(f: (s: Fichiers) => Promise<T>): Promise<T | undefined> {
    if (!source) return undefined;
    try {
      return await f(source);
    } catch {
      return undefined; // source momentanément inaccessible : la copie prend le relais
    }
  }
  async function readBytes(p: string): Promise<Uint8Array> {
    const brut = await depuisSource((s) => s.readBytes(p));
    if (brut === undefined) return espace.readBytes(dansCopie(p));
    let actuelle: Uint8Array | null;
    try {
      actuelle = await espace.readBytes(dansCopie(p));
    } catch {
      actuelle = null;
    }
    if (!actuelle || !egaux(actuelle, brut)) {
      const i = p.lastIndexOf("/");
      await espace.ensureDir(dansCopie(i < 0 ? "" : p.slice(0, i)));
      await espace.writeBytesAtomic(dansCopie(p), brut);
    }
    return brut;
  }
  return {
    async listDir(p) {
      const parNom = new Map<string, Entree>();
      if (await espace.exists(dansCopie(p))) for (const e of await espace.listDir(dansCopie(p))) if (!/\.tmp$/i.test(e.name)) parNom.set(e.name, e);
      for (const e of (await depuisSource((s) => s.listDir(p))) ?? []) parNom.set(e.name, e);
      return [...parNom.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    async exists(p) {
      return (await depuisSource((s) => s.exists(p))) || espace.exists(dansCopie(p));
    },
    readBytes,
    async readText(p) {
      return new TextDecoder().decode(await readBytes(p));
    },
    writeTextAtomic: lectureSeule,
    writeBytesAtomic: lectureSeule,
    writeTextNew: lectureSeule,
    createDir: lectureSeule,
    ensureDir: lectureSeule,
    rename: lectureSeule,
  };
}

/**
 * Où ranger, dans l'espace, un fichier ouvert par son chemin absolu : sous sa racine s'il
 * est dans l'une d'elles, sinon dans `donnees/importes`. Renvoie la référence à garder
 * (« essais:… », ou le chemin relatif à l'espace) et le chemin de la copie.
 */
export function rangement(cheminAbsolu: string, racines: Record<string, string>): { source: string; copie: string } {
  const ref = referenceDepuisChemin(cheminAbsolu, racines);
  if (ref) return { source: ref, copie: cheminCopie(ref)! };
  const copie = joindre(DOSSIER_IMPORTES, nomDe(cheminAbsolu.replace(/\\/g, "/")));
  return { source: copie, copie };
}

/**
 * Copie un fichier importé (hors racine) dans `donnees/importes` ; si un autre fichier du
 * même nom y est déjà, `nom-2.csv`, `nom-3.csv`… Même contenu : on réutilise la copie.
 */
export async function importerFichier(espace: Fichiers, nom: string, octets: Uint8Array): Promise<string> {
  await espace.ensureDir(DOSSIER_IMPORTES);
  const point = nom.lastIndexOf(".");
  const [base, ext] = point > 0 ? [nom.slice(0, point), nom.slice(point)] : [nom, ""];
  for (let k = 1; ; k++) {
    const chemin = joindre(DOSSIER_IMPORTES, k === 1 ? nom : `${base}-${k}${ext}`);
    if (!(await espace.exists(chemin))) {
      await espace.writeBytesAtomic(chemin, octets);
      return chemin;
    }
    if (egaux(await espace.readBytes(chemin), octets)) return chemin;
  }
}

/** Vrai si une source de dépouillement désigne un fichier de l'espace (chemin relatif, pas de racine). */
export function estDansEspace(source: string): boolean {
  return !lireReference(source) && !/^([A-Za-z]:|[\\/])/.test(source);
}

/** Fichiers de `a` absents de `b` (même chemin relatif) ; restes d'écriture et verrous ignorés. Sert à vérifier une copie. */
export async function fichiersManquants(a: Fichiers, b: Fichiers, chemin = ""): Promise<string[]> {
  const out: string[] = [];
  const presents = new Set((await b.exists(chemin)) ? (await b.listDir(chemin)).map((e) => e.name) : []);
  for (const e of await a.listDir(chemin)) {
    const c = joindre(chemin, e.name);
    if (e.kind === "dir") out.push(...(await fichiersManquants(a, b, c)));
    else if (!/\.(tmp|lock)$/i.test(e.name) && !presents.has(e.name)) out.push(c);
  }
  return out;
}
