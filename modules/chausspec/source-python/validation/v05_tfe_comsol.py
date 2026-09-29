"""V5 — Reproduction du chapitre 3 du TFE (modèle COMSOL 3D, 7,4 M ddl) avec chausspec.

Calcule, pour 3 lois de BB-GB (élastique 11 670 MPa, KVG Tab. 7, 2S2P1D Tab. 6) et 3 empreintes :
  - eps_T = eyy max en base de couche liée (z = 0,32 m)      [TFE : eps_xx, Tableaux 9 et 11]
  - eps_1 max en surface (déformation principale majeure)     [TFE : Tableaux 10 et 12]
  - profil en profondeur du max de |eyz|                      [TFE : eps_xz, Tableau 13, Fig. 3-13]
  - signal temporel eyy(t) en base, jauge sur l'axe des roues [TFE : Fig. 3-11]
Résultats bruts : v05_resultats.npz / v05_resultats.json (figures : v05_figures.py).
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
import chausspec as cs
from tfe_a340 import BBGB_2S2P1D, BBGB_ELAS, BBGB_KVG, V, bogie, structure

LAWS = {"elastique": BBGB_ELAS, "KVG": BBGB_KVG, "2S2P1D": BBGB_2S2P1D}
PRINTS = ("rectangulaire", "circulaire", "heterogene")
ZPROF = [0.0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.14, 0.16, 0.18, 0.20, 0.24, 0.28, 0.32]
FAST = os.environ.get("FAST") == "1"
BASE = dict(L=(16, 8), N=(512, 256), sym_y=True)
SURF = dict(L=(16, 8), N=(1024, 1024), sym_y=True) if FAST else dict(L=(16, 8), N=(2048, 2048), sym_y=True)

out = {}
arrays = {}
for law, mat in LAWS.items():
    st = structure(mat)
    regime = cs.Static() if law == "elastique" else cs.Moving(V)
    for fp in PRINTS:
        key = f"{law}_{fp}"
        t0 = time.time()
        load = bogie(fp)
        # --- base de couche liée (grand domaine, résolution modérée) --------------------------
        gb = cs.solve_grid(st, load, regime, depths=[0.32], comps=("eyy",), window=(-7, 5, 0, 1.4), **BASE)
        vmax, xm, ym = gb.argmax("eyy", 0.32)
        X, sig = gb.line_x("eyy", 0.32, 0.7)
        arrays[key + "_base_X"] = X
        arrays[key + "_base_eyy"] = sig
        # --- surface et profil (domaine réduit, résolution fine) ---------------------------------
        comps = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
        gs = cs.solve_grid(st, load, regime, depths=ZPROF, comps=("eyz",),
                           window=(-3, 1.2, 0.2, 1.2), store="complex64", **SURF)
        g0 = cs.solve_grid(st, load, regime, depths=[0.0], comps=comps,
                           window=(-3, 1.2, 0.2, 1.2), store="complex64", **SURF)
        # profil de |eyz| sur la verticale du maximum (comme les lignes A, B, C de la Fig. 3-13)
        zk = int(np.argmax([np.max(np.abs(gs["eyz", z])) for z in ZPROF]))
        jj, ii = np.unravel_index(np.argmax(np.abs(gs["eyz", ZPROF[zk]])), gs["eyz", ZPROF[zk]].shape)
        arrays[key + "_eyz_vert"] = np.array([gs["eyz", z][jj, ii] for z in ZPROF])
        e1 = g0.principal_strains(0.0)[..., 2]
        j, i = np.unravel_index(np.argmax(e1), e1.shape)
        prof = [float(np.max(np.abs(gs["eyz", z]))) for z in ZPROF]
        kz = int(np.argmax(prof))
        out[key] = dict(eyy_base_max=vmax, x_base=xm, y_base=ym,
                        e1_surf_max=float(e1[j, i]), x_e1=float(g0.x[i]), y_e1=float(g0.y[j]),
                        eyz_prof=prof, eyz_max=prof[kz], z_eyz_max=ZPROF[kz],
                        eyz_surface=prof[0], cpu_s=time.time() - t0)
        out[key].update(x_eyz=float(gs.x[ii]), y_eyz=float(gs.y[jj]))
        arrays[key + "_e1_map"] = e1.astype(np.float32)
        arrays[key + "_e1_x"] = g0.x
        arrays[key + "_e1_y"] = g0.y
        print(f"{key:26s} eyy_base = {vmax*1e6:7.1f}  e1_surf = {e1[j,i]*1e6:7.1f}  "
              f"max|eyz| = {prof[kz]*1e6:6.1f} à z = {ZPROF[kz]*1e3:.0f} mm  ({time.time()-t0:.0f} s)", flush=True)
np.savez_compressed(os.path.join(HERE, "v05_resultats.npz"), zprof=np.array(ZPROF), **arrays)
with open(os.path.join(HERE, "v05_resultats.json"), "w") as f:
    json.dump(out, f, indent=1)
