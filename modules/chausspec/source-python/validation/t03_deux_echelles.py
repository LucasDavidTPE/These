"""T3 — Validation du couplage deux échelles (texture fixe sous une enveloppe roulante).

Chargement : bogie A340 du TFE (KVG, V = 0,66 m/s) modulé par l'harmonique fondamentale du
rainurage transversal : dp = p0(x - Vt, y) . 2 cos(k x), k = 2 pi / 38,1 mm.

  - EXACT : multicouche complet ; la charge p0 exp(+i k x) est traitée par le régime
    MovingEnvelope (omega = -k1 V, noyau évalué en k1 + k) ; dp -> 2 Re[exp(i k X) g(X, y)].
  - DEUX ÉCHELLES, formule multiplicative (1re version) : réponse statique d'un massif homogène à
    dp (grille fine, E_s), multipliée par E_s . C(X, y), C = Q / p0, Q^ = p0^ / E*(-k1 V) ;
  - DEUX ÉCHELLES, méthode héréditaire (version définitive) : réponse statique du massif homogène à
    dp_eq = E_s int J(-s) d_s dp(x, s), intégrée point par point sur l'histoire du passage.
Indicateurs : écart sur le maximum de chaque composante et écart quadratique relatif à
l'intérieur de l'empreinte (p0 > 50 % du max).
"""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
from scipy.interpolate import RegularGridInterpolator as RGI
import chausspec as cs
from chausspec.regimes import MovingEnvelope
from chausspec.texture import effective_compliance, local_response, envelope_sampler, hereditary_perturbation
from tfe_a340 import BBGB_KVG, V, bogie, structure

k = 2 * np.pi / 38.1e-3
Z = [0.002, 0.005, 0.010, 0.020]
COMPS = ("exx", "eyy", "ezz", "exz", "eyz")
win = (-2.35, -1.60, 0.40, 1.00)
kw = dict(L=(6.0, 3.0), N=(1024, 512), window=win)
st = structure(BBGB_KVG)
out = []
for fp in ("heterogene", "rectangulaire"):
    load = bogie(fp)
    t0 = time.time()
    g = cs.solve_grid(st, load, MovingEnvelope(V), depths=Z, comps=COMPS, k1_shift=k, **kw)
    Xc, Yc = np.meshgrid(g.x, g.y)
    exact = {key: 2 * np.real(np.exp(1j * k * Xc) * v) for key, v in g.fields.items()}
    x, y, C, P = effective_compliance(load, BBGB_KVG, V, thr=0.01, **kw)
    Cf = RGI((y, x), np.nan_to_num(C), bounds_error=False, fill_value=0.0)
    # grille fine de la réponse locale (marge de 5 cm où dp = 0)
    d = 0.5e-3
    xf = np.arange(win[0] - 0.05, win[1] + 0.05, d)
    yf = np.arange(win[2] - 0.05, win[3] + 0.05, d)
    XF, YF = np.meshgrid(xf, yf)
    p0 = load.sample(XF, YF)
    edge = (XF < win[0]) | (XF > win[1]) | (YF < win[2]) | (YF > win[3])
    dp = np.where(edge, 0.0, p0 * 2 * np.cos(k * XF))
    E_s = 1e9
    loc = local_response(dp, d, d, Z, nu=0.35, E_s=E_s, comps=COMPS)
    # méthode héréditaire : dp(x, s) = p0(x - Vs) 2 cos(k x), texture fixe
    right = cs.Loading([w for w in load.wheels if w.y0 > 0])
    samp = envelope_sampler(right, xf, yf)
    mod = 1.0 + 2 * np.cos(k * XF)
    dpeq = hereditary_perturbation(samp, lambda p0: mod.ravel(), BBGB_KVG, V, (win[0] - 0.4) / V, 2.5e-3 / V, E_s=E_s)
    dpeq = np.where(edge, 0.0, dpeq)
    loh = local_response(dpeq, d, d, Z, nu=0.35, E_s=E_s, comps=COMPS)
    Cfine = Cf(np.stack([YF.ravel(), XF.ravel()], -1)).reshape(XF.shape)
    Pc = load.sample(Xc, Yc)
    inside = Pc > 0.5 * Pc.max()
    for z in Z:
        for c in COMPS:
            two_f = loc[(c, z)] * E_s * Cfine
            gi = lambda F_: RGI((yf, xf), F_)(np.stack([Yc.ravel(), Xc.ravel()], -1)).reshape(Xc.shape)
            two = gi(two_f)
            her = gi(loh[(c, z)])
            ex = exact[(c, z)]
            mx_e, mx_t, mx_h = np.max(np.abs(ex[inside])), np.max(np.abs(two[inside])), np.max(np.abs(her[inside]))
            rms = np.sqrt(np.mean((two[inside] - ex[inside]) ** 2)) / np.sqrt(np.mean(ex[inside] ** 2))
            rmh = np.sqrt(np.mean((her[inside] - ex[inside]) ** 2)) / np.sqrt(np.mean(ex[inside] ** 2))
            out.append((fp, z, c, mx_e * 1e6, mx_t * 1e6, mx_t / mx_e - 1, rms, mx_h * 1e6, mx_h / mx_e - 1, rmh))
            print(f"{fp:13s} z={z*1e3:4.0f} mm {c}: max exact {mx_e*1e6:7.2f} | multiplicative {mx_t*1e6:7.2f} ({(mx_t/mx_e-1)*100:+5.1f} %, "
                  f"quadr. {rms*100:5.1f} %) | héréditaire {mx_h*1e6:7.2f} ({(mx_h/mx_e-1)*100:+5.1f} %, quadr. {rmh*100:5.1f} %)", flush=True)
            if fp == "heterogene" and c == "exx" and z == 0.005:
                j = np.argmin(np.abs(g.y - 0.7))
                np.savetxt(os.path.join(HERE, "t03_ligne_exx_z5mm.csv"), np.c_[g.x, ex[j], two[j], her[j]], delimiter=";",
                           header="X;exact;multiplicative;hereditaire", comments="")
    print(f"  ({time.time()-t0:.0f} s)")
with open(os.path.join(HERE, "t03_resultats.csv"), "w") as f:
    f.write("empreinte;z;comp;max_exact;max_multiplicative;ecart_max_mult;ecart_quadr_mult;max_hereditaire;ecart_max_her;ecart_quadr_her\n")
    for r in out:
        f.write(";".join(str(v) for v in r) + "\n")
