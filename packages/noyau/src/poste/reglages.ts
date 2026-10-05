/**
 * Réglages propres à chaque poste (SPEC §4.2) : `poste.json`, dans le dossier de
 * configuration local de l'application, **jamais** dans OneDrive.
 */

export interface ReglagesPoste {
  version: 1;
  /** Chemin absolu de l'espace Thèse sur ce poste ; null au premier lancement. */
  espace: string | null;
  /** Dossier de la bibliothèque de figures (celui de Figurine) ; null si pas encore choisi. */
  figures: string | null;
  /** Racines de données de ce poste : nom → chemin absolu (« essais » → « E:/ »). */
  racines: Record<string, string>;
  /**
   * Clé d'API Zotero de ce poste (« Mettre à jour Zotero ») : sur le poste, pas dans
   * l'espace, pour qu'elle ne parte pas avec un zip de l'espace.
   */
  zotero: CompteZoteroPoste | null;
}

export interface CompteZoteroPoste {
  cle: string;
  /** Identifiant numérique du compte (userID). */
  utilisateur: number;
  nom: string;
}

export const REGLAGES_PAR_DEFAUT: ReglagesPoste = { version: 1, espace: null, figures: null, racines: {}, zotero: null };

function compteZotero(v: unknown): CompteZoteroPoste | null {
  if (typeof v !== "object" || v === null) return null;
  const z = v as Record<string, unknown>;
  if (typeof z.cle !== "string" || !/^[A-Za-z0-9]+$/.test(z.cle) || typeof z.utilisateur !== "number") return null;
  return { cle: z.cle, utilisateur: z.utilisateur, nom: typeof z.nom === "string" ? z.nom : "" };
}

/** Nom de racine : minuscules, chiffres, tirets ; commence par une lettre. */
export const NOM_RACINE_RE = /^[a-z][a-z0-9-]*$/;

export function estNomRacine(nom: string): boolean {
  return NOM_RACINE_RE.test(nom);
}

function cheminOuNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Lecture tolérante : un fichier absent, abîmé ou d'une autre version donne les défauts. */
export function lireReglages(texte: string | null): ReglagesPoste {
  if (!texte) return structuredClone(REGLAGES_PAR_DEFAUT);
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return structuredClone(REGLAGES_PAR_DEFAUT);
  }
  if (typeof brut !== "object" || brut === null) return structuredClone(REGLAGES_PAR_DEFAUT);
  const r = brut as Record<string, unknown>;
  const racines: Record<string, string> = {};
  if (typeof r.racines === "object" && r.racines !== null) {
    for (const [nom, chemin] of Object.entries(r.racines as Record<string, unknown>)) {
      const c = cheminOuNull(chemin);
      if (estNomRacine(nom) && c) racines[nom] = c;
    }
  }
  return { version: 1, espace: cheminOuNull(r.espace), figures: cheminOuNull(r.figures), racines, zotero: compteZotero(r.zotero) };
}

export function ecrireReglages(r: ReglagesPoste): string {
  const racines = Object.fromEntries(Object.entries(r.racines).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({ version: 1, espace: r.espace, figures: r.figures, racines, ...(r.zotero ? { zotero: r.zotero } : {}) }, null, 2) + "\n";
}

function sous(base: string, ...parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return [base.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

/** Dossier proposé pour l'espace au premier lancement : `<OneDrive>\Thèse\Espace`. */
export function espacePropose(oneDrive: string): string {
  return sous(oneDrive, "Thèse", "Espace");
}

/**
 * Racines que les modules savent utiliser, proposées dans les réglages : les dossiers d'où
 * viennent les données (lues, copiées dans l'espace, jamais modifiées). Les PDF de la
 * bibliographie n'en sont plus une : ils vivent dans l'espace (voir DANS_L_ESPACE).
 */
export const RACINES_CONNUES: readonly { nom: string; description: string; exemple: string }[] = [
  { nom: "essais", description: "Données brutes des essais (sorties machine)", exemple: "E:\\" },
  { nom: "recherche", description: "Dossier de recherche du Bureau (données d'essai triées)", exemple: "C:\\Users\\DAVID\\Desktop\\Recherche" },
  { nom: "manuscrits", description: "Dossier de vos fichiers Word de manuscrit (facultatif : chaque partie peut vivre ailleurs)", exemple: "C:\\Users\\DAVID\\OneDrive - entpe.fr\\Thèse\\Rédaction" },
];
