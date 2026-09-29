"""Couplage deux échelles : effet de la texture de surface sur la réponse de la chaussée.

Décomposition (notice « texture », §4) : la pression réelle sous le pneu s'écrit
    p(x, y, t) = p0(x - Vt, y) + dp(x, y, t),
avec p0 la pression nominale (échelle du pneu, celle du TFE) et dp la perturbation due à la
texture, de moyenne nulle à l'échelle de la cellule de texture Λ << longueur de contact.

  1. La réponse à p0 est la charge roulante viscoélastique multicouche (solve_grid, Moving).
  2. dp n'agit que sur une épaisseur ~ Λ / 2pi << épaisseur de la couche de roulement : sa réponse
     est celle d'un massif homogène (la couche de surface). Pour un corps homogène à coefficient
     de Poisson constant chargé en effort :
       - les contraintes ne dépendent pas du module : dsigma = dsigma_stat[dp] (exact) ;
       - les déformations suivent l'intégrale d'hérédité. Au premier ordre en Λ / L, dp(x, s) est
         proportionnel à l'enveloppe p0(x - Vs) au point x, d'où la formule multiplicative
             deps(x, y, z) = deps_stat[dp ; E_s](x, y, z) . E_s . C(X, y),
             C = Q / p0,   Q^(k) = p0^(k) / E*(omega = -k1 V),
         où C(X, y) est la « souplesse effective » vue par un point situé sous le pneu en X (elle
         tient compte de toute l'histoire du chargement : roues précédentes, fluage).
  3. La validité de 2 est contrôlée par le calcul exact des harmoniques (validation T3).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Sequence

import numpy as np

from .grid import solve_grid
from .kernel import LayeredKernel
from .materials import Elastic, Material
from .regimes import Moving
from .spectral import components_from_amplitudes
from .structure import Layer, Structure

STRAINS = ("exx", "eyy", "ezz", "exy", "exz", "eyz")


def effective_compliance(loading, material: Material, speed, L=(6.0, 3.0), N=(1024, 512), window=None, thr=0.2):
    """Souplesse effective C(X, y) = Q / p0 (1/Pa) du matériau de surface sous une charge roulante.

    Renvoie (x, y, C, p0) sur la grille demandée. Là où p0 < thr . max(p0) (bords d'empreinte,
    où le rapport Q / p0 est mal conditionné), C vaut NaN : l'appelant le prolonge par le plus
    proche voisin (dp y est faible)."""
    def spec(K1, K2):
        p = loading.ft(K1, K2)[0]
        E = material.young(-K1 * speed)
        return {("Q", 0.0): p / E, ("P", 0.0): p}

    g = solve_grid(None, loading, Moving(speed), depths=[0.0], comps=("Q", "P"), L=L, N=N,
                   window=window, specfun=spec)
    P = g["P", 0.0]
    C = np.where(P > thr * P.max(), g["Q", 0.0] / np.where(P > 0, P, 1.0), np.nan)
    return g.x, g.y, C, P


def _halfspace_unit_coeffs(nu):
    """Coefficients réduits (A, B) de la solution d'un massif semi-infini homogène sous pression
    unitaire : indépendants de xi dans la mise à l'échelle de chausspec."""
    m = Elastic(1.0, nu)
    st = Structure([Layer(m, 1.0)], bottom="halfspace")
    lam, mu = m.lame(np.zeros(1))
    K = LayeredKernel(st, np.array([1.0]), [lam], [mu])
    return K._coefficients(0)[0, :, 0], m


_AMP_CACHE = {}


