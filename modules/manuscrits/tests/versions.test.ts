import { describe, expect, it } from "vitest";
import { dossierManuscrit, empreinte, etat, lireVersion, nomVersion } from "../core/versions";

describe("versions des manuscrits", () => {
  it("noms de dossier et de version lisibles, stables entre les PC", () => {
    expect(dossierManuscrit("Thèse Lucas — Chapitre 2.docx")).toBe("manuscrits/these-lucas-chapitre-2");
    expect(nomVersion("2026-09-26T13:42:10+02:00", "Relecture chap. 2 (Sergio)")).toBe("2026-09-26_1342_relecture-chap-2-sergio");
    expect(nomVersion("2026-09-26T13:42:10+02:00", "")).toBe("2026-09-26_1342");
  });

  it("l'empreinte dit si le fichier a changé depuis la dernière version", () => {
    const a = new TextEncoder().encode("PK… version A");
    const b = new TextEncoder().encode("PK… version B");
    expect(empreinte(a)).toMatch(/^[0-9a-f]{8}$/);
    expect(empreinte(a)).not.toBe(empreinte(b));
    const v = lireVersion({ date: "2026-09-26T13:42:10+02:00", poste: "PC", note: "", taille: 13, empreinte: empreinte(a) }, "x.docx");
    expect(etat(a, [v])).toBe("a-jour");
    expect(etat(b, [v])).toBe("modifie");
    expect(etat(b, [])).toBe("aucune-version");
  });
});
