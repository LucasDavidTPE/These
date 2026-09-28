import json, sys, os, numpy as np
sys.path.insert(0, ".")
import chausspec as cs
from chausspec.io import case_from_dict
from chausspec.grid import solve_grid

cp = lambda a: [[float(v.real), float(v.imag)] for v in np.asarray(a, complex).ravel()]
out = {}

# --- lois ---
w = np.array([-30.0, 0.0, 1e-4, 0.3, 6.28, 100.0, 1e5])
m1 = cs.TwoS2P1D(E00=65, E0=30000, k=0.25, h=0.787, delta=1.58, tau_ref=1.22, beta=300, T_ref=9.3, C1=30, C2=210, T=20, nu00=0.2, nu0=0.45)
m2 = cs.GeneralizedKelvinVoigt(3.0e4, [2.96e5, 1.35e5, 2.58e4, 1.16e3], [2.06e-5, 3.44e-3, 5.74e-1, 95.7], nu=0.3)
m3 = cs.GeneralizedMaxwell(80, [15000, 9000, 5000], [1e-4, 1e-2, 1.0], nu=0.4)
out["lois"] = {"omega": w.tolist(), "2s2p1d": {"E": cp(m1.young(w)), "nu": cp(m1.poisson(w))}, "kvg": {"E": cp(m2.young(w))}, "maxwell": {"E": cp(m3.young(w))}}

# --- empreintes ---
k1 = np.array([0.0, 0.3, -2.0, 7.5, 30.0]); k2 = np.array([0.0, -1.1, 4.0, 0.2, 12.0])
csv = np.loadtxt("exemples/carte_exemple.csv", delimiter=";")
fps = {
  "rect": cs.UniformRect(0.9e6, 0.56, 0.40),
  "circle": cs.UniformCircle(0.7e6, 0.15),
  "debeer": cs.Separable(cs.HalfEllipse1D(0.277), cs.GaussianPairs1D([1.32, 0.80, 0.822], [0.14846, 0.08804, 0.02864], [0.02824, 0.01695, 0.01741])).scaled_to(370e3),
  "tab": cs.Separable(cs.Tabulated1D([-0.2, -0.1, 0.0, 0.12, 0.2], [0, 1, 2, 1.5, 0]), cs.Box1D(0.15), 1e6),
  "map": cs.PressureMap(csv[0, 1:], csv[1:, 0], csv[1:, 1:] * 1e6).scaled_to(1e5),
}
out["empreintes"] = {"k1": k1.tolist(), "k2": k2.tolist(), "ft": {k: cp(f.ft(k1, k2)) for k, f in fps.items()}, "force": {k: f.force() for k, f in fps.items()}}

# --- cas de grille ---
str5 = {"bottom": "rigid_smooth", "layers": [
  {"name": "BB+GB", "h": 0.32, "material": {"type": "2S2P1D", "E00": 65, "E0": 30000, "k": 0.25, "h": 0.787, "delta": 1.58, "tau_ref": 1.22, "beta": "inf", "T_ref": 9.3, "nu": 0.35}},
  {"name": "GRH", "h": 0.60, "material": {"type": "elastic", "E": 150, "nu": 0.35}},
  {"name": "S1", "h": 1.00, "material": {"type": "elastic", "E": 75, "nu": 0.35}},
  {"name": "S2", "h": 1.00, "material": {"type": "elastic", "E": 150, "nu": 0.35}},
  {"name": "Sub", "h": 2.00, "material": {"type": "elastic", "E": 30000, "nu": 0.35}}]}
str3 = {"bottom": "halfspace", "layers": [
  {"name": "BB", "h": 0.10, "material": {"type": "elastic", "E": 7000, "nu": 0.35}},
  {"name": "GNT", "h": 0.30, "material": {"type": "elastic", "E": 300, "nu": 0.35}},
  {"name": "Sol", "material": {"type": "elastic", "E": 50, "nu": 0.35}}]}
