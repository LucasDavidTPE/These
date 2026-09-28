/**
 * Noyau spectral du multicouche (portage de StiffnessKernel, chausspec/kernel.py) : pour un
 * nombre d'onde ξ, raccordement des solutions générales couche par couche par matrices de
 * rigidité de couche et algorithme de Thomas par blocs 2×2.
 *
 * Notations (notice, chapitre 3) : κ = (λ + 3μ)/(λ + μ) ; P-SV (U, W, T, S) et SH (V, R).
 * Famille descendante (τ = ξs) : W = (A + Bτ)e^−τ, U = (−A + κB − Bτ)e^−τ ;
 * montante (t = ξ(h − s)) : W = (C + Dt)e^−t, U = (C − κD + Dt)e^−t ; SH : V = a e^−τ + b e^−t.
 * Les inconnues sont mises à l'échelle par μ_ref ξ (μ_ref = |μ de la couche 1|).
 *
 * Écriture « bas niveau » : complexes entrelacés dans des Float64Array réutilisées, le noyau
 * étant évalué des centaines de milliers de fois par calcul.
 */
import type { Structure } from "./structure";

type M = Float64Array; // matrice complexe entrelacée, lignes × colonnes

/** out(r×q) = A(r×p) · B(p×q) */
function mm(A: M, r: number, p: number, B: M, q: number, out: M): M {
  for (let i = 0; i < r; i++)
    for (let j = 0; j < q; j++) {
      let re = 0,
        im = 0;
      for (let k = 0; k < p; k++) {
        const a = 2 * (i * p + k),
          b = 2 * (k * q + j);
        re += A[a]! * B[b]! - A[a + 1]! * B[b + 1]!;
        im += A[a]! * B[b + 1]! + A[a + 1]! * B[b]!;
      }
      out[2 * (i * q + j)] = re;
      out[2 * (i * q + j) + 1] = im;
    }
  return out;
}

function inv2(A: M, out: M): M {
  const ar = A[0]!,
    ai = A[1]!,
    br = A[2]!,
    bi = A[3]!,
    cr = A[4]!,
    ci = A[5]!,
    dr = A[6]!,
    di = A[7]!;
  const detr = ar * dr - ai * di - (br * cr - bi * ci),
    deti = ar * di + ai * dr - (br * ci + bi * cr);
  const n = detr * detr + deti * deti;
  const ir = detr / n,
    ii = -deti / n; // 1/det
  out[0] = dr * ir - di * ii;
  out[1] = dr * ii + di * ir;
  out[2] = -(br * ir - bi * ii);
  out[3] = -(br * ii + bi * ir);
  out[4] = -(cr * ir - ci * ii);
  out[5] = -(cr * ii + ci * ir);
  out[6] = ar * ir - ai * ii;
  out[7] = ar * ii + ai * ir;
  return out;
}

const sub = (A: M, B: M, out: M): M => {
  for (let i = 0; i < out.length; i++) out[i] = A[i]! - B[i]!;
  return out;
};

/** Bloc 2×2 (ligne r0, colonne c0) d'une matrice 4×4. */
function bloc(D: M, r0: number, c0: number, out: M): M {
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      out[2 * (i * 2 + j)] = D[2 * ((r0 + i) * 4 + c0 + j)]!;
      out[2 * (i * 2 + j) + 1] = D[2 * ((r0 + i) * 4 + c0 + j) + 1]!;
    }
  return out;
}
function poserBloc(out: M, r0: number, c0: number, B: M, signe = 1): void {
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      out[2 * ((r0 + i) * 4 + c0 + j)] = signe * B[2 * (i * 2 + j)]!;
      out[2 * ((r0 + i) * 4 + c0 + j) + 1] = signe * B[2 * (i * 2 + j) + 1]!;
    }
}

const w2 = () => new Float64Array(8);

