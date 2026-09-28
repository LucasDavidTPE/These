import { describe, expect, it } from "vitest";
import { actionRegeneration, enregistrerImage, origineDe, remplacerImage } from "./action";
import { MemoryFs, validateMeta } from "./library";

describe("figures régénérables", () => {
  it("une figure garde son origine et son SVG", async () => {
    const fs = new MemoryFs();
    const origine = { module: "campagnes", campagne: "b2c4", essai: "Essai1", vue: { masquees: ["Force"], plage: [1, 2] } };
    const dossier = await enregistrerImage(fs, { titre: "Courbes", png: new Uint8Array([1]), svg: "<svg/>", source: "Campagnes", origine }, "2026-09-26T12:00:00+02:00", "PC-TRAVAIL");
    expect(fs.get(`${dossier}/export.svg`)).toBe("<svg/>");
    const v = validateMeta(JSON.parse(fs.get(`${dossier}/meta.json`)!));
    expect(v.ok).toBe(true);
    const o = origineDe(v.ok ? v.meta : null)!;
    expect(o).toEqual(origine);
    expect(actionRegeneration(o)).toBe("campagnes.regenerer-figure");
  });

  it("régénérer remplace l'image sans toucher à la fiche", async () => {
    const fs = new MemoryFs();
    const dossier = await enregistrerImage(fs, { titre: "Gantt", png: new Uint8Array([1]), source: "Planning", tags: ["gantt"], origine: { module: "planning" } }, "2026-09-26T12:00:00+02:00", "PC-TRAVAIL");
    const meta = await remplacerImage(fs, dossier, { png: new Uint8Array([2, 3]), svg: "<svg>2</svg>" }, "2026-10-01T09:00:00+02:00", "PC-PERSO");
    expect(fs.getBytes(`${dossier}/export.png`)).toEqual(new Uint8Array([2, 3]));
    expect(fs.getBytes(`${dossier}/original.png`)).toEqual(new Uint8Array([1]));
    expect(fs.get(`${dossier}/export.svg`)).toBe("<svg>2</svg>");
    expect(meta).toMatchObject({ title: "Gantt", tags: ["gantt"], regenere: "2026-10-01T09:00:00+02:00", last_host: "PC-PERSO", origine: { module: "planning" } });
  });

  it("sans origine valide, rien à régénérer", () => {
    expect(origineDe(null)).toBeNull();
    expect(origineDe({ origine: "planning" } as never)).toBeNull();
  });
});
