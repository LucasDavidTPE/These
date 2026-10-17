/**
 * Thème sombre : l'application suit le thème de Windows (`prefers-color-scheme`). Ce qui casse le thème sombre,
 * c'est une couleur qui ne change pas avec lui — une variable inexistante dont le repli (`var(--panel, #fff)`)
 * devient la couleur pour de bon, une variable claire sans valeur sombre, un fond clair ou un texte foncé écrit
 * en dur, un texte blanc sur l'accent (clair en thème sombre). Ce test lit toutes les feuilles de style et refuse
 * ces cas ; les zones « papier » (aperçus de figures, vignettes, pages PDF), blanches dans les deux thèmes comme
 * la figure exportée, sont listées à part. Le contraste réel, page par page, se vérifie avec
 * `npm run audit:sombre` (outils/audit-sombre.mjs).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = new URL("..", import.meta.url).pathname;

/** Blanches dans les deux thèmes, comme la figure ou le document qu'elles montrent. */
const PAPIER = new Set([
  ".accueil-vignette", // vignette d'une figure
  ".figures-liees-grille img", // vignettes des figures liées
  ".apercu-pdf-page", // page d'un PDF
  ".thumb", // vignettes de la bibliothèque de figures
  ".graph-preview svg", // graphe tel qu'exporté
  ".modele-image svg", // aperçu d'un modèle de graphe
  ".comsol-carte", // carte COMSOL telle qu'exportée
  ".planche-svg", // planche telle qu'exportée
  ".atelier-svg", // aperçu de l'atelier COMSOL tel qu'exporté
  ".sem-cat.actif i", // point blanc sur la couleur de la catégorie (planning)
  ".sem-ev:hover .sem-poignee", // rayures blanches sur la couleur de l'événement (planning)
  ".acc-vignette .discret", // texte de remplacement sur une vignette blanche
]);

function fichiers(dossier: string, ext: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dossier, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "dist" || e.name === "src-tauri") continue;
    const p = join(dossier, e.name);
    if (e.isDirectory()) fichiers(p, ext, out);
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

interface Bloc {
  fichier: string;
  selecteur: string;
  corps: string;
  sombre: boolean;
}

/** Règles d'une feuille, avec « dans un bloc @media (prefers-color-scheme: dark) » ou non. */
function blocs(fichier: string): Bloc[] {
  const t = readFileSync(fichier, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Bloc[] = [];
  const pile: string[] = [];
  let debut = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "{") {
      pile.push(t.slice(debut, i).trim());
      debut = i + 1;
    } else if (t[i] === "}") {
      const selecteur = pile.pop() ?? "";
      const corps = t.slice(debut, i);
      if (selecteur && !selecteur.startsWith("@") && corps.includes(":"))
        out.push({ fichier: fichier.replace(RACINE, ""), selecteur: selecteur.replace(/\s+/g, " "), corps, sombre: pile.some((s) => /prefers-color-scheme:\s*dark/.test(s)) });
      debut = i + 1;
    } else if (t[i] === ";" && !pile.length) debut = i + 1;
  }
  return out;
}

/** Luminance relative d'une couleur écrite en dur (#rgb, #rrggbb, rgb(), white, black) ; null sinon. */
function luminance(v: string): number | null {
  let s = v.trim().toLowerCase();
  s = ({ white: "#ffffff", black: "#000000" } as Record<string, string>)[s] ?? s;
  let rgb: number[];
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  const r = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (h) {
    const x = h[1]!.length === 3 ? [...h[1]!].map((c) => c + c).join("") : h[1]!;
    rgb = [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16));
  } else if (r) {
    // peu opaque : un voile, pas un fond
    if (r[4] && parseFloat(r[4]) < (r[4].endsWith("%") ? 50 : 0.5)) return null;
    rgb = [r[1], r[2], r[3]].map(Number);
  } else return null;
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(rgb[0]!) + 0.7152 * f(rgb[1]!) + 0.0722 * f(rgb[2]!);
}

