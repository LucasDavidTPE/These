/**
 * « Ce que l'on modélise » : le modèle calé en réseau de ressorts, amortisseurs et éléments
 * paraboliques (avec ses constantes), sa disposition pour l'écran, le schéma équivalent pour
 * Figures (composants rhéologiques, export TikZ), et les grandeurs d'un essai animé :
 * sinusoïdal (module complexe, coefficient de Poisson), fluage et relaxation.
 */
import { aTwlf } from "./calage";
import { chaineGKV, evaluer, serieProny, type Essai } from "./essai";
import { nb } from "./format";
import { modele, type Complexe } from "./modeles";
import { fonctionTemps, type SerieProny } from "./prony";

export type Organe = "ressort" | "amortisseur" | "parabolique" | "suite";

export interface Element {
  kind: Organe;
  /** « E₀₀ », « k », « η » */
  nom: string;
  /** Valeur mise en forme, avec son unité. */
  valeur: string;
  /** Ce que l'élément représente physiquement. */
  role: string;
  /** Constantes du modèle qu'il porte (pour retrouver les curseurs). */
  cles: string[];
}

export type Reseau = Element | { kind: "serie"; items: Reseau[] } | { kind: "parallele"; branches: Reseau[] };

const EXP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** « 1,95·10⁶ » au-delà de 10⁵ : les viscosités et les corps raides de la chaîne GKV. */
function grand(v: number, d = 0): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) < 1e5) return nb(v, d);
  const k = Math.floor(Math.log10(Math.abs(v)));
  return `${nb(v / 10 ** k, 2)}·10${String(k)
    .split("")
    .map((c) => EXP[Number(c)])
    .join("")}`;
}
const mpa = (v: number | undefined) => (v === Infinity ? "∞ (corps inactif)" : `${grand(v ?? NaN)} MPa`);
const secondes = (v: number | undefined) => `${nb(v ?? NaN)} s`;
const visco = (v: number) => (v === Infinity ? "∞" : `${grand(v)} MPa·s`);

/** Le modèle courant en réseau d'éléments, constantes comprises. */
export function reseauModele(e: Essai): Reseau {
  const p = e.p;
  const m = modele(e.modeleId);
  const el = (kind: Organe, nom: string, valeur: string, role: string, cles: string[]): Element => ({ kind, nom, valeur, role, cles });
  switch (m.id) {
    case "2s2p1d":
    case "huet-sayegh": {
      const branche: Reseau[] = [
        el("ressort", "E₀ − E₀₀", mpa(p.E0! - p.E00!), "raideur ajoutée aux hautes fréquences (vitreux) : E₀ = module instantané", ["E0"]),
        el("parabolique", "k", `${nb(p.k, 3)} (δ = ${nb(p.delta, 2)})`, "élément parabolique δ(iωτ)^−k : fluage lent, pèse aux fréquences intermédiaires", ["k", "delta", "tauE"]),
        el("parabolique", "h", nb(p.h, 3), "élément parabolique (iωτ)^−h : fluage plus rapide, basses fréquences", ["h", "tauE"]),
      ];
      if (m.id === "2s2p1d") branche.push(el("amortisseur", "η", visco((p.E0! - p.E00!) * p.beta! * p.tauE!), `amortisseur newtonien η = (E₀ − E₀₀)·β·τE (β = ${nb(p.beta, 0)}) : écoulement aux très basses fréquences`, ["beta", "tauE"]));
      return {
        kind: "parallele",
        branches: [el("ressort", "E₀₀", mpa(p.E00), "module statique : raideur à fréquence nulle (granulats)", ["E00"]), { kind: "serie", items: branche }],
      };
    }
    case "maxwell":
      return { kind: "serie", items: [el("ressort", "E₀", mpa(p.EM), "élasticité instantanée", ["EM"]), el("amortisseur", "η", visco(p.EM! * p.tauM!), `viscosité, τ = η/E₀ = ${secondes(p.tauM)}`, ["tauM"])] };
    case "kelvin-voigt":
      return { kind: "parallele", branches: [el("ressort", "E₀₀", mpa(p.EKV), "raideur à long terme", ["EKV"]), el("amortisseur", "η", visco(p.EKV! * p.tauKV!), `viscosité, τ = η/E₀₀ = ${secondes(p.tauKV)}`, ["tauKV"])] };
    case "zener":
      return {
        kind: "parallele",
        branches: [
          el("ressort", "E₀₀", mpa(p.EZ00), "raideur à long terme", ["EZ00"]),
          { kind: "serie", items: [el("ressort", "E₀ − E₀₀", mpa(p.EZ0! - p.EZ00!), "raideur ajoutée instantanément", ["EZ0"]), el("amortisseur", "η", visco((p.EZ0! - p.EZ00!) * p.tauZ!), `τ = ${secondes(p.tauZ)}`, ["tauZ"])] },
        ],
      };
    case "burgers":
      return {
        kind: "serie",
        items: [
          el("ressort", "E₁", mpa(p.EB1), "élasticité instantanée", ["EB1"]),
          el("amortisseur", "η₁", visco(p.EB1! * p.tauB1!), `écoulement visqueux, τ₁ = ${secondes(p.tauB1)}`, ["tauB1"]),
          { kind: "parallele", branches: [el("ressort", "E₂", mpa(p.EB2), "élasticité retardée", ["EB2"]), el("amortisseur", "η₂", visco(p.EB2! * p.tauB2!), `retard, τ₂ = ${secondes(p.tauB2)}`, ["tauB2"])] },
        ],
      };
    case "gkv": {
      const c = e.chaine ?? chaineGKV(e);
      const kv = (i: number): Reseau => ({
        kind: "parallele",
        branches: [el("ressort", `E${indice(i + 1)}`, mpa(c?.E[i]), `corps ${i + 1} sur ${c?.E.length ?? 0}`, ["nElements"]), el("amortisseur", `η${indice(i + 1)}`, visco(c?.eta[i] ?? NaN), `τ = ${secondes(c?.tau[i])}`, ["fMin", "fMax"])],
      });
      const n = c?.E.length ?? 0;
      const items: Reseau[] = [el("ressort", "E₀", mpa(c?.Einf), "module instantané (celui du 2S2P1D)", [])];
      if (n <= 4) for (let i = 0; i < n; i++) items.push(kv(i));
      else items.push(kv(0), kv(1), el("suite", "…", `${n - 3} corps`, `chaîne de ${n} corps Kelvin-Voigt`, ["nElements"]), kv(n - 1));
      return { kind: "serie", items };
    }
    default:
      return el("ressort", "E", "—", "modèle sans schéma", []);
  }
}

