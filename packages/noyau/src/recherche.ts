/**
 * Recherche globale (Ctrl+K) : chaque module décrit ce qu'il contient sous forme d'entrées,
 * la coquille les réunit et les classe. Pur : aucun accès aux fichiers ici.
 */
import { normaliser } from "./texte";

export interface EntreeRecherche {
  /** Unique dans son module. */
  id: string;
  module: string;
  /** « Référence », « Essai », « Cas »… : affiché en petit devant le titre. */
  genre: string;
  titre: string;
  /** Une ligne sous le titre (auteurs, statut, dates…). */
  detail?: string;
  /** Texte supplémentaire cherché mais non affiché (résumé, mots-clés, notes). */
  mots?: string;
  /** Action du registre qui ouvre cet élément ; sinon on ouvre la page du module. */
  ouvrir?: { action: string; charge?: unknown };
}

export interface Commande {
  id: string;
  titre: string;
  detail?: string;
  /** Mots cherchés en plus du titre (« reglages parametres »). */
  mots?: string;
}

const POIDS_TITRE = 100;
const POIDS_DETAIL = 20;
const POIDS_MOTS = 8;

/**
 * Note d'un texte pour une requête : tous les mots doivent s'y trouver. Un mot en début de
 * texte ou de mot vaut plus qu'un mot au milieu d'un autre ; plus tôt vaut plus tard.
 * Renvoie 0 si un mot manque.
 */
export function noter(texte: string, mots: string[]): number {
  if (!mots.length) return 1;
  let total = 0;
  for (const m of mots) {
    const i = texte.indexOf(m);
    if (i < 0) return 0;
    const debutDeMot = i === 0 || texte[i - 1] === " " || texte[i - 1] === "-" || texte[i - 1] === "'";
    total += (debutDeMot ? 2 : 1) * (1 + 1 / (1 + i / 8));
  }
  return total;
}

function motsDe(requete: string): string[] {
  return normaliser(requete).split(" ").filter(Boolean);
}

/** Les meilleures entrées pour la requête, les mieux classées d'abord ; rien si la requête est vide. */
export function chercher(entrees: readonly EntreeRecherche[], requete: string, limite = 30): EntreeRecherche[] {
  const mots = motsDe(requete);
  if (!mots.length) return [];
  const notees: { e: EntreeRecherche; note: number }[] = [];
  for (const e of entrees) {
    const t = normaliser(e.titre);
    const d = normaliser(e.detail ?? "");
    const x = normaliser(e.mots ?? "");
    // Chaque mot peut être trouvé dans le titre, le détail ou les mots cachés.
    let note = 0;
    for (const m of mots) {
      const nt = noter(t, [m]);
      const nd = noter(d, [m]);
      const nx = noter(x, [m]);
      const n = Math.max(nt * POIDS_TITRE, nd * POIDS_DETAIL, nx * POIDS_MOTS);
      if (n === 0) {
        note = 0;
        break;
      }
      note += n;
    }
    if (note > 0) notees.push({ e, note });
  }
  notees.sort((a, b) => b.note - a.note || a.e.titre.localeCompare(b.e.titre, "fr"));
  return notees.slice(0, limite).map((n) => n.e);
}

/** Les commandes correspondant à la requête ; toutes si elle est vide. */
export function chercherCommandes(commandes: readonly Commande[], requete: string): Commande[] {
  const mots = motsDe(requete);
  if (!mots.length) return [...commandes];
  return commandes
    .map((c) => {
      const t = normaliser(`${c.titre} ${c.mots ?? ""}`);
      const n = mots.reduce((s, m) => (s === 0 ? 0 : noter(t, [m]) === 0 ? 0 : s + noter(normaliser(c.titre), [m]) * 10 + noter(t, [m])), 1);
      return { c, n: n <= 1 ? 0 : n };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.c);
}
