/**
 * Noyau spectral du multicouche (kernel.py) : résolution, pour chaque nombre d'onde, du système
 * linéaire qui raccorde les solutions générales couche par couche.
 *
 * Notations (voir la notice, chapitre 3) :
 *   xi = |k| = sqrt(k1^2 + k2^2),  kappa = 3 - 4 nu = (lambda + 3 mu)/(lambda + mu)
 *   Déplacements transformés :  u_x = (i/xi)(k1 U - k2 V),  u_y = (i/xi)(k2 U + k1 V),  u_z = W
 *   Contraintes transformées :  sigma_zz = S,  sigma_xz = (i/xi)(k1 T - k2 R),
 *                               sigma_yz = (i/xi)(k2 T + k1 R)
 *   P-SV (U, W, T, S) et SH (V, R) sont découplés pour des couches isotropes.
 *
 * Solution générale dans une couche d'épaisseur h, cote locale s in [0, h] :
 *   famille descendante (tau = xi s)       : W = (A + B tau) e^-tau,  U = (-A + kappa B - B tau) e^-tau
 *   famille montante    (t = xi (h - s))   : W = (C + D t) e^-t,      U = ( C - kappa D + D t) e^-t
 *   SH : V = a e^-tau + b e^-t
 * Toutes les exponentielles sont décroissantes : le système reste bien conditionné pour les
 * grandes valeurs de xi h (pas de dépassement de capacité).
 *
 * Mise à l'échelle : les inconnues X sont les coefficients physiques multipliés par (mu_ref xi).
 * Les déplacements physiques valent donc poly(X) / (mu_ref xi) et les déformations poly(X)/mu_ref.
 *
 * Seul StiffnessKernel (le solveur par défaut du Python) est porté ; DenseKernel, conservé en
 * Python comme référence de vérification, ne l'est pas.
 *
 * Représentation : une grandeur est un CArray (une valeur par nombre d'onde du paquet) ; une
 * « matrice empilée » (M, p, q) du Python est ici un tableau p × q de CArray (type Mat).
 */
import { add, CArray, mul, sub, sumOfProducts } from "./carray";
import type { Structure } from "./structure";

/** Matrice p × q dont chaque élément est un tableau de M valeurs (une par nombre d'onde). */
export type Mat = CArray[][];

// ----------------------------------------------------------------------------------------
// Fonctions de base
// ----------------------------------------------------------------------------------------

/** Valeurs de chaque fonction de base (une colonne par coefficient A, B, C, D). */
type Columns = CArray[];

/**
 * Valeurs des fonctions de base P-SV en s. Renvoie U, W, dU, dW (une entrée par colonne :
 * 2 pour le massif semi-infini, 4 sinon).
 *
 * dU et dW sont les dérivées par rapport à tau = xi s (d/dz = xi d/dtau).
 */
export function psvBasis(xi: Float64Array, s: number, h: number, kappa: CArray, halfspace: boolean): { U: Columns; W: Columns; dU: Columns; dW: Columns } {
  const tau = CArray.real(xi).mul(s);
  const e1 = tau.neg().exp();
  const U = [e1.neg(), mul(kappa.sub(tau), e1)];
  const W = [e1, mul(tau, e1)];
  const dU = [e1, mul(kappa.add(1).neg().add(tau), e1)];
  const dW = [e1.neg(), mul(sub(1, tau), e1)];
  if (!halfspace) {
    const t = CArray.real(xi).mul(h - s);
    const e2 = t.neg().exp();
    U.push(e2, mul(kappa.neg().add(t), e2));
    W.push(e2, mul(t, e2));
    dU.push(e2, mul(kappa.add(1).neg().add(t), e2));
    dW.push(e2, mul(t.sub(1), e2));
  }
  return { U, W, dU, dW };
}

/** Fonctions de base SH en s : V, dV (1 colonne pour le massif semi-infini, 2 sinon). */
export function shBasis(xi: Float64Array, s: number, h: number, halfspace: boolean): { V: Columns; dV: Columns } {
  const e1 = CArray.real(xi).mul(-s).exp();
  const V = [e1];
  const dV = [e1.neg()];
  if (!halfspace) {
    const e2 = CArray.real(xi).mul(-(h - s)).exp();
    V.push(e2);
    dV.push(e2);
  }
  return { V, dV };
}

