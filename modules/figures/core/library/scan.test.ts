import { describe, expect, it } from "vitest";
import { MemoryFs } from "./memoryFs";
import { serializeMeta, newMeta, type FigureKind } from "./meta";
import { describeIssue, scanLibrary } from "./scan";

const NOW = "2026-09-25T10:00:00+02:00";

function metaJson(id: string, title = "Titre", kind: FigureKind = "schema"): string {
  return serializeMeta(newMeta({ id, title, kind, now: NOW, host: "PC-TRAVAIL" }));
}

describe("scanLibrary", () => {
  it("bibliothèque vide", async () => {
    const index = await scanLibrary(new MemoryFs());
    expect(index).toEqual({ figures: [], issues: [], rootConflicts: [], ignored: [], nextId: "FIG-0001" });
  });

  it("indexe les figures triées par ID numérique", async () => {
    const fs = new MemoryFs({
      "figurine-library.json": "{}",
      "FIG-0010_structure/meta.json": metaJson("FIG-0010", "Structure"),
      "FIG-0010_structure/figure.json": "{}",
      "FIG-0010_structure/export.svg": "<svg/>",
      "FIG-0002_photo/meta.json": metaJson("FIG-0002", "Photo", "image"),
      "FIG-0002_photo/original.png": "png",
      "Mes brouillons/notes.txt": "x",
    });
    const index = await scanLibrary(fs);
    expect(index.figures.map((f) => f.folder)).toEqual(["FIG-0002_photo", "FIG-0010_structure"]);
    expect(index.figures[1]!.files).toEqual(["figure.json", "meta.json", "export.svg"]);
    expect(index.figures[0]!.meta?.kind).toBe("image");
    expect(index.ignored).toEqual(["Mes brouillons"]);
    expect(index.issues).toEqual([]);
    expect(index.nextId).toBe("FIG-0011");
  });

  it("signale meta.json absent, illisible ou invalide sans s'arrêter", async () => {
    const fs = new MemoryFs({
      "FIG-0001_a/export.svg": "<svg/>",
      "FIG-0002_b/meta.json": "{ pas du json",
      "FIG-0003_c/meta.json": JSON.stringify({ id: "FIG-0003", title: "" }),
      "FIG-0004_d/meta.json": metaJson("FIG-0004"),
    });
    const index = await scanLibrary(fs);
    expect(index.figures).toHaveLength(4);
    expect(index.figures.map((f) => f.meta !== null)).toEqual([false, false, false, true]);
    expect(index.issues.map((i) => i.type)).toEqual(["missing-meta", "unreadable-meta", "invalid-meta"]);
    expect(index.issues.map(describeIssue)[2]).toContain("title : ne doit pas être vide.");
  });

  it("détecte un ID de meta.json différent du dossier et en tient compte pour le prochain ID", async () => {
    const fs = new MemoryFs({ "FIG-0001_a/meta.json": metaJson("FIG-0042") });
    const index = await scanLibrary(fs);
    expect(index.issues).toEqual([{ type: "id-mismatch", folder: "FIG-0001_a", metaId: "FIG-0042" }]);
    expect(index.nextId).toBe("FIG-0043");
  });

  it("détecte deux dossiers avec le même ID (créés hors ligne sur deux PC)", async () => {
    const fs = new MemoryFs({
      "FIG-0005_travail/meta.json": metaJson("FIG-0005"),
      "FIG-0005_maison/meta.json": metaJson("FIG-0005"),
    });
    const index = await scanLibrary(fs);
    expect(index.issues).toEqual([
      { type: "duplicate-id", id: "FIG-0005", folders: ["FIG-0005_maison", "FIG-0005_travail"] },
    ]);
    expect(index.nextId).toBe("FIG-0006");
  });

  it("détecte les copies de conflit OneDrive, dans la figure et à la racine", async () => {
    const fs = new MemoryFs({
      "figurine-library.json": "{}",
      "figurine-library-PC-MAISON.json": "{}",
      "FIG-0001_a/meta.json": metaJson("FIG-0001"),
      "FIG-0001_a/figure.json": "{}",
      "FIG-0001_a/figure-PC-MAISON.json": "{}",
      "FIG-0001_a/.conflits/old_meta.json": "{}",
    });
    const index = await scanLibrary(fs);
    expect(index.rootConflicts.map((c) => c.copy)).toEqual(["figurine-library-PC-MAISON.json"]);
    expect(index.figures[0]!.conflicts).toEqual([
      { original: "figure.json", copy: "figure-PC-MAISON.json", tag: "PC-MAISON" },
    ]);
    expect(index.issues.map((i) => i.type)).toEqual(["conflict-copy"]);
  });

  it("repère les écritures interrompues sans perdre la version précédente", async () => {
    const fs = new MemoryFs({
      "FIG-0001_a/meta.json": metaJson("FIG-0001", "Avant"),
      "FIG-0001_a/meta.json.tmp": '{"id": "FIG-00',
    });
    const index = await scanLibrary(fs);
    expect(index.figures[0]!.meta?.title).toBe("Avant");
    expect(index.figures[0]!.leftovers).toEqual(["meta.json.tmp"]);
    expect(index.issues).toEqual([{ type: "interrupted-write", folder: "FIG-0001_a", file: "meta.json.tmp" }]);
  });

  it("lit le verrou, même illisible", async () => {
    const fs = new MemoryFs({
      "FIG-0001_a/meta.json": metaJson("FIG-0001"),
      "FIG-0001_a/.lock": '{"host":"PC-MAISON","since":"2026-09-25T08:00:00Z"}',
      "FIG-0002_b/meta.json": metaJson("FIG-0002"),
      "FIG-0002_b/.lock": "",
    });
    const index = await scanLibrary(fs);
    expect(index.figures[0]!.lock).toEqual({ host: "PC-MAISON", since: "2026-09-25T08:00:00Z" });
    expect(index.figures[1]!.lock?.host).toBe("?");
  });

  it("accepte espaces et accents dans les noms", async () => {
    const fs = new MemoryFs({
      "FIG-0001_é à/meta.json": metaJson("FIG-0001", "Chaussée à l'étude"),
    });
    const index = await scanLibrary(fs);
    expect(index.figures[0]!.meta?.title).toBe("Chaussée à l'étude");
  });
});