function indice(i: number): string {
  return String(i)
    .split("")
    .map((c) => "₀₁₂₃₄₅₆₇₈₉"[Number(c)])
    .join("");
}

export function elements(r: Reseau): Element[] {
  if (r.kind === "serie") return r.items.flatMap(elements);
  if (r.kind === "parallele") return r.branches.flatMap(elements);
  return [r];
}

/* ───────────────────────────── disposition à l'écran ───────────────────────────── */

export interface Organe2D {
  el: Element;
  /** Indice dans elements(). */
  i: number;
  x0: number;
  x1: number;
  y: number;
}

export interface Disposition {
  largeur: number;
  hauteur: number;
  fils: [number, number, number, number][];
  organes: Organe2D[];
}

const ELEM = { w: 88, h: 58 };
const PATTE = 14;

function taille(r: Reseau): { w: number; h: number } {
  if (r.kind === "serie") {
    const t = r.items.map(taille);
    return { w: t.reduce((a, b) => a + b.w, 0), h: Math.max(...t.map((x) => x.h)) };
  }
  if (r.kind === "parallele") {
    const t = r.branches.map(taille);
    return { w: Math.max(...t.map((x) => x.w)) + 2 * PATTE, h: t.reduce((a, b) => a + b.h, 0) };
  }
  return r.kind === "suite" ? { w: 44, h: ELEM.h } : ELEM;
}

