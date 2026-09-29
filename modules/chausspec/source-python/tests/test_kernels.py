"""Le solveur par rigidités (défaut) doit reproduire le solveur dense à la précision machine."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import pytest
import chausspec as cs
from chausspec.kernel import DenseKernel, StiffnessKernel

KVG = cs.GeneralizedKelvinVoigt(3.0e4, [2.96e5, 2.11e5, 1.35e5, 6.4e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2],
                                [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39, 95.7, 1230, 15900])


def make(bottom, inter):
    mats = [KVG, cs.Elastic(150, 0.35), cs.Elastic(75, 0.3), cs.Elastic(300, 0.4)]
    hs = [0.08, 0.3, 1.0, 2.0]
    return cs.Structure([cs.Layer(m, h) for m, h in zip(mats, hs)], bottom=bottom, interfaces=inter)


@pytest.mark.parametrize("bottom", ["halfspace", "rigid_bonded", "rigid_smooth"])
@pytest.mark.parametrize("inter", [["bonded"] * 3, ["slip", "bonded", "bonded"], ["bonded", "slip", "slip"],
                                   ["slip", "slip", "slip"]])
def test_dense_vs_stiffness(bottom, inter):
    st = make(bottom, inter)
    rng = np.random.default_rng(0)
    k1 = rng.uniform(-40, 40, 300); k2 = rng.uniform(-40, 40, 300)
    k1[:5] = [1e-3, 0.01, 0.1, 1.0, 300.0]
    xi = np.hypot(k1, k2)
    omega = -k1 * 0.66
    lam, mu = zip(*[L.material.lame(omega) for L in st.layers])
    a = DenseKernel(st, xi, lam, mu, tangential=True)
    b = StiffnessKernel(st, xi, lam, mu, tangential=True)
    ref = {k: np.max(np.abs(np.array(a.at_depth(0.0)[k])), axis=0) for k in ("n", "t", "sh")}
    for z in (0.0, 0.04, 0.08, 0.2, 0.38, 1.0, 2.5, 3.38):
        for side in ("above", "below"):
            A = a.at_depth(z, side); B = b.at_depth(z, side)
            for key in ("n", "t", "sh"):
                x = np.array(A[key]); y = np.array(B[key])
                err = np.max(np.abs(x - y) / ref[key][None, :])
                assert err < 1e-7, (key, z, side, err)
