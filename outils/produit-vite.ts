/**
 * Greffon Vite : le module virtuel `virtual:these-produit` n'importe que les manifestes des
 * modules du produit choisi par `THESE_PRODUIT` (SPEC §3.1). Les autres modules ne sont
 * pas dans le paquet : un installeur Figurine ne contient pas le code de la bibliothèque.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { produitDepuisEnv } from "../packages/noyau/src/produits.ts";

const MODULES = fileURLToPath(new URL("../modules/", import.meta.url));

/** Préfixe d'URL des fichiers statiques d'un module : `/statique/<module>/…`. */
export const PREFIXE_STATIQUE = "/statique/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function fichiersDe(dossier: string, prefixe = ""): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersDe(chemin, `${prefixe}${nom}/`) : [`${prefixe}${nom}`];
  });
}

/**
 * Fichiers statiques des modules du produit (`modules/<m>/statique/`), servis tels quels :
 * par exemple la page de traitement 2S2P1D, reprise sans empaquetage. Seuls les modules
 * du produit sont copiés dans le paquet.
 */
export function fichiersStatiques(valeur: string | undefined): { module: string; fichier: string; source: string }[] {
  return produitDepuisEnv(valeur).modules.flatMap((m) => {
    const dossier = join(MODULES, m, "statique");
    return existsSync(dossier) ? fichiersDe(dossier).map((f) => ({ module: m, fichier: f, source: join(dossier, f) })) : [];
  });
}

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
    configureServer(server) {
      const produit = produitDepuisEnv(process.env.THESE_PRODUIT);
      server.middlewares.use(PREFIXE_STATIQUE, (req, res, suite) => {
        const [module, ...reste] = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(/^\/+/, "").split("/");
        const rel = reste.join("/");
        const chemin = join(MODULES, module ?? "", "statique", rel);
        if (!module || !produit.modules.includes(module as never) || rel.includes("..") || !existsSync(chemin) || statSync(chemin).isDirectory()) return suite();
        res.setHeader("Content-Type", TYPES[extname(chemin)] ?? "application/octet-stream");
        res.end(readFileSync(chemin));
      });
    },
    generateBundle() {
      for (const f of fichiersStatiques(process.env.THESE_PRODUIT)) {
        this.emitFile({ type: "asset", fileName: `statique/${f.module}/${f.fichier}`, source: readFileSync(f.source) });
      }
    },
  };
}
