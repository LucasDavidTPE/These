/**
 * Windows ne distingue pas « ApercuPdf.tsx » de « apercuPdf.ts » (import « ./apercuPdf ») : une
 * telle paire compile sous Linux et casse l'installeur Windows. Aucun doublon de ce genre.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = new URL("..", import.meta.url).pathname;
const CODE = /\.(tsx?|mjs|js|css)$/;

function doublons(dossier: string, out: string[]): void {
  const vus = new Map<string, string>();
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      doublons(join(dossier, e.name), out);
      continue;
    }
    if (!CODE.test(e.name)) continue;
    const cle = e.name.replace(/\.(d\.)?[^.]+$/, "").toLowerCase();
    const autre = vus.get(cle);
    if (autre && autre !== e.name && autre.replace(/\.[^.]+$/, "") !== e.name.replace(/\.[^.]+$/, "")) out.push(`${join(dossier, autre)} ↔ ${e.name}`);
    vus.set(cle, e.name);
  }
}

describe("noms de fichiers sous Windows", () => {
  it("pas deux modules d'un même dossier qui ne diffèrent que par la casse", () => {
    const out: string[] = [];
    for (const d of ["app", "modules", "packages", "outils", "tests"]) doublons(join(RACINE, d), out);
    expect(out).toEqual([]);
  });
});
