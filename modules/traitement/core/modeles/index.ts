/**
 * Registre des modèles rhéologiques. Ajouter un modèle : écrire un fichier voisin qui
 * exporte par défaut un objet de forme `Modele` (type.ts), puis l'ajouter à la liste.
 */
import m2s2p1d from "./2s2p1d";
import gkv from "./gkv";
import huetSayegh from "./huet-sayegh";
import { mBurgers, mKelvinVoigt, mMaxwell, mZener } from "./simples";
import type { Constantes, Modele } from "./type";

export type { ChaineGKV, Complexe, Constantes, Modele, ModeleCale, Parametre } from "./type";

export const MODELES: readonly Modele[] = [m2s2p1d, huetSayegh, gkv, mMaxwell, mKelvinVoigt, mZener, mBurgers];

/** Clés des temps caractéristiques, tous modèles confondus (translation au changement de Tref). */
export const CLES_TEMPS: ReadonlySet<string> = new Set(MODELES.flatMap((m) => m.parametres.filter((d) => d.temps).map((d) => d.cle)));

export function modele(id: string): Modele {
  return MODELES.find((m) => m.id === id) || MODELES[0]!;
}

/**
 * Constantes de départ d'un modèle, éventuellement reprises d'un autre. Les constantes que le
 * nouveau modèle n'utilise pas sont gardées : le Kelvin-Voigt généralisé se construit sur les
 * constantes 2S2P1D, et revenir au modèle précédent retrouve son calage.
 */
export function parametresInitiaux(m: Modele, precedents: Partial<Constantes> = {}): Constantes {
  const p: Constantes = {};
  for (const [cle, v] of Object.entries(precedents)) if (Number.isFinite(v)) p[cle] = v!;
  for (const [cle, v] of Object.entries(m.defauts)) if (!Number.isFinite(p[cle])) p[cle] = v;
  return p;
}
