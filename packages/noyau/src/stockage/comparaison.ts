/**
 * Comparaison champ par champ de deux versions d'un même objet JSON : ce que l'on montre
 * avant de choisir la version à garder après un conflit OneDrive (SPEC §4.1).
 */

export interface Difference {
  /** Chemin du champ : « titre », « lecture.statut », « auteurs[2] ». */
  champ: string;
  /** Valeur dans chaque version, en texte ; undefined si le champ est absent. */
  a: string | undefined;
  b: string | undefined;
}

function texte(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function parcourir(a: unknown, b: unknown, champ: string, out: Difference[]): void {
  const objet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (objet(a) && objet(b)) {
    const cles = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of cles) parcourir(a[k], b[k], champ ? `${champ}.${k}` : k, out);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) parcourir(a[i], b[i], `${champ}[${i}]`, out);
    return;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  out.push({ champ: champ || "(contenu)", a: a === undefined ? undefined : texte(a), b: b === undefined ? undefined : texte(b) });
}

/** Différences entre deux textes JSON ; si l'un n'est pas du JSON, compare les textes bruts. */
export function comparerJson(texteA: string, texteB: string): Difference[] {
  let a: unknown;
  let b: unknown;
  try {
    a = JSON.parse(texteA);
    b = JSON.parse(texteB);
  } catch {
    return texteA === texteB ? [] : [{ champ: "(contenu)", a: texteA, b: texteB }];
  }
  const out: Difference[] = [];
  parcourir(a, b, "", out);
  return out;
}
