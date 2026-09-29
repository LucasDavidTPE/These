"""T5 — Contrôle de la formule deux échelles pour les textures ALÉATOIRES (contact non linéaire).

La formule deps = deps_stat[dp(t=0)] . E_s . C(X, y) suppose que dp(x, s) reste proportionnel à
l'enveloppe p0 pendant le passage. Pour une texture aléatoire c'est faux : l'aire de contact
grandit avec p0, la forme de dp change. On calcule ici la référence « exacte » (dans le cadre
demi-espace local + contact quasi-statique à chaque instant) par intégration temporelle :

    deps(x, t=0) = int_{-inf}^{0} J(0 - s) d/ds[ deps^{E=1}(x, s) ] ds,
    deps^{E=1}(x, s) = réponse statique à dp(x, s) = p0(x - Vs, y) (m(x, y ; p0(x - Vs, y)) - 1),

avec J(t) = 1/E0 + sum (1 - exp(-t/tau_i))/E_i (KVG du TFE), intégrée exactement pas à pas
(dp linéaire sur chaque pas). Fenêtres de 128 mm x 128 mm (une cellule de texture) fixes dans la
chaussée ; on compare sur les 64 mm centraux (pas d'effet de bord de la périodisation).
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE)); sys.path.insert(0, os.path.join(os.path.dirname(HERE), "exemples"))
import numpy as np
from scipy.interpolate import RegularGridInterpolator as RGI
from scipy import ndimage
from chausspec.contact import ContactLibrary, Tread, GROOVE_PITCH, grooves_profile, random_texture, solve_contact
from chausspec.texture import effective_compliance, local_response
from tfe_a340 import BBGB_KVG, V, bogie

D = 0.25e-3; NT = 512; TILE = NT * D
Z = [0.001, 0.002, 0.005, 0.010]
STR = ("exx", "eyy", "ezz", "exy", "exz", "eyz")
PBARS = np.array([0.15, 0.3, 0.6, 1.0, 1.65, 2.3, 3.0, 4.0]) * 1e6
TREAD = Tread(10.0, 0.49, 0.010)
E_s = 1e9
Ei = np.array(BBGB_KVG.Ei) * 1e6; ti = np.array(BBGB_KVG.taui); E0 = BBGB_KVG.E0 * 1e6
load = bogie("heterogene")
CENTRES = {"A_centre_roue": (-1.98, 0.70), "B_epaulement": (-1.98, 0.85)}
TEX = sys.argv[1:] or ["gauss_MPD1.0", "rainures_vives"]


def library(name):
    if name.startswith("rainures"):
        xg = np.arange(int(round(GROOVE_PITCH / D))) * (GROOVE_PITCH / round(GROOVE_PITCH / D))
        sol = solve_contact(grooves_profile(xg, phase=0.0, edge_radius=0.0 if "vives" in name else 1e-3), xg[1] - xg[0], 1.65e6, TREAD)
        return ("g", sol.p / 1.65e6, xg[1] - xg[0])
    mpd = float(name.split("MPD")[1][:3]) * 1e-3
    skew = name.split("_")[0]
    h = random_texture(L=TILE, N=NT, mpd=mpd, skew=skew, seed=1)
    return ("r", ContactLibrary.build(h, D, PBARS, TREAD, tol=1e-7, maxit=3000), None)


def modulation(lib, X, Y, p0):
    kind, L, dxg = lib
    if kind == "g":
        return L[(np.round(np.mod(X, GROOVE_PITCH) / dxg).astype(int)) % L.size]
    ix = (np.round(X / D).astype(int)) % NT
    iy = (np.round(Y / D).astype(int)) % NT
    return L.modulation(np.maximum(p0, 1.0), iy, ix)


# souplesse effective (formule deux échelles), deux seuils
x_, y_, C5, P = effective_compliance(load, BBGB_KVG, V, L=(6.0, 3.0), N=(2048, 1024), thr=0.5, window=(-2.4, -1.5, 0.4, 1.0))
_, _, C2, _ = effective_compliance(load, BBGB_KVG, V, L=(6.0, 3.0), N=(2048, 1024), thr=0.2, window=(-2.4, -1.5, 0.4, 1.0))
fill = lambda C: C[tuple(ndimage.distance_transform_edt(~np.isfinite(C), return_distances=False, return_indices=True))]
C5, C2 = fill(C5), fill(C2)
out = {}
for tex in TEX:
    t0 = time.time()
    lib = library(tex)
    for cname, (xc, yc) in CENTRES.items():
        xs = xc - TILE / 2 + D * np.arange(NT)
        ys = yc - TILE / 2 + D * np.arange(NT)
        X, Y = np.meshgrid(xs, ys)
        core = (np.abs(X - xc) < 0.032) & (np.abs(Y - yc) < 0.032)
        pts = np.stack([Y.ravel(), X.ravel()], -1)
        c5 = RGI((y_, x_), C5)(pts).reshape(X.shape); c2 = RGI((y_, x_), C2)(pts).reshape(X.shape)
        # --- instantané t = 0 (formule deux échelles) -----------------------------------------------
        p00 = load.sample(X, Y)
        dp0 = p00 * (modulation(lib, X, Y, p00) - 1.0)
        snap = local_response(dp0, D, D, Z, 0.35, E_s, STR)
        # --- intégration temporelle exacte ------------------------------------------------------------
        ds = 5e-3 / V
        s_all = np.arange(-4.2, 0.0 + ds / 2, ds)
        acc = {k: np.zeros(X.shape) for k in snap}
        prev = {k: np.zeros(X.shape) for k in snap}
        hist = {k: np.zeros((ti.size,) + X.shape) for k in snap}   # variables internes des cellules KV
        Jinf = 1 / E0 + np.sum(1 / Ei)
        s_prev = s_all[0]
        nsteps = 0
        idle = 0.0
        for s in s_all[1:]:
            p0s = load.sample(X - V * s, Y)
            if p0s.max() == 0 and all(np.all(prev[k] == 0) for k in prev):
                # aucune variation de dp : les variables internes relaxent pendant cette durée
                idle += s - s_prev
                s_prev = s
                continue
            if idle > 0:
                for k in hist:
                    hist[k] = hist[k] * np.exp(-idle / ti)[:, None, None]
                idle = 0.0
            dps = p0s * (modulation(lib, X, Y, p0s) - 1.0)
            cur = local_response(dps, D, D, Z, 0.35, E_s, STR) if p0s.max() > 0 else {k: np.zeros(X.shape) for k in snap}
            dt = s - s_prev
            dec = np.exp(-dt / ti)[:, None, None]
            for k in snap:
                dlt = (cur[k] - prev[k]) * E_s                 # incrément de déformation à module unité (Pa)
                # h_i(s) = int exp(-(s - u)/tau_i) d delta(u) ; delta linéaire sur le pas
                hist[k] = dec * hist[k] + (dlt / dt)[None] * (ti[:, None, None] * (1 - dec))
                acc[k] = acc[k] + dlt
                prev[k] = cur[k]
            s_prev = s
            nsteps += 1
        res = {}
        for k in snap:
            exact = acc[k] * Jinf - np.sum(hist[k] / Ei[:, None, None], axis=0)   # eps(t = 0)
            f5 = snap[k] * E_s * c5
            f2 = snap[k] * E_s * c2
            ref = np.max(np.abs(exact[core]))
            res[f"{k[0]}@{k[1]*1e3:.0f}mm"] = dict(
                max_exact=float(ref * 1e6), max_s05=float(np.max(np.abs(f5[core])) * 1e6),
                max_s02=float(np.max(np.abs(f2[core])) * 1e6),
                rms_s05=float(np.sqrt(np.mean((f5[core] - exact[core]) ** 2)) / np.sqrt(np.mean(exact[core] ** 2))),
                rms_s02=float(np.sqrt(np.mean((f2[core] - exact[core]) ** 2)) / np.sqrt(np.mean(exact[core] ** 2))))
        out[f"{tex}|{cname}"] = dict(nsteps=nsteps, p0_centre_MPa=float(load.sample(np.array(xc), np.array(yc)) / 1e6),
                                     C_centre=float(c5[NT // 2, NT // 2] * 1e6), res=res)
        r = res["ezz@2mm"]; r2 = res["exz@2mm"]
        print(f"{tex:15s} {cname:22s} p0={out[f'{tex}|{cname}']['p0_centre_MPa']:.2f} MPa  ezz@2mm exact {r['max_exact']:7.1f} "
              f"s=0.5 {r['max_s05']:7.1f} (rms {r['rms_s05']*100:4.1f} %) s=0.2 {r['max_s02']:7.1f} | exz@2mm exact {r2['max_exact']:6.1f} "
              f"s=0.5 {r2['max_s05']:6.1f}  [{nsteps} pas, {time.time()-t0:.0f} s]", flush=True)
        json.dump(out, open(os.path.join(HERE, "t05_resultats.json"), "w"), indent=1)