def _halfspace_amplitudes(nu):
    """Amplitudes réduites du massif semi-infini homogène pour les trois chargements unitaires
    (normal, tangentiel P-SV, SH). Par invariance d'échelle, chacune vaut f(xi z) avec
    f(t) = (a + b t) e^{-t} ; on identifie (a, b) à partir du noyau multicouche général évalué
    en xi = 1 et on contrôle la forme en un troisième point. Renvoie dict fam -> [(a, b), ...]."""
    if nu in _AMP_CACHE:
        return _AMP_CACHE[nu]
    m = Elastic(1.0, nu)
    st = Structure([Layer(m, 1.0)], bottom="halfspace")
    lam, mu = m.lame(np.zeros(1))
    K = LayeredKernel(st, np.array([1.0]), [lam], [mu], tangential=True)
    t1, t2 = 0.4, 1.3
    A0, A1, A2 = (K.at_depth(z) for z in (0.0, t1, t2))
    out = {}
    for fam in ("n", "t", "sh"):
        coeffs = []
        for f0, f1, f2 in zip(A0[fam], A1[fam], A2[fam]):
            a = complex(np.ravel(f0)[0])
            b = (complex(np.ravel(f1)[0]) * np.exp(t1) - a) / t1
            chk = (a + b * t2) * np.exp(-t2)
            if abs(chk - complex(np.ravel(f2)[0])) > 1e-9 * (1 + abs(a) + abs(b)):
                raise RuntimeError("forme (a + b t) e^-t non vérifiée")
            coeffs.append((a, b))
        out[fam] = coeffs
    _AMP_CACHE[nu] = out
    return out


def local_response(dp, dx, dy, depths: Sequence[float], nu=0.35, E_s=1.0e9, comps=STRAINS,
                   dqx=None, dqy=None):
    """Réponse statique d'un massif semi-infini homogène (E_s en Pa, nu) à une perturbation de
    pression dp (Pa) et, en option, d'efforts tangentiels dqx, dqy (Pa, exercés par le pneu sur la
    chaussée), donnés sur une grille régulière (ny, nx) supposée périodique (prévoir une marge où
    les efforts sont nuls). Renvoie dict[(comp, z)] -> tableau (ny, nx) réel.

    Évaluation directe en forme fermée : chaque amplitude vaut (a + b xi z) e^{-xi z}.
    """
    ny, nx = dp.shape
    F = np.fft.rfft2(dp) * dx * dy
    k1 = 2 * np.pi * np.fft.rfftfreq(nx, dx)
    k2 = 2 * np.pi * np.fft.fftfreq(ny, dy)
    K1, K2 = np.meshgrid(k1, k2)
    xi = np.hypot(K1, K2)
    xi[0, 0] = 1.0
    c1, c2 = K1 / xi, K2 / xi
    T0 = R0 = None
    if dqx is not None or dqy is not None:
        from .spectral import tangential_decomposition
        Qx = None if dqx is None else np.fft.rfft2(dqx) * dx * dy
        Qy = None if dqy is None else np.fft.rfft2(dqy) * dx * dy
        T0, R0 = tangential_decomposition(c1, c2, Qx, Qy)
    co = _halfspace_amplitudes(float(nu))
    lam = E_s * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E_s / (2 * (1 + nu))
    out = {}
    for z in depths:
        tz = xi * z
        e = np.exp(-tz)
        amp = {fam: tuple(((a + b * tz) * e).real if abs(np.imag(a)) + abs(np.imag(b)) == 0 else (a + b * tz) * e
                          for a, b in co[fam]) for fam in co}
        amp.update(lam=lam, mu=mu, mu_ref=mu)
        res = components_from_amplitudes(amp, xi, c1, c2, F, T0, R0, comps)
        for c, v in res.items():
            v = np.array(v)
            v[0, 0] = 0.0              # efforts de moyenne nulle
            out[(c, z)] = np.fft.irfft2(v, s=(ny, nx)) / (dx * dy)
    return out


def principal_max(fields, z):
    """Déformation principale majeure en chaque point (tableau)."""
    g = lambda c: fields[(c, z)]
    E = np.stack([np.stack([g("exx"), g("exy"), g("exz")], -1),
                  np.stack([g("exy"), g("eyy"), g("eyz")], -1),
                  np.stack([g("exz"), g("eyz"), g("ezz")], -1)], -2)
    return np.linalg.eigvalsh(E)[..., 2]


