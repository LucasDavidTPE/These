/** Modèles de présentation : couleurs, polices, pied de page. Un modèle = un petit fichier JSON. */
import { slugifier } from "@noyau/texte";

export interface ModelePresentation {
  nom: string;
  couleurs: { fond: string; titre: string; texte: string; accent: string; discret: string };
  polices: { titre: string; texte: string };
  /** Taille des titres et du texte, en points. */
  tailles: { titre: number; texte: number };
  /** Texte du pied de page (« Thèse · L. David · ENTPE »). */
  pied: string;
  numeros: boolean;
}

export const DOSSIER_PRESENTATIONS = "presentations";
export const DOSSIER_MODELES = `${DOSSIER_PRESENTATIONS}/modeles`;

const base = (nom: string, c: ModelePresentation["couleurs"], polices = { titre: "Calibri", texte: "Calibri" }): ModelePresentation => ({
  nom,
  couleurs: c,
  polices,
  tailles: { titre: 36, texte: 24 },
  pied: "",
  numeros: true,
});

export const MODELES_DE_BASE: ModelePresentation[] = [
  base("Sobre clair", { fond: "FFFFFF", titre: "1F3A5F", texte: "222222", accent: "2F5F8A", discret: "6A6A66" }),
  base("Sombre", { fond: "1B1F27", titre: "FFFFFF", texte: "E6E8EC", accent: "6FB1E8", discret: "9AA3B0" }),
  base("Bleu institutionnel", { fond: "FFFFFF", titre: "00396B", texte: "1D1D1B", accent: "0072BC", discret: "5C6773" }, { titre: "Arial", texte: "Arial" }),
  base("Chaud", { fond: "FBF7F0", titre: "6B2D1A", texte: "2A2320", accent: "C8642D", discret: "7A6E66" }, { titre: "Georgia", texte: "Calibri" }),
];

export const slugModele = (nom: string) => slugifier(nom);

const HEX = /^[0-9A-Fa-f]{6}$/;

/** Lit un modèle enregistré ; les champs absents ou invalides prennent la valeur du modèle de base. */
export function lireModele(brut: unknown): ModelePresentation {
  const ref = MODELES_DE_BASE[0]!;
  const o = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const c = (typeof o.couleurs === "object" && o.couleurs !== null ? o.couleurs : {}) as Record<string, unknown>;
  const p = (typeof o.polices === "object" && o.polices !== null ? o.polices : {}) as Record<string, unknown>;
  const t = (typeof o.tailles === "object" && o.tailles !== null ? o.tailles : {}) as Record<string, unknown>;
  const couleur = (k: keyof ModelePresentation["couleurs"]) => (typeof c[k] === "string" && HEX.test((c[k] as string).replace(/^#/, "")) ? (c[k] as string).replace(/^#/, "").toUpperCase() : ref.couleurs[k]);
  const taille = (v: unknown, defaut: number) => (typeof v === "number" && v >= 8 && v <= 96 ? v : defaut);
  const police = (v: unknown, defaut: string) => (typeof v === "string" && v.trim() ? v.trim() : defaut);
  return {
    nom: typeof o.nom === "string" && o.nom.trim() ? o.nom.trim() : "Modèle",
    couleurs: { fond: couleur("fond"), titre: couleur("titre"), texte: couleur("texte"), accent: couleur("accent"), discret: couleur("discret") },
    polices: { titre: police(p.titre, ref.polices.titre), texte: police(p.texte, ref.polices.texte) },
    tailles: { titre: taille(t.titre, ref.tailles.titre), texte: taille(t.texte, ref.tailles.texte) },
    pied: typeof o.pied === "string" ? o.pied : "",
    numeros: o.numeros !== false,
  };
}

/** Le modèle demandé par la présentation (par nom ou par slug), sinon le premier. */
export function trouverModele(modeles: readonly ModelePresentation[], demande: string): ModelePresentation {
  const d = slugModele(demande);
  return (d ? modeles.find((m) => slugModele(m.nom) === d) : undefined) ?? modeles[0] ?? MODELES_DE_BASE[0]!;
}
