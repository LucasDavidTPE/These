import { describe, expect, it } from "vitest";
import { empreintePdf, lireInfoApercu } from "../core/pdf";

describe("aperçu des PDF : empreinte", () => {
  it("change si le début, la fin ou la taille changent ; stable sinon", () => {
    const a = new Uint8Array(300_000).map((_, i) => i % 251);
    const e = empreintePdf(a);
    expect(empreintePdf(a.slice())).toBe(e);
    const debut = a.slice();
    debut[10] = 0;
    const fin = a.slice();
    fin[299_990] = 0;
    expect(empreintePdf(debut)).not.toBe(e);
    expect(empreintePdf(fin)).not.toBe(e);
    expect(empreintePdf(a.slice(0, 299_999))).not.toBe(e);
    expect(empreintePdf(new Uint8Array(10))).toMatch(/^10-[0-9a-f]{8}$/);
  });

  it("lit la note d'accompagnement de l'aperçu", () => {
    expect(lireInfoApercu({ pdf: "a.pdf", empreinte: "1-00" })).toEqual({ pdf: "a.pdf", empreinte: "1-00" });
    expect(lireInfoApercu({ pdf: 3 })).toBeNull();
  });
});
