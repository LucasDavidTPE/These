"""Tests du module contact : poinçons périodiques, coefficients de Legendre, MPD, formule deux échelles."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from chausspec.contact import (GROOVE_PITCH, GROOVE_WIDTH, Tread, grooves_profile, mpd_iso13473,
                               periodic_punch_fourier, periodic_punch_pressure, random_texture, solve_contact)
from chausspec.texture import local_response


def test_punch_bem_and_legendre():
    P = GROOVE_PITCH; land = P - GROOVE_WIDTH; N = 2048
    dx = P / N; x = np.arange(N) * dx - P / 2
    r = solve_contact(grooves_profile(x, phase=P / 2), dx, 1.65e6, Tread(10, 0.49, np.inf))
    pa = periodic_punch_pressure(x, land, P, 1.65e6)
    inner = np.abs(x) < 0.4 * land
    assert np.max(np.abs(r.p[inner] - pa[inner])) < 1e-3 * 1.65e6
    a = periodic_punch_fourier(4, land, P)
    for n in range(1, 5):
        assert abs(np.mean(r.p * np.cos(2 * np.pi * n * x / P)) / 1.65e6 - a[n]) < 2e-4


def test_mpd_target():
    h = random_texture(L=0.128, N=256, mpd=1.2e-3, seed=3)
    d = 0.128 / 256
    assert abs(0.5 * (mpd_iso13473(h, d) + mpd_iso13473(h.T, d)) - 1.2e-3) < 1e-9


def test_local_response_plane_strain():
    """Massif semi-infini sous p = A cos(kx) : solution plane exacte."""
    nu, E, lam, A, z = 0.35, 1e9, 0.0381, 1e6, 0.004
    k = 2 * np.pi / lam; nx = 256; dx = 4 * lam / nx; x = np.arange(nx) * dx
    r = local_response(np.tile(A * np.cos(k * x), (4, 1)), dx, dx, [z], nu, E, comps=("sxx", "szz", "sxz", "exx"))
    e = np.exp(-k * z)
    sxx = -A * (1 - k * z) * e * np.cos(k * x); szz = -A * (1 + k * z) * e * np.cos(k * x)
    sxz = -A * k * z * e * np.sin(k * x); syy = nu * (sxx + szz)
    exx = ((1 + nu) * sxx - nu * (sxx + syy + szz)) / E
    for c, ref in (("sxx", sxx), ("szz", szz), ("sxz", sxz), ("exx", exx)):
        assert np.max(np.abs(r[(c, z)][0] - ref)) < 1e-9 * np.max(np.abs(ref)) + 1e-12 * A