/** Inverse 4×4 par blocs (complément de Schur), comme _inv4_blocks. */
function inv4(D: M, out: M, t: M[]): M {
  const [P, Q, R, S, Pi, Sc, Sci, PiQ, RPi, a, b] = t as [M, M, M, M, M, M, M, M, M, M, M];
  bloc(D, 0, 0, P);
  bloc(D, 0, 2, Q);
  bloc(D, 2, 0, R);
  bloc(D, 2, 2, S);
  inv2(P, Pi);
  mm(R, 2, 2, Pi, 2, RPi);
  mm(Pi, 2, 2, Q, 2, PiQ);
  sub(S, mm(RPi, 2, 2, Q, 2, a), Sc);
  inv2(Sc, Sci);
  // haut gauche : Pi + PiQ Sci RPi
  mm(mm(PiQ, 2, 2, Sci, 2, a), 2, 2, RPi, 2, b);
  for (let i = 0; i < 8; i++) b[i] = b[i]! + Pi[i]!;
  poserBloc(out, 0, 0, b);
  poserBloc(out, 0, 2, mm(PiQ, 2, 2, Sci, 2, a), -1);
  poserBloc(out, 2, 0, mm(Sci, 2, 2, RPi, 2, a), -1);
  poserBloc(out, 2, 2, Sci);
  return out;
}

/** Bases P-SV en s : U, W, dU, dW (4 colonnes, ou 2 pour le massif semi-infini). */
function basePSV(xi: number, s: number, h: number, kr: number, ki: number, demi: boolean, U: M, W: M, dU: M, dW: M): number {
  const tau = xi * s,
    e1 = Math.exp(-tau);
  U.fill(0);
  W.fill(0);
  dU.fill(0);
  dW.fill(0);
  U[0] = -e1;
  U[2] = (kr - tau) * e1;
  U[3] = ki * e1;
  W[0] = e1;
  W[2] = tau * e1;
  dU[0] = e1;
  dU[2] = (-(1 + kr) + tau) * e1;
  dU[3] = -ki * e1;
  dW[0] = -e1;
  dW[2] = (1 - tau) * e1;
  if (demi) return 2;
  const t = xi * (h - s),
    e2 = Math.exp(-t);
  U[4] = e2;
  U[6] = (-kr + t) * e2;
  U[7] = -ki * e2;
  W[4] = e2;
  W[6] = t * e2;
  dU[4] = e2;
  dU[6] = (-(1 + kr) + t) * e2;
  dU[7] = -ki * e2;
  dW[4] = e2;
  dW[6] = (-1 + t) * e2;
  return 4;
}

export interface Amplitudes {
  couche: number;
  /** U, W, dU, dW (charge normale unitaire), complexes entrelacés. */
  n: Float64Array;
  /** U, W, dU, dW (T(0) = 1), si tangentiel. */
  t: Float64Array;
  /** V, dV (R(0) = 1), si tangentiel. */
  sh: Float64Array;
}

/**
 * Noyau pour une structure donnée ; `resoudre` le calcule pour un ξ et des modules de Lamé
 * (λ, μ par couche, entrelacés), `amplitudes` en donne les amplitudes réduites à une cote.
 */
export class Noyau {
  private readonly n: number;
  private readonly h: number[];
  private readonly demi: boolean;
  private readonly nf: number;
  private readonly nr: number;
  // modules de la résolution en cours
  private xi = 1;
  private lam!: Float64Array;
  private mu!: Float64Array;
  private kap = new Float64Array(0);
  mr = 1;
  // espaces de travail
  private readonly U = new Float64Array(8);
  private readonly W = new Float64Array(8);
  private readonly dU = new Float64Array(8);
  private readonly dW = new Float64Array(8);
  private readonly T = new Float64Array(8);
  private readonly S = new Float64Array(8);
  private readonly D: M[];
  private readonly Dinv: M[];
  private readonly Q = new Float64Array(32);
  private readonly K = new Float64Array(32);
  private readonly tmp4 = Array.from({ length: 11 }, w2);
  private readonly A: M[];
  private readonly B: M[];
  private readonly Cc: M[];
  private readonly F: M[];
  private readonly Ah: M[];
  private readonly Fh: M[];
  private readonly d: M[];
  private readonly cond: ({ type: "hs"; G: [number, number] } | { type: "fini"; cidx: number[]; ridx: number[]; G: Float64Array } | null)[];
  // SH
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly c: Float64Array;
  private readonly dsh: Float64Array;
  private readonly condSh: ({ type: "top" | "bot"; g: [number, number] } | { type: "both" } | null)[];

