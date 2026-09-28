import { describe, expect, it } from "vitest";
import { exportGraphSvg, exportPgfplots } from "./export";
import { validateGraph, type GraphDoc } from "./model";
import { graphTheme, isPlain, normalizeHex, parsePalette, parseStyle, STYLE_PRESETS, styleFileName, tikzColor } from "./style";
import { GRAPH_TEMPLATES } from "./templates";

const base = (): GraphDoc => ({
  format: "figurine-graph/1",
  width: 120,
  height: 80,
  theme: "these",
  x: { label: "x", log: false },
  y: { label: "y", log: false },
  legend: "north east",
  grid: false,
  bar_width: 3,
  series: [
    { name: "A", type: "linepoints", x: [0, 1, 2], y: [1, 2, 3], legend: true },
    { name: "B", type: "points", x: [0, 1, 2], y: [2, 1, 0], legend: true },
  ],
});

describe("palettes", () => {
  it("lit une adresse coolors, une liste de codes, des rgb()", () => {
    expect(parsePalette("https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51")).toEqual(["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"]);
    expect(parsePalette("https://coolors.co/palette/264653-2a9d8f")).toEqual(["#264653", "#2a9d8f"]);
    expect(parsePalette("#264653, #2A9D8F\n#e9c46a #264653")).toEqual(["#264653", "#2a9d8f", "#e9c46a"]);
    expect(parsePalette('"Charcoal":"264653","Persian green":"2a9d8f"')).toEqual(["#264653", "#2a9d8f"]);
    expect(parsePalette("rgb(38, 70, 83) rgba(42,157,143,1)")).toEqual(["#264653", "#2a9d8f"]);
    expect(parsePalette("bonjour")).toEqual([]);
    expect(normalizeHex("#AbC")).toBe("#aabbcc");
    expect(tikzColor("#264653")).toBe("{rgb,255:red,38;green,70;blue,83}");
  });
});

describe("styles de graphe", () => {
  it("sans style ni réglage de série, le rendu d'origine est inchangé", () => {
    const doc = base();
    expect(isPlain(doc)).toBe(true);
    expect(exportPgfplots(doc).tex).toContain("fig/serie 1");
    expect(exportGraphSvg(doc)).not.toContain('stroke="#0072b2"');
  });

  it("un style colore les séries dans le SVG et dans pgfplots", () => {
    const doc = { ...base(), style: STYLE_PRESETS.find((p) => p.id === "couleur")!.style! };
    const v = validateGraph(JSON.parse(JSON.stringify(doc)));
    expect(v.ok && v.doc.style?.name).toBe("Couleur");
    const svg = exportGraphSvg(doc);
    expect(svg).toContain('stroke="#0072b2"');
    expect(svg).toContain('stroke="#e69f00"');
    const tex = exportPgfplots(doc).tex;
    expect(tex).not.toContain("fig/serie 1");
    expect(tex).toContain("draw={rgb,255:red,0;green,114;blue,178}");
    expect(tex).toContain("only marks");
  });

  it("couleur, marque et tirets d'une série l'emportent sur le style", () => {
    const doc = base();
    doc.series[0] = { ...doc.series[0]!, color: "#ff0000", dash: "dotted", mark: "none" };
    const v = validateGraph(JSON.parse(JSON.stringify(doc)));
    expect(v.ok && v.doc.series[0]).toMatchObject({ color: "#ff0000", dash: "dotted", mark: "none" });
    const t = graphTheme(doc);
    expect(t.graph.series[0]).toMatchObject({ svg: "#ff0000", dash: "dotted", noMark: true });
    // la série 2 garde le rendu du thème
    expect(t.graph.series[1]!.svg).toBe("black");
    expect(exportPgfplots(doc).tex).toContain("draw={rgb,255:red,255;green,0;blue,0}, line width=0.3mm, dotted, mark=none");
  });

  it("axes seuls, texte agrandi : cadre et police suivent", () => {
    const doc = { ...base(), style: STYLE_PRESETS.find((p) => p.id === "presentation")!.style!, };
    doc.style = { ...doc.style, frame: "axes" };
    const tex = exportPgfplots(doc).tex;
    expect(tex).toContain("axis lines=left");
    expect(tex).toContain("font=\\normalsize");
    expect(exportGraphSvg(doc)).not.toContain('<rect x="21');
  });

  it("style illisible ignoré, valeurs bornées, nom de fichier sûr", () => {
    expect(parseStyle({ palette: [] })).toBeNull();
    expect(parseStyle({ palette: ["#fff"], lineWidth: 99 })!.lineWidth).toBe(2);
    expect(styleFileName("Présentation ENTPE !")).toBe("presentation-entpe.json");
  });
});

describe("modèles de graphes", () => {
  it("chaque modèle est un graphe valide qui s'exporte", () => {
    for (const t of GRAPH_TEMPLATES) {
      const v = validateGraph(JSON.parse(JSON.stringify(t.doc)));
      expect(v.ok, t.id).toBe(true);
      expect(exportGraphSvg(t.doc)).toContain("<svg");
      expect(exportPgfplots(t.doc).tex).toContain("\\begin{axis}");
    }
  });
});
