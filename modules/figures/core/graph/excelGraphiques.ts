/**
 * Graphiques d'un classeur Excel (SPEC §6.1) : chaque graphique (`xl/charts/chartN.xml`) est
 * relu (type, séries et leurs plages, titres d'axes, échelles log, bornes, couleurs, courbes de
 * tendance) et refait en graphe de Figures. Les valeurs sont relues dans les cellules des plages ;
 * le cache que le graphique garde de ses valeurs sert de secours (feuille absente, plage vide).
 * Ce qui ne se traduit pas (axe secondaire, barres d'erreur, 3D, secteurs…) est signalé, pas refusé.
 * Sans DOM : expressions régulières sur le XML, préfixes d'espaces de noms ignorés.
 */
import { strFromU8, unzipSync } from "fflate";
import { columnIndex } from "@noyau/formats/xlsx";
import { decodeXml, readXlsx, type Sheet } from "./xlsx";
import { emptyGraph, type GraphDoc, type LegendPos, type Series, type SeriesType } from "./model";
import type { SeriesFit } from "./fit";
import type { SeriesDash, SeriesMark } from "./style";

export interface GraphiqueExcel {
  /** Identifiant stable dans le classeur : « Feuil1/Graphique 1 » (feuille, nom de l'objet). */
  id: string;
  feuille: string;
  /** Nom de l'objet graphique dans Excel (« Graphique 1 »), sinon « Graphique n ». */
  nom: string;
  /** Titre du graphique s'il en a un. */
  titre: string;
  /** Chemin du XML dans l'archive (« xl/charts/chart2.xml »), pour l'aspect Excel. */
  chemin: string;
  /** Graphe de Figures (graph.json), null si rien n'est traduisible. */
  graphe: GraphDoc | null;
  /** Ce qui n'a pas été repris, en français. */
  avertissements: string[];
}

type Fichiers = Record<string, Uint8Array>;

/** Retire les préfixes d'espaces de noms des balises (`<c:ser>` → `<ser>`), pas des attributs. */
const sansPrefixes = (xml: string) => xml.replace(/<(\/?)[A-Za-z][\w.-]*:/g, "<$1");

function attr(tag: string, nom: string): string | undefined {
  const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]!) : undefined;
}

/** Contenus des éléments `<nom …>…</nom>` directs ou non (pas d'imbrication du même nom). */
function elements(xml: string, nom: string): string[] {
  return [...xml.matchAll(new RegExp(`<${nom}(?:\\s[^>]*)?(?<!/)>([\\s\\S]*?)</${nom}>`, "g"))].map((m) => m[1]!);
}
const element = (xml: string, nom: string) => elements(xml, nom)[0];

/** Élément `<nom … />` ou ouvrant `<nom …>` : la balise, pour lire ses attributs. */
function balise(xml: string, nom: string): string | undefined {
  return new RegExp(`<${nom}(?:\\s[^>]*)?/?>`).exec(xml)?.[0];
}
const val = (xml: string | undefined, nom: string) => (xml ? attr(balise(xml, nom) ?? "", "val") : undefined);

/** Texte d'un titre ou d'un tx (runs `<a:t>`, ou `<v>` d'un cache). */
function texte(xml: string | undefined): string {
  if (!xml) return "";
  const runs = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!));
  if (runs.length) return runs.join("").trim();
  return elements(xml, "v").map(decodeXml).join(" ").trim();
}

function relations(fichiers: Fichiers, chemin: string): Map<string, string> {
  const dossier = chemin.slice(0, chemin.lastIndexOf("/"));
  const nom = chemin.slice(chemin.lastIndexOf("/") + 1);
  const f = fichiers[`${dossier}/_rels/${nom}.rels`];
  const out = new Map<string, string>();
  if (!f) return out;
  for (const m of strFromU8(f).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const cible = attr(m[0], "Target");
    if (id && cible) out.set(id, resoudre(dossier, cible));
  }
  return out;
}

/** Chemin relatif d'une relation (« ../charts/chart1.xml ») → chemin dans l'archive. */
function resoudre(dossier: string, cible: string): string {
  if (cible.startsWith("/")) return cible.slice(1);
  const parts = dossier.split("/");
  for (const p of cible.split("/")) {
    if (p === "..") parts.pop();
    else if (p !== ".") parts.push(p);
  }
  return parts.join("/");
}

