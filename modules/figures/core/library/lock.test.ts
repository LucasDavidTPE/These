import { describe, expect, it } from "vitest";
import { lockStatus, parseLock, sameHost } from "./lock";

const NOW = new Date("2026-09-25T18:00:00Z");

describe("parseLock", () => {
  it("lit un verrou valide", () => {
    expect(parseLock('{"host":"PC-TRAVAIL","since":"2026-09-25T17:00:00Z"}')).toEqual({
      host: "PC-TRAVAIL",
      since: "2026-09-25T17:00:00Z",
    });
  });

  it("renvoie null pour un verrou illisible", () => {
    for (const bad of ["", "{", "null", "[]", '{"host":""}', '{"host":"PC","since":"hier"}']) {
      expect(parseLock(bad)).toBeNull();
    }
  });
});

describe("lockStatus", () => {
  it("free sans verrou", () => {
    expect(lockStatus(null, "PC", NOW)).toBe("free");
  });

  it("mine pour ce poste, quelle que soit la casse ou l'ancienneté", () => {
    expect(lockStatus({ host: "pc-travail", since: "2020-01-01T00:00:00Z" }, "PC-TRAVAIL", NOW)).toBe("mine");
    expect(sameHost(" PC ", "pc")).toBe(true);
  });

  it("other pour un autre poste depuis moins de 12 h", () => {
    expect(lockStatus({ host: "PC-MAISON", since: "2026-09-25T06:00:01Z" }, "PC-TRAVAIL", NOW)).toBe("other");
  });

  it("stale pour un autre poste depuis plus de 12 h", () => {
    expect(lockStatus({ host: "PC-MAISON", since: "2026-09-25T05:59:59Z" }, "PC-TRAVAIL", NOW)).toBe("stale");
    expect(lockStatus({ host: "PC-MAISON", since: "2026-09-25T07:59:59+02:00" }, "PC-TRAVAIL", NOW)).toBe("stale");
  });

  it("horloge de l'autre poste en avance : verrou considéré comme récent", () => {
    expect(lockStatus({ host: "PC-MAISON", since: "2026-09-25T20:00:00Z" }, "PC-TRAVAIL", NOW)).toBe("other");
  });
});
