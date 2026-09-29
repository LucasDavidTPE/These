"""Solveur axisymétrique (transformée de Hankel) pour une charge circulaire uniforme.

Même noyau que le solveur 2D ; seule l'inversion change :
  f(r)   = 1/(2 pi) int_0^inf F(xi) J0(xi r) xi dxi          (grandeurs scalaires)
  u_r(r) = -1/(2 pi) int_0^inf U(xi) J1(xi r) xi dxi
Utile pour : la validation croisée du solveur 2D, les calculs type Burmister, et le HWD en
fréquentiel (plaque circulaire, régime Harmonic). Régimes admis : Static et Harmonic
(le noyau ne dépend alors que de xi).
"""
from __future__ import annotations

from typing import Dict, Sequence

import numpy as np
from scipy.special import j0, j1

from .kernel import LayeredKernel
from .loads import _j1x
from .regimes import Harmonic, Moving, Static
from .spectral import layer_moduli


def _xi_nodes(a, rmax, zmin, xi_max=None, per_panel=16):
    """Nœuds/poids de Gauss sur [0, xi_max] avec des panneaux adaptés aux oscillations."""
    if xi_max is None:
        xi_max = 60.0 / zmin if zmin > 0 else 2000.0 / a
        xi_max = min(xi_max, 4000.0 / a)
    width = np.pi / (2 * max(rmax + a, a))
    # panneaux géométriques près de 0, puis réguliers
    edges = [0.0]
    e = min(width, 1e-3 / a)
    while e < width:
        edges.append(e)
        e *= 3
    x = width
    while x < xi_max:
        edges.append(x)
        x += width
    edges.append(xi_max)
    g, w = np.polynomial.legendre.leggauss(per_panel)
    nodes, weights = [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        nodes.append(0.5 * (hi - lo) * g + 0.5 * (hi + lo))
        weights.append(0.5 * (hi - lo) * w)
    return np.concatenate(nodes), np.concatenate(weights)


def solve_axisym(structure, p: float, a: float, r: Sequence[float], z: Sequence[float],
                 regime=None, side: str = "above", xi_max=None, per_panel: int = 16) -> Dict[str, np.ndarray]:
    """Réponse d'un multicouche à une pression uniforme p (Pa) sur un disque de rayon a (m).

    Renvoie un dict de tableaux (nz, nr) : uz, ur, szz, srr, stt, srz, ezz, err, ett, erz
    (déformations tensorielles ; contraintes en Pa, compression négative).
    """
    regime = Static() if regime is None else regime
    if isinstance(regime, Moving):
        raise ValueError("Le solveur axisymétrique n'admet pas de charge roulante (utiliser solve_grid).")
    r = np.atleast_1d(np.asarray(r, float))
    z = np.atleast_1d(np.asarray(z, float))
    xi, wq = _xi_nodes(a, r.max(), z.min(), xi_max, per_panel)
    omega = regime.omega(xi, 0 * xi)
    lam, mu = layer_moduli(structure, omega)
    K = LayeredKernel(structure, xi, lam, mu)
    ph = p * 2 * np.pi * a**2 * _j1x(xi * a)  # transformée de la charge
    XR = xi[:, None] * r[None, :]
    J0 = j0(XR)
    J1 = j1(XR)
    with np.errstate(invalid="ignore", divide="ignore"):
        J1x = np.where(XR > 1e-12, J1 / XR, 0.5)
    base = (wq * xi * ph)[:, None] / (2 * np.pi)
    out = {k: np.zeros((z.size, r.size), complex) for k in
           ("uz", "ur", "szz", "srr", "stt", "srz", "ezz", "err", "ett", "erz")}
    for iz, zz in enumerate(z):
        amp = K.at_depth(zz, side)
        U, W, dU, dW = amp["n"]
        mr = amp["mu_ref"]
        la, m = amp["lam"], amp["mu"]
        Uc = (U / mr)[:, None]        # = xi * U_phys
        # grandeurs spectrales
        uz = (W / (mr * xi))[:, None] * J0
        ur = -(U / (mr * xi))[:, None] * J1
        ezz = (dW / mr)[:, None] * J0
        err = -Uc * (J0 - J1x)
        ett = -Uc * J1x
        erz = -0.5 * ((dU + W) / mr)[:, None] * J1
        tr = err + ett + ezz
        L_ = la[:, None]
        M_ = m[:, None]
        vals = dict(uz=uz, ur=ur, ezz=ezz, err=err, ett=ett, erz=erz,
                    szz=L_ * tr + 2 * M_ * ezz, srr=L_ * tr + 2 * M_ * err,
                    stt=L_ * tr + 2 * M_ * ett, srz=2 * M_ * erz)
        for k, v in vals.items():
            out[k][iz] = np.sum(base * v, axis=0)
    if isinstance(regime, Static) or not any(np.iscomplexobj(v) and np.abs(v.imag).max() > 0 for v in out.values()):
        out = {k: v.real for k, v in out.items()}
    return out
