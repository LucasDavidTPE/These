"""T9 — Contrôle de la réponse locale aux efforts tangentiels (frottement).

Chargement : pression aléatoire de moyenne nulle p (texture MPD 1 mm sous 1,65 MPa) avec
frottement q = mu p (mu = 0,5, vers +x) et effort transversal 0,3 p, grille périodique de 0,25 mm.
(a) local_response : forme fermée (a + b xi z) e^{-xi z} identifiée sur le noyau ;
(b) référence : noyau multicouche général (LayeredKernel, tangentiel) évalué nombre d'onde par
    nombre d'onde sur la même grille, pour (b1) le massif homogène semi-infini et (b2) la
    structure complète du TFE (élastique 11 670 MPa), comme le contrôle T6 pour la pression.
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
import chausspec as cs
from chausspec.kernel import LayeredKernel
from chausspec.spectral import components_from_amplitudes, layer_moduli, tangential_decomposition
from chausspec.contact import ContactLibrary, Tread, random_texture
from chausspec.texture import local_response
from tfe_a340 import BBGB_ELAS, structure

D, NT = 0.25e-3, 512
Z = [0.001, 0.002, 0.005, 0.010]
C = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
h = random_texture(L=NT * D, N=NT, mpd=1.0e-3, seed=1)
lib = ContactLibrary.build(h, D, np.array([1.0, 1.65, 2.3]) * 1e6, Tread(10, 0.49, 0.01), tol=1e-7)
m = lib.m[1]
dp = 1.65e6 * (m - m.mean())
E_s, nu = 11670e6, 0.35
loc = local_response(dp, D, D, Z, nu, E_s, C, dqx=0.5 * dp, dqy=0.3 * dp)

F = np.fft.rfft2(dp) * D * D
k1 = 2 * np.pi * np.fft.rfftfreq(NT, D); k2 = 2 * np.pi * np.fft.fftfreq(NT, D)
K1, K2 = np.meshgrid(k1, k2); xi = np.hypot(K1, K2); xi[0, 0] = 1.0
c1, c2 = K1 / xi, K2 / xi
T0, R0 = tangential_decomposition(c1.ravel(), c2.ravel(), 0.5 * F.ravel(), 0.3 * F.ravel())
res = {}
for label, st in (("massif_homogene", cs.Structure([cs.Layer(cs.Elastic(E_s / 1e6, nu), 1.0)], bottom="halfspace")),
                  ("structure_TFE", structure(BBGB_ELAS))):
    lam, mu = layer_moduli(st, np.zeros(xi.size))
    K = LayeredKernel(st, xi.ravel(), lam, mu, tangential=True)
    for z in Z:
        amp = K.at_depth(z)
        ref = components_from_amplitudes(amp, xi.ravel(), c1.ravel(), c2.ravel(), F.ravel(), T0, R0, C)
        for c in C:
            v = ref[c].reshape(F.shape).copy(); v[0, 0] = 0
            r = np.fft.irfft2(v, s=(NT, NT)) / (D * D)
            res[f"{label}|{c}_z{z*1e3:.0f}mm"] = float(np.abs(loc[(c, z)] - r).max() / np.abs(r).max())
for label in ("massif_homogene", "structure_TFE"):
    sub = {k: v for k, v in res.items() if k.startswith(label)}
    print(label, "écart max relatif : %.2e" % max(sub.values()), " (composante", max(sub, key=sub.get), ")")
json.dump(res, open(os.path.join(HERE, "t09_resultats.json"), "w"), indent=1)
