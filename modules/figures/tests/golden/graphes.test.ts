/**
 * Golden des graphes (S9) : `graphes/<cas>.json` → `.svg` et `.tex` (pgfplots) octet pour
 * octet ; compilation avec pdflatex si disponible. Mise à jour : UPDATE_GOLDEN=1.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exportGraphSvg, exportPgfplots } from "../../core/graph";

const dir = join(fileURLToPath(new URL(".", import.meta.url)), "graphes");
const update = process.env.UPDATE_GOLDEN === "1";
const cases = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const load = (name: string): unknown => JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));

function checkOrWrite(file: string, actual: string) {
  const path = join(dir, file);
  if (update || !existsSync(path)) writeFileSync(path, actual);
  expect(actual).toBe(readFileSync(path, "utf8"));
}

describe("golden : graphes", () => {
  for (const name of cases) {
    it(name, () => {
      checkOrWrite(`${name}.svg`, exportGraphSvg(load(name)));
      checkOrWrite(`${name}.tex`, exportPgfplots(load(name)).tex);
    });
  }
});

const hasPdflatex = spawnSync("pdflatex", ["--version"]).status === 0;

describe.skipIf(!hasPdflatex)("compilation pgfplots", () => {
  for (const name of cases) {
    it(`${name} compile`, { timeout: 90_000 }, () => {
      const work = mkdtempSync(join(tmpdir(), "figurine-graph-"));
      try {
        writeFileSync(join(work, "g.tex"), exportPgfplots(load(name), { standalone: true }).tex);
        const r = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "g.tex"], { cwd: work, encoding: "utf8" });
        if (r.status !== 0) throw new Error(r.stdout.split("\n").filter((l) => l.startsWith("!") || l.startsWith("l.")).join("\n") || r.stdout.slice(-1500));
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    });
  }

  it("variante fichiers .dat à côté", { timeout: 90_000 }, () => {
    const work = mkdtempSync(join(tmpdir(), "figurine-graph-"));
    try {
      const out = exportPgfplots(load(cases[0]!), { standalone: true, dataFiles: true });
      writeFileSync(join(work, "g.tex"), out.tex);
      for (const [f, c] of Object.entries(out.files)) writeFileSync(join(work, f), c);
      const r = spawnSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "g.tex"], { cwd: work, encoding: "utf8" });
      expect(r.status, r.stdout.slice(-1500)).toBe(0);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
