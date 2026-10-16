/**
 * Anciens documents Word (`.doc`, 97-2003) : l'appli ne lit que le `.docx`. Un `.doc` choisi comme partie est
 * converti par Word en un `.docx` du même nom, à côté (le `.doc` reste intact), et c'est ce `.docx` que la partie
 * suit ; un `.doc` reçu en correction est converti en mémoire, et rangé en `.docx`.
 */

export const EXTENSIONS_WORD = ["docx", "doc"];

export const estDoc = (nom: string) => /\.doc$/i.test(nom);
export const estWord = (nom: string) => /\.docx?$/i.test(nom) && !scinderNom(nom).startsWith("~$");

/** « ch1.doc » → « ch1.docx » (chemin ou nom). */
export const versDocx = (nom: string) => nom.replace(/\.doc$/i, ".docx");

function scinderNom(chemin: string): string {
  const i = Math.max(chemin.lastIndexOf("/"), chemin.lastIndexOf("\\"));
  return chemin.slice(i + 1);
}

/** Fichiers Word d'une liste : un `.doc` qui a déjà son `.docx` (même nom, même dossier) est écarté. */
export function sansDoublonsDoc(chemins: readonly string[]): string[] {
  const cles = new Set(chemins.map((c) => c.toLowerCase()));
  return chemins.filter((c) => !estDoc(c) || !cles.has(versDocx(c).toLowerCase()));
}
