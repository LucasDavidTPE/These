"""Contact pneumatique / texture de chaussée (échelle de la macrotexture, 1 à 50 mm).

Hypothèses (notice « texture », §2) :
  - la chaussée est rigide à l'échelle du contact (E_chaussée / E_caoutchouc ~ 10^3) ;
  - la bande de roulement est une couche élastique linéaire (E_r, nu_r, épaisseur t) collée à
    une ceinture indéformable ; contact normal sans frottement ; quasi-statique ;
  - séparation d'échelles : la pression nominale p0 (échelle du pneu, TFE) est localement
    constante sur une cellule de texture ; la texture est une surface périodique de période Λ.

Contenu :
  - surfaces : rainurage transversal (FAA / OACI), macrotexture aléatoire auto-affine d'MPD cible ;
  - MPD selon ISO 13473-1 et ETD = 0,2 + 0,8 MPD ;
  - souplesse de la bande de roulement par le noyau multicouche de chausspec ;
  - résolution du contact par gradient conjugué projeté (Polonsky & Keer, 1999) et FFT ;
  - solutions de référence : poinçons plans périodiques (forme fermée, coefficients de Legendre),
    aire de contact de Persson (2001).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional, Sequence

import numpy as np
from scipy.special import erf, eval_legendre

from .kernel import LayeredKernel
from .materials import Elastic
from .structure import Layer, Structure

# Rainurage normalisé (FAA AC 150/5320-12C) : 6 mm x 6 mm, pas de 38 mm, transversal.
GROOVE_WIDTH = 6.35e-3
GROOVE_DEPTH = 6.35e-3
GROOVE_PITCH = 38.1e-3


# =========================================================================================
# Surfaces
# =========================================================================================
def grooves_profile(x, width=GROOVE_WIDTH, depth=GROOVE_DEPTH, pitch=GROOVE_PITCH, phase=0.0,
                    edge_radius=0.0):
    """Profil (m) d'une surface rainurée : 0 sur les plats, -depth dans les rainures.
    La rainure est centrée en x = phase + n pitch. edge_radius (m) : arrondi des arêtes
    (quart de cercle), qui borne la surpression d'arête (arête vive : edge_radius = 0)."""
    u = np.abs(np.mod(np.asarray(x) - phase + pitch / 2, pitch) - pitch / 2)
    h = np.where(u < width / 2, -depth, 0.0)
    r = edge_radius
    if r > 0:
        s = u - width / 2                      # distance à la paroi, côté plat
        zone = (s >= 0) & (s < r)
        h = np.where(zone, -(r - np.sqrt(np.clip(r**2 - (r - s) ** 2, 0, None))), h)
    return h


def mpd_iso13473(h, dx, baseline=0.100):
    """Profondeur moyenne de profil (ISO 13473-1) calculée sur les lignes de h (selon x).

    Chaque segment de longueur `baseline` est redressé (régression linéaire), coupé en deux
    moitiés ; la profondeur du segment est (pic1 + pic2)/2 - niveau moyen. MPD = moyenne.
    """
    h = np.atleast_2d(h)
    n = int(round(baseline / dx))
    vals = []
    for row in h:
        for i0 in range(0, row.size - n + 1, n):
            seg = row[i0:i0 + n]
            s = np.arange(seg.size)
            a, b = np.polyfit(s, seg, 1)
            seg = seg - (a * s + b)
            half = seg.size // 2
            vals.append(0.5 * (seg[:half].max() + seg[half:].max()) - seg.mean())
    return float(np.mean(vals))


def random_texture(L=0.128, N=512, mpd=1.0e-3, H=0.8, lam_min=1.0e-3, lam_max=50e-3,
                   lam_roll=20e-3, skew="gauss", beta=0.4, seed=0):
    """Macrotexture aléatoire isotrope, périodique de période L (m), sur une grille N x N.

    Densité spectrale auto-affine (exposant de Hurst H) entre 2pi/lam_max et 2pi/lam_min,
    plateau sous 2pi/lam_roll. skew = "gauss" (asymétrie nulle), "positive" (pics aigus,
    enduits / gravillonnage) ou "negative" (plateaux et creux, enrobés à texture négative).
    L'amplitude est ajustée pour obtenir la MPD cible (ISO 13473-1).
    """
    rng = np.random.default_rng(seed)
    k = 2 * np.pi * np.fft.fftfreq(N, L / N)
    KX, KY = np.meshgrid(k, k)
    q = np.hypot(KX, KY)
    qr, q0, q1 = 2 * np.pi / lam_roll, 2 * np.pi / lam_max, 2 * np.pi / lam_min
    C = np.where(q < qr, 1.0, (np.maximum(q, 1e-12) / qr) ** (-2 * (1 + H)))
    C[(q < q0) | (q > q1)] = 0.0
    C[0, 0] = 0.0
    phase = np.exp(2j * np.pi * rng.random((N, N)))
    g = np.real(np.fft.ifft2(np.sqrt(C) * phase))
    g = (g - g.mean()) / g.std()
    if skew == "positive":
        h = np.exp(beta * g)
    elif skew == "negative":
        h = -np.exp(beta * g)
    else:
        h = g
    h = h - h.mean()
    dx = L / N
    # MPD évaluée selon x et selon y (surface isotrope) puis mise à l'échelle
    m = 0.5 * (mpd_iso13473(h, dx) + mpd_iso13473(h.T, dx))
    return h * (mpd / m)


