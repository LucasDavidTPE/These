import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { etatGraphique, importerGraphique, lireGraphiques, origineExcel, regenererGraphique } from "./excelFigures";
import { MemoryFs, scanLibrary } from "./library";
import { creerProjet, projetsDe } from "./projets";

const T = "2026-10-23T10:00:00+02:00";
const classeur = new Uint8Array(readFileSync(new URL("./graph/fixtures/excel-graphiques.xlsx", import.meta.url)));
const rendu = async () => new Uint8Array([1]);

describe("graphiques Excel d'un projet → figures liées", () => {
  it("import rangé dans le projet, état, régénération quand le classeur change", async () => {
    const fs = new MemoryFs();
    const p = await creerProjet(fs, { titre: "Article" }, T);
    await fs.writeBytesAtomic(`_projets/${p.slug}/excel/Fig 2.xlsx`, classeur);
    const graphiques = await lireGraphiques(fs, p.slug, "Fig 2.xlsx");
    const g = graphiques[0]!;
    expect(etatGraphique(g, p.slug, "Fig 2.xlsx", (await scanLibrary(fs)).figures).etat).toBe("nouveau");

    const dossier = await importerGraphique(fs, p.slug, "Fig 2.xlsx", g, rendu, T, "PC");
    const meta = JSON.parse(fs.get(`${dossier}/meta.json`)!);
    expect(meta.title).toBe("Module complexe");
    expect(projetsDe(meta)).toEqual([p.slug]);
    expect(origineExcel(meta)).toMatchObject({ projet: p.slug, classeur: "Fig 2.xlsx", graphique: "Mes données/Chart 1" });
    expect(meta.source.note).toBe("Excel : Fig 2.xlsx › Mes données › Chart 1");
    let figures = (await scanLibrary(fs)).figures;
    expect(etatGraphique(g, p.slug, "Fig 2.xlsx", figures).etat).toBe("a-jour");
    // sans titre : nom du classeur et de l'objet
    const d2 = await importerGraphique(fs, p.slug, "Fig 2.xlsx", graphiques[1]!, rendu, T, "PC");
    expect(JSON.parse(fs.get(`${d2}/meta.json`)!).title).toBe("Fig 2 — Chart 1");

    // retouche dans Figures (titre d'axe), puis le classeur change : à mettre à jour
    const graphe = JSON.parse(fs.get(`${dossier}/graph.json`)!);
    fs.put(`${dossier}/graph.json`, JSON.stringify({ ...graphe, y: { ...graphe.y, label: "Module (MPa)" } }));
    const modifie = { ...g, graphe: { ...g.graphe!, series: g.graphe!.series.map((s) => ({ ...s, y: s.y.map((v) => v * 2) })) } };
    figures = (await scanLibrary(fs)).figures;
    expect(etatGraphique(modifie, p.slug, "Fig 2.xlsx", figures).etat).toBe("a-mettre-a-jour");

    // régénération depuis le classeur (inchangé ici) : données relues, retouche gardée, empreinte notée
    await regenererGraphique(fs, dossier, { ...origineExcel(meta)!, empreinte: "périmée" }, rendu, "2026-10-24T10:00:00+02:00", "PC");
    expect(JSON.parse(fs.get(`${dossier}/graph.json`)!).y.label).toBe("Module (MPa)");
    expect(origineExcel(JSON.parse(fs.get(`${dossier}/meta.json`)!))!.empreinte).toBe(origineExcel(meta)!.empreinte);

    await expect(regenererGraphique(fs, dossier, { ...origineExcel(meta)!, graphique: "Mes données/Disparu" }, rendu, T, "PC")).rejects.toThrow(/n'est plus dans/);
    await expect(regenererGraphique(fs, dossier, { ...origineExcel(meta)!, classeur: "absent.xlsx" }, rendu, T, "PC")).rejects.toThrow(/introuvable/);
  });
});
