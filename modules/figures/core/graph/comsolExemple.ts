/**
 * Jeu d'exemple de l'atelier COMSOL : des exports synthétiques au format COMSOL (« Données » et « Table »),
 * vraisemblables pour une chaussée à trois couches (BB 0–8 cm, GB 8–32 cm, GRH en dessous) sous une roue,
 * pour découvrir et essayer toutes les tuiles sans rien exporter : coupes x-z EL / VE × empreintes het, rect,
 * circ, un maillage raffiné, une charge roulante à plusieurs instants, une ligne de surface (bassin), des
 * profils verticaux, un balayage du module de la GB, un signal au cours du temps et une mesure de jauge.
 * Les champs sont des formes analytiques simples, pas un calcul mécanique : ils servent à essayer l'outil.
 */

export interface FichierExemple {
  nom: string;
  texte: string;
  /** À quoi il sert dans la visite. */
  role: string;
}

const EXPRESSIONS = [
  ["1e6*solid.eXX", "1"],
  ["1e6*solid.eZZ", "1"],
  ["1e6*solid.eXZ", "1"],
  ["1e3*w", "m"],
] as const;

type Cas = {
  materiau: "EL" | "VE";
  empreinte: "het" | "rect" | "circ";
  facteur?: number;
};

/** Réponse en (x, z) sous une roue centrée en x0 (m) : déformations en µdef, déflexion en mm. */
function champ(
  x: number,
  z: number,
  c: Cas & { x0?: number; amplitude?: number },
): [number, number, number, number] {
  const x0 = c.x0 ?? 0.9;
  const k =
    (c.materiau === "VE" ? 1.5 : 1) * (c.facteur ?? 1) * (c.amplitude ?? 1);
  // largeur de la tache : plus étroite pour l'empreinte hétérogène (pics de pression), plus large pour circ
  const l0 = c.empreinte === "het" ? 0.16 : c.empreinte === "rect" ? 0.2 : 0.24;
  const pic = c.empreinte === "het" ? 1.25 : c.empreinte === "rect" ? 1 : 0.9;
  const d = Math.round(-z * 1e9) / 1e9; // profondeur (arrondie : −0,8 + 36 × 0,02 doit valoir 0,08 pile)
  const l = l0 + 0.6 * d;
  const g = Math.exp(-(((x - x0) / l) ** 2));
  // εxx : compression en surface, traction à la base de la BB (z = −0,08) et surtout de la GB (z = −0,32)
  const exx =
    k *
    pic *
    g *
    (d <= 0.08
      ? -60 + (90 * d) / 0.08
      : d <= 0.32
        ? -40 + (240 * (d - 0.08)) / 0.24
        : 160 * Math.exp(-(d - 0.32) / 0.15));
  // εzz : compression, forte sous la charge, maximale au sommet du sol (module faible)
  const ezz =
    -k *
    pic *
    g *
    (d < 0.32 ? 120 + 90 * d : 260 * Math.exp(-(d - 0.32) / 0.3));
  const exz = k * pic * 40 * ((x - x0) / l) * g * Math.exp(-d / 0.25);
  const w =
    -k *
    0.45 *
    Math.exp(-(((x - x0) / (0.45 + 0.4 * d)) ** 2)) *
    Math.exp(-d / 1.2);
  return [exx, ezz, exz, w];
}

const n6 = (v: number) => String(Number(v.toPrecision(7)));
const entete = (nom: string, n: number, colonnes: string[]) =>
  [
    `% Model:              ${nom}.mph`,
    "% Version:            COMSOL 6.4.0.293 (exemple de Thèse)",
    "% Date:               Oct 16 2026, 10:00",
    "% Dimension:          3",
    `% Nodes:              ${n}`,
    `% Expressions:        ${colonnes.length}`,
    "% Description:        exemple",
    "% Length unit:        m",
    `% X                       Y                        Z                        ${colonnes.join(" ")}`,
  ].join("\n");
