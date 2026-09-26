/**
 * Simplexe de Nelder-Mead — l'équivalent du Solveur d'Excel, en local et
 * sans dépendance. Utilisé pour caler les constantes rhéologiques et la
 * loi WLF.
 */
export function nelderMead(fn, x0, opt = {}) {
  const maxIter = opt.maxIter ?? 3000;
  const tol = opt.tol ?? 1e-10;
  const n = x0.length;
  const point = x => ({ x: x.slice(), fx: fn(x) });

  const simplexe = [point(x0)];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += x[i] !== 0 ? 0.08 * Math.abs(x[i]) : 0.05;
    simplexe.push(point(x));
  }

  const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;
  for (let it = 0; it < maxIter; it++) {
    simplexe.sort((a, b) => a.fx - b.fx);
    if (Math.abs(simplexe[n].fx - simplexe[0].fx) < tol) break;

    const centre = new Array(n).fill(0);
    for (let j = 0; j < n; j++) for (let d = 0; d < n; d++) centre[d] += simplexe[j].x[d] / n;
    const pire = simplexe[n];

    const reflechi = point(centre.map((v, d) => v + alpha * (v - pire.x[d])));
    if (reflechi.fx < simplexe[0].fx) {
      const etendu = point(centre.map((v, d) => v + gamma * (v - pire.x[d])));
      simplexe[n] = etendu.fx < reflechi.fx ? etendu : reflechi;
    } else if (reflechi.fx < simplexe[n - 1].fx) {
      simplexe[n] = reflechi;
    } else {
      const contracte = point(centre.map((v, d) => v + rho * (pire.x[d] - v)));
      if (contracte.fx < pire.fx) {
        simplexe[n] = contracte;
      } else {
        for (let m = 1; m <= n; m++) {
          simplexe[m] = point(simplexe[0].x.map((v, d) => v + sigma * (simplexe[m].x[d] - v)));
        }
      }
    }
  }
  simplexe.sort((a, b) => a.fx - b.fx);
  return { x: simplexe[0].x, fx: simplexe[0].fx };
}

/** Plusieurs départs, on garde le meilleur : évite les minima locaux plats. */
export function nelderMeadMulti(fn, departs, opt) {
  let meilleur = null;
  for (const d of departs) {
    const r = nelderMead(fn, d, opt);
    if (!meilleur || r.fx < meilleur.fx) meilleur = r;
  }
  return meilleur;
}
