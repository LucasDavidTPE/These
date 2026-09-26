import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "../stockage/memoire";
import { examinerEspace, initialiserEspace, problemesRacine } from "./espace";

describe("espace", () => {
  it("reconnaît un dossier vide, même avec les fichiers posés par Windows", async () => {
    expect(await examinerEspace(new FichiersMemoire())).toEqual({ etat: "vide" });
    expect(await examinerEspace(new FichiersMemoire({ "desktop.ini": "", ".849C9593-D756-4E56-8D6E-42412F2A707B": "" }))).toEqual({ etat: "vide" });
  });

  it("signale un dossier qui contient déjà autre chose", async () => {
    const fs = new FichiersMemoire({ "Thèse.docx": "x", "BIBLIO/a.pdf": "x" });
    expect(await examinerEspace(fs)).toEqual({ etat: "autre-contenu", exemples: ["BIBLIO", "Thèse.docx"] });
  });

  it("crée puis rouvre un espace", async () => {
    const fs = new FichiersMemoire();
    const info = await initialiserEspace(fs, "PC-TRAVAIL", "2026-09-26T10:00:00+02:00");
    expect(await examinerEspace(fs)).toEqual({ etat: "ok", info });
    // Le second PC ne recrée jamais l'espace par-dessus le premier.
    await expect(initialiserEspace(fs, "PC-MAISON", "2026-09-26T11:00:00+02:00")).rejects.toThrow("Existe déjà");
  });

  it("refuse un espace écrit par une version plus récente, et signale un fichier abîmé", async () => {
    expect(await examinerEspace(new FichiersMemoire({ "espace.json": '{"format":2}' }))).toEqual({ etat: "trop-recent", format: 2 });
    expect((await examinerEspace(new FichiersMemoire({ "espace.json": "{" }))).etat).toBe("illisible");
    expect((await examinerEspace(new FichiersMemoire({ "espace.json": '{"format":"un"}' }))).etat).toBe("illisible");
  });

  it("trouve les conflits et écritures interrompues à la racine", async () => {
    const fs = new FichiersMemoire({ "espace.json": '{"format":1}', "espace-PC-MAISON.json": '{"format":1}', "espace.json.tmp": "" });
    expect((await problemesRacine(fs)).map((p) => p.type).sort()).toEqual(["conflit", "temporaire"]);
  });
});
