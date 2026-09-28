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

describe("graphes modifiables", () => {
  const doc = (y: number[], label = "|E*| (MPa)") => ({
    format: "figurine-graph/1",
    width: 120,
    height: 80,
    theme: "these",
    x: { label: "f·a_T (Hz)", log: true },
    y: { label, log: true },
    legend: "south east",
    grid: false,
    bar_width: 3,
    series: [{ name: "15 °C", type: "points", x: [0.1, 1, 10], y, legend: true }],
  });
  const rendu = async () => new Uint8Array([7]);

  it("un graphe devient une figure « graph » avec pgfplots, SVG et PNG", async () => {
    const { enregistrerGraphe } = await import("./action");
    const fs = new MemoryFs();
    const dossier = await enregistrerGraphe(fs, { titre: "Courbe maîtresse", source: "Traitement", graphe: doc([1000, 5000, 20000]), origine: { module: "traitement" } }, rendu, "2026-09-28T10:00:00+02:00", "PC");
    const meta = JSON.parse(fs.get(`${dossier}/meta.json`)!);
    expect(meta.kind).toBe("graph");
    expect(meta.origine).toEqual({ module: "traitement" });
    expect(fs.get(`${dossier}/export.tex`)).toContain("\\begin{axis}");
    expect(fs.get(`${dossier}/export.svg`)).toContain("<svg");
    expect(fs.getBytes(`${dossier}/export.png`)).toEqual(new Uint8Array([7]));
    await expect(enregistrerGraphe(fs, { titre: "x", source: "x", graphe: { format: "autre" } }, rendu, "2026-09-28T10:00:00+02:00", "PC")).rejects.toThrow("Graphe invalide");
  });

  it("régénérer remplace les données et garde la mise en forme choisie dans Figures", async () => {
    const { enregistrerGraphe, remplacerGraphe } = await import("./action");
    const fs = new MemoryFs();
    const dossier = await enregistrerGraphe(fs, { titre: "G", source: "T", graphe: doc([1000, 5000, 20000]) }, rendu, "2026-09-28T10:00:00+02:00", "PC");
    const modifie = { ...JSON.parse(fs.get(`${dossier}/graph.json`)!), width: 160, style: { name: "Couleur", palette: ["#0072b2", "#e69f00"] } };
    modifie.y.label = "Norm of the complex modulus (MPa)";
    modifie.series[0].color = "#123456";
    await fs.writeTextAtomic(`${dossier}/graph.json`, JSON.stringify(modifie));
    await remplacerGraphe(fs, dossier, doc([1100, 5100, 21000]), rendu, "2026-09-29T10:00:00+02:00", "PC");
    const apres = JSON.parse(fs.get(`${dossier}/graph.json`)!);
    expect(apres.width).toBe(160);
    expect(apres.y.label).toBe("Norm of the complex modulus (MPa)");
    expect(apres.series[0].y).toEqual([1100, 5100, 21000]);
    expect(apres.series[0].color).toBe("#123456");
    expect(apres.style.palette).toEqual(["#0072b2", "#e69f00"]);
  });

  it("régénérer une ancienne figure image la laisse image, même si le module fournit un graphe", async () => {
    const { enregistrerImage, regenerer } = await import("./action");
    const fs = new MemoryFs();
    const dossier = await enregistrerImage(fs, { titre: "Ancienne", source: "T", png: new Uint8Array([1]) }, "2026-09-28T10:00:00+02:00", "PC");
    await regenerer(fs, dossier, { png: new Uint8Array([2]), graphe: doc([1, 2, 3]) }, rendu, "2026-09-29T10:00:00+02:00", "PC");
    expect(fs.get(`${dossier}/graph.json`)).toBeUndefined();
    expect(fs.getBytes(`${dossier}/export.png`)).toEqual(new Uint8Array([2]));
    const g = await enregistrerGraphe2(fs);
    await regenerer(fs, g, { png: new Uint8Array([2]), graphe: doc([4, 5, 6]) }, rendu, "2026-09-29T10:00:00+02:00", "PC");
    expect(JSON.parse(fs.get(`${g}/graph.json`)!).series[0].y).toEqual([4, 5, 6]);
  });

  async function enregistrerGraphe2(fs: MemoryFs) {
    const { enregistrerGraphe } = await import("./action");
    return enregistrerGraphe(fs, { titre: "G", source: "T", graphe: doc([1, 2, 3]) }, rendu, "2026-09-28T10:00:00+02:00", "PC");
  }
});
