import { describe, expect, it } from "vitest";
import { planConflictResolution } from "./conflicts";
import { AlreadyExistsError, type LibraryFs } from "./fs";
import { MemoryFs } from "./memoryFs";
import { serializeMeta, validateMeta } from "./meta";
import { scanLibrary } from "./scan";
import { applyFileOps, createFigure, saveCropFigure, saveImageFigure, saveMeta } from "./store";

const NOW = "2026-09-25T10:00:00+02:00";

describe("createFigure", () => {
  it("crée FIG-0001 dans une bibliothèque vide", async () => {
    const fs = new MemoryFs();
    const created = await createFigure(fs, { title: "Modèle 2S2P1D", kind: "schema", now: NOW, host: "PC-TRAVAIL" });
    expect(created.folder).toBe("FIG-0001_modele-2s2p1d");
    expect(fs.snapshot()).toEqual({ "FIG-0001_modele-2s2p1d/meta.json": serializeMeta(created.meta) });
    expect(validateMeta(JSON.parse(fs.get("FIG-0001_modele-2s2p1d/meta.json")!)).ok).toBe(true);
    expect(created.meta.last_host).toBe("PC-TRAVAIL");
  });

  it("prend max + 1", async () => {
    const fs = new MemoryFs();
    fs.mkdirp("FIG-0003_x");
    fs.mkdirp("FIG-0007_y");
    const { meta } = await createFigure(fs, { title: "Z", kind: "image", now: NOW, host: "PC" });
    expect(meta.id).toBe("FIG-0008");
  });

  it("saute un ID dont le dossier apparaît entre le scan et la création", async () => {
    const fs = new MemoryFs();
    // Simule OneDrive qui dépose FIG-0001 juste après le scan.
    const racing: LibraryFs = {
      listDir: (p) => fs.listDir(p),
      readText: (p) => fs.readText(p),
      readBytes: (p) => fs.readBytes(p),
      writeTextAtomic: (p, c) => fs.writeTextAtomic(p, c),
      writeBytesAtomic: (p, c) => fs.writeBytesAtomic(p, c),
      rename: (a, b) => fs.rename(a, b),
      createDir: async (p) => {
        if (p.startsWith("FIG-0001")) throw new AlreadyExistsError(p);
        return fs.createDir(p);
      },
    };
    const { meta, folder } = await createFigure(racing, { title: "A", kind: "graph", now: NOW, host: "PC" });
    expect(meta.id).toBe("FIG-0002");
    expect(folder).toBe("FIG-0002_a");
  });
});

describe("saveMeta", () => {
  it("met à jour modified et last_host", async () => {
    const fs = new MemoryFs();
    const { folder, meta } = await createFigure(fs, { title: "A", kind: "schema", now: NOW, host: "PC-TRAVAIL" });
    const later = "2026-09-26T08:00:00+02:00";
    const saved = await saveMeta(fs, folder, { ...meta, tags: ["TFE"] }, { now: later, host: "PC-MAISON" });
    expect(saved).toMatchObject({ created: NOW, modified: later, last_host: "PC-MAISON", tags: ["TFE"] });
    expect(fs.get(`${folder}/meta.json`)).toBe(serializeMeta(saved));
  });
});

describe("résolution d'un conflit", () => {
  const setup = () =>
    new MemoryFs({
      "FIG-0001_a/meta.json": "travail",
      "FIG-0001_a/meta-PC-MAISON.json": "maison",
    });

  it("garder la copie : elle devient meta.json, l'ancienne est archivée, le conflit disparaît", async () => {
    const fs = setup();
    const index = await scanLibrary(fs);
    const conflict = index.figures[0]!.conflicts[0]!;
    await applyFileOps(fs, planConflictResolution("FIG-0001_a", conflict, "copy", "T1", false));
    expect(fs.snapshot()).toEqual({
      "FIG-0001_a/.conflits/T1_meta.json": "travail",
      "FIG-0001_a/meta.json": "maison",
    });
    expect((await scanLibrary(fs)).figures[0]!.conflicts).toEqual([]);
  });

  it("garder l'original : la copie est archivée", async () => {
    const fs = setup();
    const conflict = (await scanLibrary(fs)).figures[0]!.conflicts[0]!;
    await applyFileOps(fs, planConflictResolution("FIG-0001_a", conflict, "original", "T1", false));
    expect(fs.snapshot()).toEqual({
      "FIG-0001_a/.conflits/T1_meta-PC-MAISON.json": "maison",
      "FIG-0001_a/meta.json": "travail",
    });
  });
});

