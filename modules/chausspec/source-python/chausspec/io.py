"""Lecture d'un cas de calcul décrit en JSON et écriture des résultats (CSV, JSON, PNG).

Usage :  python -m chausspec cas.json            (voir exemples/cas_tfe_rectangulaire.json)
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict

import numpy as np

from . import loads as L
from . import materials as M
from .grid import solve_grid
from .regimes import Harmonic, Moving, Static
from .structure import Layer, Structure


# ------------------------------------------------------------------------------------------
def material_from_dict(d: Dict[str, Any]) -> M.Material:
    t = d["type"].lower()
    kw = {k: v for k, v in d.items() if k != "type"}
    if t in ("elastic", "elastique", "élastique"):
        return M.Elastic(**kw)
    if t == "2s2p1d":
        if kw.get("beta") in (None, "inf", "infini"):
            kw["beta"] = np.inf
        return M.TwoS2P1D(**kw)
    if t in ("kvg", "kelvin-voigt", "generalizedkelvinvoigt"):
        return M.GeneralizedKelvinVoigt(**kw)
    if t in ("maxwell", "prony", "generalizedmaxwell"):
        return M.GeneralizedMaxwell(**kw)
    raise ValueError(f"type de matériau inconnu : {t}")


def profile_from_dict(d):
    t = d["type"].lower()
    if t == "box":
        return L.Box1D(d["a"])
    if t in ("halfellipse", "demi-ellipse"):
        return L.HalfEllipse1D(d["c"])
    if t in ("gaussianpairs", "gaussiennes"):
        return L.GaussianPairs1D(d["P"], d["centers"], d["sig"])
    if t in ("tabulated", "tabule"):
        return L.Tabulated1D(d["s"], d["f"])
    raise ValueError(f"profil inconnu : {t}")


def footprint_from_dict(d, base_dir="."):
    t = d["type"].lower()
    if t in ("rect", "rectangle"):
        fp = L.UniformRect(d.get("p", 1.0), d["lx"], d["ly"])
    elif t in ("circle", "cercle", "disque"):
        fp = L.UniformCircle(d.get("p", 1.0), d["R"])
    elif t in ("separable", "séparable"):
        fp = L.Separable(profile_from_dict(d["fx"]), profile_from_dict(d["fy"]), d.get("amplitude", 1.0))
    elif t in ("map", "carte"):
        path = os.path.join(base_dir, d["file"])
        data = np.loadtxt(path, delimiter=d.get("delimiter", ";"))
        # 1re ligne : abscisses x (1re case ignorée) ; 1re colonne : ordonnées y
        x = data[0, 1:]
        y = data[1:, 0]
        P = data[1:, 1:] * d.get("unit", 1.0)
        fp = L.PressureMap(x, y, P)
    else:
        raise ValueError(f"empreinte inconnue : {t}")
    if "force" in d:
        fp = fp.scaled_to(d["force"])
    return fp


def case_from_dict(case: Dict[str, Any], base_dir="."):
    s = case["structure"]
    layers = [Layer(material_from_dict(l["material"]), l.get("h", 1.0), l.get("name", "")) for l in s["layers"]]
    st = Structure(layers, bottom=s.get("bottom", "halfspace"), interfaces=s.get("interfaces"))
    wheels = []
    for w in case["loading"]["wheels"]:
        fp = footprint_from_dict(w["footprint"], base_dir)
        wheels.append(L.Wheel(fp, w.get("x0", 0.0), w.get("y0", 0.0), w.get("qx"), w.get("qy")))
    load = L.Loading(wheels)
    r = case.get("regime", {"type": "static"})
    rt = r["type"].lower()
    if rt in ("static", "statique"):
        regime = Static()
    elif rt in ("moving", "roulant", "charge_roulante"):
        regime = Moving(r["speed"])
    elif rt in ("harmonic", "harmonique"):
        regime = Harmonic(r["freq"])
    else:
        raise ValueError(f"régime inconnu : {rt}")
    return st, load, regime


# ------------------------------------------------------------------------------------------
def run_case(path: str, plot: bool = True, verbose: bool = True):
    with open(path, encoding="utf-8") as f:
        case = json.load(f)
    base = os.path.dirname(os.path.abspath(path))
    st, load, regime = case_from_dict(case, base)
    g = case.get("grid", {})
    o = case.get("outputs", {})
    depths = o.get("depths", [0.0])
    comps = tuple(o.get("components", ["uz", "exx", "eyy", "ezz"]))
    if verbose:
        print(st.describe())
        print(f"  chargement : {len(load.wheels)} roue(s), {load.force()/1e3:.1f} kN ; régime : {regime}")
    res = solve_grid(st, load, regime, depths, comps, L=tuple(g.get("L", (16, 16))),
                     N=tuple(g.get("N", (1024, 1024))), window=g.get("window"),
                     filter_width=g.get("filter_width", 0.0), verbose=verbose)
    outdir = os.path.join(base, o.get("dir", "resultats"))
    os.makedirs(outdir, exist_ok=True)
    summary = {"meta": {k: (list(v) if isinstance(v, tuple) else v) for k, v in res.meta.items()}, "extremes": {}}
    for (c, z), f in res.fields.items():
        fr = np.real(f)
        jmax, imax = np.unravel_index(np.argmax(fr), fr.shape)
        jmin, imin = np.unravel_index(np.argmin(fr), fr.shape)
        summary["extremes"][f"{c}@z={z}"] = {
            "max": float(fr[jmax, imax]), "x_max": float(res.x[imax]), "y_max": float(res.y[jmax]),
            "min": float(fr[jmin, imin]), "x_min": float(res.x[imin]), "y_min": float(res.y[jmin])}
        if o.get("save_fields", True):
            np.savetxt(os.path.join(outdir, f"{c}_z{z:.3f}.csv"), np.vstack([np.r_[np.nan, res.x], np.c_[res.y, fr]]),
                       delimiter=";", fmt="%.6e",
                       header=f"{c} (SI) a z = {z} m ; 1re ligne : x (m) ; 1re colonne : y (m)")
    if all(c in comps for c in ("exx", "eyy", "ezz", "exy", "exz", "eyz")) and not np.iscomplexobj(res.fields[(comps[0], depths[0])]):
        for z in depths:
            e1 = res.principal_strains(z)[..., 2]
            j, i = np.unravel_index(np.argmax(e1), e1.shape)
            summary["extremes"][f"e1@z={z}"] = {"max": float(e1[j, i]), "x_max": float(res.x[i]), "y_max": float(res.y[j])}
    for k, gdef in enumerate(o.get("gauges", [])):
        if isinstance(regime, Moving):
            t, s = res.time_signal(gdef["comp"], gdef["z"], gdef.get("x", 0.0), gdef["y"], regime.speed)
            np.savetxt(os.path.join(outdir, f"jauge{k+1}_{gdef['comp']}.csv"), np.c_[t, np.real(s)], delimiter=";",
                       header="t (s);valeur", comments="")
    with open(os.path.join(outdir, "synthese.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)
    if plot:
        try:
            _plots(res, outdir)
        except Exception as exc:  # pragma: no cover
            print("  (tracés ignorés :", exc, ")")
    if verbose:
        print(f"  résultats écrits dans {outdir}")
    return res, summary


def _plots(res, outdir):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    for (c, z), f in res.fields.items():
        fig, ax = plt.subplots(figsize=(6, 4))
        fr = np.real(f)
        scale = 1e6 if c.startswith("e") else (1e3 if c.startswith("u") else 1e-6)
        unit = "µdef" if c.startswith("e") else ("mm" if c.startswith("u") else "MPa")
        vm = np.max(np.abs(fr)) * scale
        im = ax.pcolormesh(res.x, res.y, fr * scale, cmap="RdBu_r", vmin=-vm, vmax=vm, shading="auto")
        ax.set_aspect("equal")
        ax.set_xlabel("x (m) — sens de roulement")
        ax.set_ylabel("y (m)")
        ax.set_title(f"{c} à z = {z} m")
        fig.colorbar(im, ax=ax, label=unit)
        fig.tight_layout()
        fig.savefig(os.path.join(outdir, f"{c}_z{z:.3f}.png"), dpi=130)
        plt.close(fig)
