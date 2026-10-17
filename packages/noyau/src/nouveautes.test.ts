import { describe, expect, it } from "vitest";
import { comparerVersions, NOUVEAUTES, nouveautesDepuis, parVersion } from "./nouveautes";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as { version: string };

describe("nouveautés", () => {
  it("compare les versions morceau par morceau", () => {
    expect(comparerVersions("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(comparerVersions("1.40.1", "1.40.0")).toBeGreaterThan(0);
    expect(comparerVersions("1.2", "1.2.0")).toBe(0);
  });

  it("montre ce qui est postérieur à la dernière version vue, dans les modules présents", () => {
    const n = nouveautesDepuis(NOUVEAUTES, "1.39.0", "1.41.0", ["figures"]);
    expect(n.map((x) => x.version)).toEqual(["1.41.0", "1.40.0"]);
    expect(nouveautesDepuis(NOUVEAUTES, "1.41.0", "1.41.0", ["figures"])).toEqual([]);
    expect(nouveautesDepuis(NOUVEAUTES, "1.25.0", "1.27.0", ["traitement"]).map((x) => x.version)).toEqual([]);
    expect(nouveautesDepuis(NOUVEAUTES, null, "1.26.0", ["manuscrits"]).map((x) => x.titre)).toEqual(["Manuscrits : anciens fichiers Word .doc"]);
  });

  it("la liste est rangée, sans doublon de titre, et va jusqu'à la version de l'application", () => {
    const versions = NOUVEAUTES.map((n) => n.version);
    expect([...versions].sort((a, b) => comparerVersions(b, a))).toEqual(versions);
    expect(new Set(NOUVEAUTES.map((n) => n.titre)).size).toBe(NOUVEAUTES.length);
    expect(comparerVersions(versions[0]!, pkg.version)).toBeLessThanOrEqual(0);
    expect(parVersion(NOUVEAUTES)[0]!.version).toBe(versions[0]);
    for (const n of NOUVEAUTES) if (n.essayer) expect(Boolean(n.essayer.vers) !== Boolean(n.essayer.action)).toBe(true);
  });
});
