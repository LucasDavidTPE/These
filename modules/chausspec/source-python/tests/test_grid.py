"""Tests du solveur de champ : symétrie, équilibre global, cohérence Hankel/FFT."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import chausspec as cs

KVG = cs.GeneralizedKelvinVoigt(3.0e4, [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2],
                                [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900])
ST = cs.Structure([cs.Layer(KVG, 0.2), cs.Layer(cs.Elastic(150), 0.6), cs.Layer(cs.Elastic(60), 1.0)],
                  bottom="halfspace")


def bogie():
    fp = cs.UniformRect(1.0, 0.5, 0.35).scaled_to(3e5)
    return cs.Loading([cs.Wheel(fp, x0, y0) for x0 in (0.0, -1.5) for y0 in (-0.6, 0.6)])


def test_symmetry_y():
    kw = dict(depths=[0.0, 0.2], comps=("uz", "exx", "eyy", "exy", "eyz", "szz"), L=(16, 8), N=(128, 128))
    a = cs.solve_grid(ST, bogie(), cs.Moving(1.0), **kw)
    b = cs.solve_grid(ST, bogie(), cs.Moving(1.0), sym_y=True, **kw)
    for key in a.fields:
        ref = max(np.max(np.abs(a[k])) for k in a.fields if k[0][0] == key[0][0])
        assert np.max(np.abs(a[key] - b[key])) < 1e-9 * ref, key


def test_vertical_equilibrium():
    """L'intégrale de sigma_zz sur un plan horizontal vaut -F (toutes profondeurs)."""
    load = bogie()
    st = cs.Structure([cs.Layer(cs.Elastic(8000), 0.2), cs.Layer(cs.Elastic(150), 0.6),
                       cs.Layer(cs.Elastic(60), 1.0)], bottom="halfspace")
    g = cs.solve_grid(st, load, cs.Static(), depths=[0.1, 1.2], comps=("szz",), L=(96, 96), N=(512, 512))
    dA = (g.x[1] - g.x[0]) * (g.y[1] - g.y[0])
    # le champ isolé décroît en r^-3 en profondeur : la part hors fenêtre est O(1/L)
    for z, tol in ((0.1, 2e-4), (1.2, 4e-3)):
        assert abs(np.sum(g["szz", z]) * dA + load.force()) < tol * load.force()


def test_fft_vs_hankel_multilayer():
    st = cs.Structure([cs.Layer(cs.Elastic(6000, 0.35), 0.15), cs.Layer(cs.Elastic(200, 0.35), 0.4),
                       cs.Layer(cs.Elastic(50, 0.4), 1.0)], bottom="halfspace")
    load = cs.Loading([cs.Wheel(cs.UniformCircle(0.7e6, 0.15))])
    z = [0.05, 0.15, 0.4]
    ax = cs.solve_axisym(st, 0.7e6, 0.15, r=[0.0, 0.25], z=z)
    g = cs.solve_grid(st, load, cs.Static(), depths=z, comps=("uz", "exx", "ezz", "szz"), L=(16, 16), N=(1024, 1024))
    for iz, zz in enumerate(z):
        for ir, r in enumerate((0.0, 0.25)):
            # déflexion absolue sur massif semi-infini (non périodique grâce au coin 2D continu)
            assert abs(g.interp("uz", zz, r, 0) - ax["uz"][iz, ir]) < 2e-3 * np.max(np.abs(ax["uz"]))
            assert abs(g.interp("ezz", zz, r, 0) - ax["ezz"][iz, ir]) < 2e-3 * np.max(np.abs(ax["ezz"]))
            assert abs(g.interp("exx", zz, r, 0) - ax["err"][iz, ir]) < 2e-3 * np.max(np.abs(ax["err"]))
