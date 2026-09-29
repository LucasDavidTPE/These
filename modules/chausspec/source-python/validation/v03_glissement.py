"""V3 — Interfaces glissantes : comparaison à une couche intercalaire très mince, quasi
incompressible et de module de cisaillement proportionnel à son épaisseur (interfaces collées). Quand
l'intercalaire tend vers 0, la solution doit tendre vers celle de l'interface glissante.
(PyMastic diverge numériquement dans les couches supérieures dans ce cas.)"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
import chausspec as cs

q, a = 0.7e6, 0.15
E = [5000.0, 200.0, 50.0]; nu = [0.35, 0.35, 0.40]
r = [0.0, 0.3]; z = [0.0, 0.10, 0.1999, 0.35, 0.4999, 0.8]
slip = cs.Structure([cs.Layer(cs.Elastic(E[0], nu[0]), 0.2), cs.Layer(cs.Elastic(E[1], nu[1]), 0.3),
                     cs.Layer(cs.Elastic(E[2], nu[2]), 1.0)], bottom="halfspace", interfaces=["slip", "slip"])
ref = cs.solve_axisym(slip, q, a, r, z)
print("écart relatif max (w, sr) entre glissement et intercalaire mou d'épaisseur e :")
rows = []
for e in (4e-3, 1e-3, 2.5e-4, 6.25e-5):
    soft = cs.Elastic(0.05 * e, 0.49999999995)  # mu/e constant -> 0 : raideur de cisaillement évanescente
    st = cs.Structure([cs.Layer(cs.Elastic(E[0], nu[0]), 0.2 - e / 2), cs.Layer(soft, e),
                       cs.Layer(cs.Elastic(E[1], nu[1]), 0.3 - e), cs.Layer(soft, e),
                       cs.Layer(cs.Elastic(E[2], nu[2]), 1.0)], bottom="halfspace")
    zz = [0.0, 0.10, 0.1999 - e, 0.35, 0.4999 - e, 0.8]
    ax = cs.solve_axisym(st, q, a, r, zz)
    ew = np.max(np.abs(ax["uz"] / ref["uz"] - 1))
    es = np.max(np.abs(ax["srr"][1:] - ref["srr"][1:])) / np.max(np.abs(ref["srr"][1:]))
    print(f"  e = {e*1e3:6.2f} mm : w {ew:.2e}   sigma_r {es:.2e}")
    rows.append((e, ew, es))
np.savetxt(os.path.join(HERE, "v03_resultats.csv"), np.array(rows), delimiter=";", header="e;err_w;err_sr", comments="")
print("sigma_r(r=0) glissant  [MPa] :", np.round(ref["srr"][:, 0] / 1e6, 4))
