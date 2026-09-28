/** État de la page ChaussSpec : le cas en cours, son fichier dans l'espace, le dernier résultat. */
import { create } from "zustand";
import type { CasJSON } from "../core/cas";
import { EXEMPLES } from "./exemples";
import type { ResultatSerialise } from "./execution";

export interface EtatChaussspec {
  cas: CasJSON;
  /** Nom du cas (fichier `chausspec/<nom>.json` de l'espace). */
  nom: string;
  modifie: boolean;
  resultat: ResultatSerialise | null;
  /** Cas tel qu'il a été calculé (pour signaler un résultat périmé). */
  casCalcule: string | null;
  calcul: { part: number; texte: string; annuler(): void } | null;
  message: { niveau: "info" | "attention" | "erreur"; texte: string } | null;
  maj(f: (c: CasJSON) => void): void;
  ouvrir(cas: CasJSON, nom: string): void;
  signaler(texte: string, niveau?: "info" | "attention" | "erreur"): void;
}

const copie = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const useChaussspec = create<EtatChaussspec>()((set, get) => ({
  cas: EXEMPLES[0]!.cas(),
  nom: "exemple-tfe",
  modifie: false,
  resultat: null,
  casCalcule: null,
  calcul: null,
  message: null,
  maj: (f) => {
    const c = copie(get().cas);
    f(c);
    set({ cas: c, modifie: true });
  },
  ouvrir: (cas, nom) => set({ cas: copie(cas), nom, modifie: false, resultat: null, casCalcule: null, message: null }),
  signaler: (texte, niveau = "info") => set({ message: { texte, niveau } }),
}));
