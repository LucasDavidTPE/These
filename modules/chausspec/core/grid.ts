/**
 * Solveur « champ » : double transformée de Fourier sur une grille (x, y) (grid.py).
 *
 * Le spectre F(k1, k2) est découpé par une partition de l'unité (notice, §4.4) :
 *     F = (1 - phi(k1)) F                    -> FFT 2D (périodique, mais de moyenne nulle en x)
 *       + phi(k1) (1 - psi(k2)) F            -> intégrale continue en k1, FFT en y
 *       + phi(k1) psi(k2) F                  -> intégrale continue 2D (non périodique)
 * avec phi, psi des gaussiennes de largeur quelques pas de Fourier. Les grandes longueurs d'onde
 * (longue mémoire viscoélastique derrière une charge roulante, décroissance lente des champs en
 * profondeur, déflexion absolue sur massif semi-infini) sont ainsi intégrées sans périodisation :
 * un domaine de quelques fois l'emprise du chargement suffit.
 *
 * Non portés : sym_y, k1_shift et specfun.
 */
import { addMatmul, CArray, linspaceStep, matmul, meshgrid, nonzero, phases, releaseScratch, scaleColumns, scaleRows, scratch } from "./carray";
import { fftfreq, ifft2, ifftAxis0, irfft2, isPowerOfTwo, rfftfreq } from "./fft";
import type { Loading } from "./loads";
import type { Regime } from "./regimes";
import { leggauss } from "./special";
import { ALL, fieldKey, spectralFields, STRAIN, type Component } from "./spectral";
import type { Structure } from "./structure";

export interface GridMeta {
  L: [number, number];
  N: [number, number];
  dx: number;
  dy: number;
  regime: string;
  band: number;
  nBandNodes: [number, number];
  cpuS: number;
  force: number;
  /** Champs complexes (régime harmonique) ; sinon réels (partie imaginaire nulle). */
  complex: boolean;
}

/** Résultat de solveGrid : champs (ny × nx, rangés ligne par ligne, ligne j = y[j]). */
export class GridResult {
  constructor(
    readonly x: Float64Array,
    readonly y: Float64Array,
    readonly fields: Map<string, CArray>,
    readonly meta: GridMeta,
  ) {}

  // ------------------------------------------------------------------------------
  get(comp: string, z: number): CArray {
    const f = this.fields.get(fieldKey(comp, z));
    if (!f) throw new Error(`Champ ${comp} à z = ${z} m non calculé.`);
    return f;
  }

  /** Les couples (comp, z) calculés, dans l'ordre du calcul. */
  get keys(): { comp: Component; z: number }[] {
    return [...this.fields.keys()].map((k) => {
      const [comp, z] = k.split("@");
      return { comp: comp as Component, z: Number(z) };
    });
  }

  /** Interpolation bilinéaire de la partie réelle du champ (comp, z) au point (x, y) ; NaN hors grille. */
  interp(comp: string, z: number, x: number, y: number): number {
    const f = this.get(comp, z).re;
    const nx = this.x.length,
      ny = this.y.length;
    const fx = (x - this.x[0]!) / (this.x[1]! - this.x[0]!);
    const fy = (y - this.y[0]!) / (this.y[1]! - this.y[0]!);
    if (fx < 0 || fy < 0 || fx > nx - 1 || fy > ny - 1) return NaN;
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(ny - 2, Math.floor(fy));
    const tx = fx - i,
      ty = fy - j;
    const v = (jj: number, ii: number) => f[jj * nx + ii]!;
    return (1 - ty) * ((1 - tx) * v(j, i) + tx * v(j, i + 1)) + ty * ((1 - tx) * v(j + 1, i) + tx * v(j + 1, i + 1));
  }

  /** Coupe longitudinale (selon x) en y = y0 (nœud de grille le plus proche). */
  lineX(comp: string, z: number, y0: number): { x: Float64Array; f: CArray } {
    const j = nearest(this.y, y0),
      nx = this.x.length;
    return { x: this.x, f: this.get(comp, z).slice(j * nx, (j + 1) * nx) };
  }

  lineY(comp: string, z: number, x0: number): { y: Float64Array; f: CArray } {
    const i = nearest(this.x, x0),
      nx = this.x.length;
    return { y: this.y, f: this.get(comp, z).take(Array.from(this.y, (_, j) => j * nx + i)) };
  }