// ---- Plages ----

interface Plage {
  feuille: string;
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

/** « 'Mes données'!$A$2:$A$40 » ; plusieurs zones « (F!$A$2:$A$5,F!$A$8:$A$9) ». */
export function lirePlages(formule: string): Plage[] {
  const f = formule.trim().replace(/^\(|\)$/g, "");
  const zones: string[] = [];
  let cur = "";
  let cite = false;
  for (const ch of f) {
    if (ch === "'") cite = !cite;
    if (ch === "," && !cite) {
      zones.push(cur);
      cur = "";
    } else cur += ch;
  }
  zones.push(cur);
  return zones.flatMap((z) => {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i.exec(z.trim());
    if (!m) return [];
    const feuille = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!;
    const c0 = columnIndex(m[3]!);
    const r0 = Number(m[4]) - 1;
    const c1 = m[5] ? columnIndex(m[5]) : c0;
    const r1 = m[6] ? Number(m[6]) - 1 : r0;
    return [{ feuille, c0: Math.min(c0, c1), r0: Math.min(r0, r1), c1: Math.max(c0, c1), r1: Math.max(r0, r1) }];
  });
}

type Valeur = string | number | null;

function valeursPlages(plages: Plage[], feuilles: Sheet[]): Valeur[] | null {
  const out: Valeur[] = [];
  for (const p of plages) {
    const sh = feuilles.find((s) => s.name === p.feuille);
    if (!sh) return null;
    for (let r = p.r0; r <= p.r1; r++)
      for (let c = p.c0; c <= p.c1; c++) {
        const v = sh.rows[r]?.[c] ?? null;
        out.push(typeof v === "boolean" ? Number(v) : v);
      }
  }
  return out;
}

/** Valeurs du cache (`numCache` / `strCache` / `numLit` / `strLit`), à leur index. */
function valeursCache(xml: string): Valeur[] {
  const cache = element(xml, "numCache") ?? element(xml, "numLit") ?? element(xml, "strCache") ?? element(xml, "strLit");
  if (!cache) return [];
  const n = Number(val(cache, "ptCount") ?? 0);
  const out: Valeur[] = Array.from({ length: n }, () => null);
  for (const m of cache.matchAll(/<pt\b([^>]*)>([\s\S]*?)<\/pt>/g)) {
    const i = Number(attr(`<pt${m[1]}>`, "idx"));
    const v = decodeXml(element(m[2]!, "v") ?? "");
    const num = Number(v);
    out[i] = v !== "" && Number.isFinite(num) && !/^str/.test(cache) ? num : v;
  }
  return out;
}

/** Données d'une référence de série (xVal, yVal, cat, val) : cellules, sinon cache. */
function donnees(xml: string | undefined, feuilles: Sheet[]): { valeurs: Valeur[]; formule?: string } {
  if (!xml) return { valeurs: [] };
  const formule = element(xml, "f");
  const cache = valeursCache(xml);
  if (formule) {
    const lues = valeursPlages(lirePlages(decodeXml(formule)), feuilles);
    if (lues && lues.some((v) => v !== null && v !== "")) {
      // texte d'une cellule numérique (« 1,5 ») : nombre
      return { valeurs: lues.map((v) => (typeof v === "string" && /^\s*-?[\d\s]+([.,]\d+)?([eE][-+]?\d+)?\s*$/.test(v) ? Number(v.replace(/\s/g, "").replace(",", ".")) : v)), formule: decodeXml(formule) };
    }
  }
  return { valeurs: cache, ...(formule ? { formule: decodeXml(formule) } : {}) };
}

// ---- Apparence ----

const MARQUES: Record<string, SeriesMark> = { circle: "o", dot: "o", square: "square", triangle: "triangle", diamond: "diamond", x: "x", star: "x", plus: "+", dash: "+", none: "none" };
const TIRETS: Record<string, SeriesDash> = { solid: "solid", dash: "dashed", lgDash: "dashed", sysDash: "dashed", dashDot: "dashed", lgDashDot: "dashed", lgDashDotDot: "dashed", sysDashDot: "dashed", sysDashDotDot: "dashed", sysDot: "dotted", dot: "dotted" };

function couleur(spPr: string | undefined): string | undefined {
  if (!spPr) return undefined;
  const ln = element(spPr, "ln");
  const ou = [ln, spPr].filter((x): x is string => !!x);
  for (const x of ou) {
    const solide = element(x, "solidFill");
    const rgb = solide ? attr(balise(solide, "srgbClr") ?? "", "val") : undefined;
    if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) return `#${rgb.toLowerCase()}`;
  }
  return undefined;
}

