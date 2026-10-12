/**
 * Dépouillement d'un essai TSRST (éprouvette maintenue à longueur constante et refroidie à vitesse
 * constante ; SPEC §8.4) : contrainte thermique σ(T) jusqu'à la rupture, température et contrainte de
 * rupture, température de transition (ajustement bilinéaire continu de σ(T)) et pente au-delà, contrainte
 * à des températures choisies. Le résultat, courbe σ(T) réduite comprise, est rangé dans l'espace à côté
 * de l'essai : on compare et on archive sans les données brutes.
 */
import type { Serie } from "@noyau/formats/wavematrix";
import { voieTemps } from "@noyau/formats/wavematrix";
import type { Eprouvette } from "./modele";

export const VERSION_TSRST = 1;
/** Températures (°C) où relever la contrainte, par défaut. */
export const TEMPERATURES_DEFAUT = [-10, -20, -30];
/** Nombre de points au plus de la courbe σ(T) archivée. */
const POINTS_COURBE = 300;

export interface ResultatsTsrst {
  version: number;
  /** « AAAA-MM-JJ ». */
  calculeLe: string;
  /** Export lu (nom du fichier). */
  fichier: string;
  voieTemperature: string;
  voieEffort: string;
  /** Section utilisée (mm²) ; null si l'export donne directement une contrainte. */
  section: number | null;
  /** Température en début de refroidissement (°C). */
  depart: number;
  /** Rupture nette (chute de la contrainte après le pic) ; faux = contrainte maximale atteinte en fin d'enregistrement. */
  rompu: boolean;
  rupture: { temperature: number; contrainte: number; heures: number };
  /**
   * Transition : changement de pente de σ(T). `pente` (MPa/°C) = augmentation de la contrainte par degré de
   * refroidissement sous la transition, `penteAvant` au-dessus. Null si σ(T) n'a pas de coude net.
   */
  transition: {
    temperature: number;
    pente: number;
    penteAvant: number;
    r2: number;
  } | null;
  /** Contrainte aux températures demandées (null hors de la plage refroidie avant rupture). */
  aT: { temperature: number; contrainte: number | null }[];
  /** σ(T) du début du refroidissement à la rupture, températures décroissantes. */
  courbe: { temperature: number[]; contrainte: number[] };
  avertissements: string[];
}

/** Section (mm²) : saisie, sinon calculée depuis les dimensions ; null si on ne peut pas. */
export function sectionDe(e: Eprouvette): number | null {
  if (e.section !== null && e.section > 0) return e.section;
  if (e.forme === "cylindre" && e.diametre) return (Math.PI * e.diametre * e.diametre) / 4;
  if (e.forme === "prisme" && e.largeur && e.epaisseur) return e.largeur * e.epaisseur;
  return null;
}

const EPROUVETTE = /[ée]prouvette|surface|specimen|[ée]chantillon|peau/i;

/** Voies de température de l'export (nom brut), celle de l'éprouvette en premier. */
export function voiesTemperature(s: Serie): string[] {
  const v = s.voies.filter((x) => x.nature === "temperature");
  return [...v.filter((x) => EPROUVETTE.test(`${x.grandeur} ${x.capteur ?? ""}`)), ...v.filter((x) => !EPROUVETTE.test(`${x.grandeur} ${x.capteur ?? ""}`))].map((x) => x.brut);
}

const r = (x: number, n = 4) => Number(x.toPrecision(n));
const arrondi = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Ajustement bilinéaire continu y = a + b1·(x−c)⁺ + b2·(x−c)⁻, point de cassure c parmi les abscisses
 * (hors 10 % aux extrémités), au sens des moindres carrés. Renvoie aussi la somme des carrés d'une droite seule.
 */
