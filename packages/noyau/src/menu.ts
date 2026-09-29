/**
 * Menu de la coquille : les modules rangés en sections dépliables. Une section d'un seul module
 * affiche directement le module ; un module sans section (ajouté plus tard) va dans « Autres ».
 */
import type { ModuleId } from "./produits";

export interface Section {
  titre: string;
  modules: readonly ModuleId[];
}

export const SECTIONS: readonly Section[] = [
  { titre: "Accueil", modules: ["accueil"] },
  { titre: "Calendrier", modules: ["planning", "journal"] },
  { titre: "Bibliographie", modules: ["bibliotheque"] },
  { titre: "Essais", modules: ["campagnes", "traitement", "etudes"] },
  { titre: "Outils", modules: ["figures", "chausspec", "numeriseur"] },
  { titre: "Rédaction", modules: ["manuscrits"] },
];

/** Les sections pour les modules présents dans l'installeur, dans l'ordre du menu ; les vides disparaissent. */
export function sectionsDu(presents: readonly string[]): { titre: string; modules: string[] }[] {
  const dedans = new Set(SECTIONS.flatMap((s) => s.modules as readonly string[]));
  const out = SECTIONS.map((s) => ({ titre: s.titre, modules: s.modules.filter((m) => presents.includes(m)) as string[] })).filter((s) => s.modules.length);
  const autres = presents.filter((m) => !dedans.has(m));
  if (autres.length) out.push({ titre: "Autres", modules: autres });
  return out;
}
