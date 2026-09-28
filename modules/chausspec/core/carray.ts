/**
 * Tableaux de nombres complexes : l'équivalent des np.ndarray complexes du code Python.
 *
 * Toutes les opérations agissent élément par élément sur un paquet de M valeurs (en pratique,
 * M nombres d'onde), ce qui permet d'écrire les formules comme dans chausspec :
 *
 *     Python :  T = mu / mr * (dU + W)
 *     ici    :  const T = mu.div(mr).mul(dU.add(W))
 *
 * Un opérande peut être un autre CArray, un tableau réel (Float64Array) ou un nombre : il est
 * alors « diffusé » comme avec numpy. Chaque opération renvoie un nouveau tableau. Quand le
 * premier terme est un nombre, les fonctions libres add, sub, mul, div s'écrivent dans l'ordre
 * de la formule : `(1.0 - tau) * e1` devient `mul(sub(1, tau), e1)`.
 *
 * TypeScript n'ayant pas de surcharge d'opérateurs, c'est la seule différence d'écriture avec
 * le Python : les formules et leur ordre sont les mêmes.
 */

export type Operand = CArray | Float64Array | number;

// ─────────── réserve de tableaux de travail ───────────
// Chromium (le moteur de l'application) fait payer cher le premier remplissage de chaque
// tableau neuf de quelques dizaines de Ko, et le calcul d'un paquet de nombres d'onde crée
// plus d'un millier de tableaux temporaires. Pendant scratch(), ils sont pris dans une
// réserve réutilisée d'un paquet à l'autre (le calcul est environ deux fois plus rapide dans
// l'application ; rien ne change sous Node). Ce qui sort de scratch() est recopié.

const reserve = new Map<number, { buffers: Float64Array[]; used: number }>();
let reserveActive = false;

/** Tableau de n valeurs, non initialisé s'il vient de la réserve. */
function alloc(n: number): Float64Array {
  if (!reserveActive) return new Float64Array(n);
  let r = reserve.get(n);
  if (!r) reserve.set(n, (r = { buffers: [], used: 0 }));
  if (r.used === r.buffers.length) r.buffers.push(new Float64Array(n));
  return r.buffers[r.used++]!;
}

function zeroed(n: number): Float64Array {
  return reserveActive ? alloc(n).fill(0) : new Float64Array(n);
}

function copyOf(a: Float64Array): Float64Array {
  const out = alloc(a.length);
  out.set(a);
  return out;
}

/**
 * Exécute un calcul dont les tableaux temporaires sont pris dans la réserve, et renvoie ses
 * résultats recopiés hors de la réserve (qui peut alors resservir).
 */
export function scratch(fn: () => Map<string, CArray>): Map<string, CArray> {
  if (reserveActive) return fn();
  reserveActive = true;
  let result: Map<string, CArray>;
  try {
    result = fn();
  } finally {
    reserveActive = false;
  }
  const out = new Map([...result].map(([k, v]) => [k, v.copy()]));
  for (const r of reserve.values()) r.used = 0;
  return out;
}

/** Rend la mémoire de la réserve (fin d'un calcul). */
export function releaseScratch(): void {
  reserve.clear();
}

export class CArray {
  readonly re: Float64Array;
  readonly im: Float64Array;

  constructor(re: Float64Array, im?: Float64Array) {
    this.re = re;
    this.im = im ?? zeroed(re.length);
  }

  /* ─────────── création ─────────── */

  static zeros(n: number): CArray {
    return new CArray(zeroed(n), zeroed(n));
  }

  /** n fois la même valeur re + i·im (np.full). */
  static full(n: number, re: number, im = 0): CArray {
    return new CArray(alloc(n).fill(re), alloc(n).fill(im));
  }

  /** Tableau réel vu comme complexe (partie imaginaire nulle). */
  static real(values: ArrayLike<number>): CArray {
    const re = alloc(values.length);
    re.set(values);
    return new CArray(re);
  }

  /** Depuis des couples [re, im] (format des fichiers de référence). */
  static fromPairs(pairs: readonly (readonly [number, number])[]): CArray {
    return new CArray(Float64Array.from(pairs, (p) => p[0]), Float64Array.from(pairs, (p) => p[1]));
  }

  get size(): number {
    return this.re.length;
  }

  /** Élément i sous forme [re, im]. */
  at(i: number): [number, number] {
    return [this.re[i]!, this.im[i]!];
  }