// ---- Axes ----

interface Axe {
  id: string;
  genre: "valAx" | "catAx" | "dateAx" | "serAx";
  titre: string;
  log: boolean;
  inverse: boolean;
  min?: number;
  max?: number;
}

function lireAxes(zone: string): Axe[] {
  const out: Axe[] = [];
  for (const genre of ["valAx", "catAx", "dateAx", "serAx"] as const) {
    for (const x of elements(zone, genre)) {
      const scaling = element(x, "scaling") ?? "";
      const num = (k: string) => {
        const v = val(scaling, k);
        return v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined;
      };
      const min = num("min");
      const max = num("max");
      out.push({
        id: val(x, "axId") ?? "",
        genre,
        titre: texte(element(x, "title")),
        log: val(scaling, "logBase") !== undefined,
        inverse: val(scaling, "orientation") === "maxMin",
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      });
    }
  }
  return out;
}

// ---- Tendances ----

function tendance(ser: string, avert: (m: string) => void, nomSerie: string): SeriesFit | undefined {
  const t = element(ser, "trendline");
  if (!t) return undefined;
  const genre = val(t, "trendlineType");
  const label = val(t, "dispEq") === "1" || val(t, "dispRSqr") === "1";
  const intercept = val(t, "intercept");
  switch (genre) {
    case "linear":
      return { kind: intercept !== undefined && Number(intercept) === 0 ? "origine" : "lineaire", label };
    case "poly": {
      const ordre = Math.min(6, Math.max(2, Number(val(t, "order") ?? 2)));
      return { kind: "polynome", degre: ordre, label };
    }
    case "power":
      return { kind: "puissance", label };
    case "exp":
      return { kind: "exponentielle", label };
    case "log":
      return { kind: "logarithmique", label };
    default:
      avert(`Courbe de tendance « ${genre ?? "?"} » de « ${nomSerie} » non reprise (moyenne mobile).`);
      return undefined;
  }
}

// ---- Graphique ----

const GROUPES = ["scatterChart", "lineChart", "barChart", "areaChart", "line3DChart", "bar3DChart", "area3DChart", "pieChart", "pie3DChart", "doughnutChart", "radarChart", "bubbleChart", "stockChart", "surfaceChart", "surface3DChart", "ofPieChart"] as const;