// ----------------------------------------------------------------------------------------
// Petites matrices empilées
// ----------------------------------------------------------------------------------------

/** Produit de petites matrices empilées (M, p, q) x (M, q, r), élément par élément. */
export function mm(A: Mat, B: Mat): Mat {
  return A.map((row) => B[0]!.map((_, j) => sumOfProducts(row, B.map((Bk) => Bk[j]!))));
}

const madd = (A: Mat, B: Mat): Mat => A.map((row, i) => row.map((a, j) => add(a, B[i]![j]!)));
const msub = (A: Mat, B: Mat): Mat => A.map((row, i) => row.map((a, j) => sub(a, B[i]![j]!)));
const mneg = (A: Mat): Mat => A.map((row) => row.map((a) => a.neg()));
const zerosMat = (p: number, q: number, M: number): Mat => Array.from({ length: p }, () => Array.from({ length: q }, () => CArray.zeros(M)));

/** Élément (i, j) d'une matrice empilée : le A[:, i, j] du Python. */
const at = (A: Mat, i: number, j: number): CArray => A[i]![j]!;

/** Sous-matrice aux lignes `rows` et colonnes `cols` (A[:, rows][:, :, cols]). */
const pick = (A: Mat, rows: readonly number[], cols: readonly number[]): Mat => rows.map((i) => cols.map((j) => A[i]![j]!));

/** Inverse de matrices 2x2 empilées (M, 2, 2). */
export function inv2(A: Mat): Mat {
  const [[a, b], [c, d]] = A as [[CArray, CArray], [CArray, CArray]];
  const det = a.mul(d).sub(b.mul(c));
  return [
    [d.div(det), b.neg().div(det)],
    [c.neg().div(det), a.div(det)],
  ];
}

/** Inverse d'une matrice 1x1 ou 2x2 empilée (np.linalg.solve des petits systèmes). */
const inv = (A: Mat): Mat => (A.length === 1 ? [[div1(A[0]![0]!)]] : inv2(A));
const div1 = (a: CArray) => CArray.full(a.size, 1).div(a);

/**
 * Inverse de matrices 4x4 empilées par blocs 2x2 (complément de Schur) : D = [[P, Q], [R, S]].
 * P (base descendante au toit) et S (base montante à la base) sont toujours inversibles
 * (det = -kappa et kappa).
 */
export function inv4Blocks(D: Mat): Mat {
  const P = pick(D, [0, 1], [0, 1]),
    Q = pick(D, [0, 1], [2, 3]),
    R = pick(D, [2, 3], [0, 1]),
    S = pick(D, [2, 3], [2, 3]);
  const Pi = inv2(P);
  const Sc = msub(S, mm(mm(R, Pi), Q));
  const Sci = inv2(Sc);
  const PiQ = mm(Pi, Q);
  const RPi = mm(R, Pi);
  const topLeft = madd(Pi, mm(mm(PiQ, Sci), RPi));
  const topRight = mneg(mm(PiQ, Sci));
  const bottomLeft = mneg(mm(Sci, RPi));
  return [
    [...topLeft[0]!, ...topRight[0]!],
    [...topLeft[1]!, ...topRight[1]!],
    [...bottomLeft[0]!, ...Sci[0]!],
    [...bottomLeft[1]!, ...Sci[1]!],
  ];
}

/** Bloc 2x2 d'une matrice 4x4 (K[:, r0:r0+2, c0:c0+2]). */
const block = (K: Mat, r0: number, c0: number): Mat => pick(K, [r0, r0 + 1], [c0, c0 + 1]);

/** Σ_c B[c] · X[c][q] (np.einsum("mc,mc->m", B, X[:, :, q])). */
function combine(B: Columns, X: Mat, q: number): CArray {
  return sumOfProducts(B, X.map((row) => row[q]!));
}

// ========================================================================================
// Solveur par matrices de rigidité de couche (méthode par défaut)
// ========================================================================================

/** Amplitudes (réduites) à une profondeur, pour des charges unitaires (voir atDepth). */
export interface Amplitudes {
  /** (U, W, dU, dW) pour une pression normale unitaire (p = 1 Pa, vers le bas). */
  n: [CArray, CArray, CArray, CArray];
  /** (U, W, dU, dW) pour T(0) = 1 (P-SV tangentiel), si tangential. */
  t?: [CArray, CArray, CArray, CArray];
  /** (V, dV) pour R(0) = 1, si tangential. */
  sh?: [CArray, CArray];
  lam: CArray;
  mu: CArray;
  muRef: Float64Array;
  layer: number;
}