export function bilineaire(
  x: readonly number[],
  y: readonly number[],
): {
  c: number;
  a: number;
  b1: number;
  b2: number;
  sse: number;
  sseDroite: number;
  r2: number;
} | null {
  const n = x.length;
  if (n < 12) return null;
  const my = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  // droite seule
  const mx = x.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  const pente = sxx ? sxy / sxx : 0;
  let sseDroite = 0;
  for (let i = 0; i < n; i++) sseDroite += (y[i]! - (my + pente * (x[i]! - mx))) ** 2;

  const tries = [...x].sort((a, b) => a - b);
  const lo = Math.floor(n * 0.1);
  const hi = Math.ceil(n * 0.9);
  let best: {
    c: number;
    a: number;
    b1: number;
    b2: number;
    sse: number;
  } | null = null;
  for (let k = lo; k < hi; k++) {
    const c = tries[k]!;
    // normales 3×3 sur (1, u⁺, u⁻)
    const M = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const u = x[i]! - c;
      const f = [1, Math.max(u, 0), Math.min(u, 0)];
      for (let p = 0; p < 3; p++) {
        v[p]! += f[p]! * y[i]!;
        for (let q = 0; q < 3; q++) M[p]![q]! += f[p]! * f[q]!;
      }
    }
    const s = resoudre3(M, v);
    if (!s) continue;
    let sse = 0;
    for (let i = 0; i < n; i++) {
      const u = x[i]! - c;
      sse += (y[i]! - (s[0] + s[1] * Math.max(u, 0) + s[2] * Math.min(u, 0))) ** 2;
    }
    if (!best || sse < best.sse) best = { c, a: s[0], b1: s[1], b2: s[2], sse };
  }
  if (!best) return null;
  return { ...best, sseDroite, r2: sst ? 1 - best.sse / sst : 1 };
}

function resoudre3(M: number[][], v: number[]): [number, number, number] | null {
  const a = M.map((l, i) => [...l, v[i]!]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let i = c + 1; i < 3; i++) if (Math.abs(a[i]![c]!) > Math.abs(a[p]![c]!)) p = i;
    if (Math.abs(a[p]![c]!) < 1e-12) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let i = 0; i < 3; i++) {
      if (i === c) continue;
      const f = a[i]![c]! / a[c]![c]!;
      for (let j = c; j < 4; j++) a[i]![j]! -= f * a[c]![j]!;
    }
  }
  return [a[0]![3]! / a[0]![0]!, a[1]![3]! / a[1]![1]!, a[2]![3]! / a[2]![2]!];
}

/** Interpolation linéaire de y en x0 sur des x croissants ; null hors plage. */
function interpoler(x: readonly number[], y: readonly number[], x0: number): number | null {
  if (!x.length || x0 < x[0]! || x0 > x.at(-1)!) return null;
  for (let i = 1; i < x.length; i++) {
    if (x[i]! >= x0) {
      const t = x[i]! === x[i - 1]! ? 0 : (x0 - x[i - 1]!) / (x[i]! - x[i - 1]!);
      return y[i - 1]! + t * (y[i]! - y[i - 1]!);
    }
  }
  return y.at(-1)!;
}

export interface OptionsTsrst {
  /** Section de l'éprouvette (mm²), pour passer de la force à la contrainte. */
  section: number | null;
  temperatures?: readonly number[];
  /** Voie de température à utiliser (nom brut) ; sinon celle de l'éprouvette, ou la première. */
  voieTemperature?: string;
  fichier?: string;
  aujourdhui?: string;
}

