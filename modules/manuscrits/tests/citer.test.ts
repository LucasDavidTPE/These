import { describe, expect, it } from "vitest";
import type { ReferenceCitee } from "@noyau/citations";
import { citerPresentation, clesDePresentation, REFERENCES_PAR_DIAPO } from "../core/citer";
import { analyserPresentation } from "../core/presentation";

const ref = (id: string, auteurs: string, annee: string): [string, ReferenceCitee] => [id, { id, auteurs, annee, complete: `${auteurs} (${annee}). Titre ${id}.` }];
const REFS = new Map([ref("BIB-020", "Olard & Di Benedetto", "2003"), ref("BIB-065", "Burmister", "1945")]);

const MD = `titre: T

---
# Modèle [@BIB-020]
- Multicouche [@BIB-065, p. 12] et [@BIB-999]
Source: [@BIB-020]
---
# Suite
![Courbe [@BIB-065]](figure:FIG-0001)`;

describe("citations d'une présentation", () => {
  it("remplace partout, signale l'inconnu, ajoute une diapo Références triée", () => {
    const p = analyserPresentation(MD);
    expect(clesDePresentation(p)).toEqual(["BIB-020", "BIB-065", "BIB-999"]);
    const r = citerPresentation(p, REFS);
    expect(r.inconnues).toEqual(["BIB-999"]);
    const d = r.presentation.diapos;
    expect(d[1]!.titre).toBe("Modèle (Olard & Di Benedetto, 2003)");
    expect(d[1]!.gauche[0]).toMatchObject({ texte: "Multicouche (Burmister, 1945, p. 12) et [@BIB-999]" });
    expect(d[1]!.source).toBe("(Olard & Di Benedetto, 2003)");
    expect(d[2]!.gauche[0]).toMatchObject({ legende: "Courbe (Burmister, 1945)" });
    expect(d.at(-1)).toMatchObject({ mise: "references", titre: "Références" });
    expect(d.at(-1)!.gauche.map((b) => (b.type === "texte" ? b.texte : ""))).toEqual(["Burmister (1945). Titre BIB-065.", "Olard & Di Benedetto (2003). Titre BIB-020."]);
  });

  it("« références: non » : citations rendues, pas de diapo ; plusieurs diapos au-delà de la limite", () => {
    expect(citerPresentation(analyserPresentation(`titre: T\nréférences: non\n\n---\n# A\n- texte [@BIB-020]`), REFS).presentation.diapos.map((d) => d.mise)).toEqual(["titre", "contenu"]);
    const beaucoup = new Map(Array.from({ length: REFERENCES_PAR_DIAPO + 2 }, (_, i) => ref(`BIB-${100 + i}`, `Auteur${i}`, "2000")));
    const md = `# A ${[...beaucoup.keys()].map((k) => `[@${k}]`).join(" ")}`;
    expect(citerPresentation(analyserPresentation(md), beaucoup).presentation.diapos.filter((d) => d.mise === "references").map((d) => d.titre)).toEqual(["Références (1/2)", "Références (2/2)"]);
  });
});
