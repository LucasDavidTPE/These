"""T11 — Entaille géométrique des rainures (levée de l'hypothèse H6).

Cellule EF pixel (chausspec.fe2d) d'un pas de rainurage FAA (38,1 mm), rainure transversale de
6,35 x 6,35 mm vide, sur 60 mm de profondeur, en déformation plane généralisée. Chargement au point
critique du calcul 3D (T10, roue arrière droite, empreinte hétérogène) :
  * pression de contact des plateaux  p(x) = p0_eq . m(x)  (m : contact rainures, T1),
  * frottement q = mu p (T10 : mu = 0 ; 0,3 ; 0,6),
  * déformations nominales du calcul 3D au point critique : exx0 (plan) et eyy0 (hors plan)
    imposées, exy0 et eyz0 ajoutées (non perturbées par une rainure invariante en y — approximation
    pour eyz, voir rapport).
Référence : même cellule SANS vide (= modèle du niveau 1, surface plane). Rapport K(z) des maxima
de la déformation principale majeure à la profondeur z (mesurée depuis le plateau), brut et moyenné
sur une distance critique L_c (0,5 et 1 mm : théorie des distances critiques ; la déformation au
coin vif est singulière).
Variantes : arêtes vives ; arêtes et fonds arrondis r = 1 mm ; décomposition (déformation nominale
seule / pression seule) ; convergence en maillage (h = 0,2 / 0,1 / 0,066 mm).
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
from chausspec.contact import GROOVE_DEPTH, GROOVE_PITCH, GROOVE_WIDTH, Tread, grooves_profile, solve_contact
from chausspec.fe2d import PixelCell, box_average, principal_max

E_s, NU = 1e9, 0.35
ZP = [0.5, 1.0, 2.0, 3.0, 5.0, 6.35, 8.0, 10.0, 15.0, 20.0]        # mm
LC = [0.0, 0.5, 1.0]                                              # mm
log = lambda *a: print(*a, flush=True)


def point_loads(mu):
    f = os.path.join(HERE, f"t10_resultats_mu{mu:g}.json")
    d = json.load(open(f))["heterogene|rainures_vives"]["profil"]["0.001"]["point"]
    n = d["nominal"]
    return dict(p_eq=d["p0_eq"], p_inst=d["p0_inst"], exx0=n["exx"], eyy0=n["eyy"], exy0=n["exy"], eyz0=n["eyz"],
                exz_nom=n["exz"], ezz_nom=n["ezz"], mu=mu)


def geometry(h, r=0.0, H=None):
    H = float(os.environ.get("GH", "0.060")) if H is None else H
    nx = int(round(GROOVE_PITCH / h)); nz = int(round(H / h))
    xc = (np.arange(nx) + 0.5) * h; zc = (np.arange(nz) + 0.5) * h
    X, Z = np.meshgrid(xc, zc)
    u = np.abs(np.mod(X + GROOVE_PITCH / 2, GROOVE_PITCH) - GROOVE_PITCH / 2)   # distance à l'axe
    surf = -grooves_profile(xc, edge_radius=r)                                  # profondeur de surface
    void = Z < np.where(u < GROOVE_WIDTH / 2, GROOVE_DEPTH, 0.0)
    if r > 0:
        void |= Z < surf[None, :]
        # congés de fond : coin (paroi, fond) remplacé par un quart de cercle de rayon r
        s = GROOVE_WIDTH / 2 - u                   # distance à la paroi, côté rainure
        t = GROOVE_DEPTH - Z                       # hauteur au-dessus du fond
        corner = (u < GROOVE_WIDTH / 2) & (s < r) & (t > 0) & (t < r)
        void &= ~(corner & (np.hypot(r - s, r - t) > r))
    m = solve_contact(grooves_profile(xc, edge_radius=r), h, 1.65e6, Tread(10, 0.49, 0.01)).p / 1.65e6
    return xc, zc, void, m


def run(h, r, L, parts=("nom", "p"), flat=False):
    xc, zc, void, m = geometry(h, r)
    E = np.full(void.shape, E_s)
    if not flat:
        E[void] = 0.0
    cell = PixelCell(E, NU, h)
    eps_in = (L["exx0"], 0.0, 0.0) if "nom" in parts else (0.0, 0.0, 0.0)
    eyy0 = L["eyy0"] if "nom" in parts else 0.0
    p = L["p_eq"] * m if "p" in parts else None
    q = L["mu"] * L["p_eq"] * m if ("p" in parts and L["mu"]) else None
    f = cell.load_vector(eps_in, eyy0, top_p=p, top_q=q, load_depth=1.5e-3)
    e = cell.strains(cell.solve(f), eps_in)
    exy0 = L["exy0"] if "nom" in parts else 0.0
    eyz0 = L["eyz0"] if "nom" in parts else 0.0
    solid = E > 0
    out = {}
    for lc in LC:
        n = max(1, int(round(lc * 1e-3 / h)))
        comp = {c: np.nan_to_num(box_average(e[c], solid, n)) for c in ("exx", "ezz", "exz")}
        e1 = principal_max(comp["exx"], np.full_like(comp["exx"], eyy0), comp["ezz"],
                           np.full_like(comp["exx"], exy0), comp["exz"], np.full_like(comp["exx"], eyz0))
        e1 = np.where(solid, e1, np.nan)
        prof = {}
        for z in ZP:
            iz = min(int(z * 1e-3 / h), e1.shape[0] - 1)
            prof[f"{z:g}"] = float(np.nanmax(e1[iz]))
        k = int(np.nanargmax(np.where(np.isnan(e1), -np.inf, e1)))
        iz, ix = divmod(k, e1.shape[1])
        out[f"Lc{lc:g}"] = dict(profil=prof, max=float(np.nanmax(e1)), z_max_mm=float(zc[iz] * 1e3),
                                x_max_mm=float(xc[ix] * 1e3))
        if lc == 0.5 and not flat and parts == ("nom", "p"):
            out["carte"] = e1[: int(0.015 / h), :]
    return out


if __name__ == "__main__":
    T0 = time.time()
    CONV = [int(v) for v in os.environ.get("CONV", "32,64,96").split(",")]
    ONLYCONV = os.environ.get("ONLYCONV") == "1"
    fres = os.path.join(HERE, "t11_resultats.json")
    RES = json.load(open(fres)) if ONLYCONV else {}
    cartes = {}
    # 1. convergence en maillage (arêtes vives, mu = 0)
    L0 = point_loads(0)
    RES["charges_mu0"] = L0
    log("charges au point critique :", L0)
    for nper in CONV:
        h = GROOVE_WIDTH / nper
        g = run(h, 0.0, L0); f = run(h, 0.0, L0, flat=True)
        RES[f"conv_h{h*1e3:.3f}"] = dict(rainure=g if "carte" not in g else {k: v for k, v in g.items() if k != "carte"}, plan=f)
        log(f"h = {h*1e3:.3f} mm : K(1 mm, Lc 0,5) = {g['Lc0.5']['profil']['1']/f['Lc0.5']['profil']['1']:.3f}  "
            f"max global Lc 0,5 : {g['Lc0.5']['max']*1e6:.0f} µdef à z = {g['Lc0.5']['z_max_mm']:.2f} mm  ({time.time()-T0:.0f} s)")
    if ONLYCONV:
        json.dump(RES, open(fres, "w"), indent=1)
        sys.exit(0)
    H = GROOVE_WIDTH / 64
    # 2. cas de base et variantes
    for mu in (0, 0.3, 0.6):
        L = point_loads(mu)
        RES[f"charges_mu{mu:g}"] = L
        for r in (0.0, 1e-3):
            tag = f"mu{mu:g}|r{r*1e3:g}mm"
            g = run(H, r, L); f = run(H, r, L, flat=True)
            if "carte" in g:
                cartes[tag] = g.pop("carte").astype(np.float32)
            RES[tag] = dict(rainure=g, plan=f)
            log(f"{tag}: K(z) Lc 0,5 = " + " ".join(f"{z}:{g['Lc0.5']['profil'][z]/f['Lc0.5']['profil'][z]:.2f}"
                                                   for z in ("0.5", "1", "2", "5", "10")) +
                f" | max {g['Lc0.5']['max']*1e6:.0f} µdef (z = {g['Lc0.5']['z_max_mm']:.2f} mm) ({time.time()-T0:.0f} s)")
    # 3. décomposition (mu = 0, arêtes vives)
    for parts in (("nom",), ("p",)):
        g = run(H, 0.0, L0, parts); f = run(H, 0.0, L0, parts, flat=True)
        g.pop("carte", None)
        RES["seul_" + parts[0]] = dict(rainure=g, plan=f)
        log(f"seul {parts[0]}: K(1 mm) = {g['Lc0.5']['profil']['1']/f['Lc0.5']['profil']['1']:.2f}, "
            f"max {g['Lc0.5']['max']*1e6:.0f} µdef à z = {g['Lc0.5']['z_max_mm']:.2f} mm")
    json.dump(RES, open(os.path.join(HERE, "t11_resultats.json"), "w"), indent=1)
    cartes["x_mm"] = (np.arange(int(round(GROOVE_PITCH / H))) + 0.5) * H * 1e3
    cartes["z_mm"] = (np.arange(int(0.015 / H)) + 0.5) * H * 1e3
    np.savez_compressed(os.path.join(HERE, "t11_cartes.npz"), **cartes)
    log("terminé", time.time() - T0)
