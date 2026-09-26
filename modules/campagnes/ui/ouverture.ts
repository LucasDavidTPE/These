/**
 * Campagne à ouvrir, demandée par un autre module (Accueil) via l'action
 * « campagnes.ouvrir ». Lue une fois, quand la page du module s'affiche.
 */
let aOuvrir: string | null = null;

export function demanderOuverture(slug: string): void {
  aOuvrir = slug;
}

export function prendreOuverture(): string | null {
  const s = aOuvrir;
  aOuvrir = null;
  return s;
}