/** Disposition d'un réseau : séries à l'horizontale, branches parallèles empilées. */
export function disposer(r: Reseau, marge = 16): Disposition {
  const t = taille(r);
  const d: Disposition = { largeur: t.w + 2 * marge, hauteur: t.h + 8, fils: [], organes: [] };
  let n = 0;
  const placer = (r: Reseau, x: number, yc: number, w: number) => {
    if (r.kind === "serie") {
      const ts = r.items.map(taille);
      const total = ts.reduce((a, b) => a + b.w, 0);
      let cx = x;
      r.items.forEach((it, i) => {
        const wi = (ts[i]!.w / total) * w;
        placer(it, cx, yc, wi);
        cx += wi;
      });
      return;
    }
    if (r.kind === "parallele") {
      const ts = r.branches.map(taille);
      const H = ts.reduce((a, b) => a + b.h, 0);
      let y = yc - H / 2;
      const ys: number[] = [];
      r.branches.forEach((b, i) => {
        const yi = y + ts[i]!.h / 2 + 6; // place de l'étiquette au-dessus
        ys.push(yi);
        placer(b, x + PATTE, yi, w - 2 * PATTE);
        y += ts[i]!.h;
      });
      d.fils.push([x, yc, x + PATTE, yc], [x + w - PATTE, yc, x + w, yc]);
      d.fils.push([x + PATTE, Math.min(...ys), x + PATTE, Math.max(...ys)], [x + w - PATTE, Math.min(...ys), x + w - PATTE, Math.max(...ys)]);
      return;
    }
    const l = Math.min(w, r.kind === "suite" ? 36 : 60);
    const a = x + (w - l) / 2;
    if (a > x) d.fils.push([x, yc, a, yc]);
    if (a + l < x + w) d.fils.push([a + l, yc, x + w, yc]);
    d.organes.push({ el: r, i: n++, x0: a, x1: a + l, y: yc });
  };
  d.fils.push([0, d.hauteur / 2, marge, d.hauteur / 2], [d.largeur - marge, d.hauteur / 2, d.largeur, d.hauteur / 2]);
  placer(r, marge, d.hauteur / 2, t.w);
  return d;
}

/* ─────────────────────────────── schéma pour Figures ─────────────────────────────── */

/** Nombre pour LaTeX : « 41 250 » → « 41250 », « 1,95·10⁶ » → « 1{,}95 \cdot 10^{6} » (à placer entre $). */
export function texNombre(v: number, d = 0): string {
  if (!Number.isFinite(v)) return "\\infty";
  if (Math.abs(v) < 1e5) return nb(v, d).replace(",", "{,}");
  const k = Math.floor(Math.log10(Math.abs(v)));
  return `${nb(v / 10 ** k, 2).replace(",", "{,}")} \\cdot 10^{${k}}`;
}

/** figure.json (format figurine/1) du modèle, étiquettes avec ou sans valeurs. */
export function schemaFigures(e: Essai, avecValeurs: boolean): { schema: unknown; titre: string } | null {
  const p = e.p;
  const m = modele(e.modeleId);
  const v = (tex: string, valeur: string) => (avecValeurs ? `${tex} = ${valeur}` : tex);
  // valeurs des étiquettes en notation LaTeX (export TikZ compilable)
  const mpa = (x: number | undefined) => `$${texNombre(x ?? NaN)}$ MPa`;
  const visco = (x: number) => `$${texNombre(x)}$ MPa$\\cdot$s`;
  let type: string, params: Record<string, unknown>, longueur: number, hauteur: number;
  switch (m.id) {
    case "2s2p1d":
    case "huet-sayegh":
      type = m.id === "2s2p1d" ? "model_2s2p1d" : "huet_sayegh";
      params = { e00_label: v("$E_{00}$", mpa(p.E00)), e0_label: v("$E_0 - E_{00}$", mpa(p.E0! - p.E00!)), k_label: v("$k$", `$${texNombre(p.k!, 3)}$`), h_label: v("$h$", `$${texNombre(p.h!, 3)}$`) };
      if (m.id === "2s2p1d") params.eta_label = v("$\\eta$", visco((p.E0! - p.E00!) * p.beta! * p.tauE!));
      longueur = avecValeurs ? 120 : 84;
      hauteur = 45;
      break;
    case "maxwell":
      type = "maxwell";
      params = { spring_label: v("$E_0$", mpa(p.EM)), dashpot_label: v("$\\eta$", visco(p.EM! * p.tauM!)) };
      longueur = avecValeurs ? 70 : 40;
      hauteur = 28;
      break;
    case "kelvin-voigt":
      type = "kelvin_voigt";
      params = { spring_label: v("$E$", mpa(p.EKV)), dashpot_label: v("$\\eta$", visco(p.EKV! * p.tauKV!)) };
      longueur = avecValeurs ? 60 : 36;
      hauteur = 40;
      break;
    case "zener":
      type = "zener";
      params = { e00_label: v("$E_{00}$", mpa(p.EZ00)), e1_label: v("$E_0 - E_{00}$", mpa(p.EZ0! - p.EZ00!)), eta_label: v("$\\eta$", visco((p.EZ0! - p.EZ00!) * p.tauZ!)) };
      longueur = avecValeurs ? 90 : 60;
      hauteur = 45;
      break;
    case "burgers":
      type = "burgers";
      params = { e1_label: v("$E_1$", mpa(p.EB1)), eta1_label: v("$\\eta_1$", visco(p.EB1! * p.tauB1!)), e2_label: v("$E_2$", mpa(p.EB2)), eta2_label: v("$\\eta_2$", visco(p.EB2! * p.tauB2!)) };
      longueur = avecValeurs ? 130 : 80;
      hauteur = 45;
      break;
    case "gkv":
      // la chaîne compte souvent 25 corps : on dessine le motif, n en légende
      type = "kvg";
      params = { n: 3, spring_label: "$E_{i}$", dashpot_label: "$\\eta_{i}$", with_spring: true, spring0_label: v("$E_0$", mpa(p.E0)) };
      longueur = 120;
      hauteur = 40;
      break;
    default:
      return null;
  }
  const x0 = 12,
    y = hauteur / 2;
  return {
    titre: `Modèle ${m.nom}${e.nom ? ` — ${e.nom}` : ""}`,
    schema: {
      format: "figurine/1",
      canvas: { unit: "mm", width: x0 + longueur + 22, height: hauteur, grid: 1 },
      theme: "these",
      items: [
        { id: "bati", type: "fixed_support", from: [x0, y + 12], to: [x0, y - 12], params: { side: "gauche" } },
        { id: "modele", type, from: [x0, y], to: [x0 + longueur, y], params },
        { id: "F", type: "force", on: "modele.end", params: { angle: 0, length: 10, label: "$\\sigma$", applied_at: "queue" } },
      ],
    },
  };
}