const nombre = (v: Valeur): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Traduit un `chartN.xml` en graphe de Figures. */
export function graphiqueVersGraphe(xmlBrut: string, feuilles: Sheet[]): { graphe: GraphDoc | null; titre: string; avertissements: string[] } {
  const xml = sansPrefixes(xmlBrut);
  const avertissements: string[] = [];
  const avert = (m: string) => avertissements.includes(m) || avertissements.push(m);
  const chart = element(xml, "chart") ?? xml;
  // titre du graphique : avant la zone de traçage (les titres d'axes sont dedans)
  const avant = chart.includes("<plotArea") ? chart.slice(0, chart.indexOf("<plotArea")) : "";
  const titre = texte(element(avant, "title"));
  const zone = element(chart, "plotArea") ?? "";
  const axes = lireAxes(zone);
  const doc = emptyGraph();
  const series: Series[] = [];
  let categories: string[] | undefined;
  let groupesVus = 0;
  let axesPrincipaux: string[] | null = null;

  for (const nom of GROUPES) {
    for (const g of elements(zone, nom)) {
      groupesVus++;
      if (/^(pie|pie3D|doughnut|ofPie|radar|stock|surface|surface3D|bubble)Chart$/.test(nom)) {
        avert(`Graphique « ${nom.replace(/Chart$/, "")} » (secteurs, radar, bulles…) : pas d'équivalent dans Graphes.`);
        continue;
      }
      if (nom.includes("3D")) avert("Graphique en 3D : refait en 2D.");
      if (nom === "areaChart") avert("Aires : refaites en courbes.");
      const barres = nom.startsWith("bar");
      if (barres && val(g, "barDir") === "bar") avert("Barres horizontales : refaites en barres verticales.");
      if (barres && /^(stacked|percentStacked)$/.test(val(g, "grouping") ?? "")) avert("Barres empilées : refaites côte à côte.");
      const idsAxes = [...g.matchAll(/<axId\b[^>]*val="([^"]*)"/g)].map((m) => m[1]!);
      // l'ordre des axes d'un groupe fait foi : horizontal puis vertical (OOXML)
      if (!axesPrincipaux) axesPrincipaux = idsAxes;
      else if (idsAxes.join() !== axesPrincipaux.join()) avert("Axe secondaire : ses séries sont tracées sur l'axe principal.");
      const styleNuage = val(g, "scatterStyle") ?? "";
      // lineChart : <marker val="0"/> au niveau du groupe = aucune marque
      const marquesGroupe = /<marker val="0"\s*\/>/.test(g.replace(/<ser>[\s\S]*?<\/ser>/g, "")) ? false : true;

      for (const ser of elements(g, "ser")) {
        const tx = element(ser, "tx");
        // nom : relu dans sa cellule (le cache peut dater), sinon texte du cache ou saisi
        const cellule = tx && element(tx, "f") ? donnees(tx, feuilles).valeurs.find((v) => v !== null && v !== "") : undefined;
        const nomSerie = (cellule !== undefined ? String(cellule) : texte(tx)) || `Série ${series.length + 1}`;
        if (element(ser, "errBars")) avert(`Barres d'erreur de « ${nomSerie} » non reprises.`);
        if (val(ser, "smooth") === "1") avert(`Courbe lissée de « ${nomSerie} » : refaite en segments droits.`);
        const ys = donnees(element(ser, "yVal") ?? element(ser, "val"), feuilles).valeurs;
        const xsBrut = donnees(element(ser, "xVal") ?? element(ser, "cat"), feuilles).valeurs;
        const tousNumeriques = xsBrut.length > 0 && xsBrut.every((v) => v === null || nombre(v) !== null);
        let xs: (number | null)[];
        if (xsBrut.length === 0) xs = ys.map((_, i) => i + 1);
        else if (tousNumeriques && !barres) {
          xs = xsBrut.map(nombre);
          if (nom !== "scatterChart") avert("Courbes sur des catégories numériques : abscisses placées à l'échelle (Excel les espace régulièrement).");
        } else {
          // catégories (texte) : x = 1, 2, 3… et leurs noms sous l'axe
          const noms = xsBrut.map((v) => (v === null ? "" : String(v)));
          if (!categories) categories = noms;
          xs = noms.map((_, i) => i + 1);
        }
        const x: number[] = [];
        const y: number[] = [];
        for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
          const xi = xs[i] ?? null;
          const yi = nombre(ys[i] ?? null);
          if (xi !== null && yi !== null) {
            x.push(xi);
            y.push(yi);
          }
        }
        if (x.length === 0) {
          avert(`« ${nomSerie} » n'a aucune valeur numérique : ignorée.`);
          continue;
        }
        // apparence propre de la série (pas celle des marques, étiquettes, tendances, points isolés)
        const propre = ser.replace(/<(marker|trendline|dPt|dLbls|errBars|tx)>[\s\S]*?<\/\1>/g, "");
        const spPr = element(propre, "spPr");
        const ln = spPr ? element(spPr, "ln") : undefined;
        const marker = element(ser, "marker");
        const symbole = val(marker, "symbol");
        const avecTrait = !(ln && /<noFill\s*\/>/.test(ln)) && styleNuage !== "marker";
        const avecMarques = symbole !== "none" && marquesGroupe && !/^(line|smooth)$/.test(styleNuage);
        const type: SeriesType = barres ? "bar" : avecTrait && avecMarques ? "linepoints" : avecTrait ? "line" : "points";
        const s: Series = { name: nomSerie, type, x, y, legend: true };
        const c = couleur(spPr) ?? (marker ? couleur(element(marker, "spPr")) : undefined);
        if (c) s.color = c;
        if (symbole && MARQUES[symbole] && type !== "line" && type !== "bar") s.mark = MARQUES[symbole]!;
        const tiret = ln ? attr(balise(ln, "prstDash") ?? "", "val") : undefined;
        if (tiret && TIRETS[tiret] && TIRETS[tiret] !== "solid") s.dash = TIRETS[tiret]!;
        const fit = tendance(ser, avert, nomSerie);
        if (fit) s.fit = fit;
        series.push(s);
      }
    }
  }

  if (series.length === 0) return { graphe: null, titre, avertissements: groupesVus ? avertissements : [...avertissements, "Aucune série lisible dans ce graphique."] };

  const [idX, idY] = axesPrincipaux ?? [];
  const axeX = axes.find((a) => a.id === idX);
  const axeY = axes.find((a) => a.id === idY);
  const versAxe = (a: Axe | undefined) => ({
    label: a?.titre ?? "",
    log: a?.log ?? false,
    ...(a?.min !== undefined ? { min: a.min } : {}),
    ...(a?.max !== undefined ? { max: a.max } : {}),
    ...(a?.inverse ? { inverse: true } : {}),
  });
  doc.x = versAxe(axeX);
  doc.y = versAxe(axeY);
  if (categories) {
    doc.x = { ...doc.x, categories, log: false };
    delete doc.x.min;
    delete doc.x.max;
  }
  // barres sur un axe log : impossible dans Graphes
  if (series.some((s) => s.type === "bar") && doc.y.log) {
    doc.y.log = false;
    avert("Barres sur une échelle log : refaites en échelle linéaire.");
  }
  doc.series = series;
  const legende = element(chart, "legend");
  const LEGENDES: Record<string, LegendPos> = { r: "north east", tr: "north east", t: "north east", l: "north west", b: "south east" };
  doc.legend = legende ? (LEGENDES[val(legende, "legendPos") ?? "r"] ?? "north east") : "none";
  doc.grid = elements(zone, "majorGridlines").length > 0;
  return { graphe: doc, titre, avertissements };
}

