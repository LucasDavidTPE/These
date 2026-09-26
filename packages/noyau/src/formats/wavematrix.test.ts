import { describe, expect, it } from "vitest";
import { decimer, lireCsv, lireEntete, voieTemps } from "./wavematrix";

describe("en-têtes WaveMatrix", () => {
  it("décode grandeur, bâti, capteur, unité, nature", () => {
    expect(lireEntete("Force(8800 (0,1):Charge) (kN)")).toMatchObject({ grandeur: "Force", bati: "8800 (0,1)", capteur: "Charge", unite: "kN", nature: "force" });
    expect(lireEntete("Personnalisée(103 (0,3):Lion171144) (µm)")).toMatchObject({ capteur: "Lion171144", nature: "deplacement" });
    expect(lireEntete("Personnalisée(103 (0,4):Défini par utilisateur) (°C)").nature).toBe("temperature");
    expect(lireEntete("Nombre total de cycles(Forme d'onde 8800 (0,1))")).toMatchObject({ unite: null, nature: "cycles" });
    expect(lireEntete("Temps total (s)")).toMatchObject({ grandeur: "Temps total", nature: "temps" });
    expect(lireEntete("Temps de cycle (s)").nature).toBe("temps_cycle");
    expect(lireEntete("Modale(8800:Déconnecté) (mm)").nature).toBe("modal");
  });
});

describe("CSV", () => {
  it("lit le dialecte français, BOM et colonne fantôme compris", () => {
    const s = lireCsv('\uFEFF"Temps total (s)";"Force(8800 (0,1):Charge) (kN)";"Personnalisée(103 (0,4):Défini par utilisateur) (°C)";\r\n0,5;1,25;20,1;\r\n1,0;-0,75;;\r\n\r\n');
    expect(s.voies.map((v) => v.nature)).toEqual(["temps", "force", "temperature"]);
    expect(s.lignes).toBe(2);
    expect([...s.colonnes[1]!]).toEqual([1.25, -0.75]);
    expect(Number.isNaN(s.colonnes[2]![1]!)).toBe(true);
    expect(voieTemps(s)).toBe(0);
  });

  it("la décimation garde les extrêmes de chaque paquet", () => {
    const n = 10_000;
    const x = Float64Array.from({ length: n }, (_, i) => i);
    const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 3) + (i === 5000 ? 10 : 0));
    const d = decimer(x, y, 200);
    expect(d.x.length).toBeLessThanOrEqual(200);
    expect(Math.max(...d.y)).toBe(y[5000]);
    expect(Math.min(...d.y)).toBeCloseTo(-1, 3);
  });
});

describe("TOML des fiches these-lgcb", () => {
  it("listes, chaînes multilignes, tables", async () => {
    const { lireToml } = await import("./toml");
    const t = lireToml('title = "Lecture"\ntags = ["B2C4", "bio"]   # commentaire\nquestion = """\nPourquoi ?\n"""\n[inputs]\nessai = "recherche:X/Essai1"\n');
    expect(t).toEqual({ title: "Lecture", tags: ["B2C4", "bio"], question: "Pourquoi ?\n", inputs: { essai: "recherche:X/Essai1" } });
  });
});
