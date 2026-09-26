import { describe, expect, it } from "vitest";
import { MemoryFs, newMeta, serializeMeta } from "./library";
import { figuresRecentes } from "./recentes";

const meta = (id: string, title: string, now: string) => serializeMeta(newMeta({ id, title, kind: "image", now, host: "PC" }));

describe("figuresRecentes", () => {
  it("les plus récemment modifiées d'abord (fuseaux comparés), avec leur vignette", async () => {
    const fs = new MemoryFs({
      "FIG-0001_a/meta.json": meta("FIG-0001", "A", "2026-09-25T10:00:00+02:00"),
      "FIG-0001_a/export.png": "png",
      "FIG-0002_b/meta.json": meta("FIG-0002", "B", "2026-09-25T09:30:00+00:00"),
      "FIG-0003_c/meta.json": meta("FIG-0003", "C", "2026-09-20T10:00:00+02:00"),
      "FIG-0004_d/figure.json": "{}",
    });
    const r = await figuresRecentes(fs, 2);
    expect(r.map((f) => f.id)).toEqual(["FIG-0002", "FIG-0001"]);
    expect(r[1]).toMatchObject({ dossier: "FIG-0001_a", titre: "A", vignette: "export.png" });
    expect(r[0]!.vignette).toBeNull();
  });
});
