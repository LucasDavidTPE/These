import { describe, expect, it } from "vitest";
import { classer, humaniser, indexer, inclusions } from "../core/latex";

const FIGURE = "\\documentclass[tikz]{standalone}\n\\begin{document}\n\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n\\end{document}\n";
const MAITRE = [
  "\\documentclass[12pt]{report}",
  "% \\documentclass{article}",
  "\\title{Chaussées \\emph{aéronautiques}}",
  "\\begin{document}",
  "\\include{chapitres/chap1}",
  "\\end{document}",
].join("\n");
const CHAPITRE = [
  "\\chapter{Matériaux}",
  "\\begin{figure}\\includegraphics[width=\\linewidth]{figures/schema_2S2P1D}\\caption{Modèle 2S2P1D}\\end{figure}",
  "\\includegraphics{photos/eprouvette.jpg}",
  "% \\includegraphics{ancienne}",
  "\\input{figures/absente}",
].join("\n");

describe("classement (tex.py)", () => {
  it("figure, document, fragment", () => {
    expect(classer(FIGURE)).toEqual({ nature: "figure", documentclass: "standalone", titre: "" });
    expect(classer(MAITRE)).toEqual({ nature: "document", documentclass: "report", titre: "Chaussées aéronautiques" });
    expect(classer(CHAPITRE)).toMatchObject({ nature: "fragment", titre: "Modèle 2S2P1D" });
  });

  it("un documentclass en commentaire ne compte pas", () => {
    expect(classer("% \\documentclass{standalone}\n\\begin{document}\\end{document}").nature).toBe("fragment");
    expect(humaniser("schema_2S2P1D")).toBe("schema 2S2P1D");
  });

  it("inclusions, sans les lignes commentées", () => {
    expect(inclusions(CHAPITRE)).toEqual({ entrees: ["figures/absente"], graphiques: ["figures/schema_2S2P1D", "photos/eprouvette.jpg"] });
  });
});

describe("index", () => {
  const index = indexer(
    [
      { chemin: "these.tex", texte: MAITRE },
      { chemin: "chapitres/chap1.tex", texte: CHAPITRE },
      { chemin: "figures/schema_2S2P1D.tex", texte: FIGURE, modifie: "2026-09-01T10:00:00" },
    ],
    ["figures/schema_2S2P1D.pdf", "photos/Eprouvette.JPG"],
  );
  const e = (c: string) => index.find((x) => x.chemin === c)!;

  it("qui utilise quoi, et ce qui manque", () => {
    expect(e("figures/schema_2S2P1D.tex").utilisePar).toEqual(["chapitres/chap1.tex"]);
    expect(e("chapitres/chap1.tex").utilisePar).toEqual(["these.tex"]);
    expect(e("chapitres/chap1.tex").introuvables).toEqual(["figures/absente"]);
    expect(e("these.tex").introuvables).toEqual([]);
  });

  it("titre par défaut, PDF compilé à côté, tri par chemin", () => {
    expect(e("figures/schema_2S2P1D.tex")).toMatchObject({ titre: "schema 2S2P1D", pdf: "figures/schema_2S2P1D.pdf", modifie: "2026-09-01T10:00:00" });
    expect(e("these.tex").pdf).toBeNull();
    expect(index.map((x) => x.chemin)).toEqual(["chapitres/chap1.tex", "figures/schema_2S2P1D.tex", "these.tex"]);
  });
});