def surface_stats(h, dx):
    """Statistiques utiles : Sq, asymétrie, pente quadratique moyenne m2 = <|grad h|^2>, MPD."""
    gy, gx = np.gradient(h, dx)
    return dict(Sq=float(h.std()), Ssk=float(np.mean((h - h.mean()) ** 3) / h.std() ** 3),
                m2=float(np.mean(gx**2 + gy**2)),
                MPD=0.5 * (mpd_iso13473(h, dx) + mpd_iso13473(h.T, dx)))


# =========================================================================================
# Souplesse de la bande de roulement
# =========================================================================================
@dataclass
class Tread:
    """Bande de roulement : couche élastique d'épaisseur t (m) collée à une ceinture rigide.
    E en MPa. t = np.inf : massif semi-infini de caoutchouc."""

    E: float = 10.0
    nu: float = 0.49
    t: float = 0.010

    @property
    def Estar(self):
        return self.E * 1e6 / (1 - self.nu**2)

    def compliance(self, xi):
        """Déplacement normal de surface par unité de pression, dans l'espace de Fourier
        (m / (Pa m^2) x m^2 = m/Pa) : u^(xi) = C(xi) p^(xi). Obtenue par le noyau multicouche."""
        xi = np.asarray(xi, float)
        out = np.zeros(xi.shape)
        nz = xi > 0
        if not np.isfinite(self.t):
            out[nz] = 2.0 / (self.Estar * xi[nz])
            return out
        m = Elastic(self.E, self.nu)
        st = Structure([Layer(m, self.t)], bottom="rigid_bonded")
        x = xi[nz]
        lam, mu = m.lame(np.zeros(x.size))
        K = LayeredKernel(st, x, [lam], [mu])
        amp = K.at_depth(0.0)
        out[nz] = np.real(amp["n"][1] / (amp["mu_ref"] * x))
        return out


# =========================================================================================
# Résolution du contact (Polonsky & Keer, 1999)
# =========================================================================================
@dataclass
class ContactResult:
    p: np.ndarray          # pression de contact (Pa)
    gap: np.ndarray        # écartement (m), nul dans le contact
    area_fraction: float
    iterations: int
    error: float


def solve_contact(h, dx, pbar, tread: Tread, dy=None, tol=1e-9, maxit=5000, p0=None):
    """Contact d'une bande de roulement élastique pressée (pression moyenne pbar, Pa) sur une
    surface rigide périodique de hauteurs h (m, vers le haut). Grille 1D ou 2D périodique.

    Formulation : trouver p >= 0 et une constante c tels que g = u(p) - h + c >= 0 et p g = 0,
    avec <p> = pbar ; u = C * p (produit de convolution calculé par FFT).
    """
    h = np.asarray(h, float)
    one_d = h.ndim == 1
    H = h[None, :] if one_d else h
    ny, nx = H.shape
    dy = dx if dy is None else dy
    k1 = 2 * np.pi * np.fft.fftfreq(nx, dx)
    k2 = 2 * np.pi * np.fft.fftfreq(ny, dy) if ny > 1 else np.zeros(1)
    K1, K2 = np.meshgrid(k1, k2)
    C = tread.compliance(np.hypot(K1, K2))
    C[0, 0] = 0.0
    conv = lambda f: np.real(np.fft.ifft2(C * np.fft.fft2(f)))
    Ntot = H.size
    p = np.full(H.shape, float(pbar)) if p0 is None else np.array(p0, float).reshape(H.shape)
    Gold, delta = 1.0, 0.0
    t = np.zeros_like(p)
    err = np.inf
    for it in range(1, maxit + 1):
        u = conv(p)
        g = u - H
        Ic = p > 0
        g = g - g[Ic].mean()
        G = np.sum(g[Ic] ** 2)
        t = np.where(Ic, g + delta * (G / Gold) * t, 0.0)
        Gold = G
        r = conv(t)
        r = r - r[Ic].mean()
        den = np.sum(r[Ic] * t[Ic])
        tau = np.sum(g[Ic] * t[Ic]) / den if den != 0 else 0.0
        pold = p.copy()
        p = p - tau * t
        p[p < 0] = 0.0
        Iol = (p == 0) & (g < 0)
        if np.any(Iol):
            delta = 0.0
            p[Iol] = p[Iol] - tau * g[Iol]
        else:
            delta = 1.0
        p = p * (pbar * Ntot / p.sum())
        err = np.sum(np.abs(p - pold)) / np.sum(p)
        if err < tol:
            break
    u = conv(p)
    g = u - H
    Ic = p > 0
    g = g - g[Ic].mean()
    if one_d:
        p, g = p[0], g[0]
    return ContactResult(p, g, float(np.mean(p > 0)), it, float(err))