  toPairs(): [number, number][] {
    return Array.from(this.re, (r, i) => [r, this.im[i]!]);
  }

  copy(): CArray {
    return new CArray(copyOf(this.re), copyOf(this.im));
  }

  /** Éléments [start, end[ (vue copiée, comme a[start:end].copy()). */
  slice(start: number, end: number): CArray {
    return new CArray(this.re.slice(start, end), this.im.slice(start, end));
  }

  /** Éléments aux indices donnés (a[idx]). */
  take(idx: ArrayLike<number>): CArray {
    return new CArray(Float64Array.from(idx, (i) => this.re[i]!), Float64Array.from(idx, (i) => this.im[i]!));
  }

  /* ─────────── opérations élément par élément ─────────── */

  add(b: Operand): CArray {
    return add(this, b);
  }
  sub(b: Operand): CArray {
    return sub(this, b);
  }
  mul(b: Operand): CArray {
    return mul(this, b);
  }
  div(b: Operand): CArray {
    return div(this, b);
  }

  neg(): CArray {
    return new CArray(negated(this.re), negated(this.im));
  }

  conj(): CArray {
    return new CArray(copyOf(this.re), negated(this.im));
  }

  /** Multiplication par i : (a + ib)·i = −b + ia. */
  mulI(): CArray {
    return new CArray(negated(this.im), copyOf(this.re));
  }

  /** exp(z) = e^re (cos im + i sin im). */
  exp(): CArray {
    const n = this.size;
    const re = alloc(n),
      im = alloc(n);
    for (let i = 0; i < n; i++) {
      const m = Math.exp(this.re[i]!);
      re[i] = m * Math.cos(this.im[i]!);
      im[i] = m * Math.sin(this.im[i]!);
    }
    return new CArray(re, im);
  }

  /** z^p, branche principale (comme numpy) : |z|^p e^{i p arg z}. */
  pow(p: number): CArray {
    const n = this.size;
    const re = alloc(n),
      im = alloc(n);
    for (let i = 0; i < n; i++) {
      const m = Math.hypot(this.re[i]!, this.im[i]!) ** p;
      const a = p * Math.atan2(this.im[i]!, this.re[i]!);
      re[i] = m * Math.cos(a);
      im[i] = m * Math.sin(a);
    }
    return new CArray(re, im);
  }

  /** Module |z| (np.abs), tableau réel. */
  abs(): Float64Array {
    const out = alloc(this.size);
    for (let i = 0; i < out.length; i++) out[i] = Math.hypot(this.re[i]!, this.im[i]!);
    return out;
  }

  /** Somme des éléments. */
  sum(): [number, number] {
    let re = 0,
      im = 0;
    for (let i = 0; i < this.size; i++) {
      re += this.re[i]!;
      im += this.im[i]!;
    }
    return [re, im];
  }
}

/** −a (boucle simple : Float64Array.map est bien plus lent). */
function negated(a: Float64Array): Float64Array {
  const out = alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = -a[i]!;
  return out;
}

/* ─────────── fonctions libres (le premier terme peut être un nombre) ─────────── */

// Chaque opération a trois boucles (tableau-tableau, tableau-nombre, nombre-tableau) : des
// boucles simples et monomorphes, que le moteur JavaScript compile efficacement.

/** Un opérande : tableau complexe, ou nombre (re, im). Un tableau réel devient complexe. */
function arr(a: Operand): CArray | null {
  if (typeof a === "number") return null;
  return a instanceof CArray ? a : new CArray(a);
}

function sameSize(a: CArray, b: CArray): number {
  if (a.size !== b.size) throw new Error(`Tailles incompatibles : ${a.size} et ${b.size}.`);
  return a.size;
}

export function add(a: Operand, b: Operand): CArray {
  const A = arr(a),
    B = arr(b);
  if (A && B) {
    const n = sameSize(A, B);
    const re = alloc(n),
      im = alloc(n);
    for (let i = 0; i < n; i++) {
      re[i] = A.re[i]! + B.re[i]!;
      im[i] = A.im[i]! + B.im[i]!;
    }
    return new CArray(re, im);
  }
  const X = (A ?? B)!,
    k = (A ? b : a) as number;
  if (!X) throw new Error("Au moins un des deux termes doit être un tableau.");
  const re = alloc(X.size);
  for (let i = 0; i < X.size; i++) re[i] = X.re[i]! + k;
  return new CArray(re, copyOf(X.im));
}