const params = (c: Cas, suite = "") =>
  `@ 1: lc=${c.empreinte === "rect" ? 1 : c.empreinte === "circ" ? 2 : 3}, VE=${c.materiau === "VE" ? 1 : 0}${suite}`;

function coupe(c: Cas, nom: string): string {
  const xs = Array.from({ length: 41 }, (_, i) => 0.3 + i * 0.03);
  const zs = Array.from({ length: 41 }, (_, i) => -0.8 + i * 0.02);
  const cols = EXPRESSIONS.map(([e, u]) => `${e} (${u}) ${params(c)}`);
  const lignes = zs.flatMap((z) =>
    xs.map((x) => `${n6(x)} 6.5 ${n6(z)} ${champ(x, z, c).map(n6).join(" ")}`),
  );
  return `${entete(nom, lignes.length, cols)}\n${lignes.join("\n")}\n`;
}

/** Charge roulante : la roue passe de x = 0,3 à 1,5 m entre t = 8 et 12 s (une colonne par grandeur et par instant). */
function coupeInstants(c: Cas, nom: string): string {
  const ts = Array.from({ length: 9 }, (_, i) => 8 + i * 0.5);
  const xs = Array.from({ length: 41 }, (_, i) => 0.3 + i * 0.03);
  const zs = Array.from({ length: 41 }, (_, i) => -0.8 + i * 0.02);
  const cols = ts.flatMap((t) =>
    EXPRESSIONS.map(([e, u]) => `${e} (${u}) @ t=${t}`),
  );
  const lignes = zs.flatMap((z) =>
    xs.map((x) => {
      const v = ts.flatMap((t) =>
        champ(x, z, {
          ...c,
          x0: 0.9 + 0.15 * (t - 10),
          amplitude: 1 + 0.08 * (t - 10) * Math.exp(-((t - 10) ** 2)),
        }),
      );
      return `${n6(x)} 6.5 ${n6(z)} ${v.map(n6).join(" ")}`;
    }),
  );
  return `${entete(nom, lignes.length, cols)}\n${lignes.join("\n")}\n`;
}

/** Ligne de surface (z = 0) le long de x, centre de la charge en x = 0,9 m : le bassin. */
function surface(c: Cas, nom: string): string {
  const xs = Array.from({ length: 151 }, (_, i) => -1.1 + i * 0.03);
  const cols = [`1e3*w (m) ${params(c)}`, `1e6*solid.eXX (1) ${params(c)}`];
  const lignes = xs.map((x) => {
    const [exx, , , w] = champ(x, 0, c) as [number, number, number, number];
    return `${n6(x)} 6.5 0 ${n6(w)} ${n6(exx)}`;
  });
  return `${entete(nom, lignes.length, cols)}\n${lignes.join("\n")}\n`;
}

/** Profil vertical sous la charge (x = 0,9 m), avec un paramètre d'en-tête en plus (balayage de E_GB). */
function verticale(c: Cas, nom: string, suite = "", facteur = 1): string {
  const zs = Array.from({ length: 81 }, (_, i) => -0.8 + i * 0.01);
  const cols = EXPRESSIONS.map(([e, u]) => `${e} (${u}) ${params(c, suite)}`);
  const lignes = zs.map(
    (z) =>
      `0.9 6.5 ${n6(z)} ${champ(0.9, z, { ...c, facteur })
        .map(n6)
        .join(" ")}`,
  );
  return `${entete(nom, lignes.length, cols)}\n${lignes.join("\n")}\n`;
}

