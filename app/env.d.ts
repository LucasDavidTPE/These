/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module "virtual:these-produit" {
  import type { Produit } from "@noyau/produits";
  import type { Manifeste } from "@interface/manifeste";
  export const produit: Produit;
  export const manifestes: Manifeste[];
}
