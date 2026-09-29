"""T11a — Validation du solveur EF pixel (chausspec.fe2d) contre la solution fermée du massif
homogène (texture.local_response, cas plan) : surface plane, pression de contact des rainures
FAA (appliquée sur les plateaux) + frottement mu = 0,5 + déformations macroscopiques exx0, eyy0."""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
from chausspec.contact import GROOVE_PITCH, GROOVE_WIDTH, Tread, grooves_profile, solve_contact
from chausspec.fe2d import PixelCell, plane_strain_D
from chausspec.texture import local_response

E_s, nu = 1e9, 0.35
res = {}
for nper in (32, 64):
    h = GROOVE_WIDTH / nper
    nx = int(round(GROOVE_PITCH / h)); nz = int(round(0.060 / h))
    xg = (np.arange(nx) + 0.5) * h
    m = solve_contact(grooves_profile(xg, phase=0.0), h, 1.65e6, Tread(10, 0.49, 0.01)).p / 1.65e6
    p_eq, mu_f, exx0, eyy0 = 1.0e6, 0.5, -5e-5, -1e-4
    t0 = time.time()
    cell = PixelCell(np.full((nz, nx), E_s), nu, h)
    f = cell.load_vector((exx0, 0, 0), eyy0, top_p=p_eq * m, top_q=mu_f * p_eq * m)
    e = cell.strains(cell.solve(f), (exx0, 0, 0))
    tsol = time.time() - t0
    # référence : partie uniforme analytique + partie périodique (massif semi-infini, forme fermée)
    D, lam = plane_strain_D(E_s, nu); M = lam + 2 * E_s / (2 * (1 + nu)); G = E_s / (2 * (1 + nu))
    pm, qm = p_eq * m.mean(), mu_f * p_eq * m.mean()
    ezz_u = (-pm - lam * (exx0 + eyy0)) / M
    exz_u = -qm / (2 * G)         # face supérieure de normale -z : sigma_xz = -q
    dpv = p_eq * (m - m.mean())
    rows = [int(round(z / h - 0.5)) for z in (0.001, 0.002, 0.005)]
    zc = [(r + 0.5) * h for r in rows]
    loc = local_response(np.tile(dpv, (8, 1)), h, h, zc, nu, E_s, ("exx", "ezz", "exz"), dqx=np.tile(mu_f * dpv, (8, 1)))
    for r, z in zip(rows, zc):
        for c, u0 in (("exx", exx0), ("ezz", ezz_u), ("exz", exz_u)):
            ref = loc[(c, z)][0] + u0
            err = np.abs(e[c][r] - ref).max() / np.abs(ref).max()
            res[f"h={h*1e3:.3f}mm|{c}|z={z*1e3:.2f}mm"] = float(err)
    print(f"h = {h*1e3:.3f} mm ({nx} x {nz}, {tsol:.0f} s) : écart max " +
          f"{max(v for k, v in res.items() if k.startswith(f'h={h*1e3:.3f}')):.2e}", flush=True)
json.dump(res, open(os.path.join(HERE, "t11a_resultats.json"), "w"), indent=1)