/** Table COMSOL : εxx à la base de la GB sous le passage de la roue, au cours du temps. */
function table(c: Cas): string {
  const ts = Array.from({ length: 81 }, (_, i) => 8 + i * 0.05);
  const lignes = ts.map(
    (t) =>
      `${n6(t)} ${n6(champ(0.9, -0.32, { ...c, x0: 0.9 + 0.15 * (t - 10.2) })[0]!)}`,
  );
  return (
    [
      "% Model:              exemple_these.mph",
      "% Version:            COMSOL 6.4.0.293 (exemple de Thèse)",
      "% Date:               Oct 16 2026, 10:00",
      "% Table:              Évaluation point 1",
      `% Temps (s)               1e6*solid.eXX (1), Point: (0.9, 6.5, -0.32) ${params(c)}`,
      ...lignes,
    ].join("\n") + "\n"
  );
}

/** Mesure de jauge d'exemple (temps en s, µdef), à coller dans « Mesures superposées » : 8 % plus faible, 0,15 s plus tard. */
export function mesureExemple(): string {
  const ts = Array.from({ length: 41 }, (_, i) => 8.2 + i * 0.1);
  return [
    "Temps (s)\tJauge T1 (µdef)",
    ...ts.map(
      (t) =>
        `${t.toFixed(2).replace(".", ",")}\t${(0.92 * champ(0.9, -0.32, { materiau: "VE", empreinte: "het", x0: 0.9 + 0.15 * (t - 10.35) })[0]!).toFixed(1).replace(".", ",")}`,
    ),
  ].join("\n");
}

/** Bassin HWD d'exemple (distance en mm, déflexion en µm), à coller dans « Bassin de déflexion ». */
export function bassinExemple(): string {
  return [0, 200, 300, 450, 600, 900, 1200, 1500, 1800]
    .map(
      (r) =>
        `${r}\t${Math.round(-champ(0.9 + r / 1000, 0, { materiau: "VE", empreinte: "het", facteur: 1.06 })[3]! * 1000)}`,
    )
    .join("\n");
}

/** Tous les fichiers de l'exemple. */
export function jeuExemple(): FichierExemple[] {
  const out: FichierExemple[] = [];
  for (const materiau of ["EL", "VE"] as const)
    for (const empreinte of ["het", "rect", "circ"] as const)
      out.push({
        nom: `coupeXZ_R1_${materiau}_${empreinte}.txt`,
        texte: coupe({ materiau, empreinte }, "exemple_these"),
        role: "coupe x-z (cartes, critères, vue d'ensemble)",
      });
  out.push({
    nom: "coupeXZ_R1_EL-fin_het.txt",
    texte: coupe(
      { materiau: "EL", empreinte: "het", facteur: 1.012 },
      "exemple_these_fin",
    ),
    role: "même cas, maillage raffiné (convergence)",
  });
  out.push({
    nom: "coupeXZ_R1_VE-roulant_het.txt",
    texte: coupeInstants(
      { materiau: "VE", empreinte: "het" },
      "exemple_roulant",
    ),
    role: "charge roulante, 9 instants (curseur, enveloppe, animation)",
  });
  for (const materiau of ["EL", "VE"] as const)
    out.push({
      nom: `surface_${materiau}_het.txt`,
      texte: surface({ materiau, empreinte: "het" }, "exemple_these"),
      role: "ligne de surface (bassin de déflexion)",
    });
  for (const materiau of ["EL", "VE"] as const)
    out.push({
      nom: `verticale_${materiau}_het.txt`,
      texte: verticale({ materiau, empreinte: "het" }, "exemple_these"),
      role: "profil vertical sous la charge",
    });
  for (const [E, f] of [
    [9000, 1.12],
    [11000, 1],
    [13000, 0.91],
  ] as const)
    out.push({
      nom: `sensib_EGB${E / 1000}_EL_het.txt`,
      texte: verticale(
        { materiau: "EL", empreinte: "het" },
        "exemple_balayage",
        `, E_GB=${E} MPa`,
        f,
      ),
      role: "balayage du module de la GB (sensibilité)",
    });
  out.push({
    nom: "signal_VE_het.txt",
    texte: table({ materiau: "VE", empreinte: "het" }),
    role: "signal au cours du temps (table)",
  });
  return out;
}
