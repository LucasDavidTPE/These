import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isoligne, type CarteDoc } from "./carte";
import { descriptionGeometrie, estComsol, geometrie, grapheCarte, grapheProfils, legendes, libelleColonne, lireComsol } from "./comsol";
import {
  ajouterColonne,
  changerRepere,
  combiner,
  contourEmpreinte,
  grapheBarres,
  grapheTemporel,
  lireReglagesComsol,
  lireValeurs,
  nomsColonnes,
  pic,
  profilsInterpoles,
  reglagesComsolDefaut,
  synthese,
  syntheseLatex,
} from "./comsolCalcul";
import { exportGraphSvg, exportPgfplots } from "./export";
import { analyserFormule, evaluerFormule } from "./formule";
import { graphLayout, hauteurEgale } from "./layout";
import { validateGraph } from "./model";
import { echelleCommune, miseEnPage, plancheVide } from "./planche";

const lire = (n: string) => lireComsol(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"), n);
const el = () => lire("grille_XZ_EL_het.txt");
const ve = () => lire("grille_XZ_VE_het.txt");
const decalee = () => lire("grille_XZ_VE_circ_decalee.txt");
const tableVe = () => lire("table_temps_VE.txt");
const tableEl = () => lire("table_temps_EL_seule.txt");
const col = (e: ReturnType<typeof el>, expr: string) => e.valeurs[e.coordonnees.length + e.colonnes.findIndex((c) => c.expression === expr)]!;

describe("tables COMSOL (séries temporelles)", () => {
  it("reconnaît une table, avec ou sans en-tête « % Model », et lit ses colonnes", () => {
    expect(estComsol(readFileSync(new URL("./fixtures/table_temps_EL_seule.txt", import.meta.url), "utf8"))).toBe(true);
    const t = tableVe();
    expect(t.nature).toBe("table");
    expect(t.coordonnees).toEqual(["Temps"]);
    expect(t.uniteArgument).toBe("s");
    expect(t.lignes).toBe(41);
    expect(t.colonnes.map((c) => c.expression)).toEqual(["1e6*solid.eZZ", "Déformation, composante xz"]);
    expect(t.colonnes[0]!.parametres.Point).toBe("(0.848, 6.5, -0.08)");
    expect(libelleColonne(t.colonnes[0]!)).toMatchObject({ grandeur: "$\\varepsilon_{zz}$", unite: "µdef" });
    expect(libelleColonne(t.colonnes[1]!)).toMatchObject({ grandeur: "$\\varepsilon_{xz}$", unite: "-" });
    expect(geometrie(t).genre).toBe("serie");
    expect(descriptionGeometrie(t)).toBe("série (Temps en s), 41 instants, 2 colonne(s)");
    const s = tableEl();
    expect(s.nature).toBe("table");
    expect(s.colonnes).toHaveLength(1);
    expect(s.valeurs[0]![2]).toBe(1);
  });

  it("pic, instant du pic et décalage par rapport à t = 10 s, référence élastique en trait horizontal", () => {
    const t = tableVe();
    const p = pic(t.valeurs[0]!, t.valeurs[1]!, "abs")!;
    expect(p.x).toBe(11);
    expect(p.y).toBeCloseTo(-150, 6);
    expect(pic(t.valeurs[0]!, t.valeurs[1]!, "max")!.y).toBeLessThanOrEqual(0);
    const g = grapheTemporel([tableEl(), t], { expressions: ["1e6*solid.eZZ"], reference: { valeur: -100, texte: "Élastique" }, instant: 10, pic: "abs" });
    expect(g.series).toHaveLength(2);
    expect(g.x.label).toBe("$t$ (s)");
    expect(g.y.label).toBe("$\\varepsilon_{zz}$ (µdef)");
    expect(g.reperes).toEqual([
      { axe: "y", valeur: -100, texte: "Élastique", trait: "dashed" },
      { axe: "x", valeur: 10, texte: "$t$ = 10 s", trait: "dotted" },
    ]);
    expect(g.annotations).toHaveLength(2);
    expect(g.annotations![1]!.texte).toBe("−150 µdef à 11 s ; Δt = +1 s");
    expect(g.annotations![0]!.texte).toContain("Δt = +0 s");
    expect(validateGraph(g).ok).toBe(true);
    const tex = exportPgfplots(g).tex;
    expect(tex).toContain("\\draw[line width=");
    expect(tex).toContain("{Élastique}");
    expect(tex).toContain("circle[radius=0.6mm]");
    expect(exportGraphSvg(g)).toContain("Δt = +1 s");
  });
});

describe("opérations entre fichiers de même grille", () => {
  it("différence, rapport et écart relatif point à point, enregistrables comme un graphe", () => {
    const d = combiner(ve(), el(), "difference");
    expect(d.nom).toBe("grille_XZ_VE_het − grille_XZ_EL_het");
    const a = col(ve(), "1e6*solid.eZZ");
    const b = col(el(), "1e6*solid.eZZ");
    expect(col(d, "1e6*solid.eZZ")[0]).toBeCloseTo(a[0]! - b[0]!, 9);
    expect(libelleColonne(d.colonnes[1]!)).toMatchObject({ grandeur: "$\\Delta$$\\varepsilon_{zz}$", unite: "µdef" });
    const r = combiner(ve(), el(), "rapport");
    expect(col(r, "1e6*solid.eZZ")[4]).toBeCloseTo(1.5, 9);
    const e = combiner(ve(), el(), "ecart");
    // εzz < 0 : VE 1,5 fois plus comprimé → (A − B) / |B| = −50 %
    expect(col(e, "1e6*solid.eZZ")[4]).toBeCloseTo(-50, 9);
    expect(libelleColonne(e.colonnes[0]!).unite).toBe("%");
    // la grille est retrouvée même si les lignes sont dans un autre ordre
    const melange = { ...el(), valeurs: el().valeurs.map((c) => Float64Array.from([...c].reverse())) };
    expect(col(combiner(ve(), melange, "rapport"), "1e6*solid.eXX")[0]).toBeCloseTo(1.5, 9);
    // en carte comme en profil
    const carte = grapheCarte(e, "1e6*solid.eZZ", "mm");
    expect(carte.carte!.v.flat().every((v) => v !== null && Math.abs(v + 50) < 1e-9)).toBe(true);
    expect(validateGraph(carte).ok).toBe(true);
    const [p] = profilsInterpoles(d, 0, [0.8]);
    expect(grapheProfils([p!], { expressions: ["1e6*solid.eZZ"], longueur: "mm" }).series).toHaveLength(1);
  });

  it("refuse proprement deux grilles différentes", () => {
    expect(() => combiner(ve(), decalee(), "difference")).toThrow(/Grilles différentes : 9 points dans .*, dont 3 de A absents de B \(par exemple X = 0,8/);
    expect(() => combiner(ve(), tableVe(), "difference")).toThrow(/Grilles différentes/);
  });
});

describe("colonnes calculées et repère", () => {
  it("formules : abs, max(·,0), combinaison linéaire, signe, facteur d'unité", () => {
    expect(evaluerFormule("abs(a) + max(b, 0) - 2*c^2", 2, (n) => ({ a: [-1, 2], b: [-3, 4], c: [1, 0] })[n] ?? null)).toEqual(Float64Array.from([-1, 6]));
    expect(evaluerFormule("1/a", 2, () => [0, 2])[0]).toBeNaN();
    expect(() => analyserFormule("exx +")).toThrow(/incomplète/);
    expect(() => analyserFormule("foo(1)")).toThrow(/fonction inconnue/);
    expect(() => analyserFormule("2,5*x")).toThrow(/« , » en trop|position/);
    expect(() => evaluerFormule("inconnue", 1, () => null)).toThrow(/ne désigne aucune colonne/);
    const noms = nomsColonnes(el());
    expect([...noms.keys()]).toEqual(expect.arrayContaining(["x", "y", "z", "exx", "ezz", "w", "c1", "c2", "c3"]));
    const e = ajouterColonne(el(), { formule: "0.5*(exx + ezz)", nom: "moy", unite: "µdef" });
    expect(e.colonnes.at(-1)).toMatchObject({ expression: "moy", libelle: { grandeur: "moy", unite: "µdef" } });
    expect(col(e, "moy")[0]).toBeCloseTo(0.5 * (86 - 129), 9);
    const m = ajouterColonne(el(), { formule: "-1e-3*abs(ezz)", nom: "-|ezz| (‰)", unite: "‰" });
    expect(col(m, "-|ezz| (‰)")[0]).toBeCloseTo(-0.129, 9);
  });

  it("z en profondeur positive (axe vers le bas) et y − y0 pour centrer sur la roue", () => {
    const p = changerRepere(el(), 2, { facteur: -1, origine: 0 });
    expect(p.valeurs[2]![0]).toBeCloseTo(0.32, 12);
    const c = changerRepere(p, 0, { facteur: 1, origine: 0.8 });
    expect(c.valeurs[0]![0]).toBeCloseTo(-0.1, 12);
    expect(c.repere).toEqual({ 0: { facteur: 1, origine: 0.8 }, 2: { facteur: -1, origine: 0 } });
    const g = grapheCarte(c, "1e6*solid.eZZ", "mm", { interfaces: [{ z: -0.08, texte: "BB/GB" }] });
    expect(g.x.label).toBe("$x - x_0$ (mm)");
    expect(g.y.label).toBe("Profondeur (mm)");
    expect(g.y.inverse).toBe(true);
    expect(g.reperes).toEqual([{ axe: "y", valeur: 80, texte: "BB/GB", trait: "dashed" }]);
    // l'axe inversé met la surface en haut
    const { box, primitives } = graphLayout(g);
    expect(primitives.some((q) => q.kind === "text" && q.text === "BB/GB")).toBe(true);
    expect(box.h).toBeGreaterThan(0);
    expect(exportPgfplots(g).tex).toContain("y dir=reverse");
    // deux changements se composent ; revenir au repère initial l'efface
    expect(changerRepere(changerRepere(el(), 2, { facteur: -1, origine: 0 }), 2, { facteur: -1, origine: 0 }).repere).toEqual({});
  });
});

describe("profils extraits d'une carte", () => {
  it("interpole entre deux lignes de grille, plusieurs profils d'un coup, superposés", () => {
    expect(lireValeurs("0,70 ; 0,848  0.9")).toEqual([0.7, 0.848, 0.9]);
    const ps = profilsInterpoles(el(), 0, [0.7, 0.75, 0.848, 0.9]);
    expect(ps.map((p) => p.legende)).toEqual(["$x$ = 0,7 m", "$x$ = 0,75 m", "$x$ = 0,848 m", "$x$ = 0,9 m"]);
    expect(geometrie(ps[0]!).genre).toBe("profil");
    // exx = 100x − 50z (linéaire) : l'interpolation est exacte
    expect(col(ps[2]!, "1e6*solid.eXX")[0]).toBeCloseTo(100 * 0.848 + 50 * 0.32, 9);
    const g = grapheProfils(ps, { expressions: ["1e6*solid.eXX"], longueur: "mm", profondeur: true, interfaces: [{ z: -0.08, texte: "BB/GB" }] });
    expect(g.series.map((s) => s.name)).toEqual(["$x$ = 0,7 m", "$x$ = 0,75 m", "$x$ = 0,848 m", "$x$ = 0,9 m"]);
    expect(g.y).toMatchObject({ label: "Profondeur (mm)", inverse: true, min: 0 });
    expect(g.reperes).toEqual([{ axe: "y", valeur: 80, texte: "BB/GB", trait: "dashed" }]);
    expect(() => profilsInterpoles(el(), 0, [1.2])).toThrow(/hors de la coupe/);
  });
});

describe("tableau de synthèse", () => {
  it("max, min et positions ; LaTeX booktabs ; barres groupées empreinte × matériau", () => {
    const fichiers = [el(), ve(), { ...el(), nom: "coupeXZ_R1_EL_rect.txt" }, { ...ve(), nom: "coupeXZ_R1_VE_rect.txt" }].map((e, i) => (i < 2 ? { ...e, nom: ["coupeXZ_R1_EL_het.txt", "coupeXZ_R1_VE_het.txt"][i]! } : e));
    const corr = [
      { de: "VE", vers: "Viscoélastique" },
      { de: "EL", vers: "Élastique" },
      { de: "het", vers: "Hétérogène" },
    ];
    const s = synthese(fichiers, ["1e6*solid.eZZ"], { longueur: "mm", correspondances: corr });
    expect(s).toHaveLength(4);
    expect(s[0]).toMatchObject({ max: -127, posMax: { X: 900, Y: 6500, Z: -320 }, min: -193, posMin: { X: 700, Y: 6500, Z: 0 } });
    const tex = syntheseLatex(s, { longueur: "mm", virgule: true });
    expect(tex).toContain("\\toprule");
    expect(tex).toContain("\\cmidrule(lr){3-6} \\cmidrule(lr){7-10}");
    expect(tex).toContain("$\\varepsilon_{zz}$ (µdef) & $-127$ & $900$ & $6500$ & $-320$ & $-193$");
    expect(tex).toContain("\\bottomrule");
    const b = grapheBarres(s, { expression: "1e6*solid.eZZ", categorie: 3, groupe: 2, statistique: "abs", correspondances: corr });
    expect(b.x.categories).toEqual(["Hétérogène", "rect"]);
    expect(b.series.map((x) => x.name)).toEqual(["Élastique", "Viscoélastique"]);
    expect(b.series[1]!.y).toEqual([-289.5, -289.5]);
    expect(exportPgfplots(b).tex).toContain("xticklabels={{Hétérogène},{rect}}");
    expect(graphLayout(b).xs.labels).toEqual(["Hétérogène", "rect"]);
  });
});

describe("légendes depuis l'en-tête COMSOL", () => {
  it("table de correspondance (lc=3 → Hétérogène, VE=1 → Viscoélastique), en plus des mots du nom", () => {
    const corr = reglagesComsolDefaut().correspondances;
    const a = { ...el(), nom: "export.txt" };
    const b = { ...ve(), nom: "export.txt" };
    expect(legendes([a, b], { correspondances: corr })).toEqual(["Élastique", "Viscoélastique"]);
    expect(legendes([el(), ve()], { correspondances: [{ de: "EL", vers: "Élastique" }] })).toEqual(["Élastique", "VE"]);
    expect(legendes([el(), ve()], { correspondances: corr, source: "les-deux" })).toEqual(["EL — Élastique", "VE — Viscoélastique"]);
    expect(lireReglagesComsol({ correspondances: [{ de: "lc=1", vers: "Rect" }, { de: 3 }], interfaces: [{ z: -0.08, texte: "BB/GB" }, { z: "x" }] })).toEqual({
      format: "these-comsol/1",
      correspondances: [{ de: "lc=1", vers: "Rect" }],
      interfaces: [{ z: -0.08, texte: "BB/GB" }],
    });
  });
});

describe("cartes : isolignes, aspect réel, échelle commune, contour d'empreinte", () => {
  const carte: CarteDoc = { x: [0, 1, 2], y: [0, 1, 2], v: [[0, 1, 2], [1, 2, 3], [2, 3, 4]], palette: "viridis", niveaux: 8, legende: "", inverser: false };

  it("isolignes par carrés marchants, chaînées en polylignes, dans le SVG et pgfplots", () => {
    const l = isoligne(carte, 2.5);
    expect(l).toHaveLength(1);
    expect(l[0]!.length).toBe(4);
    for (const [x, y] of l[0]!) expect(x + y).toBeCloseTo(2.5, 12);
    expect(isoligne({ ...carte, v: [[0, 1, 2], [1, null, 3], [2, 3, 4]] }, 2.5)).toEqual([]);
    // col : deux coins hauts opposés, centre bas → deux segments
    expect(isoligne({ ...carte, x: [0, 1], y: [0, 1], v: [[1, 0], [0, 1]] }, 0.6)).toHaveLength(2);
    const doc = { format: "figurine-graph/1" as const, width: 100, height: 80, theme: "these", x: { label: "", log: false }, y: { label: "", log: false }, legend: "none" as const, grid: false, bar_width: 3, carte: { ...carte, isolignes: [2.5] }, series: [] };
    expect(validateGraph(doc).ok).toBe(true);
    expect(graphLayout(doc).primitives.some((p) => p.kind === "text" && p.text === "2,5")).toBe(true);
    expect(exportPgfplots(doc).tex).toMatch(/% Isoligne 2\.5\n\\addplot\[black, line width=[\d.]+mm, mark=none, forget plot\] coordinates \{\(2,0\.5\) \(1\.5,1\) \(1,1\.5\) \(0\.5,2\)\};/);
  });

  it("rapport d'aspect réel : la hauteur suit la largeur (1 m = 1 m)", () => {
    const doc = { format: "figurine-graph/1" as const, width: 100, height: 80, theme: "these", x: { label: "", log: false, min: 0, max: 4 }, y: { label: "", log: false, min: 0, max: 1 }, legend: "none" as const, grid: false, bar_width: 3, egalite: true, series: [{ name: "a", type: "line" as const, x: [0, 4], y: [0, 1], legend: false }] };
    const h = hauteurEgale(doc);
    const { box } = graphLayout({ ...doc, height: h });
    expect(box.w / box.h).toBeCloseTo(4, 1);
  });

  it("même échelle de couleurs pour toutes les cartes d'une planche", () => {
    const base = { format: "figurine-graph/1" as const, width: 100, height: 80, theme: "these", x: { label: "", log: false }, y: { label: "", log: false }, legend: "none" as const, grid: false, bar_width: 3, series: [] };
    const a = { ...base, carte: { ...carte, palette: "divergente" as const } };
    const b = { ...base, carte: { ...carte, palette: "divergente" as const, v: carte.v.map((l) => l.map((v) => (v === null ? null : -2 * v))) } };
    expect(echelleCommune([a, b])).toEqual([-8, 8]);
    const m = miseEnPage({ ...plancheVide(), memeEchelle: true }, [a, b]);
    expect(m.cases.map((c) => [c.doc!.carte!.min, c.doc!.carte!.max])).toEqual([
      [-8, 8],
      [-8, 8],
    ]);
  });

  it("contour d'empreinte : cercle, rectangle lx × Ly, courbe importée", () => {
    const c = contourEmpreinte({ forme: "cercle", cx: 0, cy: 0, r: 150 });
    expect(c).toMatchObject({ type: "line", legend: false, color: "#000000" });
    expect(Math.hypot(c.x[10]!, c.y[10]!)).toBeCloseTo(150, 6);
    expect(contourEmpreinte({ forme: "rectangle", cx: 0, cy: 0, lx: 200, ly: 100 }).x).toEqual([-100, 100, 100, -100, -100]);
    expect(() => contourEmpreinte({ forme: "courbe", x: [1], y: [1] })).toThrow(/deux points/);
  });
});

describe("repère d'origine", () => {
  it("l'inverse d'un changement de repère rend les coordonnées du fichier", () => {
    const a = changerRepere(changerRepere(el(), 2, { facteur: -1, origine: 0.1 }), 0, { facteur: 1, origine: 0.8 });
    let r = a;
    for (const [j, t] of Object.entries(a.repere ?? {})) r = changerRepere(r, Number(j), { facteur: 1 / t.facteur, origine: -t.facteur * t.origine });
    expect(r.repere).toEqual({});
    expect([...r.valeurs[2]!]).toEqual([...el().valeurs[2]!].map((v) => expect.closeTo(v, 12)));
    expect(r.valeurs[0]![1]).toBeCloseTo(0.8, 12);
  });
});
