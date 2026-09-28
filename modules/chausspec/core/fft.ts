/**
 * Transformées de Fourier rapides (ce que le Python prend dans numpy.fft) : FFT radix 2,
 * fréquences, et les inverses utilisées par le solveur grille (ifft2, irfft2, ifft selon les
 * lignes). Les tableaux 2D sont des CArray rangés ligne par ligne (ny lignes × nx colonnes).
 * Tailles : puissances de 2.
 */
import { CArray } from "./carray";

export const isPowerOfTwo = (n: number) => n >= 1 && (n & (n - 1)) === 0;

/**
 * FFT complexe en place (radix 2, Cooley-Tukey) sur n valeurs de (re, im), espacées de
 * `stride` à partir de `start`. inverse : signe + et division par n (convention numpy.fft.ifft).
 */
function fftInPlace(re: Float64Array, im: Float64Array, n: number, inverse: boolean, start = 0, stride = 1): void {
  if (!isPowerOfTwo(n)) throw new Error(`FFT : ${n} points, une puissance de 2 est attendue.`);
  const at = (k: number) => start + k * stride;
  // permutation par inversion des bits
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const p = at(i),
        q = at(j);
      [re[p], re[q]] = [re[q]!, re[p]!];
      [im[p], im[q]] = [im[q]!, im[p]!];
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang),
      wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1,
        ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = at(i + k),
          q = at(i + k + len / 2);
        const xr = re[q]! * cr - im[q]! * ci,
          xi = re[q]! * ci + im[q]! * cr;
        re[q] = re[p]! - xr;
        im[q] = im[p]! - xi;
        re[p] = re[p]! + xr;
        im[p] = im[p]! + xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) {
    for (let k = 0; k < n; k++) {
      re[at(k)] = re[at(k)]! / n;
      im[at(k)] = im[at(k)]! / n;
    }
  }
}

/** np.fft.ifft(A, axis=0) d'un tableau (ny × nx) : inverse le long de chaque colonne. */
export function ifftAxis0(A: CArray, ny: number, nx: number): CArray {
  const out = A.copy();
  for (let i = 0; i < nx; i++) fftInPlace(out.re, out.im, ny, true, i, nx);
  return out;
}

/** np.fft.ifft2 d'un tableau (ny × nx). */
export function ifft2(A: CArray, ny: number, nx: number): CArray {
  const out = ifftAxis0(A, ny, nx);
  for (let j = 0; j < ny; j++) fftInPlace(out.re, out.im, nx, true, j * nx);
  return out;
}

/**
 * np.fft.irfft2(A, s=(ny, nx)) : A contient les colonnes k1 >= 0 (nx/2 + 1) d'un spectre
 * hermitien ; le résultat (ny × nx) est réel.
 */
export function irfft2(A: CArray, ny: number, nx: number): Float64Array {
  const nk1 = nx / 2 + 1;
  const cols = ifftAxis0(A, ny, nk1);
  const out = new Float64Array(ny * nx);
  const re = new Float64Array(nx),
    im = new Float64Array(nx);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nk1; i++) {
      re[i] = cols.re[j * nk1 + i]!;
      im[i] = cols.im[j * nk1 + i]!;
    }
    // prolongement hermitien : X[nx - i] = conj(X[i])
    for (let i = 1; i < nx / 2; i++) {
      re[nx - i] = re[i]!;
      im[nx - i] = -im[i]!;
    }
    fftInPlace(re, im, nx, true);
    out.set(re, j * nx);
  }
  return out;
}

/** Fréquences de numpy.fft.fftfreq(n, d). */
export function fftfreq(n: number, d: number): Float64Array {
  const f = new Float64Array(n);
  const half = Math.floor((n - 1) / 2) + 1;
  for (let i = 0; i < half; i++) f[i] = i / (n * d);
  for (let i = half; i < n; i++) f[i] = (i - n) / (n * d);
  return f;
}

/** Fréquences de numpy.fft.rfftfreq(n, d). */
export function rfftfreq(n: number, d: number): Float64Array {
  const m = Math.floor(n / 2) + 1;
  const f = new Float64Array(m);
  for (let i = 0; i < m; i++) f[i] = i / (n * d);
  return f;
}
