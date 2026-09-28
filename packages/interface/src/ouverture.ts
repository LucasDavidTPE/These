/**
 * Élément à ouvrir dans la page d'un module, demandé par une action du registre (recherche
 * globale…). La page le lit à son montage (`useOuverture`) ; il est oublié juste après, de sorte
 * que le double rendu de React en développement lise deux fois la même demande.
 */
import { useEffect, useState } from "react";

const demandes = new Map<string, string>();

export function demanderOuverture(module: string, id: string): void {
  demandes.set(module, id);
}

/** La demande en attente pour ce module (ou null), oubliée après le montage de la page. */
export function useOuverture(module: string): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => demandes.get(module) ?? null);
  useEffect(() => {
    demandes.delete(module);
  }, [module]);
  return [id, setId];
}
