import json, sys, numpy as np
sys.path.insert(0, ".")
import chausspec as cs
from chausspec.kernel import StiffnessKernel
KVG = cs.GeneralizedKelvinVoigt(3.0e4, [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2],
                                [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900])
mats = [KVG, cs.Elastic(150, 0.35), cs.Elastic(75, 0.3), cs.Elastic(300, 0.4)]
hs = [0.08, 0.3, 1.0, 2.0]
cfgs = [("halfspace", ["bonded"]*3), ("rigid_bonded", ["bonded"]*3), ("rigid_smooth", ["slip", "bonded", "bonded"]),
        ("halfspace", ["bonded", "slip", "slip"]), ("rigid_bonded", ["slip"]*3), ("rigid_smooth", ["bonded", "slip", "bonded"])]
rng = np.random.default_rng(1)
k1 = rng.uniform(-40, 40, 20); k2 = rng.uniform(-40, 40, 20)
k1[:5] = [1e-3, 0.01, 0.1, 1.0, 300.0]
xi = np.hypot(k1, k2); omega = -k1 * 0.66
cplx = lambda a: [[float(v.real), float(v.imag)] for v in np.asarray(a).ravel()]
out = []
for bottom, inter in cfgs:
    st = cs.Structure([cs.Layer(m, h) for m, h in zip(mats, hs)], bottom=bottom, interfaces=inter)
    lam, mu = zip(*[L.material.lame(omega) for L in st.layers])
    K = StiffnessKernel(st, xi, lam, mu, tangential=True)
    pts = []
    for z, side in ((0.0, "above"), (0.04, "above"), (0.08, "above"), (0.08, "below"), (0.38, "below"), (1.0, "above"), (3.38, "above")):
        a = K.at_depth(z, side)
        pts.append({"z": z, "side": side, "layer": int(a["layer"]), "n": [cplx(v) for v in a["n"]], "t": [cplx(v) for v in a["t"]], "sh": [cplx(v) for v in a["sh"]]})
    out.append({"bottom": bottom, "interfaces": inter, "h": hs, "lam": [cplx(l) for l in lam], "mu": [cplx(m) for m in mu], "depths": pts})
json.dump({"xi": xi.tolist(), "k1": k1.tolist(), "cas": out}, open(sys.argv[1], "w"))