/* ─────────────────────────────── essai animé ─────────────────────────────── */

export interface EtatSinus {
  /** Fréquence réduite f·a_T (Hz). */
  fr: number;
  module: Complexe;
  /** Coefficient de Poisson complexe (norme, phase en °) ; constant si le modèle ne le décrit pas. */
  nu: { norme: number; phase: number; modele: boolean };
  sigma0: number;
  /** Énergie dissipée par cycle π·σ₀·ε₀·sin φ (kJ/m³). */
  energie: number;
}

/** Un essai de module complexe à la température T et la fréquence f, pour l'amplitude ε₀ (m/m). */
export function etatSinus(e: Essai, T: number, f: number, eps0: number, nuDefaut = 0.35): EtatSinus {
  const fr = f * aTwlf(T, e.Tref, e.C1, e.C2);
  const c = evaluer(e, fr);
  const m = modele(e.modeleId);
  const nuM = m.poisson && Number.isFinite(e.p.nu0) ? m.poisson(fr, e.p) : null;
  const nu = nuM ? { norme: nuM.norme, phase: nuM.phase, modele: true } : { norme: nuDefaut, phase: 0, modele: false };
  const sigma0 = c.norme * eps0;
  return { fr, module: c, nu, sigma0, energie: Math.PI * sigma0 * eps0 * Math.sin((c.phase * Math.PI) / 180) * 1000 };
}

/** À l'angle θ (rad) du cycle : déformations axiale et radiale, contrainte (réduites par ε₀, σ₀). */
export function instantSinus(s: EtatSinus, theta: number): { eax: number; erad: number; sigma: number } {
  const rad = Math.PI / 180;
  return { eax: Math.sin(theta), erad: -s.nu.norme * Math.sin(theta - s.nu.phase * rad), sigma: Math.sin(theta + s.module.phase * rad) };
}

export interface Temporel {
  serie: SerieProny;
  /** Facteur de translation à la température choisie. */
  aT: number;
  /** Bornes de temps (s, à la température choisie). */
  t0: number;
  t1: number;
}

/** Fluage (Kelvin-Voigt généralisé) ou relaxation (Maxwell généralisé) du modèle calé, à T. */
export function temporel(e: Essai, T: number, type: "fluage" | "relaxation"): Temporel | null {
  const serie = serieProny(e, { type: type === "fluage" ? "kelvin" : "maxwell", source: "modele", parDecade: 1, nu: 0.35 });
  if (!serie) return null;
  return { serie, aT: aTwlf(T, e.Tref, e.C1, e.C2), t0: 1e-3, t1: 1e5 };
}

/** J(t) (1/MPa) en fluage ou E(t) (MPa) en relaxation, au temps t à la température de l'essai. */
export function reponse(r: Temporel, t: number): number {
  return fonctionTemps(r.serie, t / r.aT);
}