type Condensation = { kind: "hs"; G: Mat } | { kind: "finite"; cidx: number[]; ridx: number[]; G: Mat };
type CondensationSH = { kind: "top" | "bot"; g: CArray } | { kind: "both" };

/**
 * Même problème que DenseKernel (Python), résolu par assemblage des matrices de rigidité de
 * couche.
 *
 * Pour chaque couche finie, la relation contraintes-déplacements des deux faces s'écrit
 * [T_t, S_t, T_b, S_b] = K_j [U_t, W_t, U_b, W_b], avec K_j = Q_j D_j^-1 construite à partir
 * de la base stable (exponentielles décroissantes). L'équilibre des faces conduit à un système
 * tridiagonal par blocs 2x2 (un bloc par face), résolu par l'algorithme de Thomas vectorisé.
 * Interfaces glissantes : condensation statique du déplacement horizontal de la face (T = 0),
 * remplacé par une inconnue muette.
 *
 * @param xi nombres d'onde radiaux > 0 [rad/m] (M valeurs)
 * @param lam, mu une entrée par couche, tableaux (M) complexes [Pa]
 * @param tangential si true, résout aussi les cas de charge tangentielle (P-SV et SH).
 */
export class StiffnessKernel {
  readonly st: Structure;
  readonly xi: Float64Array;
  readonly lam: CArray[];
  readonly mu: CArray[];
  readonly kappa: CArray[];
  readonly muRef: Float64Array;
  readonly h: number[];
  readonly half: boolean;
  readonly tangential: boolean;
  private readonly M: number;
  private cond = new Map<number, Condensation>();
  /** D^-1 de chaque couche, gardée depuis la résolution (le Python la recalcule dans _coefficients). */
  private Dinv: Mat[] = [];
  private condSh = new Map<number, CondensationSH>();
  /** (U, W) réduits par face : matrices 2 × nr (nr = 2 si tangentiel). */
  private faceDisp: Mat[] = [];
  private faceDispSh: CArray[] = [];

  constructor(structure: Structure, xi: Float64Array, lam: CArray[], mu: CArray[], tangential = false) {
    this.st = structure;
    this.xi = xi;
    if (xi.some((v) => !(v > 0))) throw new Error("xi doit être strictement positif (le mode xi = 0 est traité à part).");
    this.M = xi.length;
    this.lam = lam;
    this.mu = mu;
    this.kappa = lam.map((l, j) => l.add(mu[j]!.mul(3)).div(l.add(mu[j]!)));
    this.muRef = mu[0]!.abs();
    this.h = structure.thicknesses;
    this.half = structure.bottom === "halfspace";
    this.tangential = tangential;
    this.solvePsvStiff();
    if (tangential) this.solveShStiff();
  }

  private lastHalf(j: number): boolean {
    return this.half && j === this.st.n - 1;
  }

  // ------------------------------------------------------------------------------------
  /** U, W, T, S (et dU, dW) par colonne pour la couche j en s (P-SV). */
  private layerQuantities(j: number, s: number) {
    const { U, W, dU, dW } = psvBasis(this.xi, s, this.h[j]!, this.kappa[j]!, this.lastHalf(j));
    const lam = this.lam[j]!.div(this.muRef); // lam / mr
    const mu = this.mu[j]!.div(this.muRef); //   mu / mr
    const lam2mu = lam.add(mu.mul(2));
    const T = U.map((_, c) => mu.mul(dU[c]!.add(W[c]!))); //               T = mu / mr * (dU + W)
    const S = U.map((_, c) => lam2mu.mul(dW[c]!).sub(lam.mul(U[c]!))); // S = ((lam + 2 mu) dW - lam U) / mr
    return { U, W, dU, dW, T, S };
  }

  /** Faces (0 = toit, 1 = base) de la couche j bordées par une interface glissante. */
  private slipFaces(j: number): [boolean, boolean] {
    const n = this.st.n;
    const top = j > 0 && this.st.interfaces[j - 1] === "slip";
    const bot = j < n - 1 && this.st.interfaces[j] === "slip";
    return [top, bot];
  }

