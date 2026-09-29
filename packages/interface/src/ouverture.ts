/**
 * Élément à ouvrir dans la page d'un module, demandé par une action du registre (recherche
 * globale, Accueil…). La page l'écoute : elle le reçoit à son montage, et aussi quand elle est
 * déjà affichée (on cherche une référence depuis la Bibliothèque elle-même).
 */
import { useEffect, useState } from "react";

const demandes = new Map<string, string>();
const ecouteurs = new Map<string, Set<(id: string) => void>>();

export function demanderOuverture(module: string, id: string): void {
  const e = ecouteurs.get(module);
  if (e?.size) for (const f of e) f(id);
  else demandes.set(module, id);
}

/** L'élément ouvert dans la page du module, et de quoi le changer. */
export function useOuverture(module: string): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => demandes.get(module) ?? null);
  useEffect(() => {
    demandes.delete(module);
    const f = (x: string) => setId(x);
    let e = ecouteurs.get(module);
    if (!e) ecouteurs.set(module, (e = new Set()));
    e.add(f);
    return () => {
      e.delete(f);
    };
  }, [module]);
  return [id, setId];
}
