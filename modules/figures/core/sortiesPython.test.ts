import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryFs, scanLibrary } from "./library";
import { creerProjet, projetsDe } from "./projets";
import {
  empreinteSortie,
  etatSortie,
  importerSortie,
  installerBibliotheque,
  lireSortieGraphe,
  listerSorties,
  modeleScript,
  origineScript,
  regenererSortie,
  versionBibliotheque,
  type RendusSortie,
} from "./sortiesPython";

const T = "2026-10-23T10:00:00+02:00";
const BIBLIOTHEQUE = readFileSync(new URL("../python/these_figures.py", import.meta.url), "utf8");
const rendus: RendusSortie = { graphe: async () => new Uint8Array([1]), svg: async () => new Uint8Array([2]), pdf: async () => new Uint8Array([3]), image: async (o) => o };
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

/** Exécute un script avec la vraie bibliothèque, comme l'application (THESE_SORTIES) ; renvoie les sorties. */
function executer(script: string): Record<string, string> {
  const d = mkdtempSync(join(tmpdir(), "these-py-"));
  const scripts = join(d, "_projets", "p", "scripts");
  const sorties = join(d, "_projets", "p", "sorties", "trace");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, "these_figures.py"), BIBLIOTHEQUE);
  writeFileSync(join(scripts, "trace.py"), script);
  execFileSync(python!, ["-u", join(scripts, "trace.py")], { cwd: scripts, env: { ...process.env, THESE_SORTIES: sorties, PYTHONIOENCODING: "utf-8" } });
  return Object.fromEntries(readdirSync(sorties).map((f) => [f, readFileSync(join(sorties, f), "utf8")]));
}

