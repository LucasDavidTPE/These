import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FichiersMemoire } from "@noyau/stockage";
import { decouvrir } from "../core/decouverte";
import { lireJournal } from "../core/journal";
import { periode, periodeLisible } from "../core/modele";
import { depuisLgcb, lireToml } from "../core/toml";

const fiche = (nom: string) => readFileSync(new URL(`./fixtures/${nom}.toml`, import.meta.url), "utf8");

const JOURNAL = [
  "20/04/2026;15:44:10;Sergio CM;Essai1;60101;Création de l'essai;",
  "20/04/2026;15:44:10;Sergio CM;Essai1;60104;Version du logiciel;2.1.20079.01",
  "20/04/2026;15:44:10;Sergio CM;Essai1;60107;Utilisateur;ltds",
  "20/04/2026;15:44:10;Sergio CM;Essai1;60108;Ordinateur;LGCB-AA03956",
  "20/04/2026;15:44:10;Sergio CM;Essai1;60110;Numéro de série du bâti;8874K6136",
  "23/04/2026;03:45:15;Sergio CM;Essai1;60121;Forme d'onde 1;1000",
  "23/04/2026;03:45:15;Sergio CM;Essai1;60121;Forme d'onde 2;480,0",
  "23/04/2026;03:45:15;Sergio CM;Essai1;60120;Durée totale;216065,5",
  "23/04/2026;03:45:15;Sergio CM;Essai1;60202;État final;Essai terminé par Forme d'onde 8800 (0,1)",
  "23/04/2026;03:45:16;Sergio CM;Essai1;62000;SHA-256,Essai1.steps.tracking.csv,ab12;",
  "ligne sans intérêt",
].join("\r\n");

describe("journal Instron", () => {
  it("extrait dates, machine, cycles, durée, état et empreintes", () => {
    const j = lireJournal("﻿" + JOURNAL);
    expect(j).toMatchObject({
      projet: "Sergio CM",
      essai: "Essai1",
      debut: "2026-04-20 15:44:10",
      fin: "2026-04-23 03:45:15",
      operateur: "ltds",
      poste: "LGCB-AA03956",
      bati: "8874K6136",
      logiciel: "2.1.20079.01",
      dureeS: 216065.5,
      etatFinal: "Essai terminé par Forme d'onde 8800 (0,1)",
    });
    expect(j.cycles).toEqual({ "Forme d'onde 1": 1000, "Forme d'onde 2": 480 });
    expect(j.sha256).toEqual({ "Essai1.steps.tracking.csv": "ab12" });
  });
});

describe("découverte des essais", () => {
  it("un sous-dossier avec un export de suivi est un essai ; son journal le décrit", async () => {
    const fs = new FichiersMemoire({
      "Essai1/Essai1.steps.tracking.csv": "t;F",
      "Essai1/Essai1.log": JOURNAL,
      "Essai2/Essai2.steps.tracking.csv": "t;F",
      "Photos/p.jpg": "x",
    });
    const d = await decouvrir(fs);
    expect(Object.keys(d.essais)).toEqual(["Essai1", "Essai2"]);
    expect(d.essais.Essai1).toEqual({ debut: "2026-04-20 15:44:10", fin: "2026-04-23 03:45:15", dureeH: 60.02, cycles: 1480, etat: "Essai terminé par Forme d'onde 8800 (0,1)" });
    expect(d.essais.Essai2!.etat).toBe("essai sans journal");
    expect(d.machine).toEqual({ operateur: "ltds", poste: "LGCB-AA03956", bati: "8874K6136", logiciel: "2.1.20079.01" });
  });
});

describe("fiches these-lgcb", () => {
  it("lit le TOML des fiches : tables, chaînes multilignes, commentaires", () => {
    const t = lireToml(fiche("sergio-cm-b2c4-bio"));
    expect(t.title).toBe("Module complexe B2C4 bio (Sergio)");
    expect((t.machine as Record<string, unknown>).bati).toBe("8874K6136");
    expect(((t.tests as Record<string, Record<string, unknown>>).Essai1)!.cycles).toBe(1480);
  });

  it("importe les trois fiches existantes", () => {
    const s = depuisLgcb(fiche("sergio-cm-b2c4-bio"));
    expect(s.campagne).toMatchObject({ titre: "Module complexe B2C4 bio (Sergio)", type: "module-complexe", statut: "en cours", materiau: "B2C4 bio", donnees: "recherche:Sergio CM test Bio B2C4 brutes", notes: "" });
    expect(s.essais.Essai1).toMatchObject({ debut: "2026-04-20 15:44:10", dureeH: 60.02, cycles: 1480 });
    const t = depuisLgcb(fiche("tsrst-lucas"));
    expect(t.campagne.type).toBe("tsrst");
    expect(Object.keys(t.essais)).toEqual(["Essai1", "Essai2", "Essai3", "Essai4"]);
    expect(periodeLisible(periode(Object.values(t.essais))!)).toBe("22 → 25 juin 2026");
    expect(depuisLgcb(fiche("etude")).campagne.titre).toBe("Campagne sans titre");
  });

  it("périodes lisibles", () => {
    expect(periodeLisible({ debut: "2026-04-20", fin: "2026-05-03" })).toBe("20 avr. → 3 mai 2026");
    expect(periodeLisible({ debut: "2025-12-02", fin: "2026-01-10" })).toBe("2 déc. 2025 → 10 janv. 2026");
    expect(periodeLisible({ debut: "2026-06-22", fin: "2026-06-22" })).toBe("22 juin 2026");
  });
});
