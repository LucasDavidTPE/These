import { describe, expect, it } from "vitest";
import { toIsoWithOffset, isIsoDateTime } from "./dates";
import { newMeta, serializeMeta, validateMeta, type FigureMeta } from "./meta";

/** L'exemple de SPEC §3, types remplacés par des valeurs réelles. */
const SPEC_EXAMPLE = {
  id: "FIG-0007",
  title: "Structure de chaussée souple sous bogie A340",
  kind: "schema",
  created: "2026-10-02T09:14:00+02:00",
  modified: "2026-10-03T17:40:00+02:00",
  tags: ["chaussée", "TFE", "MAIREINFRA"],
  source: {
    type: "article",
    url: "https://example.org/article",
    bib: "BIB-042",
    author: "De Beer et al.",
    year: 1997,
    note: "Adapté de la fig. 3",
  },
  license: "inconnue",
  caption: "Adapté de De Beer et al. (1997).",
  used_in: ["Article MAIREINFRA 2027", "Manuscrit ch. 2"],
  last_host: "PC-TRAVAIL",
};

function expectErrors(raw: unknown): string[] {
  const r = validateMeta(raw);
  if (r.ok) throw new Error("validation inattendue");
  return r.errors.map((e) => e.path);
}

describe("validateMeta", () => {
  it("accepte l'exemple de la SPEC", () => {
    const r = validateMeta(SPEC_EXAMPLE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meta).toEqual(SPEC_EXAMPLE);
  });

  it("accepte une fiche minimale et complète les listes", () => {
    const r = validateMeta({
      id: "FIG-0001",
      title: "Ressort",
      kind: "image",
      created: "2026-09-25T10:00:00Z",
      modified: "2026-09-25T10:00:00Z",
    });
    expect(r.ok && r.meta.tags).toEqual([]);
    expect(r.ok && r.meta.used_in).toEqual([]);
    expect(r.ok && "source" in r.meta).toBe(false);
  });

  it("signale les champs obligatoires manquants", () => {
    expect(expectErrors({})).toEqual(["id", "title", "kind", "created", "modified"]);
  });

  it("refuse un objet qui n'en est pas un", () => {
    expect(expectErrors([])).toEqual([""]);
    expect(expectErrors("texte")).toEqual([""]);
  });

  it("signale chaque champ invalide avec son chemin", () => {
    const paths = expectErrors({
      ...SPEC_EXAMPLE,
      id: "FIG-7",
      kind: "photo",
      created: "02/10/2026",
      tags: ["ok", 3],
      source: { type: "blog", year: "1997", bib: "biblio-42" },
    });
    expect(paths).toEqual(["id", "kind", "created", "tags[1]", "source.type", "source.bib", "source.year"]);
  });

  it("conserve les champs inconnus (version plus récente de l'appli)", () => {
    const r = validateMeta({ ...SPEC_EXAMPLE, rating: 5, source: { ...SPEC_EXAMPLE.source, doi: "10.1/x" } });
    expect(r.ok && r.meta.rating).toBe(5);
    expect(r.ok && r.meta.source?.doi).toBe("10.1/x");
  });

  it("traite null comme absent pour les champs facultatifs", () => {
    const r = validateMeta({ ...SPEC_EXAMPLE, source: null, license: null, caption: null });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("source" in r.meta).toBe(false);
      expect("license" in r.meta).toBe(false);
    }
  });
});

describe("serializeMeta", () => {
  it("est stable quel que soit l'ordre des clés en entrée", () => {
    const shuffled = Object.fromEntries(Object.entries(SPEC_EXAMPLE).reverse());
    const a = validateMeta(SPEC_EXAMPLE);
    const b = validateMeta(shuffled);
    if (!a.ok || !b.ok) throw new Error("validation");
    expect(serializeMeta(b.meta)).toBe(serializeMeta(a.meta));
    expect(serializeMeta(a.meta).endsWith("}\n")).toBe(true);
  });

  it("fait l'aller-retour", () => {
    const r = validateMeta(SPEC_EXAMPLE);
    if (!r.ok) throw new Error("validation");
    const again = validateMeta(JSON.parse(serializeMeta(r.meta)));
    expect(again).toEqual(r);
  });

  it("range les champs inconnus en fin, triés", () => {
    const meta = { ...newMeta({ id: "FIG-0001", title: "T", kind: "graph", now: "2026-09-25T10:00:00Z", host: "PC" }), z: 1, a: 2 } as FigureMeta;
    const keys = Object.keys(JSON.parse(serializeMeta(meta)));
    expect(keys.slice(-2)).toEqual(["a", "z"]);
    expect(keys[0]).toBe("id");
  });
});

describe("dates", () => {
  it("formate avec le décalage demandé", () => {
    const d = new Date("2026-10-02T07:14:00Z");
    expect(toIsoWithOffset(d, 120)).toBe("2026-10-02T09:14:00+02:00");
    expect(toIsoWithOffset(d, 0)).toBe("2026-10-02T07:14:00+00:00");
    expect(toIsoWithOffset(d, -330)).toBe("2026-10-02T01:44:00-05:30");
  });

  it("valide les dates ISO avec fuseau", () => {
    expect(isIsoDateTime("2026-10-02T09:14:00+02:00")).toBe(true);
    expect(isIsoDateTime("2026-10-02T09:14:00.123Z")).toBe(true);
    expect(isIsoDateTime("2026-10-02T09:14:00")).toBe(false);
    expect(isIsoDateTime("2026-13-45T09:14:00Z")).toBe(false);
  });
});
