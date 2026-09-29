"""T4 — Campagne « niveau 1 » : influence de la texture de surface sur la réponse proche de la
surface, comparée aux résultats du TFE (surface lisse).

Pour chaque empreinte du TFE (bogie A340, KVG, 0,66 m/s, 9,3 °C) et chaque texture :
  p = p0 . m(x, y ; p0)      (m : modulation de contact, BEM pneu élastique / surface rigide)
  eps = eps_nominal (charge roulante multicouche, TFE)  +  deps (couplage deux échelles)
sur la roue arrière droite (où se trouvent les maxima du TFE), grille fine de 0,25 mm.
Résultats : t04_resultats.json (+ cartes réduites t04_cartes.npz).
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
from scipy.interpolate import RegularGridInterpolator as RGI
from scipy import ndimage
import chausspec as cs
from chausspec.contact import (ContactLibrary, Tread, GROOVE_PITCH, grooves_profile, random_texture,
                               solve_contact, surface_stats)
from chausspec.texture import effective_compliance, local_response
from tfe_a340 import BBGB_KVG, V, bogie, structure

FAST = os.environ.get("FAST") == "1"
THR = float(os.environ.get("THR", "0.5"))        # seuil de définition de C = Q / p0 (voir notice)
TEX = os.environ.get("TEX")                       # restreindre à des textures (liste séparée par des virgules)
D = 0.5e-3 if FAST else 0.25e-3                  # pas de la grille fine (m)
TILE = 0.128                                      # cellule de texture (m)
NT = int(round(TILE / D))
Z = [0.0, 0.001, 0.002, 0.005, 0.010, 0.020, 0.040, 0.080]
STR = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
WIN = (-2.30, -1.66, 0.40, 1.00)                  # roue arrière droite
MARGE = 0.02
PBARS = np.array([0.15, 0.3, 0.6, 1.0, 1.65, 2.3, 3.0, 4.0]) * 1e6
PRINTS = ("heterogene", "rectangulaire", "circulaire")
if os.environ.get("ONLY"):
    PRINTS = tuple(os.environ["ONLY"].split(","))
st = structure(BBGB_KVG)
E_s = 1e9

SUFFIX = ("_fast" if FAST else "") + ("" if THR == 0.5 else f"_thr{THR}")
resfile = os.path.join(HERE, f"t04_resultats{SUFFIX}.json")
RES = json.load(open(resfile)) if os.path.exists(resfile) else {}
CARTES = {}


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------------------------------------
# 1) textures et bibliothèques de contact
# ---------------------------------------------------------------------------------------------
t0 = time.time()
TREAD = Tread(E=10.0, nu=0.49, t=0.010)
textures = {}
# rainurage transversal FAA : modulation 1D (x) par BEM sur un pas
xg = np.arange(int(round(GROOVE_PITCH / D))) * (GROOVE_PITCH / round(GROOVE_PITCH / D))
dxg = xg[1] - xg[0]
for name, r in (("rainures_vives", 0.0), ("rainures_r1mm", 1.0e-3)):
    h = grooves_profile(xg, phase=0.0, edge_radius=r)
    sol = solve_contact(h, dxg, 1.65e6, TREAD)
    textures[name] = dict(kind="grooves", m=sol.p / 1.65e6, x=xg,
                          info=dict(pmax_MPa=float(sol.p.max() / 1e6), aire=sol.area_fraction))
    log(f"{name}: aire {sol.area_fraction:.3f}, p_max {sol.p.max()/1e6:.1f} MPa pour 1,65 MPa nominal")
rand_cases = [("gauss_MPD0.6", 0.6e-3, "gauss", TREAD), ("gauss_MPD1.0", 1.0e-3, "gauss", TREAD),
              ("gauss_MPD1.5", 1.5e-3, "gauss", TREAD), ("negative_MPD1.0", 1.0e-3, "negative", TREAD),
              ("positive_MPD1.0", 1.0e-3, "positive", TREAD),
              ("gauss_MPD1.0_Er5", 1.0e-3, "gauss", Tread(5.0, 0.49, 0.010)),
              ("gauss_MPD1.0_Er20", 1.0e-3, "gauss", Tread(20.0, 0.49, 0.010))]
for name, mpd, skew, tr in rand_cases:
    h = random_texture(L=TILE, N=NT, mpd=mpd, skew=skew, seed=1)
    stats = surface_stats(h, D)
    lib = ContactLibrary.build(h, D, PBARS, tr, tol=1e-7, maxit=3000)
    textures[name] = dict(kind="random", lib=lib, info=dict(
        MPD_mm=stats["MPD"] * 1e3, Sq_mm=stats["Sq"] * 1e3, Ssk=stats["Ssk"], m2=stats["m2"],
        aire_1p65=float(np.interp(1.65e6, PBARS, lib.area)), E_r=tr.E,
        p99_1p65_MPa=float(np.percentile((lib.m[4] * 1.65)[lib.m[4] > 0], 99))))
    log(f"{name}: {textures[name]['info']}  ({time.time()-t0:.0f} s)")
if FAST:
    for k in [k for k in textures if k.endswith(("Er5", "Er20")) or k.startswith(("positive", "gauss_MPD0.6"))]:
        textures.pop(k)

# ---------------------------------------------------------------------------------------------
# 2) boucle empreintes x textures
# ---------------------------------------------------------------------------------------------
xf = np.arange(WIN[0] - MARGE, WIN[1] + MARGE, D)
yf = np.arange(WIN[2] - MARGE, WIN[3] + MARGE, D)
XF, YF = np.meshgrid(xf, yf)
inwin = (XF >= WIN[0]) & (XF <= WIN[1]) & (YF >= WIN[2]) & (YF <= WIN[3])
pts = np.stack([YF.ravel(), XF.ravel()], -1)

for fp in PRINTS:
    load = bogie(fp)
    t1 = time.time()
    Ng = (1024, 512) if FAST else (2048, 1024)
    gn = cs.solve_grid(st, load, cs.Moving(V), depths=Z, comps=STR, L=(6.0, 3.0), N=Ng,
                       window=(WIN[0] - 0.05, WIN[1] + 0.05, WIN[2] - 0.05, WIN[3] + 0.05), store="complex64")
    x, y, C, P = effective_compliance(load, BBGB_KVG, V, L=(6.0, 3.0), N=Ng, thr=THR,
                                      window=(WIN[0] - 0.05, WIN[1] + 0.05, WIN[2] - 0.05, WIN[3] + 0.05))
    # prolongement de C hors de l'empreinte (plus proche voisin) : dp y est nul
    idx = ndimage.distance_transform_edt(~np.isfinite(C), return_distances=False, return_indices=True)
    C = C[tuple(idx)]
    Cf = RGI((y, x), C)(pts).reshape(XF.shape)
    p0 = load.sample(XF, YF)
    nominal = {}
    for z in Z:
        for c in STR:
            nominal[(c, z)] = RGI((gn.y, gn.x), gn[c, z])(pts).reshape(XF.shape).astype(np.float32)
    log(f"--- {fp} : nominal calculé ({time.time()-t1:.0f} s)")
    tl = ["lisse"] + list(textures)
    if TEX:
        tl = [t for t in tl if t in TEX.split(",")]
    for tname in tl:
        key = f"{fp}|{tname}"
        if key in RES:
            continue
        t2 = time.time()
        if tname == "lisse":
            dp = np.zeros_like(p0)
        else:
            T = textures[tname]
            if T["kind"] == "grooves":
                ix = (np.round(np.mod(XF, GROOVE_PITCH) / dxg).astype(int)) % T["m"].size
                m = T["m"][ix]
            else:
                L_ = T["lib"]
                ix = (np.round(XF / D).astype(int)) % NT
                iy = (np.round(YF / D).astype(int)) % NT
                m = L_.modulation(np.maximum(p0, 1.0), iy, ix)
            dp = np.where(inwin & (p0 > 0), p0 * (m - 1.0), 0.0)
        out = dict(profil={}, meta=dict(D=D, p0_max_MPa=float(p0.max() / 1e6),
                                        p_max_MPa=float((p0 + dp).max() / 1e6)))
        for z in Z:
            loc = local_response(dp, D, D, [z], nu=0.35, E_s=E_s, comps=STR) if tname != "lisse" else None
            f = {}
            for c in STR:
                d_ = 0.0 if loc is None else (loc[(c, z)] * E_s * Cf)
                f[(c, z)] = (nominal[(c, z)] + d_)[inwin].astype(np.float64)
            E = np.stack([np.stack([f["exx", z], f["exy", z], f["exz", z]], -1),
                          np.stack([f["exy", z], f["eyy", z], f["eyz", z]], -1),
                          np.stack([f["exz", z], f["eyz", z], f["ezz", z]], -1)], -2)
            e1 = np.linalg.eigvalsh(E)[:, 2]
            ii = int(np.argmax(e1))
            out["profil"][f"{z:.3f}"] = dict(x_e1=float(XF[inwin][ii]), y_e1=float(YF[inwin][ii]),
                e1_max=float(e1.max()), e1_p999=float(np.percentile(e1, 99.9)),
                exz_max=float(np.abs(f["exz", z]).max()), eyz_max=float(np.abs(f["eyz", z]).max()),
                eyz_p999=float(np.percentile(np.abs(f["eyz", z]), 99.9)),
                ezz_min=float(f["ezz", z].min()), exx_max=float(f["exx", z].max()), eyy_max=float(f["eyy", z].max()))
            if z == 0.002 and fp == "heterogene":
                sub = np.zeros(XF.shape, np.float32); sub[inwin] = e1
                CARTES[f"{tname}_e1_z2mm"] = sub[::4, ::4]
            del E, e1, f
        RES[key] = out
        json.dump(RES, open(resfile, "w"), indent=1)
        pr = out["profil"]
        log(f"{key:34s} e1 max z=1/2/5/10 mm : " + " / ".join(f"{pr[f'{z:.3f}']['e1_max']*1e6:6.1f}" for z in (0.001, 0.002, 0.005, 0.01))
            + f" | max|eyz| : " + " / ".join(f"{pr[f'{z:.3f}']['eyz_max']*1e6:6.1f}" for z in (0.002, 0.01, 0.04)) + f"  ({time.time()-t2:.0f} s)")
    if fp == "heterogene":
        CARTES["x"] = xf[::4]; CARTES["y"] = yf[::4]
        np.savez_compressed(os.path.join(HERE, f"t04_cartes{SUFFIX}.npz"), **CARTES)
json.dump({k: v["info"] for k, v in textures.items()}, open(os.path.join(HERE, f"t04_textures{SUFFIX}.json"), "w"), indent=1)
log("terminé", time.time() - t0)