kvgmat = {"type": "KVG", "E0": 3.0e4, "Ei": [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2], "taui": [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900]}
ALL = ["ux","uy","uz","exx","eyy","ezz","exy","exz","eyz","sxx","syy","szz","sxy","sxz","syz"]
cases = {
 "statique": {"structure": str3, "loading": {"wheels": [{"x0": 0.05, "y0": 0.0, "footprint": {"type": "rect", "lx": 0.3, "ly": 0.25, "force": 100000}}]},
   "regime": {"type": "static"}, "grid": {"L": [16, 16], "N": [64, 64], "window": [-1, 1, -1, 1]}, "outputs": {"depths": [0.0, 0.1], "components": ALL}},
 "roulant": {"structure": str5, "loading": {"wheels": [{"x0": 0.0, "y0": -0.7, "footprint": {"type": "rect", "lx": 0.56, "ly": 0.40, "force": 370000}},
   {"x0": -1.98, "y0": 0.7, "footprint": {"type": "rect", "lx": 0.56, "ly": 0.40, "force": 370000}}]},
   "regime": {"type": "moving", "speed": 0.66}, "grid": {"L": [16, 8], "N": [64, 32], "window": [-3, 2, -1.5, 1.5]}, "outputs": {"depths": [0.32], "components": ["uz","exx","eyy","ezz","exy","exz","eyz"]}},
 "harmonique": {"structure": {"bottom": "halfspace", "layers": [{"h": 0.2, "material": kvgmat}, {"material": {"type": "elastic", "E": 100, "nu": 0.4}}]},
   "loading": {"wheels": [{"footprint": {"type": "circle", "R": 0.15, "p": 0.7e6}}]}, "regime": {"type": "harmonic", "freq": 10},
   "grid": {"L": [8, 8], "N": [32, 32], "window": [-1, 1, -1, 1]}, "outputs": {"depths": [0.0, 0.2], "components": ["uz", "ezz", "exx"]}},
 "tangentiel": {"structure": {"bottom": "rigid_bonded", "interfaces": ["bonded", "bonded"], "layers": [
   {"h": 0.08, "material": {"type": "elastic", "E": 5000, "nu": 0.35}}, {"h": 0.3, "material": {"type": "elastic", "E": 300, "nu": 0.35}}, {"h": 2.0, "material": {"type": "elastic", "E": 60, "nu": 0.4}}]},
   "loading": {"wheels": [{"footprint": {"type": "rect", "lx": 0.3, "ly": 0.2, "force": 50000}, "qx": 0.3, "qy": -0.1}]},
   "regime": {"type": "static"}, "grid": {"L": [8, 8], "N": [64, 64], "window": [-0.6, 0.6, -0.6, 0.6]}, "outputs": {"depths": [0.0, 0.08], "components": ["ux", "uy", "uz", "exz", "eyz", "sxz", "exx"]}},
 "carte": {"structure": str3, "loading": {"wheels": [{"footprint": {"type": "map", "file": "exemples/carte_exemple.csv", "unit": 1e6, "force": 100000}}]},
   "regime": {"type": "static"}, "grid": {"L": [8, 8], "N": [64, 64], "window": [-0.5, 0.5, -0.5, 0.5]}, "outputs": {"depths": [0.1], "components": ["uz", "eyy"]}},
 "debeer": {"structure": str5, "loading": {"wheels": [{"footprint": {"type": "separable", "fx": {"type": "halfellipse", "c": 0.277},
   "fy": {"type": "gaussianpairs", "P": [1.32, 0.80, 0.822], "centers": [0.14846, 0.08804, 0.02864], "sig": [0.02824, 0.01695, 0.01741]}, "force": 370000}}]},
   "regime": {"type": "moving", "speed": 2.0}, "grid": {"L": [16, 8], "N": [64, 64], "window": [-1, 1, -0.5, 0.5], "filter_width": 0.02}, "outputs": {"depths": [0.0, 0.32], "components": ["uz", "eyy", "exx"]}},
}
out["grilles"] = {}
for name, case in cases.items():
    st, load, regime = case_from_dict(json.loads(json.dumps(case)))
    g, o = case["grid"], case["outputs"]
    r = solve_grid(st, load, regime, o["depths"], tuple(o["components"]), L=tuple(g["L"]), N=tuple(g["N"]), window=g.get("window"), filter_width=g.get("filter_width", 0.0))
    fields = {f"{c}@{z}": cp(v) for (c, z), v in r.fields.items()}
    out["grilles"][name] = {"cas": case, "x": r.x.tolist(), "y": r.y.tolist(), "champs": fields, "noeuds": list(r.meta["n_band_nodes"])}

# --- axisymétrique ---
st = cs.Structure([cs.Layer(cs.Elastic(6000, 0.35), 0.15), cs.Layer(cs.Elastic(200, 0.35), 0.4), cs.Layer(cs.Elastic(50, 0.4), 1.0)], bottom="halfspace")
ax = cs.solve_axisym(st, 0.7e6, 0.15, r=[0.0, 0.25, 0.6], z=[0.05, 0.15, 0.4])
st2 = cs.Structure([cs.Layer(cs.GeneralizedKelvinVoigt(**{k: v for k, v in kvgmat.items() if k != "type"}), 0.2), cs.Layer(cs.Elastic(100, 0.4), 1.0)], bottom="rigid_smooth")
ah = cs.solve_axisym(st2, 0.7e6, 0.15, r=[0.0, 0.3], z=[0.0, 0.2], regime=cs.Harmonic(5.0))
out["axisym"] = {"statique": {k: cp(v) for k, v in ax.items()}, "harmonique": {k: cp(v) for k, v in ah.items()}}
json.dump(out, open(sys.argv[1], "w"))
print({k: len(json.dumps(v)) for k, v in out.items()})
