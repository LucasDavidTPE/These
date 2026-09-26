import { describe, expect, it } from "vitest";
import { applyTransform, anchorAway, wavySegs, zigzagPoints } from "./geometry";
import { layoutFigure, resolveAnchor, splitAnchorRef } from "./layout";
import { validateParams, type ParamSchema } from "./params";
import { migrateWith, validateFigure } from "./validate";
import { escapeXml } from "./export/svg";
import { latexText, exportTikz } from "./export/tikz";
import { FigureExportError } from "./export/common";
import type { FigureDoc, Item } from "./types";

function doc(items: Partial<Item>[], canvas = { unit: "mm", width: 100, height: 60, grid: 1 }): unknown {
  return { format: "figurine/1", canvas, theme: "these", items };
}

function valid(raw: unknown): FigureDoc {
  const r = validateFigure(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.doc;
}

const close = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6);
  expect(a[1]).toBeCloseTo(b[1], 6);
};

describe("validateParams", () => {
  const schema: ParamSchema = {
    n: { kind: "number", label: "N", default: 4, min: 1, max: 10, integer: true },
    s: { kind: "string", label: "S", default: "", optional: true },
    e: { kind: "enum", label: "E", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    l: { kind: "list", label: "L", default: [], minItems: 1, item: { h: { kind: "number", label: "h", default: 1, min: 0 } } },
  };

  it("complète les valeurs par défaut", () => {
    const r = validateParams(schema, { l: [{}] }, "p");
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({ n: 4, e: "a", l: [{ h: 1 }] });
  });

  it("donne des chemins d'erreur précis", () => {
    const r = validateParams(schema, { n: 2.5, e: "z", l: [{ h: -1 }], coil: 3 }, "items[0].params");
    expect(r.errors.map((e) => e.path)).toEqual([
      "items[0].params.coil",
      "items[0].params.n",
      "items[0].params.e",
      "items[0].params.l[0].h",
    ]);
    expect(r.errors[0]!.message).toContain("inconnu");
  });

  it("vérifie la taille minimale des listes", () => {
    expect(validateParams(schema, { l: [] }, "p").errors[0]!.message).toContain("au moins 1");
  });
});

describe("migrations", () => {
  it("renvoie tel quel le format courant", () => {
    const r = migrateWith({ format: "figurine/1", x: 1 }, {});
    expect(r).toEqual({ ok: true, value: { format: "figurine/1", x: 1 }, applied: [] });
  });

  it("enchaîne les migrations", () => {
    const r = migrateWith(
      { format: "figurine/0", elements: [] },
      {
        "figurine/0": { to: "figurine/0.5", migrate: ({ elements, ...rest }) => ({ ...rest, items: elements }) },
        "figurine/0.5": { to: "figurine/1", migrate: (d) => ({ ...d, theme: "these" }) },
      },
    );
    expect(r).toEqual({
      ok: true,
      value: { format: "figurine/1", items: [], theme: "these" },
      applied: ["figurine/0 → figurine/0.5", "figurine/0.5 → figurine/1"],
    });
  });

  it("refuse un format inconnu ou absent", () => {
    const a = migrateWith({ format: "figurine/9" }, {});
    expect(!a.ok && a.error.message).toContain("inconnu");
    const b = migrateWith({}, {});
    expect(!b.ok && b.error.message).toContain("manquant");
  });
});

describe("validateFigure", () => {
  it("accepte une figure minimale et complète les paramètres", () => {
    const d = valid(doc([{ id: "r", type: "rectangle", at: [1, 2] }]));
    expect(d.items[0]!.params).toEqual({ width: 20, height: 10, fill: "aucun" });
  });

  it("signale type inconnu, identifiant en double, placement incohérent", () => {
    const r = validateFigure(
      doc([
        { id: "a", type: "rectangle", at: [0, 0] },
        { id: "a", type: "rectangle", at: [0, 0] },
        { id: "b", type: "soucoupe", at: [0, 0] },
        { id: "c", type: "rectangle", from: [0, 0], to: [1, 1] },
        { id: "d", type: "spring", from: [0, 0] },
        { id: "9x", type: "rectangle", at: [0, 0] },
        { id: "e", type: "rectangle", at: [0, 0], colour: "red" } as Partial<Item>,
      ]),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const msgs = r.errors.map((e) => `${e.path}: ${e.message}`);
      expect(msgs).toEqual([
        "items[1].id: identifiant « a » déjà utilisé.",
        "items[2].type: type de composant « soucoupe » inconnu.",
        "items[3]: « Rectangle » se place avec « at » ou « on », pas « from »/« to ».",
        "items[3]: préciser soit « at », soit « on ».",
        "items[4]: « from » et « to » vont ensemble.",
        "items[5].id: identifiant manquant ou invalide (lettres, chiffres, _ et -, commençant par une lettre).",
        "items[6].colour: champ inconnu « colour ».",
      ]);
    }
  });

  it("vérifie la planche et le thème", () => {
    const r = validateFigure({ format: "figurine/1", canvas: { unit: "cm", width: -1, height: 10 }, theme: "rose", items: [] });
    expect(!r.ok && r.errors.map((e) => e.path)).toEqual(["canvas.unit", "canvas.width", "theme"]);
  });

  it("applique les contrôles propres au composant", () => {
    const r = validateFigure(
      doc([
        {
          id: "p",
          type: "layer_stack",
          at: [0, 0],
          params: { layers: [{ name: "A", h: 5, semi_infinite: true }, { name: "B", h: 5 }] },
        },
      ]),
    );
    expect(!r.ok && r.errors[0]!.path).toBe("items[0].params.layers[0].semi_infinite");
  });
});

describe("ancres", () => {
  it("découpe les références", () => {
    expect(splitAnchorRef("pav.layer[0].top.right")).toEqual({ id: "pav", anchor: "layer[0].top.right" });
    expect(splitAnchorRef("pav")).toBeNull();
    expect(splitAnchorRef(".top")).toBeNull();
  });

  it("résout les ancres d'un empilement de couches", () => {
    const d = valid(
      doc([{ id: "pav", type: "layer_stack", at: [10, 20], params: { width: 110, layers: [{ name: "BB", h: 8 }, { name: "GB", h: 12 }] } }]),
    );
    const l = layoutFigure(d);
    expect(l.errors).toEqual([]);
    expect(resolveAnchor(l, "pav.layer[0].top.right")).toEqual({ point: [120, 20] });
    expect(resolveAnchor(l, "pav.layer[1].bottom.left")).toEqual({ point: [10, 40] });
    expect(resolveAnchor(l, "pav.top")).toEqual({ point: [65, 20] });
    expect(resolveAnchor(l, "pav.layer[2].top")).toEqual({ error: "ancre « pav.layer[2].top » introuvable." });
  });

  it("un élément suit l'ancre de son support, dans n'importe quel ordre", () => {
    const items: Partial<Item>[] = [
      { id: "k", type: "spring", from: "a.right", to: "b.left" },
      { id: "a", type: "rectangle", at: [0, 0], params: { width: 10, height: 10 } },
      { id: "b", type: "rectangle", at: [40, 0], params: { width: 10, height: 10 } },
    ];
    const l = layoutFigure(valid(doc(items)));
    expect(l.errors).toEqual([]);
    expect(l.placed.map((p) => p.item.id)).toEqual(["k", "a", "b"]);
    expect(l.placed[0]!.ctx.length).toBe(30);
    expect(l.placed[0]!.anchors.start).toEqual([10, 5]);
    // On déplace « b » : le ressort suit.
    items[2]!.at = [60, 0];
    const l2 = layoutFigure(valid(doc(items)));
    expect(l2.placed[0]!.ctx.length).toBe(50);
  });

  it("erreurs claires : élément absent, ancre absente, cycle, référence mal formée", () => {
    const l = layoutFigure(
      valid(
        doc([
          { id: "a", type: "rectangle", on: "zz.top" },
          { id: "b", type: "rectangle", at: [0, 0] },
          { id: "c", type: "rectangle", on: "b.dessus" },
          { id: "d", type: "rectangle", on: "e.top" },
          { id: "e", type: "rectangle", on: "d.top" },
          { id: "f", type: "rectangle", on: "b" },
        ]),
      ),
    );
    const msgs = l.errors.map((e) => e.message);
    expect(msgs[0]).toBe("« a » : l'élément « zz » n'existe pas (ancre « zz.top »).");
    expect(msgs[1]).toMatch(/^« c » : ancre « b.dessus » introuvable. Ancres de « b » : center, top, bottom/);
    expect(msgs[2]).toBe("dépendance circulaire : d → e → d.");
    expect(msgs[3]).toBe("« f » : ancre « b » mal formée (attendu « élément.ancre »).");
    expect(l.placed.map((p) => p.item.id)).toEqual(["b"]);
  });

  it("l'export refuse une figure aux ancres cassées, avec le message", () => {
    expect(() => exportTikz(doc([{ id: "a", type: "rectangle", on: "zz.top" }]))).toThrow(FigureExportError);
    expect(() => exportTikz(doc([{ id: "a", type: "rectangle", on: "zz.top" }]))).toThrow(/« zz » n'existe pas/);
  });
});

describe("géométrie", () => {
  it("rotation dans le sens trigonométrique visuel (y vers le bas)", () => {
    close(applyTransform({ origin: [10, 10], deg: 90 }, [5, 0]), [10, 5]);
    close(applyTransform({ origin: [0, 0], deg: -90 }, [5, 0]), [0, 5]);
    close(applyTransform({ origin: [0, 0], deg: 180 }, [5, 1]), [-5, -1]);
  });

  it("un ressort vertical (from bas → to haut) est orienté vers le haut", () => {
    const l = layoutFigure(valid(doc([{ id: "k", type: "spring", from: [10, 50], to: [10, 20] }])));
    expect(l.placed[0]!.transform.deg).toBeCloseTo(90);
    close(l.placed[0]!.anchors.end!, [10, 20]);
  });

  it("zigzag : dents alternées à gauche puis à droite, extrémités respectées", () => {
    const pts = zigzagPoints({ from: [0, 0], to: [20, 0], segment: 4, amplitude: 1, pre: 2, post: 2 });
    expect(pts[0]).toEqual([0, 0]);
    close(pts[1]!, [2, 0]);
    close(pts[2]!, [3, -1]); // à gauche = vers le haut de l'écran
    close(pts[3]!, [5, 1]);
    expect(pts.at(-1)).toEqual([20, 0]);
    expect(pts.length).toBe(2 + 4 * 3 + 1);
  });

  it("bord ondulé : le bon nombre de demi-ondes, extrémités exactes", () => {
    const segs = wavySegs(0, 24, 10, 1, 2);
    expect(segs).toHaveLength(4);
    expect(segs.at(-1)).toMatchObject({ op: "C", p: [24, 10] });
  });

  it("ancre de texte selon la direction d'écartement", () => {
    expect(anchorAway([0, -1])).toBe("south");
    expect(anchorAway([0, 1])).toBe("north");
    expect(anchorAway([1, 0])).toBe("west");
    expect(anchorAway([-1, -1])).toBe("south east");
  });
});

describe("échappements", () => {
  it("XML", () => {
    expect(escapeXml(`a<b & "c">`)).toBe("a&lt;b &amp; &quot;c&quot;&gt;");
  });

  it("LaTeX : maths brutes, spéciaux protégés ailleurs", () => {
    expect(latexText("50 % & $E_1$ #2")).toBe("50 \\% \\& $E_1$ \\#2");
    expect(latexText("a_b $a_b$ \\textbf{x}")).toBe("a\\_b $a_b$ \\textbf{x}");
  });
});