  /** Matrices D (déplacements) et Q (contraintes) des faces de la couche j. */
  private layerDQ(j: number): { D: Mat; Q: Mat } {
    const q0 = this.layerQuantities(j, 0);
    if (this.lastHalf(j)) return { D: [q0.U, q0.W], Q: [q0.T, q0.S] };
    const qh = this.layerQuantities(j, this.h[j]!);
    return { D: [q0.U, q0.W, qh.U, qh.W], Q: [q0.T, q0.S, qh.T, qh.S] };
  }

  private solvePsvStiff(): void {
    const st = this.st;
    const n = st.n;
    const M = this.M;
    const nf = this.half ? n : n + 1; // nombre de faces portant des inconnues
    const A = Array.from({ length: nf }, () => zerosMat(2, 2, M)); // blocs diagonaux
    const B = Array.from({ length: nf }, () => zerosMat(2, 2, M)); // blocs (f, f+1)
    const C = Array.from({ length: nf }, () => zerosMat(2, 2, M)); // blocs (f+1, f)
    this.cond = new Map();
    for (let j = 0; j < n; j++) {
      const { D, Q } = this.layerDQ(j);
      this.Dinv[j] = this.lastHalf(j) ? inv2(D) : inv4Blocks(D);
      if (this.lastHalf(j)) {
        let Kt = mneg(mm(Q, this.Dinv[j]!));
        const [top] = this.slipFaces(j);
        if (top) {
          // condensation de U_t (T_t = 0)
          const G = [[at(Kt, 0, 1).neg().div(at(Kt, 0, 0))]]; //                       -Kt01 / Kt00
          this.cond.set(j, { kind: "hs", G });
          const k11 = at(Kt, 1, 1).sub(at(Kt, 1, 0).mul(at(Kt, 0, 1)).div(at(Kt, 0, 0))); // Kt11 - Kt10 Kt01 / Kt00
          Kt = [
            [CArray.zeros(M), CArray.zeros(M)],
            [CArray.zeros(M), k11],
          ];
        }
        A[j] = madd(A[j]!, Kt);
        continue;
      }
      const K = mm(Q, this.Dinv[j]!);
      let Kt = K.map((row, i) => (i < 2 ? row.map((v) => v.neg()) : row)); // K * [-1, -1, 1, 1]
      const [top, bot] = this.slipFaces(j);
      const cidx = [top ? 0 : -1, bot ? 2 : -1].filter((i) => i >= 0);
      if (cidx.length) {
        const ridx = [0, 1, 2, 3].filter((i) => !cidx.includes(i));
        const Kcc = pick(Kt, cidx, cidx);
        const Kcr = pick(Kt, cidx, ridx);
        const Krc = pick(Kt, ridx, cidx);
        const Krr = pick(Kt, ridx, ridx);
        const G = mneg(mm(inv(Kcc), Kcr)); // u_c = G u_r
        const Kred = madd(Krr, mm(Krc, G));
        Kt = zerosMat(4, 4, M);
        ridx.forEach((r, a) => ridx.forEach((c, b) => (Kt[r]![c] = Kred[a]![b]!)));
        this.cond.set(j, { kind: "finite", cidx, ridx, G });
      }
      A[j] = madd(A[j]!, block(Kt, 0, 0));
      B[j] = madd(B[j]!, block(Kt, 0, 2));
      C[j] = madd(C[j]!, block(Kt, 2, 0));
      A[j + 1] = madd(A[j + 1]!, block(Kt, 2, 2));
    }
    // inconnues muettes (U aux interfaces glissantes)
    st.interfaces.forEach((c, i) => {
      if (c === "slip") A[i + 1]![0]![0] = at(A[i + 1]!, 0, 0).add(1);
    });
    // fond rigide
    const fixed: [number, number][] = st.bottom === "rigid_bonded" ? [[n, 0], [n, 1]] : st.bottom === "rigid_smooth" ? [[n, 1]] : [];
    for (const [f, d] of fixed) {
      for (let k = 0; k < 2; k++) {
        A[f]![d]![k] = CArray.zeros(M);
        A[f]![k]![d] = CArray.zeros(M);
        C[f - 1]![d]![k] = CArray.zeros(M);
        B[f - 1]![k]![d] = CArray.zeros(M);
      }
      A[f]![d]![d] = CArray.full(M, 1);
    }
    // second membre : traction de surface = -(T, S)
    const nr = this.tangential ? 2 : 1;
    const F = Array.from({ length: nf }, () => zerosMat(2, nr, M));
    F[0]![1]![0] = CArray.full(M, 1); // S(0) = -1  (pression unitaire)
    if (this.tangential) F[0]![0]![1] = CArray.full(M, -1); // T(0) = +1
    // Thomas par blocs
    const Ah: Mat[] = [A[0]!];
    const Fh: Mat[] = [F[0]!];
    for (let f = 1; f < nf; f++) {
      const L = mm(C[f - 1]!, inv2(Ah[f - 1]!));
      Ah[f] = msub(A[f]!, mm(L, B[f - 1]!));
      Fh[f] = msub(F[f]!, mm(L, Fh[f - 1]!));
    }
    const d: Mat[] = new Array<Mat>(nf);
    d[nf - 1] = mm(inv2(Ah[nf - 1]!), Fh[nf - 1]!);
    for (let f = nf - 2; f >= 0; f--) d[f] = mm(inv2(Ah[f]!), msub(Fh[f]!, mm(B[f]!, d[f + 1]!)));
    this.faceDisp = d;
  }

