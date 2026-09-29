"""V1 — Massif semi-infini élastique sous pression circulaire uniforme : comparaison aux
solutions analytiques de Love (1929) sur l'axe de la charge."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import chausspec as cs

E, nu, p, a = 100.0, 0.3, 0.7e6, 0.15
st = cs.Structure([cs.Layer(cs.Elastic(E, nu), 1.0)], bottom="halfspace")
z = np.array([0.0, 0.05, 0.1, 0.15, 0.3, 0.6, 1.0])
R = np.sqrt(a**2 + z**2)
szz_ex = -p * (1 - z**3 / R**3)
srr_ex = -p / 2 * ((1 + 2 * nu) - 2 * (1 + nu) * z / R + z**3 / R**3)
w_ex = (1 + nu) * p * a / (E * 1e6) * (a / R + (1 - 2 * nu) / a * (R - z))

t = time.time()
ax = cs.solve_axisym(st, p, a, r=[0.0], z=z)
print(f"Hankel : {time.time()-t:.2f} s")
t = time.time()
load = cs.Loading([cs.Wheel(cs.UniformCircle(p, a))])
g = cs.solve_grid(st, load, cs.Static(), depths=z, comps=("uz", "szz", "sxx"),
                  L=(24, 24), N=(1024, 1024), window=(-1, 1, -1, 1))
print(f"FFT 2D : {time.time()-t:.2f} s")
rows = []
print(f"{'z':>5} | {'szz exact':>10} {'Hankel':>10} {'FFT':>10} | {'srr exact':>10} {'Hankel':>10} {'FFT':>10} | {'w exact mm':>10} {'Hankel':>9} {'FFT':>9}")
for i, zz in enumerate(z):
    fz = g.interp("szz", zz, 0, 0); fr = g.interp("sxx", zz, 0, 0); fw = g.interp("uz", zz, 0, 0)
    print(f"{zz:5.2f} | {szz_ex[i]/1e3:10.2f} {ax['szz'][i,0]/1e3:10.2f} {fz/1e3:10.2f} | "
          f"{srr_ex[i]/1e3:10.2f} {ax['srr'][i,0]/1e3:10.2f} {fr/1e3:10.2f} | {w_ex[i]*1e3:10.4f} {ax['uz'][i,0]*1e3:9.4f} {fw*1e3:9.4f}")
    rows.append((zz, szz_ex[i], ax['szz'][i,0], fz, srr_ex[i], ax['srr'][i,0], fr, w_ex[i], ax['uz'][i,0], fw))
np.savetxt(os.path.join(os.path.dirname(__file__), "v01_resultats.csv"), np.array(rows), delimiter=";",
           header="z;szz_exact;szz_hankel;szz_fft;srr_exact;srr_hankel;srr_fft;w_exact;w_hankel;w_fft", comments="")
