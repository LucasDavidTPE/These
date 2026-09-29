"""T12 — Hétérogénéité granulats / mortier bitumineux (levée de l'hypothèse H7).

Coupe 2D (déformation plane généralisée) de la couche de roulement : granulats circulaires de 2 à
10 mm (courbe de Fuller, n = 0,45, fraction surfacique visée 0,42, obtenue 0,5 à 0,55, tirage séquentiel aléatoire, jeu
minimal 0,2 mm, périodique en x) noyés dans un mortier bitumineux (liant + fines + sables < 2 mm).
Surface sciée (granulats tronqués par la surface). Cellule 40 mm x 40 mm, pixel h, fond encastré.

1. Homogénéisation : cellule biperiodique de même granulométrie, trois essais de déformation
   uniforme -> C_hom ; on retient (E_hom, nu_hom) isotropes. Les modules des phases sont mis à
   l'échelle pour que E_hom = E_s (le module de l'enrobé homogène équivalent du niveau 1) ; seul le
   contraste c = E_granulat / E_mortier compte (c = 10, 30, 100). nu_granulat = 0,25 ; nu_mortier
   choisi pour que nu_hom ~ 0,35.
2. Chargement du point critique (T10, texture gauss MPD 1,0) : ligne de pression de contact
   p(x) = p0_eq . m(x) extraite de la carte de contact 3D, déformations nominales exx0, eyy0,
   exy0, eyz0.
3. Comparaison avec la cellule homogène (E_hom, nu_hom) sous le même chargement (= niveau 1) :
   facteur de concentration dans le mortier  K_m(z) = max(eps1 mortier, bande z +/- 0,25 mm)
   / max(eps1 homogène, même bande), et quantile 99 %. Trois chargements : « nom+p » (texture
   et déformations nominales), « lisse » (pression uniforme p0_eq : surface lisse du TFE) et
   « nom » (déformations nominales seules), pour séparer l'effet de la texture de la concentration
   de déformation propre au matériau, présente aussi sous une surface lisse.
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE))
import numpy as np
from chausspec.contact import Tread, random_texture, solve_contact
from chausspec.fe2d import PixelCell, principal_max

E_s = 1e9
NU_G, NU_M = 0.25, 0.41
W = 0.040; HC = 0.040
ZP = [0.5, 1.0, 2.0, 3.0, 5.0, 10.0]
log = lambda *a: print(*a, flush=True)


def fuller_diameters(phi, area, dmin=2e-3, dmax=10e-3, n=0.45, rng=None):
    """Diamètres tirés selon une courbe de Fuller en masse (passant = (d/dmax)^n) entre dmin et
    dmax, jusqu'à la surface cible phi . area. Classes de 0,25 mm, du plus gros au plus petit."""
    edges = np.arange(dmin, dmax + 1e-9, 0.5e-3)
    P = (edges / dmax) ** n
    frac = np.diff(P) / (P[-1] - P[0])                  # fraction de surface par classe
    ds = []
    for k in range(len(frac) - 1, -1, -1):
        target = frac[k] * phi * area
        acc = 0.0
        while acc < target:
            d = rng.uniform(edges[k], edges[k + 1])
            ds.append(d); acc += np.pi * d * d / 4
    return np.array(ds)


def microstructure(h, seed, periodic_z=False, phi=0.42, gap=0.2e-3):
    rng = np.random.default_rng(seed)
    nx, nz = int(round(W / h)), int(round(HC / h))
    ds = fuller_diameters(phi, W * HC, rng=rng)
    placed = []
    for d in ds:
        r = d / 2
        for _ in range(3000):
            x = rng.uniform(0, W)
            z = rng.uniform(0, HC) if periodic_z else rng.uniform(-r * 0.8, HC)
            ok = True
            for (x2, z2, r2) in placed:
                dx = abs(x - x2); dx = min(dx, W - dx)
                dz = abs(z - z2)
                if periodic_z:
                    dz = min(dz, HC - dz)
                if dx * dx + dz * dz < (r + r2 + gap) ** 2:
                    ok = False; break
            if ok:
                placed.append((x, z, r)); break
    xc = (np.arange(nx) + 0.5) * h; zc = (np.arange(nz) + 0.5) * h
    X, Z = np.meshgrid(xc, zc)
    agg = np.zeros((nz, nx), bool)
    for (x, z, r) in placed:
        dx = np.abs(X - x); dx = np.minimum(dx, W - dx)
        dz = np.abs(Z - z)
        if periodic_z:
            dz = np.minimum(dz, HC - dz)
        agg |= dx * dx + dz * dz < r * r
    return agg