# =========================================================================================
# Solutions de référence
# =========================================================================================
def periodic_punch_pressure(x, land, pitch, pbar=1.0):
    """Poinçons plans rigides périodiques (plats de largeur `land`, pas `pitch`) appuyés en
    contact total sur un massif élastique : p(x) = pbar cos(pi x/pitch) /
    sqrt(sin^2(pi a/pitch) - sin^2(pi x/pitch)) pour |x| < a = land/2 (plat centré en 0).
    La distribution ne dépend pas du module ; elle est singulière (en 1/sqrt) aux arêtes."""
    a = land / 2
    u = np.mod(np.asarray(x) + pitch / 2, pitch) - pitch / 2
    s2 = np.sin(np.pi * a / pitch) ** 2 - np.sin(np.pi * u / pitch) ** 2
    with np.errstate(invalid="ignore", divide="ignore"):
        p = pbar * np.cos(np.pi * u / pitch) / np.sqrt(s2)
    return np.where((np.abs(u) < a) & (s2 > 0), p, 0.0)


def periodic_punch_fourier(nmax, land, pitch):
    """Coefficients a_n tels que p(x)/pbar = a_0 + 2 sum_n a_n cos(2 pi n x / pitch) :
    a_n = [P_n(c) + P_{n-1}(c)] / 2, c = cos(2 pi a / pitch) (P_n : polynômes de Legendre)."""
    c = np.cos(np.pi * land / pitch)
    n = np.arange(nmax + 1)
    a = np.empty(nmax + 1)
    a[0] = 1.0
    a[1:] = 0.5 * (eval_legendre(n[1:], c) + eval_legendre(n[1:] - 1, c))
    return a


def persson_area_fraction(pbar, Estar, m2):
    """Aire de contact relative selon Persson (2001) pour un massif semi-infini :
    A/A0 = erf( sqrt(2) pbar / (E* sqrt(m2)) ),  m2 = <|grad h|^2>."""
    return erf(np.sqrt(2.0) * pbar / (Estar * np.sqrt(m2)))


# =========================================================================================
# Bibliothèque de contact et pression modulée
# =========================================================================================
@dataclass
class ContactLibrary:
    """Pressions de contact d'une même cellule de texture pour plusieurs pressions nominales.
    m[i] = p / pbar[i] (moyenne 1). Sert à construire p(x, y) = p0 m(x, y ; p0) sous le pneu."""

    pbar: np.ndarray
    m: np.ndarray            # (npb, ny, nx)
    dx: float
    area: np.ndarray

    @classmethod
    def build(cls, h, dx, pbars, tread: Tread, **kw):
        ms, areas = [], []
        p_prev = None
        for pb in pbars:
            r = solve_contact(h, dx, pb, tread, p0=None if p_prev is None else p_prev * pb / p_prev.mean(), **kw)
            ms.append(r.p / pb)
            areas.append(r.area_fraction)
            p_prev = r.p
        return cls(np.asarray(pbars, float), np.array(ms), dx, np.array(areas))

    def modulation(self, p0_local, iy, ix):
        """m au pixel (iy, ix) de la cellule pour une pression nominale locale p0 (interpolation
        linéaire en log p0 entre les niveaux de la bibliothèque, extrapolation constante)."""
        lp = np.log(np.clip(p0_local, self.pbar[0], self.pbar[-1]))
        lb = np.log(self.pbar)
        j = np.clip(np.searchsorted(lb, lp) - 1, 0, len(lb) - 2)
        w = (lp - lb[j]) / (lb[j + 1] - lb[j])
        return (1 - w) * self.m[j, iy, ix] + w * self.m[j + 1, iy, ix]


def textured_pressure(p0, x, y, library: Optional[ContactLibrary] = None, groove_fourier=None,
                      pitch=GROOVE_PITCH, phase=0.0, pmin_frac=1e-3):
    """Pression réelle sous le pneu sur une grille fine (x, y) :
      - rainures (groove_fourier = coefficients a_n) : p = p0 . m(x), m série de Fourier ;
      - texture aléatoire (library) : p = p0 . m(x, y ; p0), cellule répétée périodiquement.
    p0 : tableau (ny, nx) de pression nominale sur la même grille."""
    X, Y = np.meshgrid(x, y)
    if groove_fourier is not None:
        a = groove_fourier
        n = np.arange(1, a.size)
        # facteurs de Lanczos : atténuent le Gibbs de la troncature, conservent la moyenne
        sig = np.sinc(n / a.size)
        mx = a[0] + 2 * np.sum((a[1:] * sig)[:, None] * np.cos(2 * np.pi * n[:, None] * (x[None, :] - phase) / pitch), 0)
        return p0 * mx[None, :]
    L = library
    ny, nx = L.m.shape[1:]
    ix = (np.round(X / L.dx).astype(int)) % nx
    iy = (np.round(Y / L.dx).astype(int)) % ny
    m = L.modulation(np.maximum(p0, 1.0), iy, ix)
    return np.where(p0 > pmin_frac * p0.max(), p0 * m, p0)
