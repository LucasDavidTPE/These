/**
 * Permissions Tauri de la fenêtre principale : `opener:allow-open-url` sans portée
 * n'autorise AUCUNE adresse (« without any pre-configured scope ») ; les boutons « doi.org »,
 * « Scholar », « Ouvrir le lien » restaient alors muets. Une portée explicite est exigée.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Permission = string | { identifier: string; allow?: { url?: string; path?: string }[] };
const capacite = JSON.parse(readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8")) as { permissions: Permission[] };

describe("capacités Tauri", () => {
  it("l'ouverture d'une adresse web a une portée (http, https, mailto)", () => {
    const sansPortee = capacite.permissions.filter((p) => p === "opener:allow-open-url");
    expect(sansPortee).toEqual([]);
    const p = capacite.permissions.find((x) => typeof x !== "string" && x.identifier === "opener:allow-open-url");
    expect(p).toBeTruthy();
    const urls = (typeof p === "object" ? p.allow ?? [] : []).map((a) => a.url);
    expect(urls).toEqual(expect.arrayContaining(["https://*", "http://*", "mailto:*"]));
  });

  it("l'ouverture d'un dossier ou d'un fichier a une portée", () => {
    const p = capacite.permissions.find((x) => typeof x !== "string" && x.identifier === "opener:allow-open-path");
    expect(typeof p === "object" && (p.allow ?? []).length).toBeGreaterThan(0);
  });
});