describe("saveImageFigure", () => {
  it("écrit original.png, export.png et meta.json avec la source", async () => {
    const fs = new MemoryFs();
    const { folder, meta } = await saveImageFigure(fs, {
      title: "Avion détouré",
      original: Uint8Array.from([1, 2, 3]),
      result: Uint8Array.from([4, 5]),
      source: { type: "web", url: "https://example.org/page" },
      caption: "Adapté de example.org.",
      now: NOW,
      host: "PC",
    });
    expect(folder).toBe("FIG-0001_avion-detoure");
    expect([...fs.getBytes(`${folder}/original.png`)!]).toEqual([1, 2, 3]);
    expect([...fs.getBytes(`${folder}/export.png`)!]).toEqual([4, 5]);
    expect(meta).toMatchObject({ kind: "image", source: { type: "web", url: "https://example.org/page" }, caption: "Adapté de example.org." });
    const index = await scanLibrary(fs);
    expect(index.figures[0]!.files).toEqual(["meta.json", "original.png", "export.png"]);
    expect(index.issues).toEqual([]);
  });
});

describe("saveCropFigure", () => {
  it("crée une figure crop liée à l'originale, qui hérite de sa source", async () => {
    const fs = new MemoryFs();
    const orig = await saveImageFigure(fs, {
      title: "Photo",
      original: Uint8Array.from([1]),
      result: Uint8Array.from([2]),
      source: { type: "article", author: "Huang", year: 2004 },
      caption: "Adapté de Huang (2004).",
      now: NOW,
      host: "PC",
    });
    const { meta, folder } = await saveCropFigure(fs, {
      title: "Photo recadrée",
      original: Uint8Array.from([2]),
      result: Uint8Array.from([3]),
      from: orig.meta,
      crop: { rotation: 1, rect: { x: 1, y: 2, w: 3, h: 4 } },
      now: NOW,
      host: "PC",
    });
    expect(meta).toMatchObject({ kind: "crop", derived_from: "FIG-0001", source: { author: "Huang" }, caption: "Adapté de Huang (2004).", crop: { rotation: 1 } });
    const back = validateMeta(JSON.parse(fs.get(`${folder}/meta.json`)!));
    expect(back.ok && back.meta.derived_from).toBe("FIG-0001");
    expect(validateMeta({ ...meta, derived_from: "photo" }).ok).toBe(false);
  });
});

describe("action figures.enregistrer-image", () => {
  it("crée une figure image avec sa source", async () => {
    const { enregistrerImage } = await import("../action");
    const fs = new MemoryFs();
    const dossier = await enregistrerImage(fs, { titre: "Courbes Essai1", png: new Uint8Array([137, 80, 78, 71]), source: "Campagnes, B2C4 bio, Essai1", tags: ["essai"] }, "2026-09-26T12:00:00+02:00", "PC-TRAVAIL");
    expect(dossier).toBe("FIG-0001_courbes-essai1");
    const meta = JSON.parse(fs.get(`${dossier}/meta.json`)!) as { kind: string; source: { note: string }; tags: string[] };
    expect(meta.kind).toBe("image");
    expect(meta.source.note).toBe("Campagnes, B2C4 bio, Essai1");
    expect(meta.tags).toEqual(["essai"]);
    expect(fs.getBytes(`${dossier}/export.png`)).toEqual(new Uint8Array([137, 80, 78, 71]));
  });
});
