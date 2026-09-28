/**
 * Solveur « champ » (portage de chausspec/grid.py) : double transformée de Fourier sur une
 * grille (x, y), avec la partition de l'unité de la notice (§4.4) :
 *   F = (1 − φ(k1)) F                → FFT 2D (périodique, de moyenne nulle en x)
 *     + φ(k1) (1 − ψ(k2)) F          → intégrale continue en k1, FFT en y
 *     + φ(k1) ψ(k2) F                → intégrale continue 2D (non périodique)
 * φ, ψ gaussiennes de quelques pas de Fourier : les grandes longueurs d'onde (mémoire
 * viscoélastique derrière une charge roulante, déflexion absolue sur massif semi-infini) sont
 * intégrées sans périodisation.
 */
import type { Chargement } from "./chargements";
import { fft, fftfreq, leggauss, puissanceDeDeux, rfftfreq } from "./numerique";
import { COMPOSANTES, Evaluateur, hermitien, type Cle, type Composante, type Regime } from "./spectral";
import type { Structure } from "./structure";

export interface OptionsGrille {
  profondeurs: number[];
  comps?: Composante[];
  /** Taille (m) et nombre de points (puissances de 2) du domaine selon x et y. */
  L?: [number, number];
  N?: [number, number];
  centre?: [number, number];
  /** (xmin, xmax, ymin, ymax) : zone gardée. */
  fenetre?: [number, number, number, number] | null;
  cote?: "above" | "below";
  /** Largeur (m) d'un filtre gaussien sur le chargement (0 : aucun). */
  filtre?: number;
  /** Largeur relative b de la partition de l'unité (défaut 2). */
  bande?: number;
  /** Avancement (0 à 1) et texte. */
  progres?: (part: number, texte: string) => void;
}

export interface Champ {
  re: Float64Array;
  /** Partie imaginaire (régime harmonique seulement). */
  im: Float64Array | null;
}

export interface ResultatGrille {
  x: Float64Array;
  y: Float64Array;
  /** Clé « comp@z » ; tableau (ny × nx), ligne j = y[j]. */
  champs: Map<string, Champ>;
  cles: Cle[];
  meta: { L: [number, number]; N: [number, number]; dx: number; dy: number; bande: number; noeudsBande: [number, number]; secondes: number; force: number; regime: Regime };
}

export const cleChamp = (comp: string, z: number) => `${comp}@${z}`;

/** Nœuds et poids sur [0, kmax] : panneaux géométriques vers 0, puis réguliers (band_nodes). */
export function noeudsBande(kmax: number, xmax: number, relMin = 1e-7, parPanneau = 8, rapport = 4): [Float64Array, Float64Array] {
  const largeur = Math.min(kmax / 8, 5 / Math.max(xmax, 1e-9));
  const bords = [0, largeur * relMin];
  while (bords[bords.length - 1]! * rapport < largeur) bords.push(bords[bords.length - 1]! * rapport);
  let e = bords[bords.length - 1]!;
  while (e + largeur < kmax) {
    e += largeur;
    bords.push(e);
  }
  bords.push(kmax);
  const [g, w] = leggauss(parPanneau);
  const n: number[] = [],
    p: number[] = [];
  for (let i = 0; i + 1 < bords.length; i++) {
    const lo = bords[i]!,
      hi = bords[i + 1]!;
    for (let k = 0; k < parPanneau; k++) {
      n.push(0.5 * (hi - lo) * g[k]! + 0.5 * (hi + lo));
      p.push(0.5 * (hi - lo) * w[k]!);
    }
  }
  return [Float64Array.from(n), Float64Array.from(p)];
}

/** Nœuds symétriques (−q…, +q…) pondérés par la gaussienne de la partition. */
function symetriques(kmax: number, xmax: number, k0: number): [Float64Array, Float64Array] {
  const [q, w] = noeudsBande(kmax, xmax);
  const m = q.length;
  const qn = new Float64Array(2 * m),
    qw = new Float64Array(2 * m);
  for (let i = 0; i < m; i++) {
    const wi = w[i]! * Math.exp(-0.5 * (q[i]! / k0) ** 2);
    qn[m - 1 - i] = -q[i]!;
    qw[m - 1 - i] = wi;
    qn[m + i] = q[i]!;
    qw[m + i] = wi;
  }
  return [qn, qw];
}

