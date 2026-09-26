/**
 * Import des fiches de campagne de these-lgcb (`projects/*.toml`). Lecteur TOML réduit à
 * ce que ces fiches contiennent : chaînes (simples, littérales, multilignes), nombres,
 * booléens, tables `[machine]` et `[tests."Essai1"]`, commentaires.
 */
import type { Campagne, Essai } from "./modele";
import { lireCampagne, lireEssai } from "./modele";

type Valeur = string | number | boolean;
interface Table {
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

const TYPES_TOML: Record<string, string> = { "module-complexe": "module-complexe", tsrst: "tsrst", fluage: "fluage", fatigue: "fatigue" };
const STATUTS_TOML: Record<string, string> = { "en cours": "en cours", termine: "terminé", "en pause": "en pause", abandonne: "abandonné" };

/** Fiche these-lgcb → campagne et essais. Les « TODO » de modèle vide sont ignorés. */
export function depuisLgcb(texte: string): { campagne: Campagne; essais: Record<string, Essai> } {
  const t = lireToml(texte);
  const s = (v: unknown) => (typeof v === "string" && v.trim() !== "TODO" ? v.trim() : "");
  const m = (t.machine ?? {}) as Table;
  const campagne = lireCampagne({
    titre: s(t.title) || "Campagne sans titre",
    type: TYPES_TOML[s(t.kind)] ?? "autre",
    statut: STATUTS_TOML[s(t.status)] ?? "en cours",
    materiau: s(t.material),
    donnees: s(t.data),
    machine: { operateur: s(m.operateur), poste: s(m.poste), bati: s(m.bati), logiciel: s(m.logiciel) },
    notes: s(t.notes),
  });
  const essais: Record<string, Essai> = {};
  for (const [nom, e] of Object.entries((t.tests ?? {}) as Record<string, Table>)) {
    essais[nom] = lireEssai({ eprouvette: s(e.eprouvette), debut: s(e.debut), fin: s(e.fin), dureeH: e.duree_h, cycles: e.cycles, etat: s(e.etat) || s(e.note) });
  }
  return { campagne, essais };
}