export function depouillerTsrst(s: Serie, o: OptionsTsrst): ResultatsTsrst {
  const avertissements: string[] = [];
  const temperatures = voiesTemperature(s);
  if (!temperatures.length) throw new Error("Pas de voie de température (°C) dans cet export.");
  const nomT = o.voieTemperature && temperatures.includes(o.voieTemperature) ? o.voieTemperature : temperatures[0]!;
  if (temperatures.length > 1 && !o.voieTemperature) avertissements.push(`Plusieurs voies de température : « ${nomT} » retenue (${temperatures.length - 1} autre(s) disponible(s)).`);
  const jT = s.voies.findIndex((v) => v.brut === nomT);

  // effort : une contrainte si l'export en donne une, sinon la force divisée par la section
  let jE = s.voies.findIndex((v) => v.nature === "contrainte");
  let facteur = 1;
  let section: number | null = null;
  if (jE >= 0) {
    if (s.voies[jE]!.unite === "kPa") facteur = 1e-3;
  } else {
    jE = s.voies.findIndex((v) => v.nature === "force");
    if (jE < 0) throw new Error("Pas de voie de force ni de contrainte dans cet export.");
    if (!o.section || o.section <= 0) throw new Error("Section de l'éprouvette inconnue : renseignez ses dimensions (ou sa section) dans la fiche de l'essai.");
    section = o.section;
    facteur = (s.voies[jE]!.unite === "kN" ? 1000 : 1) / section; // N / mm² = MPa
  }
  const it = voieTemps(s);

  const T: number[] = [];
  const S: number[] = [];
  const H: number[] = [];
  for (let i = 0; i < s.lignes; i++) {
    const t = s.colonnes[jT]![i]!;
    const e = s.colonnes[jE]![i]!;
    if (!Number.isFinite(t) || !Number.isFinite(e)) continue;
    T.push(t);
    S.push(e * facteur);
    H.push(it >= 0 ? s.colonnes[it]![i]! / 3600 : i);
  }
  if (T.length < 20) throw new Error("Trop peu de mesures exploitables dans cet export.");
  // convention de signe : la traction est positive
  let mx = -Infinity;
  let mn = Infinity;
  for (const v of S) {
    if (v > mx) mx = v;
    if (v < mn) mn = v;
  }
  if (-mn > mx) for (let i = 0; i < S.length; i++) S[i] = -S[i]!;

  let iR = 0;
  for (let i = 1; i < S.length; i++) if (S[i]! > S[iR]!) iR = i;
  const sigmaR = S[iR]!;
  let minApres = Infinity;
  for (let i = iR + 1; i < S.length; i++) minApres = Math.min(minApres, S[i]!);
  const rompu = iR < S.length - 1 && minApres < 0.3 * sigmaR;
  if (!rompu) avertissements.push("Pas de rupture nette : la contrainte maximale est atteinte en fin d'enregistrement (essai arrêté avant rupture ?).");

  // début du refroidissement : dernier instant, avant la rupture, à moins de 0,5 °C de la température maximale
  let tMax = -Infinity;
  for (let i = 0; i <= iR; i++) tMax = Math.max(tMax, T[i]!);
  let i0 = 0;
  for (let i = 0; i <= iR; i++) if (T[i]! >= tMax - 0.5) i0 = i;
  if (T[iR]! > T[i0]! - 2) throw new Error("Pas de refroidissement avant le pic de contrainte : est-ce bien un essai TSRST ?");

  // courbe σ(T) : moyenne par tranche de température, du départ à la rupture
  const tHaut = T[i0]!;
  const tBas = T[iR]!;
  const nb = Math.min(POINTS_COURBE, Math.max(10, iR - i0 + 1));
  const pas = (tHaut - tBas) / nb;
  const sommes = Array.from({ length: nb }, () => ({ t: 0, s: 0, n: 0 }));
  for (let i = i0; i <= iR; i++) {
    const k = Math.min(nb - 1, Math.max(0, Math.floor((tHaut - T[i]!) / pas)));
    sommes[k]!.t += T[i]!;
    sommes[k]!.s += S[i]!;
    sommes[k]!.n++;
  }
  const cT: number[] = [];
  const cS: number[] = [];
  for (const b of sommes) {
    if (!b.n) continue;
    cT.push(b.t / b.n);
    cS.push(b.s / b.n);
  }
  // la dernière tranche se termine exactement au pic
  cT.push(tBas);
  cS.push(sigmaR);

  // transition : coude de σ(T) (abscisses croissantes pour l'ajustement)
  const xs = [...cT].reverse();
  const ys = [...cS].reverse();
  const f = bilineaire(xs, ys);
  let transition: ResultatsTsrst["transition"] = null;
  if (f && f.sse < 0.5 * f.sseDroite && -f.b2 > 1.5 * Math.abs(f.b1) && -f.b2 > 0) {
    transition = {
      temperature: arrondi(f.c, 1),
      pente: r(-f.b2, 3),
      penteAvant: r(-f.b1, 3),
      r2: arrondi(f.r2, 4),
    };
  } else avertissements.push("Pas de transition nette sur σ(T) (pente à peu près constante).");

  const demandees = o.temperatures ?? TEMPERATURES_DEFAUT;
  const aT = demandees.map((t) => {
    const v = interpoler(xs, ys, t);
    return { temperature: t, contrainte: v === null ? null : r(v, 4) };
  });

  return {
    version: VERSION_TSRST,
    calculeLe: o.aujourdhui ?? new Date().toISOString().slice(0, 10),
    fichier: o.fichier ?? "",
    voieTemperature: nomT,
    voieEffort: s.voies[jE]!.brut,
    section: section === null ? null : r(section, 6),
    depart: arrondi(tHaut, 2),
    rompu,
    rupture: {
      temperature: arrondi(tBas, 2),
      contrainte: r(sigmaR, 4),
      heures: arrondi(H[iR]!, 3),
    },
    transition,
    aT,
    courbe: {
      temperature: cT.map((x) => arrondi(x, 3)),
      contrainte: cS.map((x) => r(x, 4)),
    },
    avertissements,
  };
}

