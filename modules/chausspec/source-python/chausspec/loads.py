"""Empreintes de chargement et leur transformée de Fourier 2D.

Axes : x = longitudinal (sens de roulement), y = transversal, z = profondeur (vers le bas).
Convention de Fourier :  f^(k1, k2) = int int f(x, y) exp(-i (k1 x + k2 y)) dx dy.

Toutes les pressions sont en Pa, les longueurs en m, les forces en N. Une pression positive
est dirigée vers le bas (compression de la surface).

Chaque empreinte fournit :
  ft(k1, k2)   : transformée analytique (ou exacte pour une carte en pixels) ;
  sample(x, y) : valeurs dans l'espace physique (tracés, contrôles) ;
  force()      : résultante = ft(0, 0).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Union

import numpy as np
from scipy.special import j1


def _j1x(x):
    """J1(x)/x, prolongée par 1/2 en 0."""
    x = np.asarray(x, float)
    out = np.full(x.shape, 0.5)
    nz = np.abs(x) > 1e-8
    out[nz] = j1(x[nz]) / x[nz]
    return out


# =========================================================================================
# Profils 1D (pour les empreintes séparables p(x, y) = A . fx(x) . fy(y))
# =========================================================================================
class Profile1D:
    def ft(self, k):  # pragma: no cover
        raise NotImplementedError

    def sample(self, s):  # pragma: no cover
        raise NotImplementedError

    def integral(self) -> float:
        return float(np.real(self.ft(np.array([0.0]))[0]))


@dataclass
class Box1D(Profile1D):
    """Créneau unitaire de demi-largeur a centré en 0."""

    a: float

    def ft(self, k):
        k = np.asarray(k, float)
        return (2 * self.a * np.sinc(k * self.a / np.pi)).astype(complex)

    def sample(self, s):
        return (np.abs(s) < self.a).astype(float)


@dataclass
class HalfEllipse1D(Profile1D):
    """sqrt(max(0, 1 - (s/c)^2)) : profil longitudinal du TFE (demi-ellipse, b = 1)."""

    c: float

    def ft(self, k):
        k = np.asarray(k, float)
        return (np.pi * self.c * _j1x(k * self.c)).astype(complex)

    def sample(self, s):
        return np.sqrt(np.clip(1 - (np.asarray(s) / self.c) ** 2, 0, None))


@dataclass
class GaussianPairs1D(Profile1D):
    """Somme de gaussiennes symétriques : sum_i P_i [g(s - s_i) + g(s + s_i)],
    g(u) = exp(-u^2 / (2 sig_i^2)).  C'est la fonction transversale T du TFE (Annexe III).
    P_i sans dimension (niveaux relatifs) ou en Pa si l'amplitude globale vaut 1.
    """

    P: Sequence[float]
    centers: Sequence[float]
    sig: Sequence[float]

    def ft(self, k):
        k = np.asarray(k, float)[..., None]
        P, c, s = (np.asarray(v, float) for v in (self.P, self.centers, self.sig))
        g = P * s * np.sqrt(2 * np.pi) * np.exp(-0.5 * (k * s) ** 2) * 2 * np.cos(k * c)
        return g.sum(-1).astype(complex)

    def sample(self, u):
        u = np.asarray(u, float)[..., None]
        P, c, s = (np.asarray(v, float) for v in (self.P, self.centers, self.sig))
        g = P * (np.exp(-((u - c) ** 2) / (2 * s**2)) + np.exp(-((u + c) ** 2) / (2 * s**2)))
        return g.sum(-1)


@dataclass
class Tabulated1D(Profile1D):
    """Profil tabulé, interpolé linéairement entre points régulièrement espacés (nul hors plage).

    Transformée exacte de l'interpolant linéaire : d . sinc^2(k d / 2) . sum_n f_n exp(-i k s_n).
    Les points non équidistants sont rééchantillonnés.
    """

    s: Sequence[float]
    f: Sequence[float]

    def __post_init__(self):
        s = np.asarray(self.s, float)
        f = np.asarray(self.f, float)
        d = np.diff(s)
        if np.ptp(d) > 1e-9 * np.mean(d):
            n = len(s)
            s2 = np.linspace(s[0], s[-1], n)
            f = np.interp(s2, s, f)
            s = s2
        # zéro aux extrémités pour que l'interpolant soit à support compact
        d = s[1] - s[0]
        self._s = np.concatenate([[s[0] - d], s, [s[-1] + d]]) if (f[0] != 0 or f[-1] != 0) else s
        self._f = np.concatenate([[0.0], f, [0.0]]) if (f[0] != 0 or f[-1] != 0) else f
        self._d = d

    def ft(self, k):
        k = np.asarray(k, float)
        d = self._d
        sh = k.shape
        kk = k.reshape(-1, 1)
        S = np.exp(-1j * kk * self._s[None, :]) @ self._f
        return (d * np.sinc(kk[:, 0] * d / (2 * np.pi)) ** 2 * S).reshape(sh)

    def sample(self, u):
        return np.interp(u, self._s, self._f, left=0.0, right=0.0)


# =========================================================================================
# Empreintes 2D
# =========================================================================================
class Footprint:
    def ft(self, k1, k2):  # pragma: no cover
        raise NotImplementedError

    def sample(self, x, y):  # pragma: no cover
        raise NotImplementedError

    def force(self) -> float:
        return float(np.real(self.ft(np.array([0.0]), np.array([0.0]))[0]))

    def scaled_to(self, F: float) -> "Scaled":
        """Renvoie l'empreinte multipliée pour que sa résultante vaille F (N)."""
        return Scaled(self, F / self.force())

    def peak(self, n: int = 801, half_size: float = 0.5) -> float:
        g = np.linspace(-half_size, half_size, n)
        X, Y = np.meshgrid(g, g)
        return float(np.max(self.sample(X, Y)))


