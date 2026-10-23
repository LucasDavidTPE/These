import { describe, expect, it } from "vitest";
import { enregistrerImage } from "./action";
import { EMPTY_FILTER, MemoryFs, SANS_PROJET, filterAndSort, scanLibrary } from "./library";
import {
  ajouterAuProjet,
  creerProjet,
  fichiersProjet,
  listerProjets,
  modifierProjet,
  projetsDe,
  retirerDuProjet,
  slugifier,
  sourceDe,
  sourcesSansExport,
  supprimerProjet,
} from "./projets";

const T = "2026-10-23T10:00:00+02:00";

describe("projets de figures", () => {
  it("slug lisible, sans accents", () => {
    expect(slugifier("Article MAIRE INFRA27 — œuvre")).toBe("article-maire-infra27-oeuvre");
    expect(slugifier("  ")).toBe("projet");
  });

  it("création (sous-dossiers, slug unique), liste, modification, corbeille", async () => {
    const fs = new MemoryFs();
    expect(await listerProjets(fs)).toEqual({ projets: [], problemes: [] });
    const a = await creerProjet(fs, { titre: "Article INFRA27", description: "MAIRE" }, T);
    const b = await creerProjet(fs, { titre: "Article INFRA27" }, T);
    expect([a.slug, b.slug]).toEqual(["article-infra27", "article-infra27-2"]);
    expect(fs.has("_projets/article-infra27/scripts")).toBe(true);
    expect(fs.has("_projets/article-infra27/excel")).toBe(true);
    expect(JSON.parse(fs.get("_projets/article-infra27/projet.json")!)).toEqual({ format: 1, titre: "Article INFRA27", description: "MAIRE", cree: T, modifie: T });
    fs.put("_projets/casse/projet.json", "{");
    const l = await listerProjets(fs);
    expect(l.projets.map((p) => p.slug)).toEqual(["article-infra27", "article-infra27-2"]);
    expect(l.problemes.map((p) => p.slug)).toEqual(["casse"]);

    // champ inconnu gardé
    fs.put("_projets/article-infra27/projet.json", JSON.stringify({ ...JSON.parse(fs.get("_projets/article-infra27/projet.json")!), futur: 1 }));
    const m = await modifierProjet(fs, "article-infra27", { titre: "Article MAIRE", description: "" }, "2026-10-24T10:00:00+02:00");
    expect(m.description).toBeUndefined();
    expect(JSON.parse(fs.get("_projets/article-infra27/projet.json")!)).toMatchObject({ titre: "Article MAIRE", futur: 1, modifie: "2026-10-24T10:00:00+02:00" });
    await expect(creerProjet(fs, { titre: " " }, T)).rejects.toThrow(/titre/);

    const dest = await supprimerProjet(fs, "article-infra27-2", T);
    expect(dest).toBe("_projets/_corbeille/article-infra27-2-2026-10-23-10-00-00");
    expect((await listerProjets(fs)).projets.map((p) => p.slug)).toEqual(["article-infra27"]);
  });

  it("une figure dans plusieurs projets, ou dans aucun ; filtre de la bibliothèque", async () => {
    const fs = new MemoryFs();
    const f1 = await enregistrerImage(fs, { titre: "Un", png: new Uint8Array([1]), source: "x" }, T, "PC");
    const f2 = await enregistrerImage(fs, { titre: "Deux", png: new Uint8Array([1]), source: "x" }, T, "PC");
    expect(await ajouterAuProjet(fs, f1, "a", T, "PC")).toBe(true);
    expect(await ajouterAuProjet(fs, f1, "a", T, "PC")).toBe(false);
    await ajouterAuProjet(fs, f1, "b", T, "PC");
    expect(projetsDe(JSON.parse(fs.get(`${f1}/meta.json`)!))).toEqual(["a", "b"]);

    const idx = await scanLibrary(fs);
    const titres = (projet: string | null) => filterAndSort(idx.figures, { ...EMPTY_FILTER, projet }, "title").map((e) => e.meta?.title);
    expect(titres(null)).toEqual(["Deux", "Un"]);
    expect(titres("b")).toEqual(["Un"]);
    expect(titres(SANS_PROJET)).toEqual(["Deux"]);

    await retirerDuProjet(fs, f1, "a", T, "PC");
    await retirerDuProjet(fs, f1, "b", T, "PC");
    expect("projets" in JSON.parse(fs.get(`${f1}/meta.json`)!)).toBe(false);
    void f2;
  });

  it("fichiers du projet : scripts (sans la bibliothèque fournie) et classeurs (sans fichiers verrous d'Excel)", async () => {
    const fs = new MemoryFs({
      "_projets/p/scripts/trace.py": "",
      "_projets/p/scripts/these_figures.py": "",
      "_projets/p/scripts/notes.txt": "",
      "_projets/p/excel/Fig 2.xlsx": "",
      "_projets/p/excel/~$Fig 2.xlsx": "",
      "_projets/p/excel/ancien.xlsm": "",
    });
    expect(await fichiersProjet(fs, "p")).toEqual({ scripts: ["trace.py"], classeurs: ["ancien.xlsm", "Fig 2.xlsx"], svgs: [], sourcesVectorielles: [] });
    expect(await fichiersProjet(fs, "absent")).toEqual({ scripts: [], classeurs: [], svgs: [], sourcesVectorielles: [] });
  });

  it("dessins VectorCraft : document de travail associé à son export SVG", async () => {
    const fs = new MemoryFs({ "_projets/p/svg/Coupe.vectorcraft": "{}", "_projets/p/svg/coupe.svg": "<svg/>", "_projets/p/svg/Plan.vectorcraft": "{}", "_projets/p/svg/seul.svg": "<svg/>" });
    const f = await fichiersProjet(fs, "p");
    expect(f.sourcesVectorielles).toEqual(["Coupe.vectorcraft", "Plan.vectorcraft"]);
    expect(sourceDe("coupe.svg", f.sourcesVectorielles)).toBe("Coupe.vectorcraft");
    expect(sourceDe("seul.svg", f.sourcesVectorielles)).toBeUndefined();
    expect(sourcesSansExport(f.svgs, f.sourcesVectorielles)).toEqual(["Plan.vectorcraft"]);
  });
});