  /** Déformations principales (triées croissantes) : trois tableaux (ε3, ε2, ε1). */
  principalStrains(z: number): [Float64Array, Float64Array, Float64Array] {
    if (this.meta.complex) throw new Error("Champs complexes (régime harmonique) : prendre la partie réelle à un instant.");
    const [exx, eyy, ezz, exy, exz, eyz] = STRAIN.map((c) => this.get(c, z).re);
    const n = exx!.length;
    const out: [Float64Array, Float64Array, Float64Array] = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    for (let i = 0; i < n; i++) {
      const l = eigvalsh3(exx![i]!, eyy![i]!, ezz![i]!, exy![i]!, exz![i]!, eyz![i]!);
      out[0][i] = l[0];
      out[1][i] = l[1];
      out[2][i] = l[2];
    }
    return out;
  }

  /** Maximum (de la partie réelle, ou du module si absolute) et sa position (valeur, x, y). */
  argmax(comp: string, z: number, absolute = false): [number, number, number] {
    const F = this.get(comp, z);
    const f = absolute ? F.abs() : F.re;
    let k = 0;
    for (let i = 1; i < f.length; i++) if (f[i]! > f[k]!) k = i;
    const nx = this.x.length;
    return [f[k]!, this.x[k % nx]!, this.y[Math.floor(k / nx)]!];
  }

  /**
   * Signal temporel vu par une jauge fixe en (xGauge, yGauge) pour une charge roulante.
   *
   * Le champ est calculé dans le repère mobile X = x - V t (chargement centré en X = 0 à
   * t = 0). La jauge voit f(X = xGauge - V t). Renvoie (t, f(t)).
   */
  timeSignal(comp: string, z: number, xGauge: number, yGauge: number, speed: number): { t: number[]; f: number[] } {
    const { x: X, f } = this.lineX(comp, z, yGauge);
    const pts = Array.from(X, (Xi, i) => [(xGauge - Xi) / speed, f.re[i]!] as [number, number]).sort((a, b) => a[0] - b[0]);
    return { t: pts.map((p) => p[0]), f: pts.map((p) => p[1]) };
  }
}

function nearest(a: Float64Array, v: number): number {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (Math.abs(a[i]! - v) < Math.abs(a[k]! - v)) k = i;
  return k;
}

/** Valeurs propres croissantes de la matrice symétrique [[a, d, e], [d, b, f], [e, f, c]] (np.linalg.eigvalsh). */
export function eigvalsh3(a: number, b: number, c: number, d: number, e: number, f: number): [number, number, number] {
  // méthode trigonométrique (Smith, 1961)
  const p1 = d * d + e * e + f * f;
  if (p1 === 0) return [a, b, c].sort((u, v) => u - v) as [number, number, number];
  const q = (a + b + c) / 3;
  const p = Math.sqrt(((a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1) / 6);
  const [A, B, C] = [(a - q) / p, (b - q) / p, (c - q) / p];
  const [D, E, F] = [d / p, e / p, f / p];
  const detB = A * (B * C - F * F) - D * (D * C - F * E) + E * (D * F - B * E);
  const phi = Math.acos(Math.min(1, Math.max(-1, detB / 2))) / 3;
  const l1 = q + 2 * p * Math.cos(phi);
  const l3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  return [l3, 3 * q - l1 - l3, l1];
}

function gauss(n: number): [Float64Array, Float64Array] {
  return leggauss(n);
}

/**
 * Nœuds/poids de quadrature sur [0, kmax] : panneaux géométriques vers 0 (le noyau varie
 * sur une échelle logarithmique en k1 quand le matériau a des temps de relaxation longs),
 * puis panneaux réguliers assez fins pour la phase exp(i k1 X), |X| <= xmax.
 */
export function bandNodes(kmax: number, xmax: number, relMin = 1e-7, perPanel = 8, ratio = 4.0): [Float64Array, Float64Array] {
  const width = Math.min(kmax / 8, 5.0 / Math.max(xmax, 1e-9));
  const edges = [0.0, width * relMin];
  while (edges[edges.length - 1]! * ratio < width) edges.push(edges[edges.length - 1]! * ratio);
  let e = edges[edges.length - 1]!;
  while (e + width < kmax) {
    e += width;
    edges.push(e);
  }
  edges.push(kmax);
  const [g, w] = gauss(perPanel);
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const lo = edges[i]!,
      hi = edges[i + 1]!;
    g.forEach((gk, k) => {
      nodes.push(0.5 * (hi - lo) * gk + 0.5 * (hi + lo));
      weights.push(0.5 * (hi - lo) * w[k]!);
    });
  }
  return [Float64Array.from(nodes), Float64Array.from(weights)];
}