@dataclass
class Scaled(Footprint):
    base: Footprint
    factor: float

    def ft(self, k1, k2):
        return self.factor * self.base.ft(k1, k2)

    def sample(self, x, y):
        return self.factor * self.base.sample(x, y)


@dataclass
class UniformRect(Footprint):
    """Pression uniforme p (Pa) sur un rectangle lx (selon x) par ly (selon y), centré en 0."""

    p: float
    lx: float
    ly: float

    def ft(self, k1, k2):
        k1, k2 = np.broadcast_arrays(np.asarray(k1, float), np.asarray(k2, float))
        return (self.p * self.lx * np.sinc(k1 * self.lx / (2 * np.pi))
                * self.ly * np.sinc(k2 * self.ly / (2 * np.pi))).astype(complex)

    def sample(self, x, y):
        return self.p * ((np.abs(x) < self.lx / 2) & (np.abs(y) < self.ly / 2))


@dataclass
class UniformCircle(Footprint):
    """Pression uniforme p (Pa) sur un disque de rayon R."""

    p: float
    R: float

    def ft(self, k1, k2):
        xi = np.hypot(k1, k2)
        return (self.p * 2 * np.pi * self.R**2 * _j1x(xi * self.R)).astype(complex)

    def sample(self, x, y):
        return self.p * (np.hypot(x, y) <= self.R)


@dataclass
class Separable(Footprint):
    """p(x, y) = amplitude . fx(x) . fy(y)  (hypothèse de séparabilité de l'Annexe III du TFE)."""

    fx: Profile1D
    fy: Profile1D
    amplitude: float = 1.0

    def ft(self, k1, k2):
        k1, k2 = np.broadcast_arrays(np.asarray(k1, float), np.asarray(k2, float))
        if (k1.ndim == 2 and k1.shape[0] > 1 and np.all(k1[0] == k1[-1])
                and np.all(k2[:, 0] == k2[:, -1])):
            # grille tensorielle : on n'évalue chaque profil qu'une fois
            a = self.fx.ft(k1[0])[None, :]
            b = self.fy.ft(k2[:, 0])[:, None]
            return self.amplitude * a * b
        return self.amplitude * self.fx.ft(k1) * self.fy.ft(k2)

    def sample(self, x, y):
        return self.amplitude * self.fx.sample(x) * self.fy.sample(y)


