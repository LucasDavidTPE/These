/**
 * Greffon Vite : le module virtuel `virtual:these-produit` n'importe que les manifestes des
 * modules du produit choisi par `THESE_PRODUIT` (SPEC §3.1). Les autres modules ne sont
 * pas dans le paquet : un installeur Figurine ne contient pas le code de la bibliothèque.
 */
import type { Plugin } from "vite";
import { produitDepuisEnv } from "../packages/noyau/src/produits.ts";

const ID = "virtual:these-produit";
const RESOLU = "\0" + ID;

export function sourceDuProduit(valeur: string | undefined): string {
  const produit = produitDepuisEnv(valeur);
  const imports = produit.modules.map((m, i) => `import m${i} from "/modules/${m}/manifeste.tsx";`);
  return [
    ...imports,
    `export const produit = ${JSON.stringify(produit)};`,
    `export const manifestes = [${produit.modules.map((_, i) => `m${i}`).join(", ")}];`,
    "",
  ].join("\n");
}

export function produitVite(): Plugin {
  return {
    name: "these-produit",
    resolveId: (id) => (id === ID ? RESOLU : undefined),
    load: (id) => (id === RESOLU ? sourceDuProduit(process.env.THESE_PRODUIT) : undefined),
  };
}
