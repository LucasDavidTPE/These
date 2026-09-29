"""Figures et tableaux du niveau 2 (rapport « texture », v2) : frottement (T10), validation EF
(T11a), entaille des rainures (T11), granulats / mortier (T12), synthèse. Lit validation/*.json."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
V = os.path.join(ROOT, "validation")
sys.path.insert(0, ROOT)
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap

C1, C2, C3, C4, C5, C6, C7 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948"
INK, MUTED = "#222222", "#6b6b66"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                     "ytick.color": MUTED, "axes.grid": True, "grid.color": "#e4e3dc", "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.8,
                     "legend.frameon": False, "savefig.bbox": "tight"})
OUT = os.path.join(HERE, "figures")
J = lambda n: json.load(open(os.path.join(V, n)))
fr = lambda v, d=0: (f"{v:.{d}f}").replace(".", ",").replace("-", "$-$")


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".pdf")); fig.savefig(os.path.join(OUT, name + ".png"), dpi=150); plt.close(fig)


NUM = {}          # valeurs reprises dans le texte (n2_valeurs.json)
MUS = (0, 0.3, 0.6)
TEXS = ("lisse", "rainures_vives", "gauss_MPD1.0", "gauss_MPD1.5")
TNAME = {"lisse": "lisse (TFE)", "rainures_vives": "rainures FAA", "gauss_MPD1.0": "aléatoire MPD 1,0 mm",
         "gauss_MPD1.5": "aléatoire MPD 1,5 mm"}
ZK = ["0.001", "0.002", "0.005", "0.010", "0.020", "0.040"]
ZMM = [1, 2, 5, 10, 20, 40]

# =========================================================================== T10 frottement
T10 = {mu: J(f"t10_resultats_mu{mu:g}.json") for mu in MUS}
e1 = lambda mu, t, z: T10[mu][f"heterogene|{t}"]["profil"][z]["e1_max"] * 1e6
fig, axs = plt.subplots(1, 4, figsize=(10, 3.2), sharey=True)
for ax, t in zip(axs, TEXS):
    for mu, c in zip(MUS, (C1, C4, C7)):
        ax.plot([e1(mu, t, z) for z in ZK], ZMM, "o-", color=c, ms=3.5, label=f"$\\mu$ = {fr(mu, 1)}")
    ax.set_yscale("log"); ax.set_yticks(ZMM); ax.set_yticklabels([str(z) for z in ZMM]); ax.minorticks_off()
    ax.invert_yaxis(); ax.set_title(TNAME[t], fontsize=9)
    ax.set_xlabel("$\\varepsilon_1$ max (µdef)")
axs[0].set_ylabel("profondeur (mm)"); axs[0].legend(fontsize=8)
save(fig, "n2_frottement")
rows = []
for t in TEXS:
    for z, zm in zip(ZK[:4], ZMM[:4]):
        v = [e1(mu, t, z) for mu in MUS]
        rows.append(f"{TNAME[t] if z == ZK[0] else ''} & {zm} & {fr(v[0])} & {fr(v[1])} ({fr(v[1]/v[0], 2)}) & "
                    f"{fr(v[2])} ({fr(v[2]/v[0], 2)}) & {fr(v[0]/e1(0, 'lisse', z), 2)} & {fr(v[2]/e1(0.6, 'lisse', z), 2)}\\\\")
    rows.append("\\addlinespace")
open(os.path.join(HERE, "n2_tab_frottement.tex"), "w").write("\n".join(rows[:-1]))
NUM["frott"] = {t: {z: [e1(mu, t, z) for mu in MUS] for z in ZK} for t in TEXS}
NUM["points"] = {t: T10[0][f"heterogene|{t}"]["profil"]["0.001"]["point"] for t in TEXS}

# =========================================================================== T9, T11a
t9 = J("t09_resultats.json")
NUM["t9"] = {k: max(v for kk, v in t9.items() if kk.startswith(k)) for k in ("massif_homogene", "structure_TFE")}
t11a = J("t11a_resultats.json")
NUM["t11a"] = {h: {z: max(v for k, v in t11a.items() if k.startswith(h) and f"z={z}" in k) for z in
                   sorted({k.split("z=")[1] for k in t11a if k.startswith(h)})} for h in sorted({k.split("|")[0] for k in t11a})}

# =========================================================================== T11 rainures
R11 = J("t11_resultats.json")
ZP = ["0.5", "1", "2", "3", "5", "6.35", "8", "10", "15", "20"]
K = lambda tag, lc="Lc0.5": [R11[tag]["rainure"][lc]["profil"][z] / R11[tag]["plan"][lc]["profil"][z] for z in ZP]
fig, axs = plt.subplots(1, 2, figsize=(9, 3.3))
ax = axs[0]
for tag, c, lab in (("mu0|r0mm", C1, "arêtes vives, $\\mu$ = 0"), ("mu0|r1mm", C3, "arrondis $r$ = 1 mm, $\\mu$ = 0"),
                    ("mu0.3|r0mm", C4, "arêtes vives, $\\mu$ = 0,3"), ("mu0.6|r0mm", C7, "arêtes vives, $\\mu$ = 0,6")):
    ax.plot(K(tag), [float(z) for z in ZP], "o-", color=c, ms=3.5, label=lab)
ax.axhline(6.35, color=MUTED, lw=0.8, ls="--"); ax.text(ax.get_xlim()[1] if False else 1.02, 6.0, "fond de rainure", fontsize=7, color=MUTED)
ax.invert_yaxis(); ax.set_xlabel("$K_{H6}(z)$ = $\\varepsilon_1$ rainuré / $\\varepsilon_1$ plan  ($L_c$ = 0,5 mm)")
ax.set_ylabel("profondeur sous le plateau (mm)"); ax.legend(fontsize=7.5); ax.axvline(1, color=INK, lw=0.6)
ax = axs[1]
tags = [k for k in R11 if k.startswith("conv_h")]
hs = [float(k[6:]) for k in tags]
for lc, c in (("Lc0", C7), ("Lc0.5", C1), ("Lc1", C3)):
    ax.plot(hs, [R11[k]["rainure"][lc]["max"] * 1e6 for k in tags], "o-", color=c, label=f"max global, $L_c$ = {lc[2:].replace('.', ',')} mm")
    ax.plot(hs, [R11[k]["rainure"][lc]["profil"]["1"] * 1e6 for k in tags], "s--", color=c, ms=3, lw=1.2,
            label=f"max à 1 mm, $L_c$ = {lc[2:].replace('.', ',')} mm")
ax.set_xscale("log"); ax.set_xticks(hs); ax.set_xticklabels([f"{v:.3f}".replace(".", ",") for v in hs]); ax.minorticks_off()
ax.invert_xaxis(); ax.set_xlabel("taille de pixel $h$ (mm)"); ax.set_ylabel("$\\varepsilon_1$ (µdef)")
ax.legend(fontsize=7); ax.set_title("convergence en maillage (arêtes vives)", fontsize=9)
save(fig, "n2_rainures_profils")
NUM["t11"] = {tag: dict(K=dict(zip(ZP, K(tag))), K_Lc1=dict(zip(ZP, K(tag, "Lc1"))), K_Lc0=dict(zip(ZP, K(tag, "Lc0"))),
                         max=R11[tag]["rainure"]["Lc0.5"]["max"] * 1e6, zmax=R11[tag]["rainure"]["Lc0.5"]["z_max_mm"],
                         xmax=R11[tag]["rainure"]["Lc0.5"]["x_max_mm"], plan1=R11[tag]["plan"]["Lc0.5"]["profil"]["1"] * 1e6,
                         planmax=R11[tag]["plan"]["Lc0.5"]["max"] * 1e6, max_Lc1=R11[tag]["rainure"]["Lc1"]["max"] * 1e6,
                         g={z: R11[tag]["rainure"]["Lc0.5"]["profil"][z] * 1e6 for z in ZP},
                         f={z: R11[tag]["plan"]["Lc0.5"]["profil"][z] * 1e6 for z in ZP})
              for tag in R11 if "|" in tag}
NUM["t11conv"] = {k: {lc: dict(max=R11[k]["rainure"][lc]["max"] * 1e6, z1=R11[k]["rainure"][lc]["profil"]["1"] * 1e6,
                               plan1=R11[k]["plan"][lc]["profil"]["1"] * 1e6) for lc in ("Lc0", "Lc0.5", "Lc1")} for k in tags}
NUM["t11seul"] = {k: dict(K1=R11[k]["rainure"]["Lc0.5"]["profil"]["1"] / R11[k]["plan"]["Lc0.5"]["profil"]["1"],
                          max=R11[k]["rainure"]["Lc0.5"]["max"] * 1e6, zmax=R11[k]["rainure"]["Lc0.5"]["z_max_mm"],
                          planmax=R11[k]["plan"]["Lc0.5"]["max"] * 1e6) for k in ("seul_nom", "seul_p")}
C11 = np.load(os.path.join(V, "t11_cartes.npz"))
fig, axs = plt.subplots(2, 1, figsize=(9, 4.6), sharex=True)
vmax = np.nanpercentile(C11["mu0|r0mm"], 99.8)
for ax, tag, tit in zip(axs, ("mu0|r0mm", "mu0|r1mm"), ("arêtes vives", "arêtes et fonds arrondis, $r$ = 1 mm")):
    A = C11[tag].astype(float)
    x, z = C11["x_mm"], C11["z_mm"]
    # recentrage : rainure au milieu de la figure
    sh = A.shape[1] // 2
    A = np.roll(A, sh, axis=1); xx = x - x[sh]
    im = ax.imshow(A * 1e6, extent=(xx[0], xx[-1], z[-1], z[0]), aspect="auto", cmap="magma", vmin=0, vmax=vmax * 1e6)
    ax.set_title(tit, fontsize=9); ax.set_ylabel("z (mm)"); ax.grid(False)
axs[1].set_xlabel("x (mm), rainure centrée")
cb = fig.colorbar(im, ax=axs, shrink=0.9, pad=0.01); cb.set_label("$\\varepsilon_1$ (µdef), $L_c$ = 0,5 mm")
save(fig, "n2_rainures_cartes")

# =========================================================================== T12 granulats / mortier
R12 = J("t12_resultats.json")
cas = R12["cas"]
CONTR = sorted({float(k.split("|")[0][1:]) for k in cas})
ZT = ["0.5", "1", "2", "3", "5", "10"]
stat = {}
for c in CONTR:
    ks = [k for k in cas if float(k.split("|")[0][1:]) == c]
    for load in ("nom+p", "lisse", "nom"):
        for q in ("K_max", "K_p99"):
            arr = np.array([[cas[k][load][z][q] for z in ZT] for k in ks])
            stat[(c, load, q)] = (arr.mean(0), arr.min(0), arr.max(0))
        # rapport des concentrations texture / lisse (= amplification dans le mortier / amplification homogène)
        rk = np.array([[cas[k]["nom+p"][z]["K_max"] / cas[k]["lisse"][z]["K_max"] for z in ZT] for k in ks])
        rq = np.array([[cas[k]["nom+p"][z]["K_p99"] / cas[k]["lisse"][z]["K_p99"] for z in ZT] for k in ks])
        stat[(c, "rk")] = (rk.mean(0), rk.min(0), rk.max(0)); stat[(c, "rq")] = (rq.mean(0),)
    stat[(c, "info")] = dict(E_m=np.mean([cas[k]["E_mortier_MPa"] for k in ks]), Ehom=np.mean([cas[k]["E_hom_sur_Em"] for k in ks]),
                             nu=np.mean([cas[k]["nu_hom"] for k in ks]), frac=np.mean([cas[k]["fraction"] for k in ks]), n=len(ks))
fig, axs = plt.subplots(1, 3, figsize=(10, 3.2), sharey=True)
zf = [float(z) for z in ZT]
for ax, load, tit in zip(axs, ("nom+p", "lisse", None), ("texture MPD 1,0 mm", "surface lisse (TFE)", "$K_m$ texture / $K_m$ lisse")):
    for c, col in zip(CONTR, (C1, C4, C7)):
        if load:
            m_, lo, hi = stat[(c, load, "K_max")]
            ax.fill_betweenx(zf, lo, hi, color=col, alpha=0.15, lw=0)
            ax.plot(m_, zf, "o-", color=col, ms=3.5, label=f"contraste {c:g}")
            ax.plot(stat[(c, load, "K_p99")][0], zf, "--", color=col, lw=1.1)
        else:
            m_, lo, hi = stat[(c, "rk")]
            ax.fill_betweenx(zf, lo, hi, color=col, alpha=0.15, lw=0)
            ax.plot(m_, zf, "o-", color=col, ms=3.5, label=f"contraste {c:g}")
            ax.plot(stat[(c, "rq")][0], zf, "--", color=col, lw=1.1)
    if not load:
        ax.axvline(1, color=INK, lw=0.8)
        ax.set_xlabel("rapport des facteurs de concentration")
    else:
        ax.set_xlabel("$K_m$ = $\\varepsilon_1$ mortier / $\\varepsilon_1$ homogène")
    ax.set_title(tit, fontsize=9); ax.invert_yaxis() if ax is axs[0] else None
    ax.legend(fontsize=7)
axs[0].set_ylabel("profondeur (mm)")
save(fig, "n2_mortier_profils")
NUM["t12"] = {f"{c:g}": {"info": stat[(c, "info")], **{f"{load}|{q}": dict(zip(ZT, stat[(c, load, q)][0].tolist()))
                                                          for load in ("nom+p", "lisse", "nom") for q in ("K_max", "K_p99")},
                         **{f"{load}|{q}|min": dict(zip(ZT, stat[(c, load, q)][1].tolist())) for load in ("nom+p", "lisse") for q in ("K_max",)},
                         **{f"{load}|{q}|max": dict(zip(ZT, stat[(c, load, q)][2].tolist())) for load in ("nom+p", "lisse") for q in ("K_max",)},
                         "rk": dict(zip(ZT, stat[(c, "rk")][0].tolist())), "rk_min": dict(zip(ZT, stat[(c, "rk")][1].tolist())),
                         "rk_max": dict(zip(ZT, stat[(c, "rk")][2].tolist())), "rq": dict(zip(ZT, stat[(c, "rq")][0].tolist()))}
             for c in CONTR}
NUM["t12h"] = R12["h_mm"]
NUM["t12cal"] = {k: R12.get(k) for k in ("alpha", "cible_3D", "e1_2D_brut", "e1_2D_lisse", "e1_2D_cal")}
if os.path.exists(os.path.join(V, "t12_resultats_brut.json")):
    B = J("t12_resultats_brut.json")["cas"]
    NUM["t12brut"] = {f"{c:g}": dict(K1=float(np.mean([B[k]["nom+p"]["1"]["K_max"] for k in B if float(k.split("|")[0][1:]) == c])),
                                    K1l=float(np.mean([B[k]["lisse"]["1"]["K_max"] for k in B if float(k.split("|")[0][1:]) == c])))
                      for c in CONTR}
C12 = np.load(os.path.join(V, "t12_cartes.npz"))
cmid = CONTR[len(CONTR) // 2]
fig, axs = plt.subplots(1, 3, figsize=(10.5, 3.3), sharey=True)
hmm = float(C12["h_mm"])
NXC = int(round(20.0 / hmm))                      # fenêtre de 20 mm de large, à l'échelle
Ah = C12["hom_e1"].astype(float)[:, :NXC] * 1e6
ext = (0, Ah.shape[1] * hmm, Ah.shape[0] * hmm, 0)
vmax = np.percentile(C12[f"c{CONTR[-1]:g}_e1"] * 1e6, 99.5)
axs[0].imshow(Ah, extent=ext, cmap="magma", vmin=0, vmax=vmax, aspect="equal"); axs[0].set_title("homogène équivalent (niveau 1)", fontsize=9)
for ax, c in zip(axs[1:], (CONTR[0], CONTR[-1])):
    A = C12[f"c{c:g}_e1"].astype(float)[:, :NXC] * 1e6
    im = ax.imshow(A, extent=ext, cmap="magma", vmin=0, vmax=vmax, aspect="equal")
    ax.contour(C12[f"c{c:g}_agg"].astype(float)[:, :NXC], levels=[0.5], colors="w", linewidths=0.4,
               extent=(0, A.shape[1] * hmm, 0, A.shape[0] * hmm), origin="upper")
    ax.set_title(f"granulats + mortier, $c$ = {c:g}", fontsize=9)
for ax in axs:
    ax.grid(False); ax.set_xlabel("x (mm)")
axs[0].set_ylabel("z (mm)")
cb = fig.colorbar(im, ax=axs, shrink=0.9, pad=0.01); cb.set_label("$\\varepsilon_1$ (µdef)")
save(fig, "n2_mortier_cartes")

json.dump(NUM, open(os.path.join(HERE, "n2_valeurs.json"), "w"), indent=1, default=float)
print("ok")
