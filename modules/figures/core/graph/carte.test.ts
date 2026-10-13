import { describe, expect, it } from "vitest";
import { bornesCarte, couleursCarte, palier, type CarteDoc } from "./carte";
import { exportGraphSvg, exportPgfplots } from "./export";
import { graphLayout, marginsOf } from "./layout";
import { emptyGraph, validateGraph, type GraphDoc } from "./model";

const carte = (o: Partial<CarteDoc> = {}): CarteDoc => ({
  x: [0, 1, 2, 3],
  y: [-2, -1, 0],
  v: [
    [-3, -1, 1, 3],
    [-2, 0, 2, null],
    [-1, 0, 1, 2],
  ],
  palette: "divergente",
  niveaux: 8,
  legende: "$\\varepsilon_{zz}$ (µdef)",
  inverser: false,
  ...o,
});
const doc = (c: CarteDoc = carte()): GraphDoc => ({ ...emptyGraph(), width: 120, height: 60, x: { label: "$y$ (mm)", log: false }, y: { label: "$z$ (mm)", log: false }, carte: c });

describe("carte en couleurs d'un graphe", () => {
  it("validation : aller-retour, tailles contrôlées, réglages par défaut", () => {
    const v = validateGraph(JSON.parse(JSON.stringify(doc())));
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.doc.carte).toEqual(carte());
    const faux = validateGraph({ ...doc(), carte: { ...carte(), v: [[1, 2]] } });
    expect(faux.ok).toBe(false);
    if (!faux.ok) expect(faux.errors[0]!.path).toBe("carte.v");
    expect(validateGraph({ ...doc(), carte: { ...carte(), x: [0, 2, 1, 3] } }).ok).toBe(false);
    const d = validateGraph({ ...doc(), carte: { x: [0, 1], y: [0, 1], v: [[1, 2], [3, 4]] } });
    expect(d.ok && d.doc.carte).toMatchObject({ palette: "viridis", niveaux: 24, legende: "", inverser: false });
  });

  it("bornes : symétriques en divergente, imposées sinon ; paliers et couleurs", () => {
    expect(bornesCarte(carte())).toEqual([-3, 3]);
    expect(bornesCarte(carte({ palette: "viridis" }))).toEqual([-3, 3]);
    expect(bornesCarte(carte({ palette: "viridis", min: 0 }))).toEqual([0, 3]);
    expect(bornesCarte(carte({ min: -1, max: 1 }))).toEqual([-1, 1]);
    expect([palier(carte(), [-3, 3], -3), palier(carte(), [-3, 3], 0), palier(carte(), [-3, 3], 3), palier(carte(), [-3, 3], 99)]).toEqual([0, 4, 7, 7]);
    const c = couleursCarte(carte());
    expect(c).toHaveLength(8);
    expect(couleursCarte(carte({ inverser: true }))).toEqual([...c].reverse());
  });

  it("mise en page : cellules dans la boîte, barre de couleurs à droite, marge élargie", () => {
    const d = doc();
    expect(marginsOf(d).right).toBeGreaterThan(marginsOf({ ...d, carte: undefined }).right + 10);
    const { box, primitives } = graphLayout(d);
    const cellules = primitives.filter((p) => p.kind === "rect" && p.stroke === null && p.x < box.x + box.w);
    expect(cellules.length).toBeGreaterThan(5);
    for (const p of cellules) if (p.kind === "rect") expect(p.x + p.w).toBeLessThanOrEqual(box.x + box.w + 0.06);
    const barre = primitives.filter((p) => p.kind === "rect" && p.stroke === null && p.x > box.x + box.w);
    expect(barre).toHaveLength(8);
    expect(primitives.some((p) => p.kind === "text" && p.text === d.carte!.legende && p.rotate === 90)).toBe(true);
    const svg = exportGraphSvg(d);
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(svg).toBe(exportGraphSvg(d));
  });

  it("pgfplots : matrix plot, mêmes bornes et paliers, nan pour une case vide, fichier de données", () => {
    const t = exportPgfplots(doc()).tex;
    expect(t).toContain("matrix plot*, mesh/cols=4, mesh/rows=3, point meta=explicit");
    expect(t).toContain("point meta min=-3, point meta max=3");
    expect(t).toContain("colormap access=piecewise constant");
    expect(t).toContain("3 -1 nan \\\\");
    expect(t).toContain("ylabel={$\\varepsilon_{zz}$ (µdef)}");
    const f = exportPgfplots(doc(), { dataFiles: true });
    expect(f.files["export-carte.dat"]!.split("\n")[0]).toBe("x y c");
    expect(f.tex).toContain("{\\figurinedatadir export-carte.dat}");
  });
});
