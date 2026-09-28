/**
 * Moindres carrés sous contrainte de positivité (algorithme de Lawson et Hanson, 1974) :
 * min ‖A·x − b‖² avec x ≥ 0. Les séries de Prony s'y ramènent : les temps τᵢ étant fixés
 * sur une grille, les modules (ou souplesses) des branches entrent linéairement et ne
 * peuvent pas être négatifs.
 *
 * LAWSON C. L. & HANSON R. J., « Solving Least Squares Problems », Prentice-Hall, 1974,
 * chapitre 23.
 */

/** Résout le système carré G·x = c par pivot de Gauss ; null s'il est singulier. */
function resoudre(G: number[][], c: number[]): number[] | null {
  const n = c.length;
  const M = G.map((l, i) => [...l, c[i]!]);
  for (let r = 0; r < n; r++) {
    let p = r;
    for (let k = r + 1; k < n; k++) if (Math.abs(M[k]![r]!) > Math.abs(M[p]![r]!)) p = k;
    [M[r], M[p]] = [M[p]!, M[r]!];
    if (Math.abs(M[r]![r]!) < 1e-300) return null;
    for (let k = r + 1; k < n; k++) {
      const f = M[k]![r]! / M[r]![r]!;
      if (f === 0) continue;
      for (let j = r; j <= n; j++) M[k]![j]! -= f * M[r]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let j = r + 1; j < n; j++) s -= M[r]![j]! * x[j]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

/**
 * Lawson-Hanson sur les équations normales (Aᵀ·A, Aᵀ·b), suffisantes pour les tailles en jeu
 * ici (quelques dizaines d'inconnues).
 */
export function nnls(A: readonly (readonly number[])[], b: readonly number[], o: { iterations?: number } = {}): { x: number[]; residu: number } {
  const m = A.length,
    n = m ? A[0]!.length : 0;
  // colonnes normalisées : le conditionnement des équations normales en dépend
  const norme = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) norme[j]! += A[i]![j]! ** 2;
  for (let j = 0; j < n; j++) norme[j] = Math.sqrt(norme[j]!) || 1;
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const c = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) {
    const a = A[i]!;
    for (let j = 0; j < n; j++) {
      const aj = a[j]! / norme[j]!;
      if (aj === 0) continue;
      c[j]! += aj * b[i]!;
      for (let k = 0; k < n; k++) G[j]![k]! += (aj * a[k]!) / norme[k]!;
    }
  }
  const trace = G.reduce((s, g, i) => s + g[i]!, 0) / Math.max(1, n);
  for (let j = 0; j < n; j++) G[j]![j]! += 1e-13 * trace;

  const x = new Array<number>(n).fill(0);
  const passif = new Array<boolean>(n).fill(false);
  const gradient = () => c.map((cj, j) => cj - G[j]!.reduce((s, g, k) => s + g * x[k]!, 0));
  const tol = 1e-12 * Math.max(1, Math.abs(c.reduce((s, v) => Math.max(s, Math.abs(v)), 0)));
  const sousProbleme = () => {
    const P = passif.flatMap((p, j) => (p ? [j] : []));
    const z = new Array<number>(n).fill(0);
    const r = resoudre(
      P.map((j) => P.map((k) => G[j]![k]!)),
      P.map((j) => c[j]!),
    );
    if (r) P.forEach((j, q) => (z[j] = r[q]!));
    return z;
  };
  const max = o.iterations ?? 3 * n + 30;
  for (let it = 0; it < max; it++) {
    const w = gradient();
    let t = -1;
    for (let j = 0; j < n; j++) if (!passif[j] && w[j]! > tol && (t < 0 || w[j]! > w[t]!)) t = j;
    if (t < 0) break;
    passif[t] = true;
    for (let boucle = 0; boucle < 3 * n + 3; boucle++) {
      const z = sousProbleme();
      if (passif.every((p, j) => !p || z[j]! > 0)) {
        for (let j = 0; j < n; j++) x[j] = z[j]!;
        break;
      }
      // pas vers z interrompu à la première variable qui s'annule
      let alpha = Infinity;
      for (let j = 0; j < n; j++) if (passif[j] && z[j]! <= 0) alpha = Math.min(alpha, x[j]! / (x[j]! - z[j]!));
      for (let j = 0; j < n; j++) x[j] = x[j]! + alpha * (z[j]! - x[j]!);
      const echelle = x.reduce((s, v) => Math.max(s, Math.abs(v)), 0);
      for (let j = 0; j < n; j++) {
        if (passif[j] && x[j]! <= 1e-14 * echelle) {
          passif[j] = false;
          x[j] = 0;
        }
      }
    }
  }
  const sol = x.map((v, j) => Math.max(0, v) / norme[j]!);
  let residu = 0;
  for (let i = 0; i < m; i++) residu += (A[i]!.reduce((s, a, j) => s + a * sol[j]!, 0) - b[i]!) ** 2;
  return { x: sol, residu };
}