  constructor(
    private readonly st: Structure,
    private readonly tangentiel: boolean,
  ) {
    this.n = st.n;
    this.h = st.epaisseurs;
    this.demi = st.fond === "halfspace";
    this.nf = this.demi ? this.n : this.n + 1;
    this.nr = tangentiel ? 2 : 1;
    this.D = Array.from({ length: this.n }, () => new Float64Array(32));
    this.Dinv = Array.from({ length: this.n }, () => new Float64Array(32));
    const blocs = () => Array.from({ length: this.nf }, w2);
    this.A = blocs();
    this.B = blocs();
    this.Cc = blocs();
    this.Ah = blocs();
    const rhs = () => Array.from({ length: this.nf }, () => new Float64Array(4 * this.nr));
    this.F = rhs();
    this.Fh = rhs();
    this.d = rhs();
    this.cond = Array<null>(this.n).fill(null);
    this.a = new Float64Array(2 * this.nf);
    this.b = new Float64Array(2 * this.nf);
    this.c = new Float64Array(2 * this.nf);
    this.dsh = new Float64Array(2 * this.nf);
    this.condSh = Array<null>(this.n).fill(null);
  }

  private derniereDemi(j: number) {
    return this.demi && j === this.n - 1;
  }

  /** U, W, dU, dW, T, S de la couche j en s ; renvoie le nombre de colonnes. */
  private grandeurs(j: number, s: number): number {
    const nc = basePSV(this.xi, s, this.h[j]!, this.kap[2 * j]!, this.kap[2 * j + 1]!, this.derniereDemi(j), this.U, this.W, this.dU, this.dW);
    const lr = this.lam[2 * j]!,
      li = this.lam[2 * j + 1]!,
      mr0 = this.mu[2 * j]!,
      mi0 = this.mu[2 * j + 1]!,
      mr = this.mr;
    for (let k = 0; k < nc; k++) {
      const o = 2 * k;
      // T = μ/mr (dU + W)
      const sr = this.dU[o]! + this.W[o]!,
        si = this.dU[o + 1]! + this.W[o + 1]!;
      this.T[o] = (mr0 * sr - mi0 * si) / mr;
      this.T[o + 1] = (mr0 * si + mi0 * sr) / mr;
      // S = ((λ + 2μ) dW − λ U) / mr
      const pr = lr + 2 * mr0,
        pi = li + 2 * mi0;
      const ar = pr * this.dW[o]! - pi * this.dW[o + 1]! - (lr * this.U[o]! - li * this.U[o + 1]!),
        ai = pr * this.dW[o + 1]! + pi * this.dW[o]! - (lr * this.U[o + 1]! + li * this.U[o]!);
      this.S[o] = ar / mr;
      this.S[o + 1] = ai / mr;
    }
    return nc;
  }

  /** Ligne r de la matrice (nc colonnes) ← vecteur v. */
  private static ligne(Mx: M, r: number, nc: number, v: M) {
    for (let k = 0; k < nc; k++) {
      Mx[2 * (r * nc + k)] = v[2 * k]!;
      Mx[2 * (r * nc + k) + 1] = v[2 * k + 1]!;
    }
  }

  private faces(j: number): [boolean, boolean] {
    const inter = this.st.interfaces;
    return [j > 0 && inter[j - 1] === "slip", j < this.n - 1 && inter[j] === "slip"];
  }

  /** D et Q de la couche j (faces du toit et de la base), et D⁻¹. */
  private DQ(j: number): number {
    const D = this.D[j]!,
      Q = this.Q;
    if (this.derniereDemi(j)) {
      this.grandeurs(j, 0);
      Noyau.ligne(D, 0, 2, this.U);
      Noyau.ligne(D, 1, 2, this.W);
      Noyau.ligne(Q, 0, 2, this.T);
      Noyau.ligne(Q, 1, 2, this.S);
      inv2(D, this.Dinv[j]!);
      return 2;
    }
    this.grandeurs(j, 0);
    Noyau.ligne(D, 0, 4, this.U);
    Noyau.ligne(D, 1, 4, this.W);
    Noyau.ligne(Q, 0, 4, this.T);
    Noyau.ligne(Q, 1, 4, this.S);
    this.grandeurs(j, this.h[j]!);
    Noyau.ligne(D, 2, 4, this.U);
    Noyau.ligne(D, 3, 4, this.W);
    Noyau.ligne(Q, 2, 4, this.T);
    Noyau.ligne(Q, 3, 4, this.S);
    inv4(D, this.Dinv[j]!, this.tmp4);
    return 4;
  }