@dataclass
class PressureMap(Footprint):
    """Carte de pression mesurée : valeurs P[j, i] (Pa) constantes par pixel.

    x (nx,), y (ny,) : centres des pixels, pas réguliers. P de forme (ny, nx).
    Transformée exacte de la fonction constante par morceaux :
        p^ = dx sinc(k1 dx/2) dy sinc(k2 dy/2) sum_ij P_ji exp(-i (k1 x_i + k2 y_j)).
    C'est le point d'entrée prévu pour les cartes du prototype STAC (Tekscan, etc.).
    """

    x: Sequence[float]
    y: Sequence[float]
    P: np.ndarray

    def __post_init__(self):
        self.x = np.asarray(self.x, float)
        self.y = np.asarray(self.y, float)
        self.P = np.asarray(self.P, float)
        assert self.P.shape == (self.y.size, self.x.size), "P doit être de forme (ny, nx)"
        self.dx = self.x[1] - self.x[0] if self.x.size > 1 else 1.0
        self.dy = self.y[1] - self.y[0] if self.y.size > 1 else 1.0

    def _pix(self, k1, k2):
        return (self.dx * np.sinc(k1 * self.dx / (2 * np.pi)) * self.dy * np.sinc(k2 * self.dy / (2 * np.pi)))

    def ft(self, k1, k2):
        k1, k2 = np.broadcast_arrays(np.asarray(k1, float), np.asarray(k2, float))
        if k1.ndim == 2 and k1.shape[0] > 1 and np.all(k1[0] == k1[-1]) and np.all(k2[:, 0] == k2[:, -1]):
            Ex = np.exp(-1j * np.outer(self.x, k1[0]))       # (nx, Nk1)
            Ey = np.exp(-1j * np.outer(k2[:, 0], self.y))    # (Nk2, ny)
            S = Ey @ self.P @ Ex
            return S * self._pix(k1, k2)
        sh = k1.shape
        a = k1.ravel()
        b = k2.ravel()
        out = np.empty(a.size, complex)
        step = max(1, int(2e7 // max(self.P.size, 1)))
        for i0 in range(0, a.size, step):
            sl = slice(i0, i0 + step)
            Ex = np.exp(-1j * np.outer(a[sl], self.x))       # (m, nx)
            Ey = np.exp(-1j * np.outer(b[sl], self.y))       # (m, ny)
            out[sl] = np.einsum("mj,ji,mi->m", Ey, self.P, Ex)
        return (out * self._pix(a, b)).reshape(sh)

    def sample(self, x, y):
        ix = np.round((np.asarray(x) - self.x[0]) / self.dx).astype(int)
        iy = np.round((np.asarray(y) - self.y[0]) / self.dy).astype(int)
        ok = (ix >= 0) & (ix < self.x.size) & (iy >= 0) & (iy < self.y.size)
        out = np.zeros(np.broadcast(ix, iy).shape)
        out[ok] = self.P[iy[ok], ix[ok]]
        return out


# =========================================================================================
# Roues et chargement complet
# =========================================================================================
@dataclass
class Wheel:
    """Une empreinte positionnée en (x0, y0).

    Efforts tangentiels (optionnels) : qx, qy = coefficient (q = coef . p, ex. freinage)
    ou Footprint distincte (carte de cisaillement mesurée). Convention : q est la force
    surfacique exercée PAR le pneu SUR la chaussée (qx > 0 vers +x).
    """

    footprint: Footprint
    x0: float = 0.0
    y0: float = 0.0
    qx: Union[None, float, Footprint] = None
    qy: Union[None, float, Footprint] = None

    def _shift(self, k1, k2):
        return np.exp(-1j * (k1 * self.x0 + k2 * self.y0))

    def ft(self, k1, k2):
        sh = self._shift(k1, k2)
        p = self.footprint.ft(k1, k2)
        out = [p * sh]
        for q in (self.qx, self.qy):
            if q is None:
                out.append(None)
            elif isinstance(q, Footprint):
                out.append(q.ft(k1, k2) * sh)
            else:
                out.append(float(q) * p * sh)
        return out

    def sample(self, x, y):
        return self.footprint.sample(x - self.x0, y - self.y0)

    @property
    def has_tangential(self) -> bool:
        return self.qx is not None or self.qy is not None


@dataclass
class Loading:
    """Ensemble de roues (atterrisseur, essieu, plaque HWD...)."""

    wheels: List[Wheel]

    def ft(self, k1, k2):
        """Renvoie (p^, qx^, qy^) ; qx^, qy^ valent None si aucun effort tangentiel."""
        p = 0
        qx = None
        qy = None
        for w in self.wheels:
            a, b, c = w.ft(k1, k2)
            p = p + a
            if b is not None:
                qx = b if qx is None else qx + b
            if c is not None:
                qy = c if qy is None else qy + c
        return p, qx, qy

    def sample(self, x, y):
        return sum(w.sample(x, y) for w in self.wheels)

    def force(self) -> float:
        return sum(w.footprint.force() for w in self.wheels)

    @property
    def has_tangential(self) -> bool:
        return any(w.has_tangential for w in self.wheels)

    def extent(self, pad: float = 0.5):
        xs = [w.x0 for w in self.wheels]
        ys = [w.y0 for w in self.wheels]
        return (min(xs) - pad, max(xs) + pad, min(ys) - pad, max(ys) + pad)
