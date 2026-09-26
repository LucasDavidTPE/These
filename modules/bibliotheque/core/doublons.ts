/**
 * Contrôle des doublons (macro VerifierDoublons) : même clé, même DOI, ou même titre (une
 * fois normalisé) et même premier auteur — deux livres « Contact Mechanics » de Johnson
 * et de Barber ne sont pas des doublons.
 */
import { normaliser } from "@noyau/texte";
import type { Reference } from "./modele";

export interface Doublon {
  motif: "clé" | "DOI" | "titre";
  valeur: string;
  ids: string[];
}

export function doublons(refs: { id: string; valeur: Reference }[]): Doublon[] {
  const out: Doublon[] = [];
  const grouper = (motif: Doublon["motif"], cle: (r: Reference) => string) => {
    const m = new Map<string, string[]>();
    for (const { id, valeur } of refs) {
      const k = cle(valeur);
      if (k) m.set(k, [...(m.get(k) ?? []), id]);
    }
    for (const [valeur, ids] of m) if (ids.length > 1) out.push({ motif, valeur, ids });
  };
  grouper("clé", (r) => r.cle.trim().toLowerCase());
  grouper("DOI", (r) => r.doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, ""));
  grouper("titre", (r) => (r.titre.length > 12 ? `${normaliser(r.titre).replace(/[^a-z0-9]+/g, " ").trim()} — ${normaliser(r.auteurs.split(/[;,]/)[0] ?? "")}` : ""));
  return out;
}
