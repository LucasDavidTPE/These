"""T8 — Convergence en résolution de la chaîne contact + réponse locale (grandeurs à 0,5-5 mm).

Même surface physique à plusieurs pas (troncature spectrale exacte : la densité spectrale est
nulle sous lambda = 1 mm), pression nominale uniforme 1,65 MPa sur la cellule, massif homogène
élastique (11 670 MPa, nu = 0,35) + état uniforme de compression confinée.
Rainures : arêtes vives et arrondies (r = 1 mm), pas de 0,25 à 0,0625 mm."""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
from chausspec.contact import Tread, GROOVE_PITCH, grooves_profile, random_texture, solve_contact
from chausspec.texture import local_response

Z = [0.0005, 0.001, 0.002, 0.005]
STR = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
E, nu, pb = 11670e6, 0.35, 1.65e6
lam = E * nu / ((1 + nu) * (1 - 2 * nu)); mu = E / (2 * (1 + nu))
ezz0 = -pb / (lam + 2 * mu)
tr = Tread(10, 0.49, 0.010)


def stats(dp, d, key):
    loc = local_response(dp, d, d, Z, nu, E, STR)
    r = {}
    for z in Z:
        f = {c: loc[(c, z)].ravel() for c in STR}
        f["ezz"] = f["ezz"] + ezz0
        Et = np.stack([np.stack([f["exx"], f["exy"], f["exz"]], -1), np.stack([f["exy"], f["eyy"], f["eyz"]], -1),
                       np.stack([f["exz"], f["eyz"], f["ezz"]], -1)], -2)
        e1 = np.linalg.eigvalsh(Et)[:, 2]
        r[f"{z*1e3:g}mm"] = dict(e1_max=float(e1.max() * 1e6), e1_p999=float(np.percentile(e1, 99.9) * 1e6),
                                 e1_p99=float(np.percentile(e1, 99) * 1e6), ezz_min=float(f["ezz"].min() * 1e6),
                                 gxz_max=float(np.abs(f["exz"]).max() * 1e6))
    return r


out = {"aleatoire": {}, "rainures": {}}
L = 0.128
h1024 = random_texture(L=L, N=1024, mpd=1.0e-3, seed=1)
H = np.fft.fft2(h1024)
for N in (256, 512, 1024):
    # troncature spectrale exacte vers la grille N
    k = np.fft.fftfreq(1024) * 1024
    keep = np.abs(k) < N / 2
    Hs = H[np.ix_(keep, keep)] * (N / 1024) ** 2
    h = np.real(np.fft.ifft2(Hs))
    d = L / N
    t0 = time.time()
    r = solve_contact(h, d, pb, tr, tol=1e-8, maxit=5000)
    s = stats(r.p - pb, d, N)
    out["aleatoire"][d * 1e3] = dict(aire=r.area_fraction, pmax=float(r.p.max() / 1e6),
                                     p999=float(np.percentile(r.p[r.p > 0], 99.9) / 1e6), rep=s)
    print(f"aléatoire MPD 1,0, pas {d*1e3:.3f} mm : aire {r.area_fraction:.3f}, p99.9 {out['aleatoire'][d*1e3]['p999']:.1f} MPa "
          f"| e1 max 0.5/1/2/5 mm : " + " / ".join(f"{s[z]['e1_max']:.0f}" for z in s) +
          " | e1 p99.9 : " + " / ".join(f"{s[z]['e1_p999']:.0f}" for z in s) + f" ({time.time()-t0:.0f} s)", flush=True)
for r_e in (0.0, 1e-3):
    for n in (152, 304, 608):
        d = GROOVE_PITCH / n
        x = np.arange(n) * d
        sol = solve_contact(grooves_profile(x, edge_radius=r_e), d, pb, tr)
        dp = np.tile(sol.p - pb, (8, 1))
        s = stats(dp, d, n)
        out["rainures"][f"r{r_e*1e3:g}_d{d*1e3:.4f}"] = dict(pmax=float(sol.p.max() / 1e6), rep=s)
        print(f"rainures r={r_e*1e3:g} mm, pas {d*1e3:.3f} mm : p_max {sol.p.max()/1e6:.1f} MPa | e1 max 0.5/1/2/5 mm : "
              + " / ".join(f"{s[z]['e1_max']:.0f}" for z in s), flush=True)
json.dump(out, open(os.path.join(HERE, "t08_resultats.json"), "w"), indent=1)
