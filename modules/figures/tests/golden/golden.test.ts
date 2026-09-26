/**
 * Tests golden des exports (SPEC §7) : pour chaque figure `<cas>.json`, les sorties
 * `<cas>.svg` et `<cas>.tex` doivent être identiques octet pour octet.
 *
 * Mise à jour volontaire, après relecture des différences :
 *   UPDATE_GOLDEN=1 npx vitest run tests/golden
 *
 * Si `pdflatex` est installé, chaque figure est aussi compilée (document standalone).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_THESE, exportSvg, exportTikz, generateSty } from "../../core/schema";

const dir = fileURLToPath(new URL(".", import.meta.url));
const root = join(dir, "..", "..");
const update = process.env.UPDATE_GOLDEN === "1";
const cases = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -5))
  .sort();

function checkOrWrite(file: string, actual: string) {
  const path = join(dir, file);
  if (update || !existsSync(path)) writeFileSync(path, actual);
  expect(actual).toBe(readFileSync(path, "utf8"));
}

describe("golden : exports SVG et TikZ", () => {
  for (const name of cases) {
    it(name, () => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
      checkOrWrite(`${name}.svg`, exportSvg(raw));
      checkOrWrite(`${name}.tex`, exportTikz(raw));
    });
  }

  it("deux exports successifs sont identiques", () => {
    const raw: unknown = JSON.parse(readFileSync(join(dir, `${cases[0]}.json`), "utf8"));
    expect(exportSvg(raw)).toBe(exportSvg(raw));
    expect(exportTikz(raw)).toBe(exportTikz(raw));
  });
});

describe("figurine.sty", () => {
  it("le fichier livré correspond au thème", () => {
    const path = join(root, "tex", "figurine.sty");
    if (update) writeFileSync(path, generateSty(THEME_THESE));
    expect(readFileSync(path, "utf8")).toBe(generateSty(THEME_THESE));
  });
});

const hasPdflatex = spawnSync("pdflatex", ["--version"], { encoding: "utf8" }).status === 0;
if (!hasPdflatex) console.warn("pdflatex absent : la compilation des .tex générés n'est pas testée.");

describe.skipIf(!hasPdflatex)("compilation LaTeX (pdflatex)", () => {
  for (const name of cases) {
    it(`${name} compile`, { timeout: 60_000 }, () => {
      const raw: unknown = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
      const work = mkdtempSync(join(tmpdir(), "figurine-tex-"));
      try {
        writeFileSync(join(work, "fig.tex"), exportTikz(raw, { standalone: true }));
        const r = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "fig.tex"], { cwd: work, encoding: "utf8" });
        if (r.status !== 0) throw new Error(r.stdout.split("\n").filter((l) => l.startsWith("!") || l.startsWith("l.")).join("\n") || r.stdout.slice(-2000));
        expect(existsSync(join(work, "fig.pdf"))).toBe(true);
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    });
  }
});
