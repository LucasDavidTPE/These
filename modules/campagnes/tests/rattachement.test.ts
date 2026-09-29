import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "@noyau/stockage";
import { resumeTraitement } from "../core/traitement";
import { chargerCampagnes, creerCampagne, preparerEssaiTraitement } from "../ui/donnees";
import { lireCampagne } from "../core/modele";

const PROJET = { version: 2, essais: [{ modeleId: "2s2p1d", p: { E0: 30000, k: 0.2 }, Tref: 10, C1: 20, C2: 150 }] };

describe("rattacher un dépouillement 2S2P1D à un essai de campagne", () => {
  it("crée l'essai, puis ne remplace qu'à la demande en rangeant l'ancien", async () => {
    const fs = new FichiersMemoire();
    const slug = await creerCampagne(fs, lireCampagne({ titre: "Module complexe B2C4" }));
    const r = await preparerEssaiTraitement(fs, slug, "Essai 3", false);
    expect(r).toEqual({ chemin: `campagnes/${slug}/essais/Essai 3/traitement.json`, existe: false });
    expect(await fs.exists(`campagnes/${slug}/essais/Essai 3/essai.json`)).toBe(true);
    await fs.writeTextAtomic(r.chemin, JSON.stringify({ version: 1, nom: "Essai 3", source: "recherche:B2C4/Essai3.csv", fichier: "Essai3.csv", projet: PROJET }));

    const c = (await chargerCampagnes(fs)).campagnes[0]!;
    expect(c.depouilles).toEqual(["Essai 3"]);
    expect(c.traitements["Essai 3"]).toMatchObject({ modele: "2S2P1D", Tref: 10 });

    // Déjà dépouillé : rien n'est touché sans « remplacer ».
    expect(await preparerEssaiTraitement(fs, slug, "Essai 3", false)).toEqual({ chemin: r.chemin, existe: true });
    expect(await fs.exists(r.chemin)).toBe(true);
    // Remplacer : l'ancien part dans .anciens.
    await preparerEssaiTraitement(fs, slug, "Essai 3", true);
    expect(await fs.exists(r.chemin)).toBe(false);
    expect((await fs.listDir(`campagnes/${slug}/essais/Essai 3/.anciens`)).map((e) => e.name)[0]).toMatch(/-traitement\.json$/);
  });

  it("refuse une campagne inconnue ou un nom vide ; nettoie les caractères interdits", async () => {
    const fs = new FichiersMemoire();
    await expect(preparerEssaiTraitement(fs, "nulle-part", "E1", false)).rejects.toThrow(/introuvable/);
    const slug = await creerCampagne(fs, lireCampagne({ titre: "C" }));
    await expect(preparerEssaiTraitement(fs, slug, "  ", false)).rejects.toThrow(/nom/);
    expect((await preparerEssaiTraitement(fs, slug, "E1/b:c", false)).chemin).toBe(`campagnes/${slug}/essais/E1_b_c/traitement.json`);
  });

  it("le résumé lit les deux formats (projet seul ou dépouillement avec sa source)", () => {
    expect(resumeTraitement(PROJET)).toEqual(resumeTraitement({ source: "x", projet: PROJET }));
    expect(resumeTraitement({ source: "x", projet: {} })).toBeNull();
  });
});
