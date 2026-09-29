"""V2 — Multicouche élastique (3 couches, interfaces collées puis glissantes) sous charge
circulaire : comparaison à PyMastic (Nakhaei, code Burmister indépendant, validé vs KENPAVE)."""
import sys, os, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, os.environ.get("PYMASTIC", "/home/claude/PyMastic"))
import numpy as np
import chausspec as cs
from Main.MLE import PyMastic

q, a = 0.7, 0.15               # MPa, m
H = [0.20, 0.30]
E = [5000.0, 200.0, 50.0]
nu = [0.35, 0.35, 0.40]
r = [0.0, 0.3]
z = [0.0, 0.10, 0.1999, 0.2001, 0.35, 0.4999, 0.5001, 0.8]
out = []
for bd, lab in (([1, 1], "bonded"), ([0, 0], "slip")):
    RS = PyMastic(q, a, r, z, H, [e * 1e-3 for e in E], nu, ZRO=7e-7, isBounded=bd, iteration=(40 if bd[0] else 10), inverser="solve")  # PyMastic multiplie E par 1000 (ksi)
    layers = [cs.Layer(cs.Elastic(E[i], nu[i]), H[i] if i < 2 else 1.0) for i in range(3)]
    st = cs.Structure(layers, bottom="halfspace", interfaces=[lab, lab])
    ax = cs.solve_axisym(st, q * 1e6, a, r=r, z=z, side="above")
    # côté « below » pour les cotes juste sous une interface : on garde les cotes décalées
    print(f"\n=== interfaces : {lab} ===")
    print(f"{'z':>7} {'r':>4} | {'w PyM':>9} {'w cs':>9} | {'sz PyM':>8} {'sz cs':>8} | {'sr PyM':>8} {'sr cs':>8} | {'er PyM':>9} {'er cs':>9}")
    for iz, zz in enumerate(z):
        for ir, rr in enumerate(r):
            wP = RS["Displacement_Z"][iz, ir]; wc = ax["uz"][iz, ir]
            sP = RS["Stress_Z"][iz, ir]; sc = ax["szz"][iz, ir] / 1e6
            rP = RS["Stress_R"][iz, ir]; rc = ax["srr"][iz, ir] / 1e6
            eP = RS["Strain_R"][iz, ir]; ec = ax["err"][iz, ir]
            print(f"{zz:7.4f} {rr:4.1f} | {wP*1e3:9.4f} {wc*1e3:9.4f} | {sP:8.4f} {-sc:8.4f} | {rP:8.4f} {-rc:8.4f} | {-eP*1e6:9.2f} {ec*1e6:9.2f}")
            out.append((lab == "slip", zz, rr, wP, wc, sP, -sc, rP, -rc, -eP, ec))
np.savetxt(os.path.join(HERE, "v02_resultats.csv"), np.array(out, float), delimiter=";",
           header="slip;z;r;w_pymastic;w_cs;sz_pymastic;sz_cs;sr_pymastic;sr_cs;er_pymastic;er_cs", comments="")
