"""V4 — Charge roulante sur massif viscoélastique homogène (loi KVG du TFE, Tableau 7).

Référence indépendante : pour un corps homogène à coefficient de Poisson constant chargé en
effort, le champ de contraintes est celui du problème élastique et la déformation s'obtient
par l'intégrale d'hérédité de Boltzmann avec la complaisance de fluage J(t) du KVG :
    eps(t) = int_{-inf}^{t} J(t - s) d eps_el^{E=1}(s),  J(t) = 1/E0 + sum 1/Ei (1 - exp(-t/tau_i)).
eps_el^{E=1}(s) est la déformation élastique (module unité) vue par le point quand la charge
passe : on la calcule en statique élastique (validé en V1-V2), puis on intègre en temps.
C'est une vérification directe de la correspondance omega = -k1 V et du traitement k1 = 0."""
import sys, os, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
import chausspec as cs

Ei = [2.96e5, 2.11e5, 1.35e5, 6.40e4, 2.58e4, 7.13e3, 1.16e3, 1.37e2, 1.43e2]
ti = [2.06e-5, 2.65e-4, 3.44e-3, 4.42e-2, 5.74e-1, 7.39e0, 9.57e1, 1.23e3, 1.59e4]
kvg = cs.GeneralizedKelvinVoigt(3.0e4, Ei, ti, nu=0.35)
V = 0.66
p, a = 1.65e6, 0.267
z = [0.05, 0.15]
load = cs.Loading([cs.Wheel(cs.UniformCircle(p, a))])
import os as _o
LX = float(_o.environ.get("LX", 256)); NX = int(_o.environ.get("NX", 16384)); LY = float(_o.environ.get("LY", 16)); NY = int(_o.environ.get("NY", 512))
kw = dict(depths=z, comps=("exx", "eyy", "ezz"), L=(LX, LY), N=(NX, NY), window=(-LX / 2 + 2, LX / 2 - 2, -0.1, 0.1))

st_el = cs.Structure([cs.Layer(cs.Elastic(1.0, 0.35), 1.0)], bottom="halfspace")
st_ve = cs.Structure([cs.Layer(kvg, 1.0)], bottom="halfspace")
t0 = time.time()
gel = cs.solve_grid(st_el, load, cs.Static(), **kw)
gve = cs.solve_grid(st_ve, load, cs.Moving(V), **kw)
print(f"calculs : {time.time()-t0:.1f} s")

E0 = 3.0e4
Ei_ = np.array(Ei); ti_ = np.array(ti)
res = []
for zz in z:
    for comp in ("exx", "eyy", "ezz"):
        X, fel = gel.line_x(comp, zz, 0.0)            # champ élastique E = 1 MPa
        _, fve = gve.line_x(comp, zz, 0.0)
        # point matériel en x = 0 : il voit X = -V t ; t croissant <=> X décroissant
        order = np.argsort(-X)
        Xs, e_el = X[order], fel[order]
        t = -Xs / V
        h = np.zeros_like(ti_)
        eps = np.empty_like(e_el)
        Jinf = 1 / E0 + np.sum(1 / Ei_)
        eps[0] = e_el[0] * Jinf
        for n in range(1, t.size):
            dt = t[n] - t[n - 1]
            de = e_el[n] - e_el[n - 1]
            dec = np.exp(-dt / ti_)
            h = dec * h + de * ti_ / dt * (1 - dec)
            eps[n] = e_el[n] * Jinf - np.sum(h / Ei_)
        ref = eps
        ve = fve[order]
        m = np.abs(Xs) < 3.0
        err = np.max(np.abs(ve[m] - ref[m])) / np.max(np.abs(ref[m]))
        iref = np.argmax(np.abs(ref)); ive = np.argmax(np.abs(ve))
        print(f"z={zz:.2f} {comp}: max |eps| réf {abs(ref[iref])*1e6:8.2f} µdef en X={Xs[iref]:+.3f} m | "
              f"chausspec {abs(ve[ive])*1e6:8.2f} µdef en X={Xs[ive]:+.3f} m | écart max {err*100:.2f} %")
        res.append((zz, comp, abs(ref[iref]) * 1e6, Xs[iref], abs(ve[ive]) * 1e6, Xs[ive], err))
        if zz == 0.15 and comp == "exx":
            np.savetxt(os.path.join(HERE, "v04_signal_exx_z015.csv"), np.c_[Xs[m], ref[m], ve[m], e_el[m] / E0],
                       delimiter=";", header="X;eps_heredite;eps_chausspec;eps_elastique_E0", comments="")
with open(os.path.join(HERE, "v04_resultats.csv"), "w") as f:
    f.write("z;comp;max_ref_microdef;X_ref;max_cs_microdef;X_cs;ecart_rel\n")
    for r in res:
        f.write(";".join(str(v) for v in r) + "\n")
