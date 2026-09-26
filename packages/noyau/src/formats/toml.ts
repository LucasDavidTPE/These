/**
 * Lecteur TOML réduit à ce que contiennent les fiches de these-lgcb (`projects/*.toml`,
 * `studies/<étude>/study.toml`) : chaînes (simples, littérales, multilignes), nombres,
 * booléens, listes sur une ligne, tables `[machine]` et `[tests."Essai1"]`, commentaires.
 */

export type Valeur = string | number | boolean | (string | number)[];
export interface Table {
  [cle: string]: Valeur | Table;
}

function sansCommentaire(l: string): string {
  let dans: string | null = null;
  for (let i = 0; i < l.length; i++) {
    const c = l[i]!;
    if (dans) {
      if (c === "\\" && dans === '"') i++;
      else if (c === dans) dans = null;
    } else if (c === '"' || c === "'") dans = c;
    else if (c === "#") return l.slice(0, i);
  }
  return l;
}

function valeur(brut: string): Valeur {
  const v = brut.trim();
  if (v.startsWith('"')) return JSON.parse(v) as string;
  if (v.startsWith("'")) return v.slice(1, -1);
  if (v.startsWith("[") && v.endsWith("]")) return JSON.parse(v.replace(/'([^']*)'/g, '"$1"').replace(/,\s*]$/, "]")) as (string | number)[];
  if (v === "true" || v === "false") return v === "true";
  const nombre = Number(v.replace(/_/g, ""));
  if (!Number.isNaN(nombre) && v !== "") return nombre;
  throw new Error(`Valeur TOML non prise en charge : ${v}`);
}

function cle(brut: string): string[] {
  return [...brut.matchAll(/"([^"]*)"|'([^']*)'|([A-Za-z0-9_-]+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!);
}

export function lireToml(texte: string): Table {
  const racine: Table = {};
  let courant = racine;
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let i = 0; i < lignes.length; i++) {
    const l = sansCommentaire(lignes[i]!).trim();
    if (!l) continue;
    const table = /^\[(.+)\]$/.exec(l);
    if (table) {
      courant = racine;
      for (const k of cle(table[1]!)) courant = (courant[k] ??= {}) as Table;
      continue;
    }
    const eg = l.indexOf("=");
    if (eg < 0) throw new Error(`Ligne TOML illisible : ${l}`);
    const k = cle(l.slice(0, eg)).at(-1)!;
    const reste = lignes[i]!.slice(lignes[i]!.indexOf("=") + 1).trim();
    const multi = reste.startsWith('"""') ? '"""' : reste.startsWith("'''") ? "'''" : null;
    if (multi) {
      let corps = reste.slice(3);
      while (!corps.includes(multi) && i + 1 < lignes.length) corps += "\n" + lignes[++i]!;
      corps = corps.slice(0, corps.indexOf(multi)).replace(/^\n/, "");
      courant[k] = multi === '"""' ? corps.replace(/\\"/g, '"').replace(/\\n/g, "\n") : corps;
    } else courant[k] = valeur(sansCommentaire(reste));
  }
  return racine;
}