def homogenize(agg, h, c):
    """C_hom (plan, déformation plane) pour E_mortier = 1, E_granulat = c. Renvoie (E, nu) isotropes."""
    E = np.where(agg, c, 1.0); nu = np.where(agg, NU_G, NU_M)
    cell = PixelCell(E, nu, h, periodic_z=True)
    C = np.zeros((3, 3))
    for j in range(3):
        eps = np.zeros(3); eps[j] = 1.0
        u = cell.solve(cell.load_vector(eps))
        C[:, j] = cell.mean_stress(u, eps)
    C11 = 0.5 * (C[0, 0] + C[1, 1]); C12 = 0.5 * (C[0, 1] + C[1, 0]); C33 = C[2, 2]
    # isotrope le plus proche : C11 = lam + 2 mu, C12 = lam, (C33 = mu)
    mu = 0.5 * (0.5 * (C11 - C12) + C33); lam = C12 + 0.5 * (C11 - C12) - mu
    nu_h = lam / (2 * (lam + mu)); E_h = mu * 2 * (1 + nu_h)
    return E_h, nu_h, C


def pressure_line(h, seed=1):
    D = 0.25e-3
    hmap = random_texture(L=0.128, N=512, mpd=1.0e-3, seed=seed)
    sol = solve_contact(hmap, D, 1.65e6, Tread(10, 0.49, 0.01), tol=1e-7)
    m = sol.p / 1.65e6
    row = m[256]                                    # ligne médiane de la carte
    xs = np.arange(row.size) * D
    xc = (np.arange(int(round(W / h))) + 0.5) * h
    return np.interp(xc, xs, row) / max(np.interp(xc, xs, row).mean(), 1e-9)


def band_stats(e1, mask, zc, z):
    sel = (np.abs(zc - z * 1e-3) <= 0.25e-3)[:, None] & mask
    v = e1[sel]
    return (float(v.max()), float(np.percentile(v, 99))) if v.size else (np.nan, np.nan)


def solve_case(E, nu, h, L, m, parts=("nom", "p")):
    cell = PixelCell(E, nu, h)
    eps_in = (L["exx0"], 0.0, 0.0) if "nom" in parts else (0.0, 0.0, 0.0)
    eyy0 = L["eyy0"] if "nom" in parts else 0.0
    p = L["p_eq"] * m if "p" in parts else None
    f = cell.load_vector(eps_in, eyy0, top_p=p)
    e = cell.strains(cell.solve(f), eps_in)
    k = lambda v: np.full_like(e["exx"], v if "nom" in parts else 0.0)
    return principal_max(e["exx"], k(eyy0 if "nom" in parts else 0.0), e["ezz"], k(L["exy0"]), e["exz"], k(L["eyz0"]))