/** Relecture tolérante d'un `tsrst.json`. */
export function lireResultats(brut: unknown): ResultatsTsrst {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const rup = (b.rupture ?? {}) as Record<string, unknown>;
  if (num(rup.temperature) === null || num(rup.contrainte) === null) throw new Error("Résultats TSRST incomplets (rupture).");
  const tr = b.transition as Record<string, unknown> | null | undefined;
  const c = (b.courbe ?? {}) as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : []);
  const cT = liste(c.temperature);
  const cS = liste(c.contrainte);
  return {
    version: num(b.version) ?? VERSION_TSRST,
    calculeLe: typeof b.calculeLe === "string" ? b.calculeLe : "",
    fichier: typeof b.fichier === "string" ? b.fichier : "",
    voieTemperature: typeof b.voieTemperature === "string" ? b.voieTemperature : "",
    voieEffort: typeof b.voieEffort === "string" ? b.voieEffort : "",
    section: num(b.section),
    depart: num(b.depart) ?? NaN,
    rompu: b.rompu !== false,
    rupture: {
      temperature: num(rup.temperature)!,
      contrainte: num(rup.contrainte)!,
      heures: num(rup.heures) ?? NaN,
    },
    transition:
      tr && num(tr.temperature) !== null && num(tr.pente) !== null
        ? {
            temperature: num(tr.temperature)!,
            pente: num(tr.pente)!,
            penteAvant: num(tr.penteAvant) ?? 0,
            r2: num(tr.r2) ?? NaN,
          }
        : null,
    aT: (Array.isArray(b.aT) ? b.aT : [])
      .map((x) => x as Record<string, unknown>)
      .filter((x) => num(x.temperature) !== null)
      .map((x) => ({
        temperature: num(x.temperature)!,
        contrainte: num(x.contrainte),
      })),
    courbe: {
      temperature: cT.slice(0, Math.min(cT.length, cS.length)),
      contrainte: cS.slice(0, Math.min(cT.length, cS.length)),
    },
    avertissements: Array.isArray(b.avertissements) ? b.avertissements.filter((x): x is string => typeof x === "string") : [],
  };
}

/** σ à une température donnée, depuis la courbe archivée (pour des températures ajoutées après coup). */
export function contrainteA(res: ResultatsTsrst, t: number): number | null {
  const x = [...res.courbe.temperature].reverse();
  const y = [...res.courbe.contrainte].reverse();
  const v = interpoler(x, y, t);
  return v === null ? null : r(v, 4);
}

// ---- Tableau de tous les essais TSRST, tri, groupes ----

export interface LigneTsrst {
  slug: string;
  campagne: string;
  essai: string;
  eprouvette: string;
  materiau: string;
  vieillissement: string;
  vides: number | null;
  section: number | null;
  /** « AAAA-MM-JJ » (début de l'essai). */
  date: string;
  validite: string;
  motif: string;
  resultats: ResultatsTsrst | null;
}

export type ColonneTsrst = "campagne" | "essai" | "eprouvette" | "materiau" | "vieillissement" | "vides" | "date" | "validite" | "Trupture" | "Srupture" | "Ttransition" | "pente" | `aT:${number}`;

export function valeurColonne(l: LigneTsrst, c: ColonneTsrst): string | number | null {
  const res = l.resultats;
  switch (c) {
    case "campagne":
    case "essai":
    case "eprouvette":
    case "materiau":
    case "vieillissement":
    case "date":
    case "validite":
      return l[c];
    case "vides":
      return l.vides;
    case "Trupture":
      return res?.rupture.temperature ?? null;
    case "Srupture":
      return res?.rupture.contrainte ?? null;
    case "Ttransition":
      return res?.transition?.temperature ?? null;
    case "pente":
      return res?.transition?.pente ?? null;
    default: {
      const t = Number(c.slice(3));
      return res ? (res.aT.find((x) => x.temperature === t)?.contrainte ?? contrainteA(res, t)) : null;
    }
  }
}

/** Tri stable ; les valeurs manquantes vont toujours à la fin. */
export function trier(lignes: readonly LigneTsrst[], c: ColonneTsrst, sens: 1 | -1): LigneTsrst[] {
  return [...lignes].sort((a, b) => {
    const x = valeurColonne(a, c);
    const y = valeurColonne(b, c);
    const vx = x === null || x === "";
    const vy = y === null || y === "";
    if (vx || vy) return vx === vy ? 0 : vx ? 1 : -1;
    const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr", { numeric: true });
    return d * sens || a.campagne.localeCompare(b.campagne) || a.essai.localeCompare(b.essai, "fr", { numeric: true });
  });
}