export function sub(a: Operand, b: Operand): CArray {
  const A = arr(a),
    B = arr(b);
  if (A && B) {
    const n = sameSize(A, B);
    const re = alloc(n),
      im = alloc(n);
    for (let i = 0; i < n; i++) {
      re[i] = A.re[i]! - B.re[i]!;
      im[i] = A.im[i]! - B.im[i]!;
    }
    return new CArray(re, im);
  }
  if (A) return add(A, -(b as number));
  if (!B) throw new Error("Au moins un des deux termes doit être un tableau.");
  // nombre - tableau
  const k = a as number;
  const re = alloc(B.size),
    im = alloc(B.size);
  for (let i = 0; i < B.size; i++) {
    re[i] = k - B.re[i]!;
    im[i] = -B.im[i]!;
  }
  return new CArray(re, im);
}

export function mul(a: Operand, b: Operand): CArray {
  const A = arr(a),
    B = arr(b);
  if (A && B) {
    const n = sameSize(A, B);
    const re = alloc(n),
      im = alloc(n);
    for (let i = 0; i < n; i++) {
      const ar = A.re[i]!,
        ai = A.im[i]!,
        br = B.re[i]!,
        bi = B.im[i]!;
      re[i] = ar * br - ai * bi;
      im[i] = ar * bi + ai * br;
    }
    return new CArray(re, im);
  }
  const X = (A ?? B)!,
    k = (A ? b : a) as number;
  if (!X) throw new Error("Au moins un des deux termes doit être un tableau.");
  const re = alloc(X.size),
    im = alloc(X.size);
  for (let i = 0; i < X.size; i++) {
    re[i] = X.re[i]! * k;
    im[i] = X.im[i]! * k;
  }
  return new CArray(re, im);
}

export function div(a: Operand, b: Operand): CArray {
  const A = arr(a),
    B = arr(b);
  if (A && !B) return mul(A, 1 / (b as number));
  if (!B) throw new Error("Au moins un des deux termes doit être un tableau.");
  const n = B.size;
  if (A) sameSize(A, B);
  const k = A ? 0 : (a as number);
  const re = alloc(n),
    im = alloc(n);
  for (let i = 0; i < n; i++) {
    const ar = A ? A.re[i]! : k,
      ai = A ? A.im[i]! : 0,
      br = B.re[i]!,
      bi = B.im[i]!;
    // division de Smith (évite les dépassements), comme numpy
    if (Math.abs(br) >= Math.abs(bi)) {
      const r = bi / br,
        d = br + bi * r;
      re[i] = (ar + ai * r) / d;
      im[i] = (ai - ar * r) / d;
    } else {
      const r = br / bi,
        d = br * r + bi;
      re[i] = (ar * r + ai) / d;
      im[i] = (ai * r - ar) / d;
    }
  }
  return new CArray(re, im);
}

/**
 * Σ_k a[k] · b[k] élément par élément, en une seule boucle (produits de petites matrices :
 * évite un tableau intermédiaire par produit).
 */
export function sumOfProducts(a: readonly CArray[], b: readonly CArray[]): CArray {
  const n = a[0]!.size,
    p = a.length;
  const re = zeroed(n),
    im = zeroed(n);
  for (let k = 0; k < p; k++) {
    const A = a[k]!,
      B = b[k]!;
    sameSize(A, B);
    const Ar = A.re,
      Ai = A.im,
      Br = B.re,
      Bi = B.im;
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! + Ar[i]! * Br[i]! - Ai[i]! * Bi[i]!;
      im[i] = im[i]! + Ar[i]! * Bi[i]! + Ai[i]! * Br[i]!;
    }
  }
  return new CArray(re, im);
}

/** np.exp d'un tableau complexe. */
export const exp = (a: CArray): CArray => a.exp();

/* ─────────── tableaux réels (Float64Array) ─────────── */

/** np.arange(n) * step + start. */
export function linspaceStep(start: number, step: number, n: number): Float64Array {
  return Float64Array.from({ length: n }, (_, i) => start + step * i);
}