/** Nœuds de bandNodes pondérés par la gaussienne, puis symétrisés : (-q[::-1], q). */
function symmetricNodes(kmax: number, xmax: number, gaussian: (k: number) => number): [Float64Array, Float64Array] {
  const [q, w] = bandNodes(kmax, xmax);
  const wq = w.map((v, i) => v * gaussian(q[i]!));
  const m = q.length;
  const qn = new Float64Array(2 * m),
    qw = new Float64Array(2 * m);
  for (let i = 0; i < m; i++) {
    qn[m - 1 - i] = -q[i]!;
    qw[m - 1 - i] = wq[i]!;
    qn[m + i] = q[i]!;
    qw[m + i] = wq[i]!;
  }
  return [qn, qw];
}

export interface GridOptions {
  /** Composantes parmi ux uy uz exx eyy ezz exy exz eyz sxx syy szz sxy sxz syz. */
  comps?: readonly Component[];
  /** Taille (m) et nombre de points (puissances de 2) du domaine périodique selon (x, y). */
  L?: [number, number];
  N?: [number, number];
  /** Centre du domaine. */
  center?: [number, number];
  /** (xmin, xmax, ymin, ymax) : ne garder qu'une zone. */
  window?: [number, number, number, number] | null;
  /** Sur une interface, "above" prend la couche supérieure. */
  side?: "above" | "below";
  /** Largeur (m) d'un filtre gaussien appliqué au chargement (0 = aucun). */
  filterWidth?: number;
  /** Largeur relative b de la partition de l'unité (défaut 2). */
  band?: number;
  /** Nombre de nombres d'onde par paquet (le Python prend 16384 ; 1024 est plus rapide ici). */
  chunk?: number;
  /** Avancement (0 à 1) et texte : l'équivalent de verbose. */
  progress?: (part: number, text: string) => void;
}

/**
 * Champs mécaniques sur des plans horizontaux z = depths.
 *
 * Les déformations sont tensorielles (exz = gamma_xz / 2), en m/m. band : largeur relative b
 * de la partition de l'unité en k1 (notice §4.4). Le spectre est scindé en
 * F = (1 - phi) F + phi F avec phi(k1) = exp(-(k1 / (b dk1))^2 / 2) : (1 - phi) F est sommé par
 * FFT (périodique), phi F est intégré continûment en k1 (quadrature géométrique vers 0 + phases
 * exactes : non périodique en x). De même en k2 avec psi(k2) : le coin phi.psi F est intégré en
 * 2D, ce qui supprime aussi la périodisation en y des grandes longueurs d'onde (déflexions
 * absolues). Défaut b = 2.
 */
