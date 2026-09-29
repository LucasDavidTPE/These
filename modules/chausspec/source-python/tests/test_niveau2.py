"""Tests du niveau 2 : réponse locale tangentielle et solveur EF pixel."""
import numpy as np

from chausspec.fe2d import PixelCell, principal_max
from chausspec.texture import _halfspace_amplitudes, local_response


def test_amplitudes_normales_forme_fermee():
    nu = 0.35
    k = 3 - 4 * nu
    (U, W, dU, dW) = _halfspace_amplitudes(nu)["n"]
    A, B = W[0].real, W[1].real
    assert np.allclose([U[0].real, U[1].real], [-A + k * B, -B])
    assert np.allclose([dU[0].real, dU[1].real], [A - (1 + k) * B, B])
    assert np.allclose([dW[0].real, dW[1].real], [B - A, -B])


def _cell_vs_closed(case):
    E_s, nu, h, nx, nz = 1e9, 0.35, 2e-4, 100, 150
    x = (np.arange(nx) + 0.5) * h
    p = 1e6 * np.cos(2 * np.pi * x / (nx * h))
    cell = PixelCell(np.full((nz, nx), E_s), nu, h)
    f = cell.load_vector(top_p=p if case == "p" else None, top_q=p if case == "q" else None)
    e = cell.strains(cell.solve(f))
    r = 15; z = (r + 0.5) * h
    P = np.tile(p, (4, 1))
    loc = local_response(P if case == "p" else 0 * P, h, h, [z], nu, E_s, ("exx", "ezz", "exz"),
                         dqx=P if case == "q" else None)
    for c in ("exx", "ezz", "exz"):
        ref = loc[(c, z)][0]
        assert np.abs(e[c][r] - ref).max() < 0.02 * np.abs(ref).max()


def test_ef_pression():
    _cell_vs_closed("p")


def test_ef_frottement():
    _cell_vs_closed("q")


def test_ef_deformation_imposee_uniforme():
    cell = PixelCell(np.full((20, 10), 2e9), 0.3, 1e-3)
    eps = (1e-4, 0.0, 0.0)
    e = cell.strains(cell.solve(cell.load_vector(eps, eyy0=-5e-5)), eps)
    lam = 2e9 * 0.3 / (1.3 * 0.4); mu = 2e9 / 2.6
    ezz = -lam * (1e-4 - 5e-5) / (lam + 2 * mu)      # surface libre, fond encastré : sigma_zz = 0
    assert np.allclose(e["exx"], 1e-4) and np.allclose(e["ezz"], ezz, rtol=1e-6)


def test_principal_max():
    v = principal_max(np.array(1.0), np.array(2.0), np.array(3.0), np.array(0.0), np.array(0.0), np.array(0.0))
    assert np.isclose(v, 3.0)
