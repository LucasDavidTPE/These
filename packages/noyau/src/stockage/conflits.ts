/**
 * Copies de conflit OneDrive (SPEC §4.1).
 *
 * Quand le même fichier a été modifié sur deux PC, OneDrive garde les deux et renomme
 * l'un en ajoutant le nom du poste : `BIB-001-PC-MAISON.json`, puis `BIB-001-PC-MAISON-1.json`…
 * On reconnaît aussi les copies de l'Explorateur (`BIB-001 - Copie.json`, `BIB-001 (2).json`),
 * qui ont la même conséquence : deux versions du même fichier.
 *
 * Repris de Figurine ; la résolution gagne un troisième choix, « garder les deux », pour
 * les collections où deux objets distincts ont reçu le même ID hors ligne.
 */
import { joindre } from "./chemins";

/** Dossier où sont rangées les versions écartées lors d'un conflit : rien n'est supprimé. */
export const DOSSIER_CONFLITS = ".conflits";

export interface CopieConflit {
  /** Nom du fichier canonique, « BIB-001.json ». */
  original: string;
  /** Nom de la copie, « BIB-001-PC-MAISON.json ». */
  copie: string;
  /** Ce qui distingue la copie : le nom du poste pour OneDrive, « (2) » ou « Copie » sinon. */
  etiquette: string;
}

const SUFFIXES: RegExp[] = [
  // OneDrive : « -NOMPC » ou « -NOMPC-2 ». Noms de poste Windows : lettres, chiffres, tirets.
  /^-([A-Za-z0-9][A-Za-z0-9_-]*)$/,
  // Explorateur Windows : « (2) », « - Copie », « - Copie (2) », « - Copy ».
  /^ (\(\d+\))$/,
  /^ - (Cop(?:ie|y)(?: \(\d+\))?)$/,
];

function decouper(nom: string): [racine: string, ext: string] {
  const point = nom.lastIndexOf(".");
  return point <= 0 ? [nom, ""] : [nom.slice(0, point), nom.slice(point)];
}

/** Si `nom` est une copie de conflit de l'un des `originaux`, la décrit ; sinon null. */
export function detecterCopieConflit(nom: string, originaux: readonly string[]): CopieConflit | null {
  if (originaux.includes(nom)) return null;
  const [racine, ext] = decouper(nom);
  // Le plus long original d'abord : « BIB-0010.json » ne doit pas passer pour une copie de « BIB-001.json ».
  const candidats = [...originaux].sort((a, b) => b.length - a.length);
  for (const original of candidats) {
    const [oRacine, oExt] = decouper(original);
    if (ext.toLowerCase() !== oExt.toLowerCase() || !racine.startsWith(oRacine)) continue;
    const reste = racine.slice(oRacine.length);
    for (const re of SUFFIXES) {
      const m = re.exec(reste);
      if (m) return { original, copie: nom, etiquette: m[1]! };
    }
  }
  return null;
}

/** Vrai pour un fichier temporaire d'écriture atomique resté en place (écriture interrompue). */
export function estTemporaireOrphelin(nom: string): boolean {
  return nom.endsWith(".tmp");
}

export type OperationFichier =
  | { op: "mkdir"; path: string }
  | { op: "rename"; from: string; to: string };

export type ChoixConflit = "original" | "copie" | "les-deux";

/**
 * Plan de résolution d'un conflit dans `dossier` :
 * - `original` / `copie` : la version choisie prend le nom canonique, l'autre est rangée
 *   dans `.conflits/` ;
 * - `les-deux` : la copie devient un nouvel objet, sous le nom `nouveauNom` (ID suivant).
 * `horodatage` rend le nom d'archive unique (par exemple « 2026-09-25T17-02-00 »).
 */
export function planResolution(
  dossier: string,
  conflit: CopieConflit,
  choix: ChoixConflit,
  horodatage: string,
  archiveExiste: boolean,
  nouveauNom?: string,
): OperationFichier[] {
  const orig = joindre(dossier, conflit.original);
  const copie = joindre(dossier, conflit.copie);
  if (choix === "les-deux") {
    if (!nouveauNom) throw new Error("« Garder les deux » demande un nouveau nom de fichier.");
    return [{ op: "rename", from: copie, to: joindre(dossier, nouveauNom) }];
  }
  const tampon = horodatage.replace(/[^0-9A-Za-z-]/g, "-");
  const archive = joindre(dossier, DOSSIER_CONFLITS);
  const ops: OperationFichier[] = archiveExiste ? [] : [{ op: "mkdir", path: archive }];
  if (choix === "original") {
    ops.push({ op: "rename", from: copie, to: joindre(archive, `${tampon}_${conflit.copie}`) });
  } else {
    ops.push({ op: "rename", from: orig, to: joindre(archive, `${tampon}_${conflit.original}`) });
    ops.push({ op: "rename", from: copie, to: orig });
  }
  return ops;
}