export function solveGrid(structure: Structure, loading: Loading, regime: Regime, depths: readonly number[], options: GridOptions = {}): GridResult {
  const t0 = performance.now();
  const comps = options.comps ?? (["uz", "exx", "eyy", "ezz", "exy", "exz", "eyz"] as const);
  for (const c of comps) if (!ALL.includes(c)) throw new Error(`composante inconnue : ${c}`);
  // Écart assumé avec le Python : effort tangentiel + interface glissante, le problème est mal
  // posé (rien ne retient horizontalement les couches au-dessus) et le Python renvoie des NaN.
  if (loading.hasTangential && structure.interfaces.includes("slip"))
    throw new Error(
      "Efforts tangentiels et interface glissante : rien ne retient horizontalement les couches au-dessus de l'interface, le problème est mal posé (le code Python d'origine renvoie des NaN). Coller l'interface ou retirer les efforts tangentiels.",
    );
  const [Lx, Ly] = options.L ?? [16.0, 16.0];
  const [Nx, Ny] = options.N ?? [1024, 1024];
  if (!isPowerOfTwo(Nx) || !isPowerOfTwo(Ny)) throw new Error("N doit être une puissance de 2 selon x et y (256, 512, 1024…).");
  const [dx, dy] = [Lx / Nx, Ly / Ny];
  const center = options.center ?? [0.0, 0.0];
  const x0 = center[0] - Lx / 2;
  const y0 = center[1] - Ly / 2;
  const herm = regime.hermitian;
  const k1 = (herm ? rfftfreq(Nx, dx) : fftfreq(Nx, dx)).map((f) => 2 * Math.PI * f);
  const k2 = fftfreq(Ny, dy).map((f) => 2 * Math.PI * f);
  const [dk1, dk2] = [(2 * Math.PI) / Lx, (2 * Math.PI) / Ly];
  const nk1 = k1.length;
  const band = options.band ?? 2.0;
  const kphi = band * dk1;
  const kpsi = band * dk2;
  const phi = (k: number) => Math.exp(-0.5 * (k / kphi) ** 2);
  const psi = (k: number) => Math.exp(-0.5 * (k / kpsi) ** 2);
  const x = linspaceStep(x0, dx, Nx);
  const y = linspaceStep(y0, dy, Ny);
  const win = options.window ?? null;
  const ix = win ? nonzero(x, (v) => v >= win[0] && v <= win[1]) : [...x.keys()];
  const iy = win ? nonzero(y, (v) => v >= win[2] && v <= win[3]) : [...y.keys()];
  if (!ix.length || !iy.length) throw new Error("La fenêtre ne contient aucun point de la grille.");
  const chunk = options.chunk ?? 1024;
  const progress = options.progress ?? (() => undefined);
  const kw = { side: options.side ?? "above", filterWidth: options.filterWidth ?? 0 };
  // tableaux temporaires d'un paquet pris dans la réserve de carray.ts (voir scratch)
  const spectrum = (K1: Float64Array, K2: Float64Array) => scratch(() => spectralFields(structure, regime, loading, K1, K2, depths, comps, kw));
  const keys = comps.flatMap((c) => depths.map((z) => fieldKey(c, z)));

  // ---- 1) partie haute (1 - phi) F : somme discrète par FFT ---------------------------------------
  const F = new Map(keys.map((key) => [key, CArray.zeros(Ny * nk1)]));
  const cols = nonzero(k1, (k) => k !== 0);
  const ncolChunk = Math.max(1, Math.floor(chunk / Ny));
  for (let i0 = 0; i0 < cols.length; i0 += ncolChunk) {
    const cc = cols.slice(i0, i0 + ncolChunk);
    const k1c = Float64Array.from(cc, (i) => k1[i]!);
    const res = spectrum(k1c, k2);
    const wcol = k1c.map((k) => 1.0 - phi(k));
    for (const [key, v] of res) {
      const vw = scaleColumns(v, Ny, cc.length, wcol);
      const Fk = F.get(key)!;
      for (let r = 0; r < Ny; r++)
        cc.forEach((i, c) => {
          Fk.re[r * nk1 + i] = vw.re[r * cc.length + c]!;
          Fk.im[r * nk1 + i] = vw.im[r * cc.length + c]!;
        });
    }
    progress((0.6 * (i0 + cc.length)) / cols.length, "Nombres d'onde de la grille…");
  }

  const fields = new Map<string, CArray>();
  const [K1, K2] = meshgrid(k1, k2);
  const ph = new CArray(new Float64Array(K1.length), K1.map((a, i) => a * x0 + K2[i]! * y0)).exp(); // exp(i (k1 x0 + k2 y0))
  for (const [key, Fk0] of F) {
    const Fk = Fk0.mul(ph);
    F.delete(key);
    const f = herm ? new CArray(irfft2(Fk, Ny, Nx)) : ifft2(Fk, Ny, Nx);
    fields.set(key, window2D(f, Nx, iy, ix).mul(1 / (dx * dy)));
  }

  // ---- 2) partie phi(k1) (1 - psi(k2)) F : continue en k1, discrète en k2 ------------------------
  const xs = Float64Array.from(ix, (i) => x[i]!);
  const ys = Float64Array.from(iy, (j) => y[j]!);
  const xmax = Math.max(...xs.map(Math.abs), 1.0);
  const ymax = Math.max(...ys.map(Math.abs), 1.0);
  const [qn, qw] = symmetricNodes(6.0 * kphi, xmax, phi);
  const rows = nonzero(k2, (k) => k !== 0);
  const k2rows = Float64Array.from(rows, (j) => k2[j]!);
  const wrow = k2rows.map((k) => 1.0 - psi(k));
  const B = new Map(keys.map((key) => [key, CArray.zeros(Ny * xs.length)]));
  let step = Math.max(1, Math.floor(chunk / Math.max(rows.length, 1)));
  for (let i0 = 0; i0 < qn.length; i0 += step) {
    const qq = qn.slice(i0, i0 + step);
    const ww = qw.slice(i0, i0 + step);
    const E = phases(qq, xs, { rows: ww }); // exp(1j outer(qq, xs)) * ww[:, None]   (nq, nx)
    const res = spectrum(qq, k2rows); //                                                (nrows, nq)
    for (const [key, v] of res) addMatmul(B.get(key)!, rows, scaleRows(v, rows.length, qq.length, wrow), rows.length, qq.length, E, xs.length); // B[rows] += (v * wrow) @ E
    progress(0.6 + (0.3 * (i0 + qq.length)) / qn.length, "Bande des grandes longueurs d'onde…");
  }
  const phy = new CArray(new Float64Array(Ny), k2.map((k) => k * y0)).exp(); // exp(1j k2 y0)
  for (const [key, Bk] of B) {
    const fb = window2D(ifftAxis0(Bk.mul(repeatRows(phy, xs.length)), Ny, xs.length), xs.length, iy, [...xs.keys()]).mul(Ny / (2 * Math.PI * Ly));
    fields.set(key, fields.get(key)!.add(herm ? new CArray(fb.re) : fb));
    B.delete(key);
  }

  // ---- 3) coin phi(k1) psi(k2) F : intégrale continue 2D (non périodique en x et en y) ------------
  const [rn, rw] = symmetricNodes(6.0 * kpsi, ymax, psi);
  const E2 = phases(ys, rn, { cols: rw }); // exp(1j outer(ys, rn)) * rw[None, :]   (ny, nr)
  // Le Python ajoute E2 @ (v @ E1) paquet par paquet. E2 ne dépendant pas du paquet, on somme
  // d'abord les v @ E1 et on ne multiplie par E2 qu'une fois (même résultat, bien moins de
  // calcul sans la multiplication matricielle optimisée de numpy).
  const vE1 = new Map(keys.map((key) => [key, CArray.zeros(rn.length * xs.length)]));
  step = Math.max(1, Math.floor(chunk / rn.length));
  for (let i0 = 0; i0 < qn.length; i0 += step) {
    const qq = qn.slice(i0, i0 + step);
    const ww = qw.slice(i0, i0 + step);
    const E1 = phases(qq, xs, { rows: ww }); // exp(1j outer(qq, xs)) * ww[:, None]   (nq, nx)
    const res = spectrum(qq, rn); //                                                   (nr, nq)
    for (const [key, v] of res) addMatmul(vE1.get(key)!, null, v, rn.length, qq.length, E1, xs.length); // += v @ E1
    progress(0.9 + (0.1 * (i0 + qq.length)) / qn.length, "Coin continu 2D…");
  }
  for (const key of keys) {
    const Cc = matmul(E2, ys.length, rn.length, vE1.get(key)!, xs.length); // E2 @ Σ (v @ E1)
    const fc = Cc.mul(1 / (4 * Math.PI ** 2));
    fields.set(key, fields.get(key)!.add(herm ? new CArray(fc.re) : fc));
  }
  releaseScratch();
  progress(1, "Terminé");
  const meta: GridMeta = {
    L: [Lx, Ly],
    N: [Nx, Ny],
    dx,
    dy,
    regime: regime.toString(),
    band,
    nBandNodes: [qn.length, rn.length],
    cpuS: (performance.now() - t0) / 1000,
    force: loading.force(),
    complex: !herm,
  };
  return new GridResult(xs, ys, fields, meta);
}

/** f[np.ix_(iy, ix)] d'un tableau (… × nx) rangé ligne par ligne. */
function window2D(f: CArray, nx: number, iy: readonly number[], ix: readonly number[]): CArray {
  const out = CArray.zeros(iy.length * ix.length);
  iy.forEach((j, jj) =>
    ix.forEach((i, ii) => {
      out.re[jj * ix.length + ii] = f.re[j * nx + i]!;
      out.im[jj * ix.length + ii] = f.im[j * nx + i]!;
    }),
  );
  return out;
}

/** Colonne v (n) répétée sur `cols` colonnes : tableau (n × cols), v[:, None] diffusé. */
function repeatRows(v: CArray, cols: number): CArray {
  const out = CArray.zeros(v.size * cols);
  for (let r = 0; r < v.size; r++)
    for (let c = 0; c < cols; c++) {
      out.re[r * cols + c] = v.re[r]!;
      out.im[r * cols + c] = v.im[r]!;
    }
  return out;
}