/** Tous les graphiques du classeur (feuilles et feuilles graphiques), dans l'ordre des onglets. */
export function graphiquesDuClasseur(octets: Uint8Array): GraphiqueExcel[] {
  let fichiers: Fichiers;
  try {
    fichiers = unzipSync(octets);
  } catch {
    throw new Error("Classeur illisible (archive invalide). Les anciens .xls ne sont pas pris en charge : les enregistrer en .xlsx.");
  }
  const feuilles = readXlsx(octets);
  const wb = fichiers["xl/workbook.xml"];
  if (!wb) throw new Error("Classeur invalide (xl/workbook.xml absent).");
  const relWb = relations(fichiers, "xl/workbook.xml");
  const out: GraphiqueExcel[] = [];
  const dejaVus = new Set<string>();
  for (const m of strFromU8(wb).matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)) {
    const nomFeuille = attr(m[0], "name") ?? "";
    const chemin = relWb.get(attr(m[0], "r:id") ?? "");
    if (!chemin || !fichiers[chemin]) continue;
    const relFeuille = relations(fichiers, chemin);
    const dessins = [...strFromU8(fichiers[chemin]).matchAll(/<(?:\w+:)?drawing\b[^>]*>/g)].map((d) => relFeuille.get(attr(d[0], "r:id") ?? "")).filter((d): d is string => !!d && !!fichiers[d]);
    let n = 0;
    for (const dessin of dessins) {
      const relDessin = relations(fichiers, dessin);
      const xmlDessin = sansPrefixes(strFromU8(fichiers[dessin]!));
      // un graphicFrame par graphique : nom de l'objet (cNvPr) et relation du graphique
      for (const cadre of elements(xmlDessin, "graphicFrame")) {
        const rid = /<chart\b[^>]*\sr:id="([^"]+)"/.exec(cadre)?.[1];
        const graphique = rid ? relDessin.get(rid) : undefined;
        if (!graphique || !fichiers[graphique] || dejaVus.has(graphique)) continue;
        dejaVus.add(graphique);
        n++;
        const nom = attr(balise(cadre, "cNvPr") ?? "", "name") || `Graphique ${n}`;
        let r: ReturnType<typeof graphiqueVersGraphe>;
        try {
          r = graphiqueVersGraphe(strFromU8(fichiers[graphique]!), feuilles);
        } catch (e) {
          r = { graphe: null, titre: "", avertissements: [`Graphique illisible : ${e instanceof Error ? e.message : String(e)}`] };
        }
        out.push({ id: `${nomFeuille}/${nom}`, feuille: nomFeuille, nom, titre: r.titre, chemin: graphique, graphe: r.graphe, avertissements: r.avertissements });
      }
    }
  }
  return out;
}
