"""T10 — Campagne « frottement » (dérivée de T7) : freinage q = mu p à l'échelle du pneu ET de la texture
(glissement total local, loi d'Amontons), plus l'état de déformation complet au point critique
(champ nominal, perturbation, pression nominale héréditaire p0_eq) pour les modèles locaux EF (T11, T12).
Variable d'environnement supplémentaire : MU.

T7 — Campagne définitive « texture » (méthode héréditaire exacte, voir note §4.4).

Pour chaque empreinte du TFE et chaque texture, sur la roue arrière droite :
  eps(x, z) = eps_nominal (charge roulante multicouche, KVG, TFE)
            + local_response( dp_eq ) ,  dp_eq = E_s . int J(-s) d_s dp(x, s)   (histoire complète,
                                                                                   deux roues droites)
dp(x, s) = p0(x - Vs, y) [m(x, y ; p0) - 1] : contact recalculé (bibliothèque) à chaque instant.
Variables d'environnement : ONLY (empreintes), TEX (textures), SEEDS (tirages supplémentaires,
ex. "2,3,4,5"), OUT (suffixe du fichier de résultats).
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
from scipy.interpolate import RegularGridInterpolator as RGI
import chausspec as cs
from chausspec.contact import (ContactLibrary, Tread, GROOVE_PITCH, grooves_profile, random_texture,
                               solve_contact, surface_stats)
from chausspec.texture import envelope_sampler, hereditary_perturbation, local_response
from tfe_a340 import BBGB_KVG, V, bogie, structure

D = 0.25e-3; TILE = 0.128; NT = int(round(TILE / D))
Z = [0.001, 0.002, 0.005, 0.010, 0.020, 0.040, 0.080]
STR = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
WIN = (-2.30, -1.66, 0.40, 1.00); MARGE = 0.02
PBARS = np.array([0.15, 0.3, 0.6, 1.0, 1.65, 2.3, 3.0, 4.0]) * 1e6
DSMM = {"heterogene": 10e-3, "rectangulaire": 5e-3, "circulaire": 5e-3}   # pas de déplacement de l'enveloppe
E_s = 1e9
st = structure(BBGB_KVG)
PRINTS = tuple(os.environ.get("ONLY", "heterogene,rectangulaire,circulaire").split(","))
SEEDS = [int(s) for s in os.environ["SEEDS"].split(",")] if os.environ.get("SEEDS") else []
OUTS = os.environ.get("OUT", "")
MU = float(os.environ.get("MU", "0"))
resfile = os.path.join(HERE, f"t10_resultats{OUTS}.json")
RES = json.load(open(resfile)) if os.path.exists(resfile) else {}
log = lambda *a: print(*a, flush=True)

# ---------------------------------------------------------------------------------- textures
T0 = time.time()
TREAD = Tread(10.0, 0.49, 0.010)
defs = []
if not SEEDS:
    defs += [("rainures_vives", "g", 0.0, None), ("rainures_r1mm", "g", 1e-3, None)]
    defs += [(n, "r", (mpd, skew, tr, 1), None) for n, mpd, skew, tr in (
        ("gauss_MPD0.6", 0.6e-3, "gauss", TREAD), ("gauss_MPD1.0", 1.0e-3, "gauss", TREAD),
        ("gauss_MPD1.5", 1.5e-3, "gauss", TREAD), ("negative_MPD1.0", 1.0e-3, "negative", TREAD),
        ("positive_MPD1.0", 1.0e-3, "positive", TREAD), ("gauss_MPD1.0_Er5", 1.0e-3, "gauss", Tread(5.0, 0.49, 0.010)),
        ("gauss_MPD1.0_Er20", 1.0e-3, "gauss", Tread(20.0, 0.49, 0.010)))]
else:
    for sd in SEEDS:
        for mpd in (0.6e-3, 1.0e-3, 1.5e-3):
            defs.append((f"gauss_MPD{mpd*1e3:.1f}_s{sd}", "r", (mpd, "gauss", TREAD, sd), None))
if os.environ.get("TEX"):
    defs = [d for d in defs if d[0] in os.environ["TEX"].split(",")]
TEXINFO = {}
libs = {}
for name, kind, par, _ in defs:
    if all(f"{fp}|{name}" in RES for fp in PRINTS):
        continue
    if kind == "g":
        xg = np.arange(int(round(GROOVE_PITCH / D))) * (GROOVE_PITCH / round(GROOVE_PITCH / D))
        sol = solve_contact(grooves_profile(xg, phase=0.0, edge_radius=par), xg[1] - xg[0], 1.65e6, TREAD)
        libs[name] = ("g", sol.p / 1.65e6, xg[1] - xg[0])
        TEXINFO[name] = dict(aire=sol.area_fraction, pmax_MPa=float(sol.p.max() / 1e6))
    else:
        mpd, skew, tr, sd = par
        h = random_texture(L=TILE, N=NT, mpd=mpd, skew=skew, seed=sd)
        s_ = surface_stats(h, D)
        lib = ContactLibrary.build(h, D, PBARS, tr, tol=1e-7, maxit=3000)
        libs[name] = ("r", lib, None)
        TEXINFO[name] = dict(MPD_mm=s_["MPD"] * 1e3, Sq_mm=s_["Sq"] * 1e3, Ssk=s_["Ssk"], m2=s_["m2"], E_r=tr.E,
                             aire_1p65=float(np.interp(1.65e6, PBARS, lib.area)),
                             p99_1p65_MPa=float(np.percentile((lib.m[4] * 1.65)[lib.m[4] > 0], 99)),
                             aire_par_pbar=lib.area.tolist())
    log(f"texture {name}: {TEXINFO[name]}  ({time.time()-T0:.0f} s)")
tfile = os.path.join(HERE, f"t10_textures{OUTS}.json")
old = json.load(open(tfile)) if os.path.exists(tfile) else {}
old.update(TEXINFO); json.dump(old, open(tfile, "w"), indent=1)

# ---------------------------------------------------------------------------------- grille fine
xf = np.arange(WIN[0] - MARGE, WIN[1] + MARGE, D)
yf = np.arange(WIN[2] - MARGE, WIN[3] + MARGE, D)
XF, YF = np.meshgrid(xf, yf)
inwin = (XF >= WIN[0]) & (XF <= WIN[1]) & (YF >= WIN[2]) & (YF <= WIN[3])
pts = np.stack([YF.ravel(), XF.ravel()], -1)
IX = (np.round(XF / D).astype(int)) % NT
IY = (np.round(YF / D).astype(int)) % NT
CARTES = {}
for fp in PRINTS:
    if all(f"{fp}|{d[0]}" in RES for d in defs) and (SEEDS or f"{fp}|lisse" in RES):
        continue
    load = bogie(fp)
    if MU:
        load = cs.Loading([cs.Wheel(w.footprint, x0=w.x0, y0=w.y0, qx=MU) for w in load.wheels])
    right = cs.Loading([w for w in load.wheels if w.y0 > 0])
    t1 = time.time()
    gn = cs.solve_grid(st, load, cs.Moving(V), depths=Z, comps=STR, L=(6.0, 3.0), N=(2048, 1024),
                       window=(WIN[0] - 0.05, WIN[1] + 0.05, WIN[2] - 0.05, WIN[3] + 0.05), store="complex64")
    # champs nominaux gardés sur la grille grossière (fenêtre) ; interpolation à la demande
    NOMG = (gn.y, gn.x, {k: v.astype(np.float32) for k, v in gn.fields.items()})
    del gn
    nominal_at = lambda key: RGI((NOMG[0], NOMG[1]), NOMG[2][key])(pts).reshape(XF.shape).astype(np.float32)
    sampler = envelope_sampler(right, xf, yf)
    s_start = (WIN[0] - MARGE - 0.35) / V            # arrivée de la roue avant sur la fenêtre
    DS = DSMM[fp] / V
    # points actifs : chargés à un instant de l'histoire (inutile d'intégrer ailleurs)
    active = np.zeros(XF.shape, bool)
    for s_ in np.arange(s_start, DS / 2, DS):
        pp = sampler(V * s_)
        active |= pp > 1e-4 * max(pp.max(), 1.0)
    active &= inwin
    IXm, IYm = IX[active], IY[active]
    log(f"--- {fp}: nominal ({time.time()-t1:.0f} s)")
    p0eq = hereditary_perturbation(sampler, lambda p0: 2.0 * np.ones_like(p0), BBGB_KVG, V, s_start, DS, E_s=E_s, mask=active)
    p0inst = sampler(0.0)
    names = ([] if SEEDS else ["lisse"]) + [d[0] for d in defs]
    for tname in names:
        key = f"{fp}|{tname}"
        if key in RES:
            continue
        t2 = time.time()
        if tname == "lisse":
            dp_eq = None
        else:
            kind, L_, dxg = libs[tname]
            if kind == "g":
                mfix = L_[(np.round(np.mod(XF[active], GROOVE_PITCH) / dxg).astype(int)) % L_.size]
                modf = lambda p0, mfix=mfix: mfix
            else:
                modf = lambda p0, L_=L_: L_.modulation(np.maximum(p0, 1.0), IYm, IXm)
            dp_eq = hereditary_perturbation(sampler, modf, BBGB_KVG, V, s_start, DS, E_s=E_s, mask=active)
            dp_eq = np.where(inwin, dp_eq, 0.0)       # marge nulle (périodisation de la grille fine)
        out = dict(profil={})
        for z in Z:
            loc = local_response(dp_eq, D, D, [z], 0.35, E_s, STR, dqx=(MU * dp_eq if MU else None)) if dp_eq is not None else None
            f = {c: (nominal_at((c, z)) + (0 if loc is None else loc[(c, z)]))[inwin].astype(np.float64) for c in STR}
            E = np.stack([np.stack([f["exx"], f["exy"], f["exz"]], -1), np.stack([f["exy"], f["eyy"], f["eyz"]], -1),
                          np.stack([f["exz"], f["eyz"], f["ezz"]], -1)], -2)
            e1 = np.linalg.eigvalsh(E)[:, 2]
            ii = int(np.argmax(e1))
            xw, yw = XF[inwin], YF[inwin]
            out["profil"][f"{z:.3f}"] = dict(
                e1_max=float(e1.max()), e1_p999=float(np.percentile(e1, 99.9)), e1_p99=float(np.percentile(e1, 99)),
                x_e1=float(xw[ii]), y_e1=float(yw[ii]),
                exz_max=float(np.abs(f["exz"]).max()), exz_p999=float(np.percentile(np.abs(f["exz"]), 99.9)),
                eyz_max=float(np.abs(f["eyz"]).max()), eyz_p999=float(np.percentile(np.abs(f["eyz"]), 99.9)),
                ezz_min=float(f["ezz"].min()), exx_max=float(f["exx"].max()), eyy_max=float(f["eyy"].max()),
                point=dict(nominal={c: float(nominal_at((c, z))[inwin][ii]) for c in STR},
                           total={c: float(f[c][ii]) for c in STR},
                           p0_eq=float(p0eq[inwin][ii]), p0_inst=float(p0inst[inwin][ii])))
            if False:
                sub = np.zeros(XF.shape, np.float32); sub[inwin] = e1
                CARTES[f"{tname}_e1_z{z*1e3:.0f}mm"] = sub[::4, ::4]
            del E, e1, f, loc
        RES[key] = out
        json.dump(RES, open(resfile, "w"), indent=1)
        pr = out["profil"]
        log(f"{key:32s} e1 max 1/2/5/10/20 mm : " + " / ".join(f"{pr[f'{z:.3f}']['e1_max']*1e6:6.1f}" for z in Z[:5])
            + " | p99.9 2 mm " + f"{pr['0.002']['e1_p999']*1e6:6.1f}" + f"  ({time.time()-t2:.0f} s)")
    if CARTES:
        CARTES["x"] = xf[::4]; CARTES["y"] = yf[::4]
        pass
log("terminé", time.time() - T0)