  /** Déplacements réels (U_t, W_t[, U_b, W_b]) de la couche j : 4 (ou 2) lignes × nr. */
  private layerFaceValues(j: number): Mat {
    const top = this.faceDisp[j]!;
    const cond = this.cond.get(j);
    if (this.lastHalf(j)) {
      const u = [...top];
      if (cond?.kind === "hs") u[0] = mm(cond.G, [u[1]!])[0]!;
      return u;
    }
    const u = [...top, ...this.faceDisp[j + 1]!];
    if (cond?.kind === "finite") {
      const uc = mm(cond.G, cond.ridx.map((i) => u[i]!));
      cond.cidx.forEach((i, k) => (u[i] = uc[k]!));
    }
    return u;
  }

  private coefficients(j: number): Mat {
    return mm(this.Dinv[j]!, this.layerFaceValues(j));
  }

  // ------------------------------------------------------------------------------------
  private solveShStiff(): void {
    const st = this.st;
    const n = st.n;
    const M = this.M;
    const nf = this.half ? n : n + 1;
    const a = Array.from({ length: nf }, () => CArray.zeros(M));
    const b = Array.from({ length: nf }, () => CArray.zeros(M));
    const c = Array.from({ length: nf }, () => CArray.zeros(M));
    this.condSh = new Map();

    const VR = (j: number, s: number) => {
      const { V, dV } = shBasis(this.xi, s, this.h[j]!, this.lastHalf(j));
      const muR = this.mu[j]!.div(this.muRef);
      return { V, R: dV.map((v) => muR.mul(v)) }; // R = mu / mr * dV
    };

    for (let j = 0; j < n; j++) {
      const [top, bot] = this.slipFaces(j);
      const { V: V0, R: R0 } = VR(j, 0);
      if (this.lastHalf(j)) {
        const kt = top ? CArray.zeros(M) : R0[0]!.neg().div(V0[0]!);
        a[j] = a[j]!.add(kt);
        continue;
      }
      const { V: Vh, R: Rh } = VR(j, this.h[j]!);
      const D = [V0, Vh];
      const Q = [R0, Rh];
      const K = mm(Q, inv2(D));
      let Kt = [K[0]!.map((v) => v.neg()), K[1]!]; // K * [-1, 1]
      if (top && bot) {
        Kt = zerosMat(2, 2, M);
        this.condSh.set(j, { kind: "both" });
      } else if (top) {
        // face du toit libre : condensation
        const k11 = at(Kt, 1, 1).sub(at(Kt, 1, 0).mul(at(Kt, 0, 1)).div(at(Kt, 0, 0))); // Kt11 - Kt10 Kt01 / Kt00
        this.condSh.set(j, { kind: "top", g: at(Kt, 0, 1).neg().div(at(Kt, 0, 0)) }); //    -Kt01 / Kt00
        Kt = zerosMat(2, 2, M);
        Kt[1]![1] = k11;
      } else if (bot) {
        const k00 = at(Kt, 0, 0).sub(at(Kt, 0, 1).mul(at(Kt, 1, 0)).div(at(Kt, 1, 1))); // Kt00 - Kt01 Kt10 / Kt11
        this.condSh.set(j, { kind: "bot", g: at(Kt, 1, 0).neg().div(at(Kt, 1, 1)) }); //    -Kt10 / Kt11
        Kt = zerosMat(2, 2, M);
        Kt[0]![0] = k00;
      }
      a[j] = a[j]!.add(at(Kt, 0, 0));
      b[j] = b[j]!.add(at(Kt, 0, 1));
      c[j] = c[j]!.add(at(Kt, 1, 0));
      a[j + 1] = a[j + 1]!.add(at(Kt, 1, 1));
    }
    st.interfaces.forEach((cc, i) => {
      if (cc === "slip") a[i + 1] = a[i + 1]!.add(1);
    });
    if (st.bottom === "rigid_bonded") {
      a[n] = CArray.full(M, 1);
      c[n - 1] = CArray.zeros(M);
      b[n - 1] = CArray.zeros(M);
    }
    const F = Array.from({ length: nf }, () => CArray.zeros(M));
    F[0] = CArray.full(M, -1); // R(0) = +1
    const ah: CArray[] = [a[0]!];
    const fh: CArray[] = [F[0]];
    for (let f = 1; f < nf; f++) {
      const L = c[f - 1]!.div(ah[f - 1]!);
      ah[f] = a[f]!.sub(L.mul(b[f - 1]!));
      fh[f] = F[f]!.sub(L.mul(fh[f - 1]!));
    }
    const d = new Array<CArray>(nf);
    d[nf - 1] = fh[nf - 1]!.div(ah[nf - 1]!);
    for (let f = nf - 2; f >= 0; f--) d[f] = fh[f]!.sub(b[f]!.mul(d[f + 1]!)).div(ah[f]!);
    this.faceDispSh = d;
  }

