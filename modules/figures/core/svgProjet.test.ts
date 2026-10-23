import { describe, expect, it } from "vitest";
import { MemoryFs, scanLibrary } from "./library";
import { creerProjet, fichiersProjet, projetsDe } from "./projets";
import { deposerSvg, etatSvg, importerSvgProjet, origineSvg, regenererSvgProjet } from "./svgProjet";

const T = "2026-10-23T10:00:00+02:00";
const rendu = async () => new Uint8Array([1]);
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="20mm"><rect width="10" height="5"/></svg>';

describe("SVG d'un projet → figures liées", () => {
  it("dépôt, import rangé dans le projet, retouche dans Inkscape, mise à jour", async () => {
    const fs = new MemoryFs();
    const p = await creerProjet(fs, { titre: "Article" }, T);
    expect(fs.has(`_projets/${p.slug}/svg`)).toBe(true);
    await expect(deposerSvg(fs, p.slug, "x.svg", "pas un dessin")).rejects.toThrow(/pas un SVG/);
    expect(await deposerSvg(fs, p.slug, "Coupe chaussée.svg", DESSIN)).toBe("Coupe chaussée.svg");
    expect(await deposerSvg(fs, p.slug, "Coupe chaussée.svg", DESSIN)).toBe("Coupe chaussée (2).svg");
    expect((await fichiersProjet(fs, p.slug)).svgs).toEqual(["Coupe chaussée (2).svg", "Coupe chaussée.svg"]);

    let figures = (await scanLibrary(fs)).figures;
    expect(etatSvg(p.slug, "Coupe chaussée.svg", DESSIN, figures).etat).toBe("nouveau");
    const d = await importerSvgProjet(fs, p.slug, "Coupe chaussée.svg", rendu, T, "PC");
    const meta = JSON.parse(fs.get(`${d}/meta.json`)!);
    expect(meta).toMatchObject({ title: "Coupe chaussée", kind: "image", source: { note: "SVG du projet : Coupe chaussée.svg" } });
    expect(projetsDe(meta)).toEqual([p.slug]);
    expect(fs.get(`${d}/export.svg`)).toBe(DESSIN);
    figures = (await scanLibrary(fs)).figures;
    expect(etatSvg(p.slug, "Coupe chaussée.svg", DESSIN, figures).etat).toBe("a-jour");

    const retouche = DESSIN.replace('width="10"', 'width="30"');
    fs.put(`_projets/${p.slug}/svg/Coupe chaussée.svg`, retouche);
    expect(etatSvg(p.slug, "Coupe chaussée.svg", retouche, figures).etat).toBe("a-mettre-a-jour");
    await regenererSvgProjet(fs, d, origineSvg(meta)!, rendu, T, "PC");
    expect(fs.get(`${d}/export.svg`)).toBe(retouche);
    figures = (await scanLibrary(fs)).figures;
    expect(etatSvg(p.slug, "Coupe chaussée.svg", retouche, figures).etat).toBe("a-jour");

    await expect(regenererSvgProjet(fs, d, { ...origineSvg(meta)!, fichier: "absent.svg" }, rendu, T, "PC")).rejects.toThrow(/n'est plus/);
  });
});
