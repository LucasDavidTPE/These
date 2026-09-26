/**
 * Les produits (SPEC §3.1) : chaque installeur a sa surcharge Tauri cohérente avec
 * `PRODUITS`, et le module virtuel n'importe que les modules du produit.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PRODUITS } from "../packages/noyau/src/produits";
import { fichiersStatiques, sourceDuProduit } from "../outils/produit-vite";

const lire = (rel: string) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")) as Record<string, unknown>;

describe("produits", () => {
  it("la configuration Tauri de base est celle de Thèse", () => {
    const base = lire("src-tauri/tauri.conf.json");
    const these = PRODUITS.find((p) => p.id === "these")!;
    expect(base.productName).toBe(these.nom);
    expect(base.identifier).toBe(these.identifiant);
  });

  it.each(PRODUITS.filter((p) => p.id !== "these"))("la surcharge de $id reprend son nom et son identifiant", (p) => {
    const chemin = `src-tauri/produits/${p.id}.json`;
    expect(existsSync(new URL(`../${chemin}`, import.meta.url))).toBe(true);
    const c = lire(chemin) as { productName: string; identifier: string; app: { windows: { title: string }[] } };
    expect(c.productName).toBe(p.nom);
    expect(c.identifier).toBe(p.identifiant);
    expect(c.app.windows[0]?.title).toBe(p.nom);
  });

  it("le module virtuel n'importe que les modules du produit", () => {
    const figurine = sourceDuProduit("figurine");
    expect(figurine).toContain('"/modules/figures/manifeste.tsx"');
    expect(figurine).not.toContain("/modules/bibliotheque/");
    expect(sourceDuProduit(undefined).match(/import m\d+ from/g)).toHaveLength(7);
  });

  it("les fichiers statiques d'un module ne sont embarqués que dans ses produits", () => {
    expect(fichiersStatiques("traitement").map((f) => f.fichier)).toContain("index.html");
    expect(fichiersStatiques("these").some((f) => f.module === "traitement" && f.fichier === "src/main.js")).toBe(true);
    expect(fichiersStatiques("figurine")).toEqual([]);
  });

  it("chaque module a son manifeste", () => {
    for (const m of PRODUITS[0]!.modules) expect(existsSync(new URL(`../modules/${m}/manifeste.tsx`, import.meta.url))).toBe(true);
  });
});