export interface Stat {
  n: number;
  moyenne: number | null;
  ecartType: number | null;
}

export function statistique(v: readonly (number | null)[]): Stat {
  const x = v.filter((y): y is number => y !== null && Number.isFinite(y));
  if (!x.length) return { n: 0, moyenne: null, ecartType: null };
  const m = x.reduce((s, y) => s + y, 0) / x.length;
  const e = x.length > 1 ? Math.sqrt(x.reduce((s, y) => s + (y - m) ** 2, 0) / (x.length - 1)) : null;
  return {
    n: x.length,
    moyenne: r(m, 4),
    ecartType: e === null ? null : r(e, 3),
  };
}

export interface GroupeTsrst {
  cle: string;
  essais: number;
  Trupture: Stat;
  Srupture: Stat;
  Ttransition: Stat;
  pente: Stat;
  aT: { temperature: number; stat: Stat }[];
}

/**
 * Moyennes et écarts-types par groupe (matériau, vieillissement…), sur les essais dépouillés et valides
 * (les écartés n'entrent pas dans les moyennes).
 */
export function grouperTsrst(lignes: readonly LigneTsrst[], par: (l: LigneTsrst) => string, temperatures: readonly number[]): GroupeTsrst[] {
  const groupes = new Map<string, LigneTsrst[]>();
  for (const l of lignes) {
    if (!l.resultats || l.validite === "ecarte") continue;
    const k = par(l) || "(non renseigné)";
    groupes.set(k, [...(groupes.get(k) ?? []), l]);
  }
  return [...groupes]
    .sort(([a], [b]) => a.localeCompare(b, "fr", { numeric: true }))
    .map(([cle, ls]) => ({
      cle,
      essais: ls.length,
      Trupture: statistique(ls.map((l) => valeurColonne(l, "Trupture") as number | null)),
      Srupture: statistique(ls.map((l) => valeurColonne(l, "Srupture") as number | null)),
      Ttransition: statistique(ls.map((l) => valeurColonne(l, "Ttransition") as number | null)),
      pente: statistique(ls.map((l) => valeurColonne(l, "pente") as number | null)),
      aT: temperatures.map((t) => ({
        temperature: t,
        stat: statistique(ls.map((l) => valeurColonne(l, `aT:${t}`) as number | null)),
      })),
    }));
}

// ---- Construction des lignes, comparaison, export ----

export interface SourceTsrst {
  slug: string;
  titre: string;
  type: string;
  materiau: string;
  essais: Record<
    string,
    {
      eprouvette: string;
      debut: string;
      fiche: Eprouvette;
      validite: string;
      motif: string;
    }
  >;
  tsrst: Record<string, ResultatsTsrst>;
}

/** Une ligne par essai des campagnes TSRST (et de toute campagne qui a des résultats TSRST). */
export function lignesTsrst(campagnes: readonly SourceTsrst[]): LigneTsrst[] {
  return campagnes
    .filter((c) => c.type === "tsrst" || Object.keys(c.tsrst).length)
    .flatMap((c) =>
      Object.entries(c.essais).map(([essai, e]) => ({
        slug: c.slug,
        campagne: c.titre,
        essai,
        eprouvette: e.eprouvette,
        materiau: e.fiche.materiau || c.materiau,
        vieillissement: e.fiche.vieillissement,
        vides: e.fiche.vides,
        section: sectionDe(e.fiche),
        date: e.debut.slice(0, 10),
        validite: e.validite,
        motif: e.motif,
        resultats: c.tsrst[essai] ?? null,
      })),
    );
}

/** Nom court d'un essai dans une comparaison : « Essai2 (B2C4) » ou « Campagne · Essai2 ». */
export function nomCourbe(l: LigneTsrst, plusieursCampagnes: boolean): string {
  const base = plusieursCampagnes ? `${l.campagne} · ${l.essai}` : l.essai;
  return l.eprouvette ? `${base} (${l.eprouvette})` : base;
}

/** σ(T) de plusieurs essais sur un même graphe (températures croissantes en abscisse). */
export function panneauComparaison(lignes: readonly LigneTsrst[]): {
  titre: string;
  unite: string;
  traces: { nom: string; x: number[]; y: number[] }[];
} {
  const plusieurs = new Set(lignes.map((l) => l.slug)).size > 1;
  return {
    titre: "Contrainte thermique",
    unite: "MPa",
    traces: lignes
      .filter((l) => l.resultats)
      .map((l) => ({
        nom: nomCourbe(l, plusieurs),
        x: [...l.resultats!.courbe.temperature].reverse(),
        y: [...l.resultats!.courbe.contrainte].reverse(),
      })),
  };
}