describe("sorties des scripts Python", () => {
  it("bibliothèque : version lue, installée si absente ou plus ancienne, jamais rétrogradée", async () => {
    expect(versionBibliotheque(BIBLIOTHEQUE)).toBe("1");
    const fs = new MemoryFs();
    const p = await creerProjet(fs, { titre: "A" }, T);
    expect(await installerBibliotheque(fs, p.slug, BIBLIOTHEQUE)).toBe(true);
    expect(await installerBibliotheque(fs, p.slug, BIBLIOTHEQUE)).toBe(false);
    fs.put(`_projets/${p.slug}/scripts/these_figures.py`, '__version__ = "0"\n');
    expect(await installerBibliotheque(fs, p.slug, BIBLIOTHEQUE)).toBe(true);
    fs.put(`_projets/${p.slug}/scripts/these_figures.py`, '__version__ = "9"\n');
    expect(await installerBibliotheque(fs, p.slug, BIBLIOTHEQUE)).toBe(false);
  });

  it.skipIf(!python)("le Python écrit des graphes que Figures lit (contrat these_figures.py ↔ graph.json)", () => {
    const s = executer(`import these_figures as tf
g = tf.Graphe(x="Fréquence (Hz)", y="|E*| (MPa)", log_x=True, legende="south east")
g.serie("15 °C", [0.1, 1, float("nan"), 10], [8200, 11000, 1, 14000], type="points", marque="triangle", tendance=("polynome", 3))
g.serie("30 °C", (1, 2), (3, 4), couleur="#C00000", tirets="dashed")
g.enregistrer("module", titre="Module complexe")
b = tf.Graphe(y="Ornière (mm)")
b.barres(["BBSG", "EME2"], [4.1, 2.7], nom="Ornière")
b.enregistrer("barres")
open(tf.sortie("note.txt"), "w").write("x")
`);
    const m = lireSortieGraphe(s["module.graphe.json"]!, "module.graphe.json");
    expect(m.titre).toBe("Module complexe");
    expect(m.graphe).toMatchObject({ x: { label: "Fréquence (Hz)", log: true }, legend: "south east" });
    expect(m.graphe.series[0]).toMatchObject({ name: "15 °C", type: "points", mark: "triangle", x: [0.1, 1, 10], y: [8200, 11000, 14000], fit: { kind: "polynome", degre: 3 } });
    expect(m.graphe.series[1]).toMatchObject({ color: "#c00000", dash: "dashed", type: "linepoints" });
    const b = lireSortieGraphe(s["barres.graphe.json"]!, "barres.graphe.json");
    expect(b.titre).toBe("barres");
    expect(b.graphe.x.categories).toEqual(["BBSG", "EME2"]);
    expect(b.graphe.series[0]).toMatchObject({ type: "bar", x: [1, 2], y: [4.1, 2.7] });
  });

  it("refuse une sortie d'un autre format", () => {
    expect(() => lireSortieGraphe("{", "a.graphe.json")).toThrow(/illisible/);
    expect(() => lireSortieGraphe('{"format":"x"}', "a.graphe.json")).toThrow(/format/);
    expect(() => lireSortieGraphe('{"format":"these-figures-sortie/1","graphe":{}}', "a.graphe.json")).toThrow(/graphe invalide/);
  });

  it("sorties → figures rangées dans le projet, état après une nouvelle exécution, régénération", async () => {
    const fs = new MemoryFs();
    const p = await creerProjet(fs, { titre: "A" }, T);
    const graphe = (y: number[]) => JSON.stringify({ format: "these-figures-sortie/1", titre: "Module", graphe: { format: "figurine-graph/1", x: { label: "f", log: false }, y: { label: "E", log: false }, series: [{ name: "a", type: "line", x: [1, 2], y }] } });
    const dir = `_projets/${p.slug}/sorties/trace`;
    fs.put(`${dir}/module.graphe.json`, graphe([1, 2]));
    await fs.writeBytesAtomic(`${dir}/photo.png`, new Uint8Array([9, 9]));
    fs.put(`${dir}/schema.svg`, '<svg width="10mm" height="5mm"></svg>');
    fs.put(`${dir}/journal.txt`, "x");
    const sorties = await listerSorties(fs, p.slug, "trace.py");
    expect(sorties).toEqual([
      { fichier: "module.graphe.json", genre: "graphe" },
      { fichier: "photo.png", genre: "image" },
      { fichier: "schema.svg", genre: "svg" },
    ]);
    const dossiers = [];
    for (const s of sorties) dossiers.push(await importerSortie(fs, p.slug, "trace.py", s, rendus, T, "PC"));
    const meta = JSON.parse(fs.get(`${dossiers[0]}/meta.json`)!);
    expect(meta).toMatchObject({ title: "Module", kind: "graph", source: { note: "Script Python : trace.py › module.graphe.json" } });
    expect(projetsDe(meta)).toEqual([p.slug]);
    expect(fs.get(`${dossiers[2]}/export.svg`)).toContain("<svg");

    let figures = (await scanLibrary(fs)).figures;
    const etat = async (i: number) => etatSortie(sorties[i]!, await empreinteSortie(fs, p.slug, "trace.py", sorties[i]!), p.slug, "trace.py", figures).etat;
    expect(await etat(0)).toBe("a-jour");
    expect(await etat(1)).toBe("a-jour");

    // nouvelle exécution : autres valeurs, autre image
    fs.put(`${dir}/module.graphe.json`, graphe([5, 6]));
    await fs.writeBytesAtomic(`${dir}/photo.png`, new Uint8Array([7]));
    expect(await etat(0)).toBe("a-mettre-a-jour");
    expect(await etat(1)).toBe("a-mettre-a-jour");
    for (const d of dossiers.slice(0, 2)) await regenererSortie(fs, d, origineScript(JSON.parse(fs.get(`${d}/meta.json`)!))!, rendus, T, "PC");
    figures = (await scanLibrary(fs)).figures;
    expect(await etat(0)).toBe("a-jour");
    expect(await etat(1)).toBe("a-jour");
    expect(JSON.parse(fs.get(`${dossiers[0]}/graph.json`)!).series[0].y).toEqual([5, 6]);
    expect(fs.getBytes(`${dossiers[1]}/export.png`)).toEqual(new Uint8Array([7]));

    fs.remove(`${dir}/module.graphe.json`);
    await expect(regenererSortie(fs, dossiers[0]!, origineScript(JSON.parse(fs.get(`${dossiers[0]}/meta.json`)!))!, rendus, T, "PC")).rejects.toThrow(/relancez le script/);
  });

  it("modèle de script : importe la bibliothèque et enregistre un graphe", () => {
    const s = modeleScript("fig 3");
    expect(s).toContain("import these_figures as tf");
    expect(s).toContain('g.enregistrer("fig_3"');
  });
});
