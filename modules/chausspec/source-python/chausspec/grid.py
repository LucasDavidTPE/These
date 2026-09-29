"""Solveur « champ » : double transformée de Fourier sur une grille (x, y).

Le spectre F(k1, k2) est découpé par une partition de l'unité (notice, §4.4) :
    F = (1 - phi(k1)) F                    -> FFT 2D (périodique, mais de moyenne nulle en x)
      + phi(k1) (1 - psi(k2)) F            -> intégrale continue en k1, FFT en y
      + phi(k1) psi(k2) F                  -> intégrale continue 2D (non périodique)
avec phi, psi des gaussiennes de largeur quelques pas de Fourier. Les grandes longueurs d'onde
(longue mémoire viscoélastique derrière une charge roulante, décroissance lente des champs en
profondeur, déflexion absolue sur massif semi-infini) sont ainsi intégrées sans périodisation :
un domaine de quelques fois l'emprise du chargement suffit.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Iterable, Optional, Sequence, Tuple

import numpy as np

from .regimes import Moving, Regime
from .spectral import ALL, STRAIN, spectral_fields

ODD_Y = ("uy", "exy", "eyz", "sxy", "syz")


@dataclass
class GridResult:
    x: np.ndarray
    y: np.ndarray
    fields: Dict[Tuple[str, float], np.ndarray]
    meta: dict

    # ------------------------------------------------------------------------------
    def __getitem__(self, key):
        return self.fields[key]

    def get(self, comp: str, z: float):
        return self.fields[(comp, z)]

    def interp(self, comp: str, z: float, x, y):
        """Interpolation bilinéaire du champ (comp, z) aux points (x, y)."""
        from scipy.interpolate import RegularGridInterpolator

        f = self.fields[(comp, z)]
        it = RegularGridInterpolator((self.y, self.x), f.real if not np.iscomplexobj(f) else f,
                                     bounds_error=False, fill_value=np.nan)
        x, y = np.broadcast_arrays(np.asarray(x, float), np.asarray(y, float))
        return it(np.stack([y.ravel(), x.ravel()], -1)).reshape(x.shape)

    def line_x(self, comp, z, y0):
        """Coupe longitudinale (selon x) en y = y0 (nœud de grille le plus proche)."""
        j = int(np.argmin(np.abs(self.y - y0)))
        return self.x, self.fields[(comp, z)][j, :]

    def line_y(self, comp, z, x0):
        i = int(np.argmin(np.abs(self.x - x0)))
        return self.y, self.fields[(comp, z)][:, i]

    def strain_tensor(self, z):
        g = lambda c: self.fields[(c, z)]
        exx, eyy, ezz, exy, exz, eyz = (g(c) for c in STRAIN)
        E = np.stack([np.stack([exx, exy, exz], -1),
                      np.stack([exy, eyy, eyz], -1),
                      np.stack([exz, eyz, ezz], -1)], -2)
        return E

    def principal_strains(self, z):
        """Déformations principales (triées croissantes) : tableau (..., 3)."""
        E = self.strain_tensor(z)
        if np.iscomplexobj(E):
            raise ValueError("Champs complexes (régime harmonique) : prendre la partie réelle à un instant.")
        return np.linalg.eigvalsh(E)

    def argmax(self, comp, z, absolute=False):
        f = self.fields[(comp, z)]
        f = np.abs(f) if absolute else f
        j, i = np.unravel_index(np.nanargmax(f), f.shape)
        return float(f[j, i]), float(self.x[i]), float(self.y[j])

    def time_signal(self, comp, z, x_gauge, y_gauge, speed):
        """Signal temporel vu par une jauge fixe en (x_gauge, y_gauge) pour une charge roulante.

        Le champ est calculé dans le repère mobile X = x - V t (chargement centré en X = 0 à
        t = 0). La jauge voit f(X = x_gauge - V t). Renvoie (t, f(t)).
        """
        X, f = self.line_x(comp, z, y_gauge)
        t = (x_gauge - X) / speed
        order = np.argsort(t)
        return t[order], f[order]


def _gauss(n):
    g, w = np.polynomial.legendre.leggauss(n)
    return g, w


def band_nodes(kmax, xmax, rel_min=1e-7, per_panel=8, ratio=4.0):
    """Nœuds/poids de quadrature sur [0, kmax] : panneaux géométriques vers 0 (le noyau varie
    sur une échelle logarithmique en k1 quand le matériau a des temps de relaxation longs),
    puis panneaux réguliers assez fins pour la phase exp(i k1 X), |X| <= xmax."""
    width = min(kmax / 8, 5.0 / max(xmax, 1e-9))
    edges = [0.0, width * rel_min]
    while edges[-1] * ratio < width:
        edges.append(edges[-1] * ratio)
    e = edges[-1]
    while e + width < kmax:
        e += width
        edges.append(e)
    edges.append(kmax)
    g, w = _gauss(per_panel)
    nodes, weights = [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        nodes.append(0.5 * (hi - lo) * g + 0.5 * (hi + lo))
        weights.append(0.5 * (hi - lo) * w)
    return np.concatenate(nodes), np.concatenate(weights)


def solve_grid(structure, loading, regime: Regime, depths: Sequence[float],
               comps: Iterable[str] = ("uz", "exx", "eyy", "ezz", "exy", "exz", "eyz"),
               L: Tuple[float, float] = (16.0, 16.0), N: Tuple[int, int] = (1024, 1024),
               center: Tuple[float, float] = (0.0, 0.0), window: Optional[Tuple[float, float, float, float]] = None,
               side: str = "above", filter_width: float = 0.0,
               band: Optional[float] = None, chunk: int = 16384, store: str = "complex128",
               sym_y: bool = False, k1_shift: float = 0.0, specfun=None,
               verbose: bool = False) -> GridResult:
    """Champs mécaniques sur des plans horizontaux z = depths.

    Parameters
    ----------
    structure, loading, regime : voir structure.py, loads.py, regimes.py
    depths : profondeurs (m). Sur une interface, side="above" prend la couche supérieure.
    comps : composantes parmi ux uy uz exx eyy ezz exy exz eyz sxx syy szz sxy sxz syz.
            Les déformations sont tensorielles (exz = gamma_xz / 2), en m/m.
    L, N : taille (m) et nombre de points du domaine périodique selon (x, y). N pair.
    center : centre du domaine ; window : (xmin, xmax, ymin, ymax) pour ne garder qu'une zone.
    filter_width : largeur (m) d'un filtre gaussien appliqué au chargement (0 = aucun).
    band : largeur relative b de la partition de l'unité en k1 (notice §4.4). Le spectre est
           scindé en F = (1 - phi) F + phi F avec phi(k1) = exp(-(k1 / (b dk1))^2 / 2) :
           (1 - phi) F est sommé par FFT (périodique), phi F est intégré continûment en k1
           (quadrature géométrique vers 0 + phases exactes : non périodique en x). De même en k2
           avec psi(k2) : le coin phi.psi F est intégré en 2D, ce qui supprime aussi la
           périodisation en y des grandes longueurs d'onde (déflexions absolues). Défaut b = 2.
    k1_shift : décalage géométrique du noyau (voir spectral_fields ; régime MovingEnvelope).
    specfun : fonction specfun(K1, K2) -> dict[(comp, z)] remplaçant le calcul multicouche
              (permet d'inverser n'importe quel spectre avec la même partition de l'unité).
    sym_y : chargement symétrique par rapport à y = 0 (ex. atterrisseur centré, charges normales
            seulement) : seule la moitié k2 >= 0 est calculée, le reste par parité (temps / 2).
    store : précision de stockage des spectres ("complex128" ou "complex64" pour diviser la
            mémoire par deux sur les grosses grilles ; précision relative ~1e-7).
    """
    comps = tuple(comps)
    for c in comps:
        if c not in ALL and specfun is None:
            raise ValueError(f"composante inconnue : {c}")
    depths = [float(z) for z in depths]
    Lx, Ly = map(float, L)
    Nx, Ny = map(int, N)
    dx, dy = Lx / Nx, Ly / Ny
    x0 = center[0] - Lx / 2
    y0 = center[1] - Ly / 2
    herm = regime.hermitian
    k1 = 2 * np.pi * (np.fft.rfftfreq(Nx, dx) if herm else np.fft.fftfreq(Nx, dx))
    k2 = 2 * np.pi * np.fft.fftfreq(Ny, dy)
    dk1, dk2 = 2 * np.pi / Lx, 2 * np.pi / Ly
    nk1 = k1.size
    if band is None:
        band = 2.0
    kphi = band * dk1
    kpsi = band * dk2
    phi = lambda k: np.exp(-0.5 * (k / kphi) ** 2)
    psi = lambda k: np.exp(-0.5 * (k / kpsi) ** 2)
    x = x0 + dx * np.arange(Nx)
    y = y0 + dy * np.arange(Ny)
    if window is not None:
        ix = np.nonzero((x >= window[0]) & (x <= window[1]))[0]
        iy = np.nonzero((y >= window[2]) & (y <= window[3]))[0]
    else:
        ix = np.arange(Nx)
        iy = np.arange(Ny)
    F = {(c, z): np.zeros((Ny, nk1), np.dtype(store)) for c in comps for z in depths}
    t0 = time.time()
    kw = dict(comps=comps, side=side, filter_width=filter_width, k1_shift=k1_shift)
    if specfun is not None:
        # spectre fourni par l'utilisateur : specfun(K1, K2) -> dict[(comp, z)] -> tableau
        _sf = lambda st_, rg_, ld_, K1_, K2_, dp_, **kw_: specfun(np.asarray(K1_, float), np.asarray(K2_, float))
    else:
        _sf = spectral_fields

    # ---- 1) partie haute (1 - phi) F : somme discrète par FFT ---------------------------------------
    cols = np.nonzero(k1 != 0)[0]
    # symétrie y -> -y : on ne calcule que k2 >= 0 puis on complète par parité
    if sym_y:
        if loading.has_tangential:
            raise ValueError("sym_y n'est prévu que pour des charges purement normales.")
        rows_c = np.r_[np.nonzero(k2 >= 0)[0], [Ny // 2] if Ny % 2 == 0 else []].astype(int)
        mirror = [(r, (Ny - r) % Ny) for r in rows_c if 0 < r < Ny // 2]
        sgn = {c: (-1.0 if c in ODD_Y else 1.0) for c in comps}
    else:
        rows_c = np.arange(Ny)
    ncol_chunk = max(1, chunk // rows_c.size)
    for i0 in range(0, cols.size, ncol_chunk):
        cc = cols[i0:i0 + ncol_chunk]
        K1, K2 = np.meshgrid(k1[cc], k2[rows_c])
        res = _sf(structure, regime, loading, K1, K2, depths, **kw)
        wcol = (1.0 - phi(k1[cc]))[None, :]
        for key, v in res.items():
            F[key][rows_c[:, None], cc[None, :]] = v * wcol
            if sym_y:
                src = np.array([m[0] for m in mirror]); dst = np.array([m[1] for m in mirror])
                F[key][dst[:, None], cc[None, :]] = sgn[key[0]] * F[key][src[:, None], cc[None, :]]
        if verbose and (i0 // ncol_chunk) % 20 == 0:
            print(f"  colonnes {i0 + cc.size}/{cols.size}  ({time.time() - t0:.1f} s)")

    fields = {}
    ph = np.exp(1j * (k1[None, :] * x0 + k2[:, None] * y0))
    for key, Fk in F.items():
        Fk = Fk * ph
        F[key] = None
        if herm:
            f = np.fft.irfft2(Fk, s=(Ny, Nx)) / (dx * dy)
        else:
            f = np.fft.ifft2(Fk) / (dx * dy)
        fields[key] = f[np.ix_(iy, ix)].copy()
        del f, Fk

    # ---- 2) partie phi(k1) (1 - psi(k2)) F : continue en k1, discrète en k2 ------------------------
    xs = x[ix]
    ys = y[iy]
    xmax = max(np.max(np.abs(xs)), 1.0)
    ymax = max(np.max(np.abs(ys)), 1.0)
    qn, qw = band_nodes(6.0 * kphi, xmax)
    qw = qw * phi(qn)
    qn = np.concatenate([-qn[::-1], qn])
    qw = np.concatenate([qw[::-1], qw])
    rows = (np.r_[np.nonzero(k2 > 0)[0], [Ny // 2] if Ny % 2 == 0 else []].astype(int) if sym_y
            else np.nonzero(k2 != 0)[0])
    wrow = (1.0 - psi(k2[rows]))[:, None]
    B = {key: np.zeros((Ny, xs.size), complex) for key in fields}
    step = max(1, chunk // max(rows.size, 1))
    for i0 in range(0, qn.size, step):
        qq = qn[i0:i0 + step]
        ww = qw[i0:i0 + step]
        E = np.exp(1j * np.outer(qq, xs)) * ww[:, None]              # (nq, nx)
        K1, K2 = np.meshgrid(qq, k2[rows])
        res = _sf(structure, regime, loading, K1, K2, depths, **kw)
        for key, v in res.items():
            B[key][rows] += (v * wrow) @ E
    if sym_y:
        src = np.array([m[0] for m in mirror]); dst = np.array([m[1] for m in mirror])
        for key in B:
            B[key][dst] = sgn[key[0]] * B[key][src]
    phy = np.exp(1j * k2 * y0)[:, None]
    for key in fields:
        fb = np.fft.ifft(B[key] * phy, axis=0) * Ny / (2 * np.pi * Ly)
        fb = fb[iy]
        fields[key] = fields[key] + (fb.real if herm else fb)
        B[key] = None

    # ---- 3) coin phi(k1) psi(k2) F : intégrale continue 2D (non périodique en x et en y) ------------
    rn, rw = band_nodes(6.0 * kpsi, ymax)
    rw = rw * psi(rn)
    rn = np.concatenate([-rn[::-1], rn])
    rw = np.concatenate([rw[::-1], rw])
    E2 = np.exp(1j * np.outer(ys, rn)) * rw[None, :]                  # (ny, nr)
    Cc = {key: np.zeros((ys.size, xs.size), complex) for key in fields}
    step = max(1, chunk // rn.size)
    for i0 in range(0, qn.size, step):
        qq = qn[i0:i0 + step]
        ww = qw[i0:i0 + step]
        E1 = np.exp(1j * np.outer(qq, xs)) * ww[:, None]              # (nq, nx)
        K1, K2 = np.meshgrid(qq, rn)                                   # (nr, nq)
        res = _sf(structure, regime, loading, K1, K2, depths, **kw)
        for key, v in res.items():
            Cc[key] += E2 @ (v @ E1)
    for key in fields:
        fc = Cc[key] / (4 * np.pi**2)
        fields[key] = fields[key] + (fc.real if herm else fc)
    meta = dict(L=(Lx, Ly), N=(Nx, Ny), dx=dx, dy=dy, regime=repr(regime), band=band,
                n_band_nodes=(int(qn.size), int(rn.size)), cpu_s=time.time() - t0, force=loading.force())
    if verbose:
        print(f"  terminé en {meta['cpu_s']:.1f} s")
    return GridResult(x[ix], y[iy], fields, meta)
