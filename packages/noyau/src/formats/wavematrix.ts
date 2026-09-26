/**
 * Exports CSV d'Instron WaveMatrix 2 (`*.steps.tracking.csv`, `*.Stop.csv`) : séparateur
 * « ; », décimale « , », BOM UTF-8, en-têtes « Grandeur(bâti:capteur) (unité) ». Les voies
 * sont identifiées par leur grandeur et leur unité, jamais par le numéro de série du
 * capteur (il change quand on remonte les capteurs). Portage de `lgcb/io/wavematrix.py`
 * et `lgcb/io/channels.py` (these-lgcb). Partagé : Campagnes, et Traitement à terme.
 */

export type Nature =
  | "temps"
  | "temps_cycle"
  | "force"
  | "deplacement_verin"
  | "deplacement"
  | "deformation"
  | "temperature"
  | "contrainte"
  | "frequence"
  | "angle"
  | "couple"
  | "cycles"
  | "etape"
  | "boucle"
  | "modal"
  | "inconnu";

export interface Voie {
  brut: string;
  grandeur: string;
  bati: string | null;
  capteur: string | null;
  unite: string | null;
  nature: Nature;
}

const PAR_UNITE: Record<string, Nature> = {
  s: "temps",
  kN: "force",
  N: "force",
  mm: "deplacement_verin",
  µm: "deplacement",
  um: "deplacement",
  "%": "deformation",
  "°C": "temperature",
  C: "temperature",
  MPa: "contrainte",
  kPa: "contrainte",
  Hz: "frequence",
  "°": "angle",
  "N.m": "couple",
};

/** « Force(8800 (0,1):Charge) (kN) » → grandeur, bâti, capteur, unité, nature. */
export function lireEntete(entete: string): Voie {
  let tete = entete.trim().replace(/^"|"$/g, "");
  let unite: string | null = null;
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(tete);
  if (m) {
    tete = m[1]!;
    unite = m[2]!;
  }
  let grandeur = tete;
  let bati: string | null = null;
  let capteur: string | null = null;
  if (tete.endsWith(")") && tete.includes("(")) {
    const i = tete.indexOf("(");
    grandeur = tete.slice(0, i).trim();
    const dedans = tete.slice(i + 1, -1).trim();
    const d = dedans.lastIndexOf(":");
    if (d >= 0) {
      bati = dedans.slice(0, d) || null;
      capteur = dedans.slice(d + 1) || null;
    } else bati = dedans;
  }
  return { brut: entete.trim(), grandeur, bati, capteur, unite, nature: classer(grandeur, unite) };
}

function classer(grandeur: string, unite: string | null): Nature {
  const bas = grandeur.toLowerCase();
  if (unite === null) {
    if (bas.includes("etape") || bas.includes("étape")) return "etape";
    if (bas.includes("cycle")) return "cycles";
    if (bas.includes("boucle")) return "boucle";
    return "inconnu";
  }
  if (unite === "s") return bas.includes("cycle") ? "temps_cycle" : "temps";
  if (unite === "mm" && bas.startsWith("modale")) return "modal";
  return PAR_UNITE[unite] ?? "inconnu";
}

export interface Serie {
  voies: Voie[];
  /** Une colonne par voie ; NaN pour une cellule vide ou non numérique. */
  colonnes: Float64Array[];
  lignes: number;
}

function nombre(s: string): number {
  const t = s.trim().replace(/^"|"$/g, "").replace(/\s/g, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
}

/** Lit un export CSV complet (les deux dialectes). */
export function lireCsv(texte: string): Serie {
  const lignes = texte.replace(/^\uFEFF/, "").split(/\r?\n/);
  const entetes = (lignes[0] ?? "").split(";");
  // « ; » terminal de .Stop.csv : colonne fantôme sans nom, retirée.
  while (entetes.length && entetes.at(-1)!.trim().replace(/"/g, "") === "") entetes.pop();
  const voies = entetes.map(lireEntete);
  const donnees = lignes.slice(1).filter((l) => l.trim() !== "");
  const colonnes = voies.map(() => new Float64Array(donnees.length));
  donnees.forEach((l, i) => {
    const c = l.split(";");
    for (let j = 0; j < voies.length; j++) colonnes[j]![i] = nombre(c[j] ?? "");
  });
  return { voies, colonnes, lignes: donnees.length };
}

/**
 * Réduit une série à environ `n` points pour l'affichage, en gardant le minimum et le
 * maximum de chaque paquet : les pics d'un signal cyclique restent visibles.
 */
export function decimer(x: Float64Array, y: Float64Array, n: number): { x: number[]; y: number[] } {
  if (x.length <= n) return { x: [...x], y: [...y] };
  const paquets = Math.max(1, Math.floor(n / 2));
  const taille = x.length / paquets;
  const ox: number[] = [];
  const oy: number[] = [];
  for (let p = 0; p < paquets; p++) {
    const a = Math.floor(p * taille);
    const b = Math.min(x.length, Math.floor((p + 1) * taille));
    let iMin = -1;
    let iMax = -1;
    for (let i = a; i < b; i++) {
      if (Number.isNaN(y[i]!)) continue;
      if (iMin < 0 || y[i]! < y[iMin]!) iMin = i;
      if (iMax < 0 || y[i]! > y[iMax]!) iMax = i;
    }
    if (iMin < 0) continue;
    for (const i of iMin <= iMax ? [iMin, iMax] : [iMax, iMin]) {
      ox.push(x[i]!);
      oy.push(y[i]!);
    }
  }
  return { x: ox, y: oy };
}

/** Colonne de temps de l'essai (« Temps total »), sinon la première en secondes. */
export function voieTemps(s: Serie): number {
  const total = s.voies.findIndex((v) => v.nature === "temps" && /total/i.test(v.grandeur));
  return total >= 0 ? total : s.voies.findIndex((v) => v.nature === "temps");
}