const feuilles = fichiers(RACINE, /\.css$/).filter((f) => /\/(packages|modules|app)\//.test(f));
const tous = feuilles.flatMap(blocs);
const definies = (sombre: boolean) => new Set(tous.filter((b) => b.sombre === sombre).flatMap((b) => [...b.corps.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]!)));
const clair = definies(false);
const sombre = definies(true);
// variables posées par le code (style={{ "--couleur": … }}) : valeur de donnée, pas de thème
const dynamiques = new Set(fichiers(RACINE, /\.tsx?$/).flatMap((f) => [...readFileSync(f, "utf8").matchAll(/["'`](--[a-z][\w-]*)["'`]/g)].map((m) => m[1]!)));

describe("thème sombre", () => {
  it("les feuilles de style sont bien lues", () => {
    expect(feuilles.length).toBeGreaterThan(10);
    expect(clair.has("--surface") && sombre.has("--surface")).toBe(true);
  });

  it("aucune variable inexistante (son repli deviendrait la couleur dans les deux thèmes)", () => {
    const utilisees = tous.flatMap((b) => [...b.corps.matchAll(/var\((--[\w-]+)/g)].map((m) => ({ v: m[1]!, ou: `${b.fichier} ${b.selecteur}` })));
    expect(utilisees.filter((u) => !clair.has(u.v) && !dynamiques.has(u.v)).map((u) => `${u.v} (${u.ou})`)).toEqual([]);
  });

  it("toute variable de couleur du thème clair a sa valeur sombre", () => {
    const couleurs = tous.filter((b) => !b.sombre).flatMap((b) => [...b.corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)].filter((m) => /#|rgb|hsl|white|black|color-mix/.test(m[2]!)).map((m) => m[1]!));
    expect([...new Set(couleurs)].filter((v) => !sombre.has(v))).toEqual([]);
  });

  it("pas de fond clair ni de texte foncé écrit en dur sans variante sombre (hors zones « papier »)", () => {
    const selecteursSombres = new Set(tous.filter((b) => b.sombre).flatMap((b) => b.selecteur.split(",").map((s) => s.trim())));
    const fautes: string[] = [];
    for (const b of tous.filter((x) => !x.sombre && !x.selecteur.startsWith(":root"))) {
      const selecteurs = b.selecteur.split(",").map((s) => s.trim());
      if (selecteurs.every((s) => PAPIER.has(s) || selecteursSombres.has(s))) continue;
      for (const m of b.corps.matchAll(/(?:^|;|\s)(background(?:-color)?|color)\s*:\s*([^;]+)/g)) {
        let v = m[2]!.trim().replace(/\s*!important$/, "");
        const repli = /^var\((--[\w-]+)\s*,\s*(.+)\)$/.exec(v);
        if (repli) {
          if (clair.has(repli[1]!) || dynamiques.has(repli[1]!)) continue;
          v = repli[2]!;
        }
        // dégradés et motifs : chaque couleur compte
        const couleurs = v.includes("gradient") ? [...v.matchAll(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/gi)].map((x) => x[0]) : [v];
        const L = couleurs.map(luminance).filter((x): x is number => x !== null);
        if (!L.length) continue;
        const faute = m[1] === "color" ? L.every((x) => x < 0.2) : L.every((x) => x > 0.6);
        if (faute) fautes.push(`${b.fichier} ${b.selecteur} { ${m[1]}: ${v} }`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("le texte posé sur l'accent utilise --accent-texte (l'accent est clair en thème sombre)", () => {
    const fautes = tous
      .filter((b) => !b.sombre && /background(?:-color)?\s*:\s*var\(--accent\b/.test(b.corps) && /(?:^|;|\s)color\s*:\s*(#fff\b|#ffffff\b|white\b)/i.test(b.corps))
      .map((b) => `${b.fichier} ${b.selecteur}`);
    expect(fautes).toEqual([]);
  });
});
