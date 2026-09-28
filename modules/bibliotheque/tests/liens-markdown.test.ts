import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculer, moisCourant } from "../core/calculs";
import { importerClasseur } from "../core/import";
import { libelleLien, lienARevoir, liensAVerifier } from "../core/liens";
import { nomNote, noteReference, pointMensuel } from "../core/markdown";

const imp = importerClasseur(new Uint8Array(readFileSync(new URL("./fixtures/Biblio_These_Lucas_MAITRE.xlsx", import.meta.url))));
const p = imp.parametres;
const jour = imp.excel.aujourdhui;
const calc = calculer(imp.references, p, moisCourant(jour, p));

describe("vérification des liens", () => {
  it("libellés d'état", () => {
    const r = (code: number | null, erreur = "") => libelleLien({ code, urlFinale: "", erreur });
    expect(r(200)).toBe("OK (200)");
    expect(r(404)).toBe("Lien mort (404)");
    expect(r(403)).toBe("Accès restreint (403)");
    expect(r(503)).toBe("Erreur du serveur (503)");
    expect(r(null, "timeout: global")).toBe("Injoignable : délai dépassé");
    expect(r(null, "io: failed to lookup address")).toBe("Injoignable : nom de site inconnu");
  });

  it("à revoir : liens morts et injoignables, pas les accès restreints", () => {
    expect(lienARevoir("Lien mort (404)")).toBe(true);
    expect(lienARevoir("Injoignable : délai dépassé")).toBe(true);
    expect(lienARevoir("Accès restreint (403)")).toBe(false);
    expect(lienARevoir("")).toBe(false);
  });

  it("seules les adresses web sont vérifiées", () => {
    const refs = liensAVerifier(imp.references);
    expect(refs.length).toBeGreaterThan(100);
    expect(refs.every((r) => r.valeur.url.startsWith("http"))).toBe(true);
    expect(liensAVerifier([{ id: "BIB-1", valeur: { url: "Bibliothèque ENTPE" } }])).toEqual([]);
  });
});

describe("export Markdown", () => {
  const cles = new Set(imp.references.map((r) => r.valeur.cle));

  it("une note par référence, avec ses propriétés, déterministe", () => {
    const c = calc.find((x) => x.ref.fiche.objectif || x.ref.notes.apport) ?? calc[0]!;
    const md = noteReference(c, p, cles);
    expect(md).toBe(noteReference(c, p, cles));
    expect(md.startsWith(`---\nid: ${c.id}\ncle: ${JSON.stringify(c.ref.cle)}`)).toBe(true);
    expect(md).toContain(`# ${c.citation} — ${c.ref.titre}`);
    expect(md).not.toMatch(/undefined|null\b|\n{3,}/);
    expect(nomNote(c.id, c.ref)).toBe(`${c.ref.cle}.md`);
  });

  it("toutes les références s'exportent", () => {
    for (const c of calc) expect(noteReference(c, p, cles)).toMatch(/^---\n[\s\S]+\n---\n\n# /);
  });

  it("point mensuel : lu, à lire par score, demandes", () => {
    const md = pointMensuel(1, calc, imp.demandes.map((d) => d.valeur), p, jour);
    const duMois = calc.filter((c) => c.ref.mois === 1);
    expect(md).toContain("# Point mensuel — mois 1");
    expect(md).toContain(`sur ${duMois.length}`);
    expect((md.match(/^- \[\[/gm) ?? []).length).toBe(duMois.filter((c) => c.ref.statut !== "Écarté").length);
  });
});
