import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { depuisStudyToml, lireExecution } from "../core/modele";
import { OUTIL, script } from "../core/python";

describe("fiches", () => {
  it("lit le study.toml de these-lgcb", () => {
    const e = depuisStudyToml('title = "Lecture essai"\ndate = "2026-09-07"\nstatus = "termine"\nproject = "sergio-cm-b2c4-bio"\ntags = ["B2C4", "bio"]\nquestion = """\nVérifier la lecture.\n"""\n[inputs]\nessai_cm = "recherche:Sergio/Essai1"\n');
    expect(e).toEqual({ titre: "Lecture essai", question: "Vérifier la lecture.", conclusion: "", statut: "terminée", date: "2026-09-07", campagnes: ["sergio-cm-b2c4-bio"], tags: ["B2C4", "bio"], entrees: { essai_cm: "recherche:Sergio/Essai1" } });
  });
});

const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

describe.skipIf(!python)("outil Python : une exécution laisse sa trace", () => {
  it("résout les racines du poste, trace les sorties, et les erreurs", () => {
    const d = mkdtempSync(join(tmpdir(), "etude-"));
    const appdata = join(d, "appdata");
    mkdirSync(join(appdata, "fr.lucasdavid.these"), { recursive: true });
    writeFileSync(join(appdata, "fr.lucasdavid.these", "poste.json"), JSON.stringify({ racines: { recherche: "/donnees" } }));
    writeFileSync(join(d, "these_etude.py"), OUTIL);
    writeFileSync(join(d, "run.py"), script("Essai", "Q ?").replace("# essai = ", "essai = "));
    execFileSync(python!, ["run.py"], { cwd: d, env: { ...process.env, APPDATA: appdata } });
    const [stamp] = readdirSync(join(d, "sorties"));
    const x = lireExecution(stamp!, JSON.parse(readFileSync(join(d, "sorties", stamp!, "execution.json"), "utf8")));
    expect(x.statut).toBe("ok");
    expect(x.fichiers.map((f) => f.nom)).toEqual(["resultat.txt"]);
    expect(x.fichiers[0]!.octets).toBeGreaterThan(0);
    // Le chemin est écrit par Python dans la forme du système (« \donnees\… » sous Windows).
    expect(x.entrees.map((e) => ({ ...e, chemin: e.chemin.replace(/\\/g, "/") }))).toEqual([{ reference: "recherche:Sergio CM test Bio B2C4 brutes/Essai1", chemin: "/donnees/Sergio CM test Bio B2C4 brutes/Essai1" }]);

    writeFileSync(join(d, "casse.py"), "from these_etude import Etude\nimport time\nEtude(__file__)\ntime.sleep(1.1)\nraise ValueError('palier introuvable')\n");
    spawnSync(python!, ["casse.py"], { cwd: d, env: { ...process.env, APPDATA: appdata } });
    const stamps = readdirSync(join(d, "sorties")).sort();
    const y = lireExecution(stamps.at(-1)!, JSON.parse(readFileSync(join(d, "sorties", stamps.at(-1)!, "execution.json"), "utf8")));
    expect(y.statut).toBe("erreur");
    expect(y.erreur).toContain("ValueError: palier introuvable");
  });
});