export function resoudreGrille(st: Structure, chargement: Chargement, regime: Regime, o: OptionsGrille): ResultatGrille {
  const t0 = performance.now();
  const comps = o.comps ?? (["uz", "exx", "eyy", "ezz", "exy", "exz", "eyz"] as Composante[]);
  for (const c of comps) if (!COMPOSANTES.includes(c)) throw new Error(`Composante inconnue : ${c}`);
  const profondeurs = o.profondeurs.map(Number);
  const [Lx, Ly] = o.L ?? [16, 16];
  const [Nx, Ny] = o.N ?? [1024, 1024];
  if (!puissanceDeDeux(Nx) || !puissanceDeDeux(Ny)) throw new Error("N doit être une puissance de 2 selon x et y (256, 512, 1024…).");
  const dx = Lx / Nx,
    dy = Ly / Ny;
  const centre = o.centre ?? [0, 0];
  const x0 = centre[0] - Lx / 2,
    y0 = centre[1] - Ly / 2;
  const herm = hermitien(regime);
  const k1 = (herm ? rfftfreq(Nx, dx) : fftfreq(Nx, dx)).map((v) => 2 * Math.PI * v);
  const k2 = fftfreq(Ny, dy).map((v) => 2 * Math.PI * v);
  const dk1 = (2 * Math.PI) / Lx,
    dk2 = (2 * Math.PI) / Ly;
  const nk1 = k1.length;
  const bande = o.bande ?? 2;
  const kphi = bande * dk1,
    kpsi = bande * dk2;
  const phi = (k: number) => Math.exp(-0.5 * (k / kphi) ** 2);
  const psi = (k: number) => Math.exp(-0.5 * (k / kpsi) ** 2);
  const x = Float64Array.from({ length: Nx }, (_, i) => x0 + dx * i);
  const y = Float64Array.from({ length: Ny }, (_, j) => y0 + dy * j);
  const f = o.fenetre ?? null;
  const ix = [...x.keys()].filter((i) => !f || (x[i]! >= f[0] && x[i]! <= f[1]));
  const iy = [...y.keys()].filter((j) => !f || (y[j]! >= f[2] && y[j]! <= f[3]));
  if (!ix.length || !iy.length) throw new Error("La fenêtre ne contient aucun point de la grille.");
  const xs = Float64Array.from(ix, (i) => x[i]!),
    ys = Float64Array.from(iy, (j) => y[j]!);
  const nxs = xs.length,
    nys = ys.length;

  const tang = chargement.tangentiel;
  if (tang && st.interfaces.includes("slip"))
    throw new Error(
      "Efforts tangentiels et interface glissante : rien ne retient horizontalement les couches au-dessus de l'interface, le problème est mal posé (le code Python d'origine renvoie des NaN). Coller l'interface ou retirer les efforts tangentiels.",
    );
  const ev = new Evaluateur(st, regime, comps, profondeurs, o.cote ?? "above", tang, o.filtre ?? 0);
  const nk = ev.cles.length;
  const val = new Float64Array(2 * nk);
  const progres = o.progres ?? (() => undefined);
  const ptC = (a: Float64Array | null, i: number): [number, number] | null => (a ? [a[2 * i]!, a[2 * i + 1]!] : null);

  // ---- 1) (1 − φ) F : somme discrète par FFT -------------------------------------------------
  const F = Array.from({ length: nk }, () => new Float64Array(2 * Ny * nk1));
  {
    const ch = chargement.ftGrille(k1, k2);
    for (let i = 0; i < nk1; i++) {
      if (k1[i] === 0) continue;
      const wcol = 1 - phi(k1[i]!);
      for (let j = 0; j < Ny; j++) {
        const o2 = j * nk1 + i;
        ev.evaluer(k1[i]!, k2[j]!, ch.p[2 * o2]!, ch.p[2 * o2 + 1]!, ptC(ch.qx, o2), ptC(ch.qy, o2), val);
        for (let k = 0; k < nk; k++) {
          F[k]![2 * o2] = val[2 * k]! * wcol;
          F[k]![2 * o2 + 1] = val[2 * k + 1]! * wcol;
        }
      }
      if (i % 16 === 0) progres((0.6 * i) / nk1, "Nombres d'onde de la grille…");
    }
  }
  const champs = new Map<string, Champ>();
  const col = new Float64Array(2 * Ny),
    ligne = new Float64Array(2 * Nx);
  ev.cles.forEach((cle, k) => {
    const Fk = F[k]!;
    // phase exp(i(k1 x0 + k2 y0)), puis ifft selon y (colonnes)
    for (let i = 0; i < nk1; i++) {
      for (let j = 0; j < Ny; j++) {
        const t = k1[i]! * x0 + k2[j]! * y0,
          cr = Math.cos(t),
          ci = Math.sin(t);
        const o2 = 2 * (j * nk1 + i);
        col[2 * j] = Fk[o2]! * cr - Fk[o2 + 1]! * ci;
        col[2 * j + 1] = Fk[o2]! * ci + Fk[o2 + 1]! * cr;
      }
      fft(col, Ny, true);
      for (let j = 0; j < Ny; j++) {
        Fk[2 * (j * nk1 + i)] = col[2 * j]!;
        Fk[2 * (j * nk1 + i) + 1] = col[2 * j + 1]!;
      }
    }
    const re = new Float64Array(nys * nxs),
      im = herm ? null : new Float64Array(nys * nxs);
    iy.forEach((j, jj) => {
      ligne.fill(0);
      for (let i = 0; i < nk1; i++) {
        ligne[2 * i] = Fk[2 * (j * nk1 + i)]!;
        ligne[2 * i + 1] = Fk[2 * (j * nk1 + i) + 1]!;
      }
      if (herm) {
        // prolongement hermitien (irfft) : X[Nx − i] = conj(X[i])
        for (let i = 1; i < Nx / 2; i++) {
          ligne[2 * (Nx - i)] = ligne[2 * i]!;
          ligne[2 * (Nx - i) + 1] = -ligne[2 * i + 1]!;
        }
      }
      fft(ligne, Nx, true);
      ix.forEach((i, ii) => {
        re[jj * nxs + ii] = ligne[2 * i]! / (dx * dy);
        if (im) im[jj * nxs + ii] = ligne[2 * i + 1]! / (dx * dy);
      });
    });
    F[k] = new Float64Array(0);
    champs.set(cleChamp(cle.comp, cle.z), { re, im });
  });

  // ---- 2) φ(k1)(1 − ψ(k2)) F : continue en k1, discrète en k2 --------------------------------
  let xmax = 1,
    ymax = 1;
  for (const v of xs) xmax = Math.max(xmax, Math.abs(v));
  for (const v of ys) ymax = Math.max(ymax, Math.abs(v));
  const [qn, qw] = symetriques(6 * kphi, xmax, kphi);
  const rows = [...k2.keys()].filter((j) => k2[j] !== 0);
  const k2rows = Float64Array.from(rows, (j) => k2[j]!);
  const B = Array.from({ length: nk }, () => new Float64Array(2 * Ny * nxs));
  {
    const ch = chargement.ftGrille(qn, k2rows);
    const nq = qn.length;
    const E = new Float64Array(2 * nxs);
    const v = new Float64Array(2 * nk * rows.length);
    for (let q = 0; q < nq; q++) {
      for (let ii = 0; ii < nxs; ii++) {
        const t = qn[q]! * xs[ii]!;
        E[2 * ii] = Math.cos(t) * qw[q]!;
        E[2 * ii + 1] = Math.sin(t) * qw[q]!;
      }
      rows.forEach((j, r) => {
        const o2 = r * nq + q;
        ev.evaluer(qn[q]!, k2[j]!, ch.p[2 * o2]!, ch.p[2 * o2 + 1]!, ptC(ch.qx, o2), ptC(ch.qy, o2), val);
        const wrow = 1 - psi(k2[j]!);
        for (let k = 0; k < nk; k++) {
          v[2 * (k * rows.length + r)] = val[2 * k]! * wrow;
          v[2 * (k * rows.length + r) + 1] = val[2 * k + 1]! * wrow;
        }
      });
      for (let k = 0; k < nk; k++) {
        const Bk = B[k]!;
        rows.forEach((j, r) => {
          const vr = v[2 * (k * rows.length + r)]!,
            vi = v[2 * (k * rows.length + r) + 1]!;
          const base = 2 * j * nxs;
          for (let ii = 0; ii < nxs; ii++) {
            Bk[base + 2 * ii] = Bk[base + 2 * ii]! + vr * E[2 * ii]! - vi * E[2 * ii + 1]!;
            Bk[base + 2 * ii + 1] = Bk[base + 2 * ii + 1]! + vr * E[2 * ii + 1]! + vi * E[2 * ii]!;
          }
        });
      }
      if (q % 8 === 0) progres(0.6 + (0.3 * q) / nq, "Bande des grandes longueurs d'onde…");
    }
  }
  ev.cles.forEach((cle, k) => {
    const Bk = B[k]!;
    const ch = champs.get(cleChamp(cle.comp, cle.z))!;
    for (let ii = 0; ii < nxs; ii++) {
      for (let j = 0; j < Ny; j++) {
        const t = k2[j]! * y0,
          cr = Math.cos(t),
          ci = Math.sin(t);
        const a = Bk[2 * (j * nxs + ii)]!,
          b = Bk[2 * (j * nxs + ii) + 1]!;
        col[2 * j] = a * cr - b * ci;
        col[2 * j + 1] = a * ci + b * cr;
      }
      fft(col, Ny, true);
      const s = Ny / (2 * Math.PI * Ly);
      iy.forEach((j, jj) => {
        ch.re[jj * nxs + ii] = ch.re[jj * nxs + ii]! + col[2 * j]! * s;
        if (ch.im) ch.im[jj * nxs + ii] = ch.im[jj * nxs + ii]! + col[2 * j + 1]! * s;
      });
    }
    B[k] = new Float64Array(0);
  });

  // ---- 3) coin φ(k1)ψ(k2) F : intégrale continue 2D --------------------------------------------
  const [rn, rw] = symetriques(6 * kpsi, ymax, kpsi);
  {
    const nq = qn.length,
      nr = rn.length;
    const ch = chargement.ftGrille(qn, rn);
    // E2 (nys × nr) = exp(i ys rn) rw
    const E2 = new Float64Array(2 * nys * nr);
    for (let jj = 0; jj < nys; jj++)
      for (let r = 0; r < nr; r++) {
        const t = ys[jj]! * rn[r]!;
        E2[2 * (jj * nr + r)] = Math.cos(t) * rw[r]!;
        E2[2 * (jj * nr + r) + 1] = Math.sin(t) * rw[r]!;
      }
    const Cc = Array.from({ length: nk }, () => new Float64Array(2 * nys * nxs));
    const v = new Float64Array(2 * nk * nr);
    const g = new Float64Array(2 * nys);
    const E1 = new Float64Array(2 * nxs);
    for (let q = 0; q < nq; q++) {
      for (let r = 0; r < nr; r++) {
        const o2 = r * nq + q;
        ev.evaluer(qn[q]!, rn[r]!, ch.p[2 * o2]!, ch.p[2 * o2 + 1]!, ptC(ch.qx, o2), ptC(ch.qy, o2), val);
        for (let k = 0; k < nk; k++) {
          v[2 * (k * nr + r)] = val[2 * k]!;
          v[2 * (k * nr + r) + 1] = val[2 * k + 1]!;
        }
      }
      for (let ii = 0; ii < nxs; ii++) {
        const t = qn[q]! * xs[ii]!;
        E1[2 * ii] = Math.cos(t) * qw[q]!;
        E1[2 * ii + 1] = Math.sin(t) * qw[q]!;
      }
      for (let k = 0; k < nk; k++) {
        // g = E2 · v[:, q]
        for (let jj = 0; jj < nys; jj++) {
          let re = 0,
            im = 0;
          for (let r = 0; r < nr; r++) {
            const er = E2[2 * (jj * nr + r)]!,
              ei = E2[2 * (jj * nr + r) + 1]!,
              vr = v[2 * (k * nr + r)]!,
              vi = v[2 * (k * nr + r) + 1]!;
            re += er * vr - ei * vi;
            im += er * vi + ei * vr;
          }
          g[2 * jj] = re;
          g[2 * jj + 1] = im;
        }
        const Ck = Cc[k]!;
        for (let jj = 0; jj < nys; jj++) {
          const gr = g[2 * jj]!,
            gi = g[2 * jj + 1]!;
          const base = 2 * jj * nxs;
          for (let ii = 0; ii < nxs; ii++) {
            Ck[base + 2 * ii] = Ck[base + 2 * ii]! + gr * E1[2 * ii]! - gi * E1[2 * ii + 1]!;
            Ck[base + 2 * ii + 1] = Ck[base + 2 * ii + 1]! + gr * E1[2 * ii + 1]! + gi * E1[2 * ii]!;
          }
        }
      }
      if (q % 8 === 0) progres(0.9 + (0.1 * q) / nq, "Coin continu 2D…");
    }
    ev.cles.forEach((cle, k) => {
      const chp = champs.get(cleChamp(cle.comp, cle.z))!;
      const Ck = Cc[k]!;
      const s = 1 / (4 * Math.PI * Math.PI);
      for (let i = 0; i < nys * nxs; i++) {
        chp.re[i] = chp.re[i]! + Ck[2 * i]! * s;
        if (chp.im) chp.im[i] = chp.im[i]! + Ck[2 * i + 1]! * s;
      }
    });
  }
  progres(1, "Terminé");
  return {
    x: xs,
    y: ys,
    champs,
    cles: ev.cles,
    meta: { L: [Lx, Ly], N: [Nx, Ny], dx, dy, bande, noeudsBande: [qn.length, rn.length], secondes: (performance.now() - t0) / 1000, force: chargement.force(), regime },
  };
}