# =============================================================================================
# Méthode héréditaire exacte (remplace la formule multiplicative pour les textures non linéaires)
# =============================================================================================
def envelope_sampler(loading, xs, ys):
    """Renvoie une fonction s -> p0(xs - V s, ys) sur la grille (ys, xs), avec un chemin rapide pour
    les empreintes séparables (Separable, UniformRect) : f_y(y) est calculé une fois pour toutes."""
    from .loads import Scaled, Separable, UniformRect
    parts = []
    for w in loading.wheels:
        fp, fac = w.footprint, 1.0
        while isinstance(fp, Scaled):
            fac *= fp.factor
            fp = fp.base
        if isinstance(fp, Separable):
            fy = fac * fp.amplitude * fp.fy.sample(ys - w.y0)
            if np.any(fy != 0):
                parts.append(("sep", fy, (lambda xx, fp=fp: fp.fx.sample(xx)), w.x0))
        elif isinstance(fp, UniformRect):
            fy = fac * fp.p * (np.abs(ys - w.y0) < fp.ly / 2)
            if np.any(fy != 0):
                parts.append(("sep", fy.astype(float), (lambda xx, fp=fp: (np.abs(xx) < fp.lx / 2).astype(float)), w.x0))
        else:
            parts.append(("gen", w, None, None))
    X, Y = None, None

    def sample(shift):
        nonlocal X, Y
        out = np.zeros((ys.size, xs.size))
        for kind, a, b, x0 in parts:
            if kind == "sep":
                out += np.outer(a, b(xs - shift - x0))
            else:
                if X is None:
                    X, Y = np.meshgrid(xs, ys)
                out += a.sample(X - shift, Y)
        return out
    return sample


def hereditary_perturbation(sample, modulation, kvg, speed, s_start, ds, E_s=1.0e9, mask=None,
                            dtype=np.float32, tau_min_frac=0.02):
    """Pression perturbatrice « héréditaire » équivalente à l'instant t = 0.

    Pour un massif homogène à coefficient de Poisson constant, la réponse viscoélastique à dp(x, s)
    vaut G_1[pi] avec pi(x) = int_{-inf}^{0} J(-s) d_s dp(x, s) (G_1 : opérateur élastique de module
    unité, linéaire en espace ; il commute avec l'intégrale d'hérédité). On renvoie dp_eq = pi . E_s,
    à passer à local_response(..., E_s=E_s).

    sample(shift) -> p0(x - shift, y) sur la grille complète ; modulation(p0_actifs) -> m aux points
    actifs ; kvg : GeneralizedKelvinVoigt. mask : points actifs (où p0 est non nul à un instant de
    l'histoire) ; ailleurs dp_eq = 0. Intégration exacte pas à pas (dp linéaire sur chaque pas).
    Les cellules de Kelvin-Voigt de temps caractéristique < tau_min_frac . ds sont instantanées :
    leur souplesse est entièrement dans J(0+) et leur variable interne est nulle.
    """
    Ei = np.asarray(kvg.Ei, float) * 1e6
    ti = np.asarray(kvg.taui, float)
    E0 = kvg.E0 * 1e6
    Jinf = 1.0 / E0 + np.sum(1.0 / Ei)
    keep = ti >= tau_min_frac * ds
    Ek, tk = Ei[keep], ti[keep]
    s_grid = np.arange(s_start, 0.0 + ds / 2, ds)
    full_shape = None
    prev = acc = h = None
    last = s_grid[0]
    for s in s_grid:
        p0f = sample(speed * s)
        if full_shape is None:
            full_shape = p0f.shape
            if mask is None:
                mask = np.ones(full_shape, bool)
        p0 = p0f[mask]
        if not np.any(p0 > 0) and (prev is None or not np.any(prev)):
            continue
        dp = np.zeros(p0.shape, dtype)
        on = p0 > 0
        if np.any(on):
            m = modulation(p0)
            dp[on] = (p0 * (m - 1.0))[on]
        if prev is None:
            prev = np.zeros_like(dp)
            acc = np.zeros_like(dp)
            h = np.zeros((tk.size,) + dp.shape, dtype)
            last = s - ds
        gap = s - last
        if gap > 1.5 * ds:          # pas de variation de dp : relaxation des variables internes
            h *= np.exp(-(gap - ds) / tk).astype(dtype)[:, None]
        dec = np.exp(-ds / tk).astype(dtype)[:, None]
        gain = (tk * (1 - np.exp(-ds / tk)) / ds).astype(dtype)[:, None]
        dlt = dp - prev
        h *= dec
        h += gain * dlt[None]
        acc += dlt
        prev = dp
        last = s
    out = np.zeros(full_shape)
    if acc is None:
        return out
    pi = acc.astype(float) * Jinf - np.sum(h.astype(float) / Ek[:, None], axis=0)
    out[mask] = pi * E_s
    return out