  /** Coefficients SH (a[, b]) de la couche j. */
  private coefficientsSh(j: number): Columns {
    const lastHalf = this.lastHalf(j);
    const { V: V0 } = shBasis(this.xi, 0, this.h[j]!, lastHalf);
    let top = this.faceDispSh[j]!;
    if (lastHalf) return [top.div(V0[0]!)];
    const { V: Vh } = shBasis(this.xi, this.h[j]!, this.h[j]!, lastHalf);
    let bot = this.faceDispSh[j + 1]!;
    const cond = this.condSh.get(j);
    if (cond) {
      // couche entre deux interfaces glissantes : aucun effort SH ne la traverse
      if (cond.kind === "both") return [CArray.zeros(this.M), CArray.zeros(this.M)];
      if (cond.kind === "top") top = cond.g.mul(bot);
      else bot = cond.g.mul(top);
    }
    const D = [V0, Vh];
    return mm(inv2(D), [[top], [bot]]).map((row) => row[0]!);
  }

  // ------------------------------------------------------------------------------------
  /**
   * Amplitudes (réduites) à la profondeur z pour charges unitaires. Les grandeurs sont
   * « réduites » : déplacement physique = valeur / (mu_ref xi), dérivée d/dz physique =
   * valeur / mu_ref.
   */
  atDepth(z: number, side: "above" | "below" = "above"): Amplitudes {
    const [j, s] = this.st.locate(z, side);
    const lastHalf = this.lastHalf(j);
    const { U, W, dU, dW } = psvBasis(this.xi, s, this.h[j]!, this.kappa[j]!, lastHalf);
    const X = this.coefficients(j);
    const out: Amplitudes = {
      n: [combine(U, X, 0), combine(W, X, 0), combine(dU, X, 0), combine(dW, X, 0)],
      lam: this.lam[j]!,
      mu: this.mu[j]!,
      muRef: this.muRef,
      layer: j,
    };
    if (this.tangential) {
      out.t = [combine(U, X, 1), combine(W, X, 1), combine(dU, X, 1), combine(dW, X, 1)];
      const { V, dV } = shBasis(this.xi, s, this.h[j]!, lastHalf);
      const Xs = this.coefficientsSh(j).map((x) => [x]);
      out.sh = [combine(V, Xs, 0), combine(dV, Xs, 0)];
    }
    return out;
  }
}
