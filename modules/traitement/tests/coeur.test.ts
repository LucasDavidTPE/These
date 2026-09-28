/**
 * Le cœur TypeScript (core/) : mêmes tests que ceux de la page d'origine (tests/*.test.js,
 * lancés par `node --test`), assertions et tolérances identiques — jamais assouplies —, plus
 * une vérification que le portage donne exactement les mêmes nombres que le JavaScript
 * d'origine.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aTwlf, calageConjoint, calerWLF, ecarts, recalerIsothermes, type PointMesure } from "../core/calage";
import { detecterCampagne } from "../core/campagne";
import { construireDonnees, TableBrute } from "../core/donnees";
import { lireFichier } from "../core/io/lecture";
import { MODELES, modele, type ModeleCale } from "../core/modeles";
import { identifierGKV, moduleGKV } from "../core/modeles/gkv";
import { synthetiser } from "../core/synthese";
import { traiterPalier, type LigneCycle } from "../core/traitement";

interface Reference {
  raw: unknown[][];
  ref: Record<string, unknown>[];
  params: { a1: number; b1: number; a2: number; b2: number; freq: number; diam: number; temp: number };
}
const lire = (nom: string) => JSON.parse(readFileSync(new URL(`./reference/${nom}`, import.meta.url), "utf8")) as Reference;

const JEUX: [string, string][] = [
  ["palier-0003hz.json", "palier à 0,003 Hz — 447 points demandés, 410 utilisés"],
  ["palier-0003hz-sous-echantillonne.json", "même palier sous-échantillonné — aucune troncature"],
];

function traiter(R: Reference, exact: boolean): LigneCycle[] {
  const P = R.params;
  const donnees = construireDonnees(TableBrute.depuisLignes(R.raw), {
    etalonnage: { a1: P.a1, b1: P.b1, a2: P.a2, b2: P.b2 },
    voiesAxiales: [true, true, true],
    voiesRadiales: [true, true, false, false],
  });
  return traiterPalier(donnees, { freq: P.freq, diametre: P.diam, hCalcul: 1, temperature: P.temp, exact });
}

describe("conformité au classeur Excel (Info!D7:BL7 recalculé par un vrai tableur)", () => {
  it.each(JEUX)("%s : %s", (fichier) => {
    const R = lire(fichier);
    const lignes = traiter(R, true);
    // le classeur nomme « Emod » ce que le code nomme « module »
    const alias: Record<string, string> = { Emod: "module", sonde2: "sonde" };
    let pire = { ecart: 0, cle: "", cycle: 0, a: 0, b: 0 };
    let comparaisons = 0;
    for (let i = 0; i < R.ref.length; i++) {
      const attendu = R.ref[i]!,
        obtenu = lignes[i];
      expect(obtenu, `cycle ${i + 1} absent du résultat`).toBeTruthy();
      for (const [cle, a] of Object.entries(attendu)) {
        if (typeof a !== "number" || !Number.isFinite(a)) continue;
        const b = obtenu![alias[cle] ?? cle] as number;
        const ecart = Math.abs(b - a) / Math.max(Math.abs(a), 1e-12);
        if (ecart > pire.ecart) pire = { ecart, cle, cycle: i + 1, a, b };
        comparaisons++;
      }
    }
    expect(comparaisons).toBeGreaterThan(200);
    expect(pire.ecart, `écart sur « ${pire.cle} » au cycle ${pire.cycle} (Excel ${pire.a}, calculé ${pire.b})`).toBeLessThan(1e-9);
  });

  it("le mode corrigé lève bien la troncature à 410 points", () => {
    const R = lire(JEUX[0]![0]);
    const P = R.params;
    const donnees = construireDonnees(TableBrute.depuisLignes(R.raw), { etalonnage: { a1: P.a1, b1: P.b1, a2: P.a2, b2: P.b2 } });
    const commun = { freq: P.freq, diametre: P.diam, hCalcul: 1, temperature: P.temp };
    const exact = traiterPalier(donnees, { ...commun, exact: true });
    const corrige = traiterPalier(donnees, { ...commun, exact: false });
    expect(exact[0]!.nPoints).toBe(410);
    expect(exact[0]!.tronque).toBe(true);
    expect(corrige[0]!.nPoints).toBe(corrige[0]!.nCycle);
    expect(corrige[0]!.tronque).toBe(false);
    expect(Math.abs(corrige[0]!.module - exact[0]!.module)).toBeGreaterThan(1e-6);
  });

  it("un cycle écarté sort de la synthèse et y revient tel quel", () => {
    const lignes = traiter(lire(JEUX[0]![0]), true);
    const tout = synthetiser(lignes)[0]!;
    expect(tout.n).toBe(lignes.length);
    expect(tout.ecartes).toBe(0);
    const partiel = synthetiser(lignes, (l) => l.cycle !== lignes[0]!.cycle)[0]!;
    expect(partiel.n).toBe(lignes.length - 1);
    expect(partiel.ecartes).toBe(1);
    expect(partiel.module).not.toBe(tout.module);
    const remis = synthetiser(lignes, () => true)[0]!;
    for (const champ of ["module", "phi", "nu", "sigma0", "module_et"]) expect(remis[champ]).toBe(tout[champ]);
  });
});

const P = { E00: 120, E0: 41000, k: 0.175, h: 0.6, delta: 2.05, tauE: 0.32, beta: 180, nu00: 0.18, nu0: 0.44, tauNu: 1.024 };

describe("modèles et calage", () => {
  it("chaque modèle déclare ce dont l'interface a besoin", () => {
    for (const m of MODELES) {
      expect(m.id && m.nom && m.resume).toBeTruthy();
      expect(m.parametres.length).toBeGreaterThan(0);
      for (const p of m.parametres) {
        expect(p.cle && p.label).toBeTruthy();
        expect(Number.isFinite(m.defauts[p.cle])).toBe(true);
      }
      for (const cle of m.ajustables) expect(m.bornes[cle]).toBeTruthy();
    }
  });

  it("Huet-Sayegh est le 2S2P1D quand β tend vers l'infini", () => {
    const hs = modele("huet-sayegh") as ModeleCale,
      s2 = modele("2s2p1d") as ModeleCale;
    for (const f of [1e-4, 1e-2, 1, 100]) {
      const a = hs.module(f, P);
      const b = s2.module(f, { ...P, beta: 1e12 });
      expect(Math.abs(a.norme - b.norme) / b.norme).toBeLessThan(1e-6);
    }
    const bas = 1e-6;
    expect(Math.abs(hs.module(bas, P).norme - s2.module(bas, P).norme) / hs.module(bas, P).norme).toBeGreaterThan(0.05);
  });

  it("la chaîne Kelvin-Voigt reproduit le modèle dont elle est tirée", () => {
    const source = modele("2s2p1d") as ModeleCale;
    const chaine = identifierGKV(source, P, { nElements: 40, fMin: 1e-6, fMax: 1e12 });
    expect(chaine.E).toHaveLength(40);
    expect(chaine.E.every((e) => e > 0)).toBe(true);
    let pire = 0;
    for (let lf = -4; lf <= 6; lf += 0.5) {
      const f = 10 ** lf;
      const a = source.module(f, P).norme;
      const b = moduleGKV(f, chaine).norme;
      pire = Math.max(pire, Math.abs(b - a) / a);
    }
    expect(pire).toBeLessThan(0.05);
  });

  it("la loi WLF est retrouvée à partir de facteurs de translation exacts", () => {
    const Tref = 15,
      C1 = 25,
      C2 = 180;
    const temperatures = [-25, -15, -5, 5, 15, 25, 35, 45];
    const r = calerWLF(
      temperatures,
      temperatures.map((T) => aTwlf(T, Tref, C1, C2)),
      Tref,
    );
    expect(Math.abs(r.C1 - C1)).toBeLessThan(0.5);
    expect(Math.abs(r.C2 - C2)).toBeLessThan(5);
  });

  it("le recalage des isothermes et le calage retrouvent les constantes de départ", () => {
    const Tref = 15,
      C1 = 25,
      C2 = 180;
    const temperatures = [-25, -15, -5, 5, 15, 25, 35];
    const frequences = [0.003, 0.01, 0.03, 0.1, 0.3, 1, 3, 10];
    const s2 = modele("2s2p1d") as ModeleCale;
    const points: PointMesure[] = [];
    const parTemperature: Record<number, PointMesure[]> = {};
    for (const T of temperatures) {
      parTemperature[T] = [];
      for (const f of frequences) {
        const m = s2.module(f * aTwlf(T, Tref, C1, C2), P);
        const pt = { T, f, module: m.norme, phi: m.phase, nu: NaN };
        points.push(pt);
        parTemperature[T].push(pt);
      }
    }
    const geo = recalerIsothermes(parTemperature, Tref);
    for (const T of temperatures.filter((t) => t >= -5)) expect(Math.abs(Math.log10(geo[T]!) - Math.log10(aTwlf(T, Tref, C1, C2)))).toBeLessThan(0.15);
    const depart = { ...P, E0: 30000, k: 0.25, h: 0.7, delta: 3, tauE: 1, beta: 400 };
    const r = calageConjoint(s2, parTemperature, Tref, depart, geo);
    for (const T of temperatures) expect(Math.abs(Math.log10(r.aT[T]!) - Math.log10(aTwlf(T, Tref, C1, C2)))).toBeLessThan(0.12);
    const e = ecarts(s2, points, r.aT, r.parametres);
    expect(e.module).toBeLessThan(1);
    expect(e.phase).toBeLessThan(0.5);
  });
});

describe("lecture", () => {
  it("export WaveMatrix (.steps.tracking.csv) : « ; », en-têtes entre guillemets", async () => {
    const l = ['"Nombre total de cycles";"Temps total (s)";"Force(8800 (0,1):Charge) (kN)";"Personnalisée(103 (0,3):Lion171144) (µm)";"Personnalisée(103 (0,5):Défini par utilisateur) (°C)";'];
    for (let i = 0; i < 300; i++) l.push([Math.floor(i / 20) + 1, i * 30, "1,5", "2", "20", ""].join(";"));
    const r = await lireFichier({ name: "Essai1.steps.tracking.csv", text: async () => l.join("\n") });
    expect(r.table.n).toBe(300);
    expect(r.entetes[0]).toBe("Nombre total de cycles");
    expect(r.correspondance).toMatchObject({ cycle: 0, charge: 2, lion1: 3, pt100: 4 });
    expect(r.table.colonne(2)![0]).toBe(1.5);
  });
});

describe("portage fidèle : mêmes nombres que le JavaScript d'origine", () => {
  it("traitement, synthèse, détection de campagne et calage, à l'identique", async () => {
    // @ts-expect-error -- code JavaScript de la page d'origine, sans déclaration de types
    const jsDonnees = (await import("../statique/src/coeur/donnees.js")) as { TableBrute: { depuisLignes(l: unknown[][]): unknown }; construireDonnees(t: unknown, o: unknown): unknown };
    // @ts-expect-error -- idem
    const jsTraitement = (await import("../statique/src/coeur/traitement.js")) as { traiterPalier(d: unknown, o: unknown): Record<string, unknown>[] };
    // @ts-expect-error -- idem
    const jsCalage = (await import("../statique/src/coeur/calage.js")) as { recalerIsothermes(p: unknown, T: number): Record<number, number>; calageConjoint(m: unknown, p: unknown, T: number, p0: unknown, a: unknown): { parametres: Record<string, number> } };
    // @ts-expect-error -- idem
    const jsModeles = (await import("../statique/src/coeur/modeles/index.js")) as { modele(id: string): unknown };

    for (const [fichier] of JEUX) {
      const R = lire(fichier);
      const P2 = R.params;
      for (const exact of [true, false]) {
        const o = { etalonnage: { a1: P2.a1, b1: P2.b1, a2: P2.a2, b2: P2.b2 } };
        const ts = traiterPalier(construireDonnees(TableBrute.depuisLignes(R.raw), o), { freq: P2.freq, diametre: P2.diam, temperature: P2.temp, exact });
        const js = jsTraitement.traiterPalier(jsDonnees.construireDonnees(jsDonnees.TableBrute.depuisLignes(R.raw), o), { freq: P2.freq, diametre: P2.diam, temperature: P2.temp, exact });
        expect(ts.length).toBe(js.length);
        ts.forEach((l, i) => {
          for (const [k, v] of Object.entries(l)) if (typeof v === "number") expect(Object.is(v, js[i]![k]), `${fichier} ${k} cycle ${i}`).toBe(true);
        });
      }
    }

    // Détection de campagne sur un essai synthétique à trois paliers.
    const lignes: number[][] = [];
    let t = 0,
      cycle = 1;
    for (const [T, f, n] of [
      [20, 1, 10],
      [20, 10, 20],
      [30, 1, 10],
    ] as const) {
      for (let c = 0; c < n; c++, cycle++) for (let k = 0; k < 40; k++, t += 1 / (40 * f)) lignes.push([cycle, t, 0, Math.sin(2 * Math.PI * f * t), 0, 0, 0, 0, 0, 0, T]);
    }
    const table = TableBrute.depuisLignes(lignes);
    // @ts-expect-error -- idem
    const jsCampagne = (await import("../statique/src/coeur/campagne.js")) as { detecterCampagne(t: unknown, m: unknown): unknown };
    const map = { cycle: 0, temps: 1, position: 2, charge: 3, defM: 4, defA: 5, defB: 6, defC: 7, lion1: 8, lion2: 9, lion3: -1, lion4: -1, pt100: 10 };
    expect(detecterCampagne(table, map)).toEqual(jsCampagne.detecterCampagne(jsDonnees.TableBrute.depuisLignes(lignes), map));

    // Recalage et calage conjoint.
    const Tref = 15;
    const s2 = modele("2s2p1d") as ModeleCale;
    const par: Record<number, PointMesure[]> = {};
    for (const T of [-5, 5, 15, 25])
      par[T] = [0.01, 0.1, 1, 10].map((f) => {
        const m = s2.module(f * aTwlf(T, Tref, 25, 180), P);
        return { T, f, module: m.norme, phi: m.phase };
      });
    const geoTs = recalerIsothermes(par, Tref);
    expect(geoTs).toEqual(jsCalage.recalerIsothermes(par, Tref));
    const depart = { ...P, E0: 30000 };
    expect(calageConjoint(s2, par, Tref, depart, geoTs).parametres).toEqual(jsCalage.calageConjoint(jsModeles.modele("2s2p1d"), par, Tref, depart, geoTs).parametres);
  });
});
