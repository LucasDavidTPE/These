import { describe, expect, it } from "vitest";
import { avecGarde, ModifieAilleurs } from "./garde";
import { FichiersMemoire } from "./memoire";

describe("garde contre les écrasements entre PC", () => {
  it("refuse d'écraser un fichier modifié ailleurs depuis sa lecture", async () => {
    const disque = new FichiersMemoire();
    await disque.writeTextAtomic("note.json", "v1");
    const pcA = avecGarde(disque);
    expect(await pcA.readText("note.json")).toBe("v1");
    await disque.writeTextAtomic("note.json", "v2 (PC B)"); // synchronisé par OneDrive
    await expect(pcA.writeTextAtomic("note.json", "v1 + modif A")).rejects.toBeInstanceOf(ModifieAilleurs);
    expect(await disque.readText("note.json")).toBe("v2 (PC B)");
    // Après rechargement, A peut enregistrer ; ses propres écritures successives passent.
    await pcA.readText("note.json");
    await pcA.writeTextAtomic("note.json", "v3");
    await pcA.writeTextAtomic("note.json", "v4");
    expect(await disque.readText("note.json")).toBe("v4");
    // Fichier jamais lu (création) : écrit sans vérification.
    await pcA.writeTextAtomic("neuf.json", "x");
  });
});
