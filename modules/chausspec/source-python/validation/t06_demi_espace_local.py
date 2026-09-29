"""T6 — Hypothèse de « demi-espace local » : la perturbation de texture dp ne voit que la couche
de surface, traitée comme un massif homogène semi-infini. Contrôle en élastique statique
(BB-GB à 11 670 MPa) : réponse à dp calculée (a) par le massif homogène (méthode de la campagne),
(b) par la structure multicouche complète du TFE (5 couches, substratum rigide), sur la même
grille périodique de 0,25 mm (fenêtre de 0,30 m x 0,30 m sous la roue arrière droite)."""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
import chausspec as cs
from chausspec.kernel import LayeredKernel
from chausspec.spectral import components_from_amplitudes, layer_moduli
from chausspec.contact import ContactLibrary, Tread, GROOVE_PITCH, grooves_profile, random_texture, solve_contact
from chausspec.texture import local_response
from tfe_a340 import BBGB_ELAS, bogie, structure

D = 0.25e-3; NT = 512
Z = [0.001, 0.002, 0.005, 0.010, 0.020, 0.040]
COMPS = ("exx", "eyy", "ezz", "exz", "eyz")
st = structure(BBGB_ELAS)
load = bogie("heterogene")
xs = -2.13 + D * np.arange(1200); ys = 0.55 + D * np.arange(1200)
X, Y = np.meshgrid(xs, ys)
p0 = load.sample(X, Y)
out = {}
for tex in ("rainures_vives", "gauss_MPD1.0"):
    if tex.startswith("rainures"):
        xg = np.arange(int(round(GROOVE_PITCH / D))) * (GROOVE_PITCH / round(GROOVE_PITCH / D))
        m = solve_contact(grooves_profile(xg), xg[1] - xg[0], 1.65e6, Tread(10, 0.49, 0.01)).p / 1.65e6
        mm = m[(np.round(np.mod(X, GROOVE_PITCH) / (xg[1] - xg[0])).astype(int)) % m.size]
    else:
        h = random_texture(L=NT * D, N=NT, mpd=1.0e-3, seed=1)
        lib = ContactLibrary.build(h, D, np.array([0.15, 0.3, 0.6, 1.0, 1.65, 2.3, 3.0, 4.0]) * 1e6, Tread(10, 0.49, 0.01), tol=1e-7)
        mm = lib.modulation(np.maximum(p0, 1.0), (np.round(Y / D).astype(int)) % NT, (np.round(X / D).astype(int)) % NT)
    dp = p0 * (mm - 1)
    t0 = time.time()
    loc = local_response(dp, D, D, Z, nu=0.35, E_s=11670e6, comps=COMPS)
    # structure complète
    ny, nx = dp.shape
    F = np.fft.rfft2(dp) * D * D
    k1 = 2 * np.pi * np.fft.rfftfreq(nx, D); k2 = 2 * np.pi * np.fft.fftfreq(ny, D)
    full = {(c, z): np.zeros(F.shape, complex) for c in COMPS for z in Z}
    for j0 in range(0, ny, 16):
        rows = slice(j0, j0 + 16)
        K1, K2 = np.meshgrid(k1, k2[rows])
        a, b = K1.ravel(), K2.ravel()
        xi = np.hypot(a, b); ok = xi > 0; xi[~ok] = 1.0
        lam, mu = layer_moduli(st, 0 * a)
        K = LayeredKernel(st, xi, lam, mu)
        for z in Z:
            amp = K.at_depth(z)
            res = components_from_amplitudes(amp, xi, a / xi, b / xi, F[rows].ravel(), None, None, COMPS)
            for c, v in res.items():
                v = np.where(ok, v, 0)
                full[(c, z)][rows] = v.reshape(K1.shape)
    r = {}
    for key, Fk in full.items():
        fu = np.fft.irfft2(Fk, s=(ny, nx)) / (D * D)
        lo = loc[key]
        r[f"{key[0]}@{key[1]*1e3:.0f}mm"] = dict(max_full=float(np.abs(fu).max() * 1e6), max_local=float(np.abs(lo).max() * 1e6),
                                                 rms=float(np.sqrt(np.mean((fu - lo) ** 2) / np.mean(fu ** 2))))
    out[tex] = r
    print(tex, f"({time.time()-t0:.0f} s)")
    for k, v in r.items():
        print(f"   {k:10s} max multicouche {v['max_full']:8.2f}  max demi-espace {v['max_local']:8.2f}  écart quadratique {v['rms']*100:5.2f} %")
json.dump(out, open(os.path.join(HERE, "t06_resultats.json"), "w"), indent=1)
