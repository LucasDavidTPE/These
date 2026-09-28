import { describe, expect, it } from "vitest";
import { enregistrerImage } from "./action";
import { MemoryFs } from "./library";
import { detacher, figuresDe, rattacher, rattachementsDe } from "./rattachement";

const T = "2026-09-28T10:00:00+02:00";

describe("figures rattachées", () => {
  it("par l'origine (courbes d'un essai, traitement d'un essai de campagne) et à la main", async () => {
    const fs = new MemoryFs();
    const a = await enregistrerImage(fs, { titre: "Courbes", png: new Uint8Array([1]), source: "x", origine: { module: "campagnes", campagne: "b2c4", essai: "Essai1", vue: {} } }, T, "PC");
    const b = await enregistrerImage(fs, { titre: "Maîtresse", png: new Uint8Array([1]), source: "x", origine: { module: "traitement", demande: { campagne: "b2c4" }, graphe: "maitreE" } }, "2026-09-28T11:00:00+02:00", "PC");
    const c = await enregistrerImage(fs, { titre: "Photo", png: new Uint8Array([1]), source: "x" }, T, "PC");
    const cible = { type: "campagne" as const, id: "b2c4", titre: "B2C4 bio" };
    expect((await figuresDe(fs, cible)).map((f) => [f.dossier, f.lien])).toEqual([
      [b, "origine"],
      [a, "origine"],
    ]);
    await rattacher(fs, c, cible, T, "PC");
    await rattacher(fs, c, cible, T, "PC"); // pas de doublon
    const meta = JSON.parse(fs.get(`${c}/meta.json`)!);
    expect(rattachementsDe(meta)).toEqual([cible]);
    expect((await figuresDe(fs, cible)).find((f) => f.dossier === c)?.lien).toBe("manuel");
    expect(await figuresDe(fs, { type: "etude", id: "b2c4" })).toEqual([]);
    await detacher(fs, c, cible, T, "PC");
    expect((await figuresDe(fs, cible)).map((f) => f.dossier)).not.toContain(c);
  });
});
