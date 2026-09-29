"""T1 — BEM contre la solution fermée des poinçons plans périodiques (rainurage).
T2 — BEM contre la théorie de Persson (aire de contact, surfaces gaussiennes, massif semi-infini)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
from chausspec.contact import (GROOVE_PITCH, GROOVE_WIDTH, Tread, grooves_profile, periodic_punch_fourier,
                               periodic_punch_pressure, persson_area_fraction, random_texture, solve_contact,
                               surface_stats)

out = {"T1": {}, "T2": []}
P = GROOVE_PITCH; land = P - GROOVE_WIDTH
for N in (512, 2048, 8192):
    dx = P / N; x = np.arange(N) * dx - P / 2
    h = grooves_profile(x, phase=P / 2)
    r = solve_contact(h, dx, 1.65e6, Tread(10, 0.49, np.inf))
    pa = periodic_punch_pressure(x, land, P, 1.65e6)
    inner = np.abs(x) < 0.4 * land
    # coefficients de Fourier du BEM vs Legendre
    a_bem = np.array([np.mean(r.p * np.cos(2 * np.pi * n * x / P)) / 1.65e6 for n in range(6)])
    out["T1"][N] = dict(err_int=float(np.max(np.abs(r.p[inner] - pa[inner])) / 1.65e6), aire=r.area_fraction,
                        a_bem=a_bem.tolist(), a_legendre=periodic_punch_fourier(5, land, P).tolist(),
                        gap_min_rainure_mm=float(1e3 * r.gap[np.abs(x) > land / 2].min()))
    print("T1", N, out["T1"][N])
    if N == 2048:
        rt = solve_contact(h, dx, 1.65e6, Tread(10, 0.49, 0.010))
        np.savetxt(os.path.join(HERE, "t01_rainures.csv"), np.c_[x, pa, r.p, rt.p, h], delimiter=";",
                   header="x;p_ferme;p_bem_demi_espace;p_bem_bande_10mm;h", comments="")
for mpd in (0.6e-3, 1.0e-3, 1.5e-3):
    h = random_texture(L=0.128, N=512, mpd=mpd, seed=1)
    s = surface_stats(h, 0.128 / 512)
    tr = Tread(10, 0.49, np.inf)
    for pb in (0.3e6, 0.6e6, 1.0e6, 1.65e6, 2.5e6, 3.5e6):
        r = solve_contact(h, 0.128 / 512, pb, tr, tol=1e-7)
        out["T2"].append(dict(MPD_mm=mpd * 1e3, p_MPa=pb / 1e6, A_bem=r.area_fraction,
                              A_persson=float(persson_area_fraction(pb, tr.Estar, s["m2"])),
                              x_red=float(pb / (tr.Estar * np.sqrt(s["m2"])))))
        print("T2", out["T2"][-1])
json.dump(out, open(os.path.join(HERE, "t01_t02_resultats.json"), "w"), indent=1)