const LIBELLE_VALIDITE: Record<string, string> = {
  "": "à juger",
  valide: "valide",
  ecarte: "écarté",
};

/**
 * Classeur d'archive : feuille des essais (fiche et résultats), synthèse par groupe, et courbes σ(T)
 * (deux colonnes par essai) ; de quoi refaire une figure ou une analyse sans l'application.
 */
export function feuillesTsrst(lignes: readonly LigneTsrst[], temperatures: readonly number[], groupes: readonly GroupeTsrst[], groupePar: string) {
  const sT = (t: number) => `σ à ${t} °C (MPa)`;
  const essais = {
    nom: "Essais TSRST",
    entetes: [
      "Campagne",
      "Essai",
      "Éprouvette",
      "Matériau",
      "Vieillissement",
      "Vides (%)",
      "Section (mm²)",
      "Date",
      "Validité",
      "Motif",
      "T rupture (°C)",
      "σ rupture (MPa)",
      "Rupture nette",
      "T transition (°C)",
      "Pente sous la transition (MPa/°C)",
      ...temperatures.map(sT),
      "Dépouillé le",
    ],
    lignes: lignes.map((l) => [
      l.campagne,
      l.essai,
      l.eprouvette,
      l.materiau,
      l.vieillissement,
      l.vides,
      l.section === null ? null : Math.round(l.section * 10) / 10,
      l.date,
      LIBELLE_VALIDITE[l.validite] ?? l.validite,
      l.motif,
      l.resultats?.rupture.temperature ?? null,
      l.resultats?.rupture.contrainte ?? null,
      l.resultats ? (l.resultats.rompu ? "oui" : "non") : "",
      l.resultats?.transition?.temperature ?? null,
      l.resultats?.transition?.pente ?? null,
      ...temperatures.map((t) => valeurColonne(l, `aT:${t}`) as number | null),
      l.resultats?.calculeLe ?? "",
    ]),
    mise: {
      largeurs: [24, 10, 14, 18, 16, 9, 11, 11, 9, 24, 12, 12, 9, 13, 14, ...temperatures.map(() => 13), 12],
      figerColonnes: 2,
      filtre: true,
      retour: true,
    },
  };
  const m = (s: Stat) => s.moyenne;
  const e = (s: Stat) => s.ecartType;
  const synthese = {
    nom: "Synthèse",
    entetes: [
      groupePar,
      "Essais",
      "T rupture moy.",
      "écart-type",
      "σ rupture moy.",
      "écart-type",
      "T transition moy.",
      "écart-type",
      "Pente moy.",
      "écart-type",
      ...temperatures.flatMap((t) => [`σ à ${t} °C moy.`, "écart-type"]),
    ],
    lignes: groupes.map((g) => [
      g.cle,
      g.essais,
      m(g.Trupture),
      e(g.Trupture),
      m(g.Srupture),
      e(g.Srupture),
      m(g.Ttransition),
      e(g.Ttransition),
      m(g.pente),
      e(g.pente),
      ...g.aT.flatMap((x) => [m(x.stat), e(x.stat)]),
    ]),
    mise: {
      largeurs: [24, 8, ...Array.from({ length: 8 + temperatures.length * 2 }, () => 12)],
      figerColonnes: 1,
      filtre: true,
    },
  };
  const avecCourbe = lignes.filter((l) => l.resultats);
  const plusieurs = new Set(avecCourbe.map((l) => l.slug)).size > 1;
  const long = Math.max(0, ...avecCourbe.map((l) => l.resultats!.courbe.temperature.length));
  const courbes = {
    nom: "Courbes σ(T)",
    entetes: avecCourbe.flatMap((l) => [`${nomCourbe(l, plusieurs)} T (°C)`, "σ (MPa)"]),
    lignes: Array.from({ length: long }, (_, i) => avecCourbe.flatMap((l) => [l.resultats!.courbe.temperature[i] ?? null, l.resultats!.courbe.contrainte[i] ?? null])),
    mise: { largeurs: avecCourbe.flatMap(() => [16, 10]) },
  };
  return avecCourbe.length ? [essais, synthese, courbes] : [essais, synthese];
}