  /** Résout le système pour ξ > 0 ; lam, mu : (λ, μ) de chaque couche, entrelacés (Pa). */
  resoudre(xi: number, lam: Float64Array, mu: Float64Array): void {
    if (!(xi > 0)) throw new Error("ξ doit être strictement positif (le mode ξ = 0 est traité à part).");
    this.xi = xi;
    this.lam = lam;
    this.mu = mu;
    const n = this.n;
    if (this.kap.length !== 2 * n) this.kap = new Float64Array(2 * n);
    for (let j = 0; j < n; j++) {
      // κ = (λ + 3μ)/(λ + μ)
      const nr = lam[2 * j]! + 3 * mu[2 * j]!,
        ni = lam[2 * j + 1]! + 3 * mu[2 * j + 1]!,
        dr = lam[2 * j]! + mu[2 * j]!,
        di = lam[2 * j + 1]! + mu[2 * j + 1]!;
      const q = dr * dr + di * di;
      this.kap[2 * j] = (nr * dr + ni * di) / q;
      this.kap[2 * j + 1] = (ni * dr - nr * di) / q;
    }
    this.mr = Math.hypot(mu[0]!, mu[1]!);
    this.resoudrePSV();
    if (this.tangentiel) this.resoudreSH();
  }

  private resoudrePSV() {
    const n = this.n,
      nf = this.nf,
      nr = this.nr;
    for (const X of [this.A, this.B, this.Cc]) for (const m of X) m.fill(0);
    for (let j = 0; j < n; j++) {
      this.cond[j] = null;
      const nc = this.DQ(j);
      if (nc === 2) {
        // Kt = −Q D⁻¹
        const Kt = mm(this.Q, 2, 2, this.Dinv[j]!, 2, this.tmp4[9]!);
        for (let i = 0; i < 8; i++) Kt[i] = -Kt[i]!;
        const [top] = this.faces(j);
        if (top) {
          // condensation de U_t (T_t = 0) : G = −Kt01/Kt00
          const g = cdivS(-Kt[2]!, -Kt[3]!, Kt[0]!, Kt[1]!);
          this.cond[j] = { type: "hs", G: g };
          const r = cdivS(...cmulS(Kt[4]!, Kt[5]!, Kt[2]!, Kt[3]!), Kt[0]!, Kt[1]!);
          Kt[6] = Kt[6]! - r[0];
          Kt[7] = Kt[7]! - r[1];
          for (const i of [0, 1, 2, 3, 4, 5]) Kt[i] = 0;
        }
        for (let i = 0; i < 8; i++) this.A[j]![i] = this.A[j]![i]! + Kt[i]!;
        continue;
      }
      const K = mm(this.Q, 4, 4, this.Dinv[j]!, 4, this.K);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 8; k++) K[r * 8 + k] = -K[r * 8 + k]!; // lignes du toit : signe −
      const [top, bot] = this.faces(j);
      const cidx = [top ? 0 : -1, bot ? 2 : -1].filter((i) => i >= 0);
      if (cidx.length) {
        const ridx = [0, 1, 2, 3].filter((i) => !cidx.includes(i));
        const nc2 = cidx.length,
          nr2 = ridx.length;
        const el = (r: number, cc: number): [number, number] => [K[2 * (r * 4 + cc)]!, K[2 * (r * 4 + cc) + 1]!];
        // G = −Kcc⁻¹ Kcr  (nc2 × nr2)
        const G = new Float64Array(2 * nc2 * nr2);
        if (nc2 === 1) {
          const [kr, ki] = el(cidx[0]!, cidx[0]!);
          for (let q = 0; q < nr2; q++) {
            const [a, b] = el(cidx[0]!, ridx[q]!);
            const g = cdivS(-a, -b, kr, ki);
            G[2 * q] = g[0];
            G[2 * q + 1] = g[1];
          }
        } else {
          const Kcc = new Float64Array(8);
          for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) [Kcc[2 * (i * 2 + k)], Kcc[2 * (i * 2 + k) + 1]] = el(cidx[i]!, cidx[k]!);
          const Kcr = new Float64Array(2 * 2 * nr2);
          for (let i = 0; i < 2; i++) for (let q = 0; q < nr2; q++) [Kcr[2 * (i * nr2 + q)], Kcr[2 * (i * nr2 + q) + 1]] = el(cidx[i]!, ridx[q]!);
          mm(inv2(Kcc, new Float64Array(8)), 2, 2, Kcr, nr2, G);
          for (let i = 0; i < G.length; i++) G[i] = -G[i]!;
        }
        // Kred = Krr + Krc G
        const Kred = new Float64Array(2 * nr2 * nr2);
        for (let r = 0; r < nr2; r++)
          for (let q = 0; q < nr2; q++) {
            let [re, im] = el(ridx[r]!, ridx[q]!);
            for (let k = 0; k < nc2; k++) {
              const [a, b] = el(ridx[r]!, cidx[k]!);
              const gr = G[2 * (k * nr2 + q)]!,
                gi = G[2 * (k * nr2 + q) + 1]!;
              re += a * gr - b * gi;
              im += a * gi + b * gr;
            }
            Kred[2 * (r * nr2 + q)] = re;
            Kred[2 * (r * nr2 + q) + 1] = im;
          }
        K.fill(0);
        for (let r = 0; r < nr2; r++)
          for (let q = 0; q < nr2; q++) {
            K[2 * (ridx[r]! * 4 + ridx[q]!)] = Kred[2 * (r * nr2 + q)]!;
            K[2 * (ridx[r]! * 4 + ridx[q]!) + 1] = Kred[2 * (r * nr2 + q) + 1]!;
          }
        this.cond[j] = { type: "fini", cidx, ridx, G };
      }
      const t = this.tmp4[10]!;
      const ajoute = (dest: M) => {
        for (let i = 0; i < 8; i++) dest[i] = dest[i]! + t[i]!;
      };
      bloc(K, 0, 0, t);
      ajoute(this.A[j]!);
      bloc(K, 0, 2, t);
      ajoute(this.B[j]!);
      bloc(K, 2, 0, t);
      ajoute(this.Cc[j]!);
      bloc(K, 2, 2, t);
      ajoute(this.A[j + 1]!);
    }
    // inconnues muettes (U aux interfaces glissantes)
    this.st.interfaces.forEach((ci, i) => {
      if (ci === "slip") this.A[i + 1]![0] = this.A[i + 1]![0]! + 1;
    });
    // fond rigide
    const fixes: [number, number][] = this.st.fond === "rigid_bonded" ? [[n, 0], [n, 1]] : this.st.fond === "rigid_smooth" ? [[n, 1]] : [];
    for (const [f, dd] of fixes) {
      const Af = this.A[f]!;
      for (let k = 0; k < 2; k++) {
        Af[2 * (dd * 2 + k)] = 0;
        Af[2 * (dd * 2 + k) + 1] = 0;
        Af[2 * (k * 2 + dd)] = 0;
        Af[2 * (k * 2 + dd) + 1] = 0;
      }
      Af[2 * (dd * 2 + dd)] = 1;
      const Cf = this.Cc[f - 1]!,
        Bf = this.B[f - 1]!;
      for (let k = 0; k < 2; k++) {
        Cf[2 * (dd * 2 + k)] = 0;
        Cf[2 * (dd * 2 + k) + 1] = 0;
        Bf[2 * (k * 2 + dd)] = 0;
        Bf[2 * (k * 2 + dd) + 1] = 0;
      }
    }
    // second membre : traction de surface = −(T, S)
    for (const m of this.F) m.fill(0);
    this.F[0]![2 * (1 * nr + 0)] = 1; // S(0) = −1
    if (this.tangentiel) this.F[0]![2 * (0 * nr + 1)] = -1; // T(0) = +1
    // Thomas par blocs
    const L = this.tmp4[0]!,
      inv = this.tmp4[1]!,
      LB = this.tmp4[2]!;
    const LF = new Float64Array(4 * nr),
      tmpF = new Float64Array(4 * nr);
    this.Ah[0]!.set(this.A[0]!);
    this.Fh[0]!.set(this.F[0]!);
    for (let f = 1; f < nf; f++) {
      mm(this.Cc[f - 1]!, 2, 2, inv2(this.Ah[f - 1]!, inv), 2, L);
      sub(this.A[f]!, mm(L, 2, 2, this.B[f - 1]!, 2, LB), this.Ah[f]!);
      sub(this.F[f]!, mm(L, 2, 2, this.Fh[f - 1]!, nr, LF), this.Fh[f]!);
    }
    mm(inv2(this.Ah[nf - 1]!, inv), 2, 2, this.Fh[nf - 1]!, nr, this.d[nf - 1]!);
    for (let f = nf - 2; f >= 0; f--) {
      sub(this.Fh[f]!, mm(this.B[f]!, 2, 2, this.d[f + 1]!, nr, LF), tmpF);
      mm(inv2(this.Ah[f]!, inv), 2, 2, tmpF, nr, this.d[f]!);
    }
  }

  /** Déplacements réels des faces de la couche j (après condensation). */
  private valeursFaces(j: number, out: M): number {
    const nr = this.nr;
    const top = this.d[j]!;
    if (this.derniereDemi(j)) {
      out.set(top);
      const cd = this.cond[j];
      if (cd && cd.type === "hs") {
        for (let q = 0; q < nr; q++) {
          const [re, im] = cmulS(cd.G[0], cd.G[1], out[2 * (1 * nr + q)]!, out[2 * (1 * nr + q) + 1]!);
          out[2 * q] = re;
          out[2 * q + 1] = im;
        }
      }
      return 2;
    }
    out.set(top, 0);
    out.set(this.d[j + 1]!, 4 * nr);
    const cd = this.cond[j];
    if (cd && cd.type === "fini") {
      const { cidx, ridx, G } = cd;
      const nr2 = ridx.length;
      for (let k = 0; k < cidx.length; k++)
        for (let q = 0; q < nr; q++) {
          let re = 0,
            im = 0;
          for (let r = 0; r < nr2; r++) {
            const gr = G[2 * (k * nr2 + r)]!,
              gi = G[2 * (k * nr2 + r) + 1]!;
            const ur = out[2 * (ridx[r]! * nr + q)]!,
              ui = out[2 * (ridx[r]! * nr + q) + 1]!;
            re += gr * ur - gi * ui;
            im += gr * ui + gi * ur;
          }
          out[2 * (cidx[k]! * nr + q)] = re;
          out[2 * (cidx[k]! * nr + q) + 1] = im;
        }
    }
    return 4;
  }

  /* ─────────────────────────── SH ─────────────────────────── */

  private resoudreSH() {
    const n = this.n,
      nf = this.nf;
    const { a, b, c } = this;
    a.fill(0);
    b.fill(0);
    c.fill(0);
    const mr = this.mr;
    for (let j = 0; j < n; j++) {
      this.condSh[j] = null;
      const demi = this.derniereDemi(j);
      const [top, bot] = this.faces(j);
      const xi = this.xi,
        h = this.h[j]!;
      const mur = this.mu[2 * j]! / mr,
        mui = this.mu[2 * j + 1]! / mr;
      // s = 0 : V = [1, e^−ξh], dV = [−1, e^−ξh] ; R = μ/mr dV
      if (demi) {
        // kt = −R0/V0 = μ/mr
        if (!top) {
          a[2 * j] = a[2 * j]! + mur;
          a[2 * j + 1] = a[2 * j + 1]! + mui;
        }
        continue;
      }
      const e = Math.exp(-xi * h);
      // D = [[1, e], [e, 1]] ; Q = μ/mr [[−1, e], [−e, 1]]
      const det = 1 - e * e;
      // K = Q D⁻¹ = μ/mr [[−1, e], [−e, 1]] · [[1, −e], [−e, 1]] / det
      const k00 = (-1 - e * e) / det,
        k01 = (e + e) / det,
        k10 = (-e - e) / det,
        k11 = (e * e + 1) / det;
      // Kt = K · [−1, 1] (lignes)
      let K = [
        [-k00 * mur, -k00 * mui],
        [-k01 * mur, -k01 * mui],
        [k10 * mur, k10 * mui],
        [k11 * mur, k11 * mui],
      ] as [number, number][];
      if (top && bot) {
        K = [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ];
        this.condSh[j] = { type: "both" };
      } else if (top) {
        const r = cdivS(...cmulS(...K[2]!, ...K[1]!), ...K[0]!);
        const g = cdivS(-K[1]![0], -K[1]![1], ...K[0]!);
        this.condSh[j] = { type: "top", g };
        K = [
          [0, 0],
          [0, 0],
          [0, 0],
          [K[3]![0] - r[0], K[3]![1] - r[1]],
        ];
      } else if (bot) {
        const r = cdivS(...cmulS(...K[1]!, ...K[2]!), ...K[3]!);
        const g = cdivS(-K[2]![0], -K[2]![1], ...K[3]!);
        this.condSh[j] = { type: "bot", g };
        K = [
          [K[0]![0] - r[0], K[0]![1] - r[1]],
          [0, 0],
          [0, 0],
          [0, 0],
        ];
      }
      a[2 * j] = a[2 * j]! + K[0]![0];
      a[2 * j + 1] = a[2 * j + 1]! + K[0]![1];
      b[2 * j] = b[2 * j]! + K[1]![0];
      b[2 * j + 1] = b[2 * j + 1]! + K[1]![1];
      c[2 * j] = c[2 * j]! + K[2]![0];
      c[2 * j + 1] = c[2 * j + 1]! + K[2]![1];
      a[2 * (j + 1)] = a[2 * (j + 1)]! + K[3]![0];
      a[2 * (j + 1) + 1] = a[2 * (j + 1) + 1]! + K[3]![1];
    }
    this.st.interfaces.forEach((ci, i) => {
      if (ci === "slip") a[2 * (i + 1)] = a[2 * (i + 1)]! + 1;
    });
    if (this.st.fond === "rigid_bonded") {
      a[2 * n] = 1;
      a[2 * n + 1] = 0;
      c[2 * (n - 1)] = 0;
      c[2 * (n - 1) + 1] = 0;
      b[2 * (n - 1)] = 0;
      b[2 * (n - 1) + 1] = 0;
    }
    // Thomas scalaire, F[0] = −1
    const ah = new Float64Array(2 * nf),
      fh = new Float64Array(2 * nf);
    ah[0] = a[0]!;
    ah[1] = a[1]!;
    fh[0] = -1;
    fh[1] = 0;
    for (let f = 1; f < nf; f++) {
      const L = cdivS(c[2 * (f - 1)]!, c[2 * (f - 1) + 1]!, ah[2 * (f - 1)]!, ah[2 * (f - 1) + 1]!);
      const lb = cmulS(L[0], L[1], b[2 * (f - 1)]!, b[2 * (f - 1) + 1]!);
      ah[2 * f] = a[2 * f]! - lb[0];
      ah[2 * f + 1] = a[2 * f + 1]! - lb[1];
      const lf = cmulS(L[0], L[1], fh[2 * (f - 1)]!, fh[2 * (f - 1) + 1]!);
      fh[2 * f] = -lf[0];
      fh[2 * f + 1] = -lf[1];
    }
    const d = this.dsh;
    const last = cdivS(fh[2 * (nf - 1)]!, fh[2 * (nf - 1) + 1]!, ah[2 * (nf - 1)]!, ah[2 * (nf - 1) + 1]!);
    d[2 * (nf - 1)] = last[0];
    d[2 * (nf - 1) + 1] = last[1];
    for (let f = nf - 2; f >= 0; f--) {
      const bd = cmulS(b[2 * f]!, b[2 * f + 1]!, d[2 * (f + 1)]!, d[2 * (f + 1) + 1]!);
      const v = cdivS(fh[2 * f]! - bd[0], fh[2 * f + 1]! - bd[1], ah[2 * f]!, ah[2 * f + 1]!);
      d[2 * f] = v[0];
      d[2 * f + 1] = v[1];
    }
  }

  /** Coefficients SH (a, b) de la couche j. */
  private coefSH(j: number): [number, number, number, number] {
    const d = this.dsh;
    const top: [number, number] = [d[2 * j]!, d[2 * j + 1]!];
    if (this.derniereDemi(j)) return [top[0], top[1], 0, 0]; // V0 = 1
    let bot: [number, number] = [d[2 * (j + 1)]!, d[2 * (j + 1) + 1]!];
    let t = top;
    const cd = this.condSh[j];
    if (cd) {
      if (cd.type === "both") return [0, 0, 0, 0];
      if (cd.type === "top") t = cmulS(cd.g[0], cd.g[1], bot[0], bot[1]);
      else bot = cmulS(cd.g[0], cd.g[1], top[0], top[1]);
    }
    const e = Math.exp(-this.xi * this.h[j]!),
      det = 1 - e * e;
    // [[1, e], [e, 1]]⁻¹ = [[1, −e], [−e, 1]] / det
    return [(t[0] - e * bot[0]) / det, (t[1] - e * bot[1]) / det, (-e * t[0] + bot[0]) / det, (-e * t[1] + bot[1]) / det];
  }

  /* ─────────────────────────── amplitudes ─────────────────────────── */

  private readonly faceVals = new Float64Array(16);
  private readonly X = new Float64Array(16);

  /** Amplitudes réduites à la profondeur z (déplacement physique = valeur / (μ_ref ξ)). */
  amplitudes(z: number, cote: "above" | "below", out: Amplitudes): Amplitudes {
    const [j, s] = this.st.localiser(z, cote);
    out.couche = j;
    const nr = this.nr;
    const nc = this.valeursFaces(j, this.faceVals);
    mm(this.Dinv[j]!, nc, nc, this.faceVals, nr, this.X);
    basePSV(this.xi, s, this.h[j]!, this.kap[2 * j]!, this.kap[2 * j + 1]!, this.derniereDemi(j), this.U, this.W, this.dU, this.dW);
    const proj = (B: M, q: number, dest: Float64Array, o: number) => {
      let re = 0,
        im = 0;
      for (let k = 0; k < nc; k++) {
        const xr = this.X[2 * (k * nr + q)]!,
          xim = this.X[2 * (k * nr + q) + 1]!;
        re += B[2 * k]! * xr - B[2 * k + 1]! * xim;
        im += B[2 * k]! * xim + B[2 * k + 1]! * xr;
      }
      dest[o] = re;
      dest[o + 1] = im;
    };
    [this.U, this.W, this.dU, this.dW].forEach((B, i) => proj(B, 0, out.n, 2 * i));
    if (this.tangentiel) {
      [this.U, this.W, this.dU, this.dW].forEach((B, i) => proj(B, 1, out.t, 2 * i));
      const [ar, ai, br, bi] = this.coefSH(j);
      const tau = this.xi * s,
        e1 = Math.exp(-tau);
      if (this.derniereDemi(j)) {
        out.sh[0] = e1 * ar;
        out.sh[1] = e1 * ai;
        out.sh[2] = -e1 * ar;
        out.sh[3] = -e1 * ai;
      } else {
        const e2 = Math.exp(-this.xi * (this.h[j]! - s));
        out.sh[0] = e1 * ar + e2 * br;
        out.sh[1] = e1 * ai + e2 * bi;
        out.sh[2] = -e1 * ar + e2 * br;
        out.sh[3] = -e1 * ai + e2 * bi;
      }
    }
    return out;
  }

  lameCouche(j: number): [number, number, number, number] {
    return [this.lam[2 * j]!, this.lam[2 * j + 1]!, this.mu[2 * j]!, this.mu[2 * j + 1]!];
  }
}

export const nouvellesAmplitudes = (): Amplitudes => ({ couche: 0, n: new Float64Array(8), t: new Float64Array(8), sh: new Float64Array(4) });

function cmulS(ar: number, ai: number, br: number, bi: number): [number, number] {
  return [ar * br - ai * bi, ar * bi + ai * br];
}
function cdivS(ar: number, ai: number, br: number, bi: number): [number, number] {
  const q = br * br + bi * bi;
  return [(ar * br + ai * bi) / q, (ai * br - ar * bi) / q];
}