/** Indices où la condition est vraie (np.nonzero). */
export function nonzero(a: ArrayLike<number>, cond: (v: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (cond(a[i]!)) out.push(i);
  return out;
}

/**
 * np.meshgrid(k1, k2) aplati ligne par ligne : K1[r·n1 + c] = k1[c], K2[r·n1 + c] = k2[r]
 * (k2 selon les lignes, k1 selon les colonnes, comme les tableaux (ny, nx) du Python).
 */
export function meshgrid(k1: Float64Array, k2: Float64Array): [Float64Array, Float64Array] {
  const n1 = k1.length,
    n2 = k2.length;
  const K1 = new Float64Array(n1 * n2),
    K2 = new Float64Array(n1 * n2);
  for (let r = 0; r < n2; r++)
    for (let c = 0; c < n1; c++) {
      K1[r * n1 + c] = k1[c]!;
      K2[r * n1 + c] = k2[r]!;
    }
  return [K1, K2];
}

/**
 * Produit matriciel de tableaux complexes rangés ligne par ligne : A (r × p) @ B (p × q).
 * Sert aux sommes de phases exp(i k x) des parties continues de la grille.
 */
export function matmul(A: CArray, r: number, p: number, B: CArray, q: number): CArray {
  const re = new Float64Array(r * q),
    im = new Float64Array(r * q);
  const Ar = A.re,
    Ai = A.im,
    Br = B.re,
    Bi = B.im;
  for (let i = 0; i < r; i++)
    for (let k = 0; k < p; k++) {
      const ar = Ar[i * p + k]!,
        ai = Ai[i * p + k]!;
      if (ar === 0 && ai === 0) continue;
      const o = i * q,
        b = k * q;
      for (let j = 0; j < q; j++) {
        const br = Br[b + j]!,
          bi = Bi[b + j]!;
        re[o + j] = re[o + j]! + ar * br - ai * bi;
        im[o + j] = im[o + j]! + ar * bi + ai * br;
      }
    }
  return new CArray(re, im);
}

/**
 * out[rows[i], :] += (A @ B)[i, :], en place : le « B[key][rows] += A @ B » du Python.
 * out a q colonnes ; rows = null pour toutes les lignes dans l'ordre.
 */
export function addMatmul(out: CArray, rows: readonly number[] | null, A: CArray, r: number, p: number, B: CArray, q: number): void {
  const Or = out.re,
    Oi = out.im,
    Ar = A.re,
    Ai = A.im,
    Br = B.re,
    Bi = B.im;
  for (let i = 0; i < r; i++) {
    const o = (rows ? rows[i]! : i) * q;
    for (let k = 0; k < p; k++) {
      const ar = Ar[i * p + k]!,
        ai = Ai[i * p + k]!;
      if (ar === 0 && ai === 0) continue;
      const b = k * q;
      for (let j = 0; j < q; j++) {
        const br = Br[b + j]!,
          bi = Bi[b + j]!;
        Or[o + j] = Or[o + j]! + ar * br - ai * bi;
        Oi[o + j] = Oi[o + j]! + ar * bi + ai * br;
      }
    }
  }
}

/** Tableau (rows × cols) dont la colonne c est multipliée par w[c] (A * w[None, :]). */
export function scaleColumns(A: CArray, rows: number, cols: number, w: Float64Array): CArray {
  const out = A.copy();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      out.re[r * cols + c] = out.re[r * cols + c]! * w[c]!;
      out.im[r * cols + c] = out.im[r * cols + c]! * w[c]!;
    }
  return out;
}

/** Tableau (rows × cols) dont la ligne r est multipliée par w[r] (A * w[:, None]). */
export function scaleRows(A: CArray, rows: number, cols: number, w: Float64Array): CArray {
  const out = A.copy();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      out.re[r * cols + c] = out.re[r * cols + c]! * w[r]!;
      out.im[r * cols + c] = out.im[r * cols + c]! * w[r]!;
    }
  return out;
}

/** exp(i · outer(a, b)) · w : matrice (a.length × b.length) de phases pondérées. */
export function phases(a: Float64Array, b: Float64Array, w?: { rows?: Float64Array; cols?: Float64Array }): CArray {
  const n = a.length,
    m = b.length;
  const re = new Float64Array(n * m),
    im = new Float64Array(n * m);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const k = (w?.rows ? w.rows[i]! : 1) * (w?.cols ? w.cols[j]! : 1);
      const t = a[i]! * b[j]!;
      re[i * m + j] = Math.cos(t) * k;
      im[i * m + j] = Math.sin(t) * k;
    }
  return new CArray(re, im);
}
