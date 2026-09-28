/**
 * Nom des PDF : la convention se déduit des PDF déjà rangés dans le classeur (auteurs et année
 * à l'identique ; le titre court, choisi à la main jusqu'ici, n'est qu'une proposition).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importerClasseur } from "../core/import";
import { auteursPourNom, dansRacine, nomPdf, titreCourt } from "../core/pdf";

const imp = importerClasseur(new Uint8Array(readFileSync(new URL("./fixtures/Biblio_These_Lucas_MAITRE.xlsx", import.meta.url))));

describe("nom du PDF d'une référence", () => {
  it("auteurs : un, deux, « etal », organisme, particule", () => {
    expect(auteursPourNom("Tielking, J. T.")).toBe("Tielking");
    expect(auteursPourNom("De Beer, M.; Fisher, C.")).toBe("DeBeer-Fisher");
    expect(auteursPourNom("De Beer, M.; Maina, J. W.; van Rensburg, Y.")).toBe("DeBeer-etal");
    expect(auteursPourNom("Airbus S.A.S.")).toBe("Airbus");
    expect(auteursPourNom("Élie, B.")).toBe("Elie");
  });

  it("titre court : mots vides retirés, six mots, sigles gardés", () => {
    expect(titreCourt("Aircraft tire/pavement pressure distribution")).toBe("Aircraft-tire-pavement-pressure-distribution");
    expect(titreCourt("Toward using tire-road contact stresses in pavement design and analysis")).toBe("Tire-road-contact-stresses-pavement-design");
    expect(titreCourt("High Tire Pressure Test (HTPT) — Final report")).toBe("High-tire-pressure-test-HTPT-final");
    expect(titreCourt("Étude de l'orniérage des enrobés")).toBe("Etude-ornierage-enrobes");
  });

  it("sur le classeur : même partie « ID_auteurs_année » que les PDF déjà nommés", () => {
    const refs = imp.references.filter(({ valeur }) => valeur.fichierPdf);
    expect(refs.length).toBeGreaterThan(10);
    const ecarts: string[] = [];
    for (const { id, valeur: r } of refs) {
      const attendu = r.fichierPdf.split("_").slice(0, 3).join("_");
      if (nomPdf(id, r).split("_").slice(0, 3).join("_") !== attendu) ecarts.push(`${id}: ${nomPdf(id, r)} / ${r.fichierPdf}`);
      expect(nomPdf(id, r)).toMatch(/^BIB-\d{3}_[A-Za-z0-9-]+_\d{4}_[A-Za-z0-9-]+\.pdf$/);
    }
    // BIB-060 : norme AFNOR datée 2018 dans la fiche, rangée sous l'année consultée (2026)
    expect(ecarts.filter((e) => !e.startsWith("BIB-060"))).toEqual([]);
  });

  it("chemin dans la racine des PDF (Windows, casse ignorée)", () => {
    expect(dansRacine("C:\\Users\\DAVID\\OneDrive\\Biblio\\PDF\\a.pdf", "c:\\users\\david\\onedrive\\biblio\\pdf")).toBe("a.pdf");
    expect(dansRacine("C:\\Users\\DAVID\\Downloads\\a.pdf", "C:\\Users\\DAVID\\OneDrive\\Biblio\\PDF")).toBeNull();
  });
});