if __name__ == "__main__":
    T0 = time.time()
    d = json.load(open(os.path.join(HERE, "t10_resultats_mu0.json")))["heterogene|gauss_MPD1.0"]["profil"]["0.001"]["point"]
    n = d["nominal"]
    L = dict(p_eq=d["p0_eq"], exx0=n["exx"], eyy0=n["eyy"], exy0=n["exy"], eyz0=n["eyz"])
    log("charges :", L)
    H_PIX = float(os.environ.get("HPIX", "0.1e-3"))
    H_HOM = max(H_PIX, 0.1e-3)          # homogénisation (cellule biperiodique) au plus fin à 0,1 mm
    SEEDS = [int(s) for s in os.environ.get("SEEDS", "1,2,3").split(",")]
    CONTRASTS = [float(c) for c in os.environ.get("CONTRASTS", "10,30,100").split(",")]
    RES = dict(charges=L, h_mm=H_PIX * 1e3, cas={})
    zc = (np.arange(int(round(HC / H_PIX))) + 0.5) * H_PIX
    m = pressure_line(H_PIX)
    # Étalonnage du chargement 2D : une ligne de pression extraite d'une carte 3D, prolongée
    # indéfiniment en y (déformation plane), charge beaucoup plus que les taches de contact 3D. On
    # réduit l'amplitude de la modulation, m_cal = 1 + alpha (m - 1), pour que la cellule homogène
    # reproduise eps1 max à 1 mm du calcul 3D au point critique (T10). CALIB=0 : ligne brute.
    RES["alpha"] = 1.0
    if os.environ.get("CALIB", "1") == "1":
        target = json.load(open(os.path.join(HERE, "t10_resultats_mu0.json")))["heterogene|gauss_MPD1.0"]["profil"]["0.001"]["e1_max"]
        shp = (int(round(HC / H_PIX)), int(round(W / H_PIX)))
        E_h0, nu_h0, _ = homogenize(microstructure(H_HOM, 100 + SEEDS[0], periodic_z=True), H_HOM, 30.0)
        cellh = PixelCell(np.full(shp, E_s), nu_h0, H_PIX)
        def e1_1mm(alpha):
            mm_ = 1 + alpha * (m - 1)
            eps_in = (L["exx0"], 0.0, 0.0)
            e = cellh.strains(cellh.solve(cellh.load_vector(eps_in, L["eyy0"], top_p=L["p_eq"] * mm_)), eps_in)
            k = lambda v: np.full_like(e["exx"], v)
            e1 = principal_max(e["exx"], k(L["eyy0"]), e["ezz"], k(L["exy0"]), e["exz"], k(L["eyz0"]))
            return band_stats(e1, np.ones(shp, bool), zc, 1.0)[0]
        lo, hi = 0.0, 1.0
        for _ in range(14):
            mid = 0.5 * (lo + hi)
            lo, hi = (mid, hi) if e1_1mm(mid) < target else (lo, mid)
        alpha = 0.5 * (lo + hi)
        RES.update(alpha=alpha, cible_3D=target, e1_2D_brut=e1_1mm(1.0), e1_2D_lisse=e1_1mm(0.0), e1_2D_cal=e1_1mm(alpha))
        log(f"étalonnage : alpha = {alpha:.3f} (cible 3D {target*1e6:.0f} µdef ; 2D brut {RES['e1_2D_brut']*1e6:.0f}, "
            f"lisse {RES['e1_2D_lisse']*1e6:.0f}, étalonné {RES['e1_2D_cal']*1e6:.0f})")
        m = 1 + alpha * (m - 1)
        del cellh
    cartes = {}
    ref_cache = {}
    for c in CONTRASTS:
        agg_b = microstructure(H_HOM, 100 + SEEDS[0], periodic_z=True)
        E_h, nu_h, C = homogenize(agg_b, H_HOM, c)
        scale = E_s / E_h
        log(f"contraste {c:g} : fraction {agg_b.mean():.3f}, E_hom = {E_h:.3f} E_m, nu_hom = {nu_h:.3f} "
            f"-> E_mortier = {scale/1e6:.0f} MPa, E_granulat = {c*scale/1e6:.0f} MPa ({time.time()-T0:.0f} s)")
        key = round(nu_h, 4)
        VAR = {"nom+p": (("nom", "p"), m), "lisse": (("nom", "p"), np.ones_like(m)), "nom": (("nom",), m)}
        for name, (parts, mm) in VAR.items():
            if (key, name) not in ref_cache:
                shp = (int(round(HC / H_PIX)), int(round(W / H_PIX)))
                ref_cache[(key, name)] = solve_case(np.full(shp, E_s), nu_h, H_PIX, L, mm, parts)
        for sd in SEEDS:
            agg = microstructure(H_PIX, sd)
            E = np.where(agg, c * scale, scale); nu = np.where(agg, NU_G, NU_M)
            out = dict(E_hom_sur_Em=E_h, nu_hom=nu_h, E_mortier_MPa=scale / 1e6, fraction=float(agg.mean()))
            for name, (parts, mm) in VAR.items():
                e1 = solve_case(E, nu, H_PIX, L, mm, parts)
                e1h = ref_cache[(key, name)]
                prof = {}
                for z in ZP:
                    mx, p99 = band_stats(e1, ~agg, zc, z)
                    mxg, _ = band_stats(e1, agg, zc, z)
                    hmx, _ = band_stats(e1h, np.ones_like(agg), zc, z)
                    prof[f"{z:g}"] = dict(mortier_max=mx, mortier_p99=p99, granulat_max=mxg, homogene_max=hmx,
                                          K_max=mx / hmx, K_p99=p99 / hmx)
                out[name] = prof
                if name == "nom+p" and sd == SEEDS[0]:
                    nz15 = int(0.015 / H_PIX)
                    cartes[f"c{c:g}_e1"] = e1[:nz15].astype(np.float32)
                    cartes[f"c{c:g}_agg"] = agg[:nz15]
                    cartes["hom_e1"] = e1h[:nz15].astype(np.float32)
            RES["cas"][f"c{c:g}|s{sd}"] = out
            pr = out["nom+p"]
            log(f"c = {c:g}, tirage {sd} : K_max(z) " + " ".join(f"{z}:{pr[z]['K_max']:.2f}" for z in ("0.5", "1", "2", "5", "10"))
                + " | K_p99(1 mm) " + f"{pr['1']['K_p99']:.2f}" + f"  ({time.time()-T0:.0f} s)")
        json.dump(RES, open(os.path.join(HERE, f"t12_resultats{os.environ.get('OUT', '')}.json"), "w"), indent=1)
    cartes["h_mm"] = H_PIX * 1e3; cartes["m"] = m
    np.savez_compressed(os.path.join(HERE, f"t12_cartes{os.environ.get('OUT', '')}.npz"), **cartes)
    log("terminé", time.time() - T0)
