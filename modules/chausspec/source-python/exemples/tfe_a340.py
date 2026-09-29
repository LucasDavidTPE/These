"""Cas du TFE : train principal d'A340 (4 roues, 370 kN/roue) sur la structure PEP.

Reproduit le chapitre 3 du rapport de TFE (L. DAVID, 2026) avec chausspec :
  - structure BB-GB / GRH / Subgrade 1 / Subgrade 2 / Substratum, fond « déplacement vertical
    bloqué » (rigid_smooth), interfaces collées, nu = 0.35 partout ;
  - trois empreintes : rectangulaire uniforme, circulaire uniforme, hétérogène De Beer (Annexe III) ;
  - trois lois pour BB-GB : élastique E = 11 670 MPa, KVG (Tableau 7), 2S2P1D (Tableau 6).
Axes chausspec : x = longitudinal (roulement), y = transversal. Dans le TFE c'est l'inverse :
eps_xx(TFE) = eyy(chausspec) et eps_xz(TFE) = eyz(chausspec).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import chausspec as cs

F_ROUE = 370e3
V = 0.66            # m/s
DX_BOGIE = 1.98     # entraxe longitudinal (m)
DY_BOGIE = 1.40     # entraxe transversal (m)

# --- matériaux -------------------------------------------------------------------------------
BBGB_2S2P1D = cs.TwoS2P1D(E00=65, E0=30000, k=0.25, h=0.787, delta=1.58, tau_ref=1.22,
                          beta=np.inf, T_ref=9.3, nu=0.35, name="2S2P1D (Tab. 6)")
BBGB_KVG = cs.GeneralizedKelvinVoigt(
    E0=3.0e4,
    Ei=[2.96e5, 2.11e5, 1.35e5, 6.40e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2],
    taui=[2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39e0, 9.57e1, 1.23e3, 1.59e4],
    nu=0.35, name="KVG 9 branches (Tab. 7)")
BBGB_ELAS = cs.Elastic(11670, 0.35, name="élastique 11 670 MPa")


def structure(bbgb):
    return cs.Structure([
        cs.Layer(bbgb, 0.32, "BB+GB"),
        cs.Layer(cs.Elastic(150, 0.35), 0.60, "GRH"),
        cs.Layer(cs.Elastic(75, 0.35), 1.00, "Subgrade 1"),
        cs.Layer(cs.Elastic(150, 0.35), 1.00, "Subgrade 2"),
        cs.Layer(cs.Elastic(30000, 0.35), 2.00, "Substratum"),
    ], bottom="rigid_smooth")


# --- empreintes (x longitudinal, y transversal) -----------------------------------------------
def footprint(kind):
    if kind == "rectangulaire":
        return cs.UniformRect(1.0, lx=0.56, ly=0.40).scaled_to(F_ROUE)
    if kind == "circulaire":
        return cs.UniformCircle(1.0, R=np.sqrt(0.40 * 0.56 / np.pi)).scaled_to(F_ROUE)
    if kind == "heterogene":
        T = cs.GaussianPairs1D(P=[1.32, 0.80, 0.822], centers=[0.14846, 0.08804, 0.02864],
                               sig=[0.02824, 0.01695, 0.01741])
        Lg = cs.HalfEllipse1D(c=0.277)
        return cs.Separable(fx=Lg, fy=T).scaled_to(F_ROUE)
    raise ValueError(kind)


def bogie(kind):
    fp = footprint(kind)
    wheels = [cs.Wheel(fp, x0=x0, y0=y0) for x0 in (0.0, -DX_BOGIE) for y0 in (-DY_BOGIE / 2, DY_BOGIE / 2)]
    return cs.Loading(wheels)


if __name__ == "__main__":
    import time
    st = structure(BBGB_KVG)
    print(st.describe())
    for kind in ("rectangulaire", "circulaire", "heterogene"):
        fp = footprint(kind)
        print(f"{kind:14s} F = {fp.force()/1e3:.1f} kN   p_max = {fp.peak()/1e6:.2f} MPa")
    t = time.time()
    g = cs.solve_grid(st, bogie("rectangulaire"), cs.Moving(V), depths=[0.32], comps=("eyy",),
                      L=(32, 16), N=(512, 1024), window=(-4, 2, -2, 2), verbose=True)
    print("temps", time.time() - t, "eyy max", g.argmax("eyy", 0.32))
