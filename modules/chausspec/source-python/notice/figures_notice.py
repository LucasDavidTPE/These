"""Figures de la notice (V1, V4, courbes maîtresses, empreintes, partition spectrale, V5)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, os.path.join(ROOT, "exemples"))
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import chausspec as cs
from tfe_a340 import BBGB_2S2P1D, BBGB_KVG, footprint

C1, C2, C3, C4 = "#2a78d6", "#eb6834", "#1baf7a", "#4a3aa7"
INK, MUTED = "#222222", "#6b6b66"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                     "ytick.color": MUTED, "axes.grid": True, "grid.color": "#e4e3dc", "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 2,
                     "legend.frameon": False, "savefig.bbox": "tight"})
OUT = os.path.join(HERE, "figures")
V = os.path.join(ROOT, "validation")


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".pdf"))
    fig.savefig(os.path.join(OUT, name + ".png"), dpi=160)
    plt.close(fig)


# --- V1 ------------------------------------------------------------------------------------------
d = np.loadtxt(os.path.join(V, "v01_resultats.csv"), delimiter=";", skiprows=1)
E, nu, p, a = 100.0, 0.3, 0.7e6, 0.15
z = np.linspace(0, 1.0, 200); R = np.sqrt(a**2 + z**2)
fig, ax = plt.subplots(1, 2, figsize=(6.4, 3.0))
ax[0].plot(-p * (1 - z**3 / R**3) / 1e3, z, color=C1, label=r"$\sigma_{zz}$ exact")
ax[0].plot(-p / 2 * ((1 + 2 * nu) - 2 * (1 + nu) * z / R + z**3 / R**3) / 1e3, z, color=C2, label=r"$\sigma_{rr}$ exact")
ax[0].plot(d[:, 2] / 1e3, d[:, 0], "o", ms=5, mfc="none", color=C1, label="Hankel")
ax[0].plot(d[:, 3] / 1e3, d[:, 0], "s", ms=4, color=C1, label="FFT 2D")
ax[0].plot(d[:, 5] / 1e3, d[:, 0], "o", ms=5, mfc="none", color=C2)
ax[0].plot(d[:, 6] / 1e3, d[:, 0], "s", ms=4, color=C2)
ax[0].invert_yaxis(); ax[0].set_xlabel("contrainte sur l'axe (kPa)"); ax[0].set_ylabel("z (m)")
ax[0].legend(fontsize=7)
w = (1 + nu) * p * a / (E * 1e6) * (a / R + (1 - 2 * nu) / a * (R - z))
ax[1].plot(w * 1e3, z, color=C3, label="Love (exact)")
ax[1].plot(d[:, 8] * 1e3, d[:, 0], "o", ms=5, mfc="none", color=C3, label="Hankel")
ax[1].plot(d[:, 9] * 1e3, d[:, 0], "s", ms=4, color=C3, label="FFT 2D")
ax[1].invert_yaxis(); ax[1].set_xlabel("déplacement vertical (mm)"); ax[1].legend(fontsize=7)
save(fig, "v1_love")

# --- V4 ------------------------------------------------------------------------------------------
d = np.loadtxt(os.path.join(V, "v04_signal_exx_z015.csv"), delimiter=";", skiprows=1)
fig, ax = plt.subplots(figsize=(6.0, 2.8))
ax.plot(d[:, 0], d[:, 3] * 1e6, color=MUTED, lw=1.2, ls="--", label=r"élastique $E_0$ (réf. instantanée)")
ax.plot(d[:, 0], d[:, 1] * 1e6, color=C1, label="intégrale d'hérédité (référence)")
ax.plot(d[:, 0][::6], d[:, 2][::6] * 1e6, "o", ms=4, mfc="none", color=C2, label="chausspec (charge roulante)")
ax.set_xlabel(r"$X = x - Vt$ (m)  —  la charge avance vers $+x$"); ax.set_ylabel(r"$\varepsilon_{xx}$ (µdef)")
ax.set_xlim(-3, 3); ax.legend(fontsize=7)
save(fig, "v4_heredite")

# --- courbes maîtresses ---------------------------------------------------------------------------
f = np.logspace(-5, 4, 400); w_ = 2 * np.pi * f
A = BBGB_2S2P1D.young(w_) / 1e6; B = BBGB_KVG.young(w_) / 1e6
fig, ax = plt.subplots(1, 2, figsize=(6.4, 2.8))
ax[0].loglog(f, abs(A), color=C1, label=r"2S2P1D ($\tau$ = 1,22 s)")
ax[0].loglog(f, abs(B), color=C2, ls="--", label="KVG 9 branches")
ax[0].axhline(11670, color=MUTED, lw=1, ls=":"); ax[0].axvline(1, color=MUTED, lw=1, ls=":")
ax[0].annotate("11 670 MPa", (1.3e-5, 13000), color=MUTED, fontsize=7)
ax[0].set_xlabel("fréquence (Hz) à 9,3 °C"); ax[0].set_ylabel(r"$|E^*|$ (MPa)"); ax[0].legend(fontsize=7)
ax[1].semilogx(f, np.degrees(np.angle(A)), color=C1); ax[1].semilogx(f, np.degrees(np.angle(B)), color=C2, ls="--")
ax[1].set_xlabel("fréquence (Hz)"); ax[1].set_ylabel(r"$\varphi$ (°)")
save(fig, "courbes_maitresses")

# --- empreintes ----------------------------------------------------------------------------------
g = np.linspace(-0.35, 0.35, 351); X, Y = np.meshgrid(g, g)
fig, ax = plt.subplots(1, 4, figsize=(7.6, 2.3), gridspec_kw=dict(width_ratios=[1, 1, 1, 1.4], wspace=0.35))
names = [("rectangulaire", "rectangulaire"), ("circulaire", "circulaire"), ("heterogene", "hétérogène (Annexe III)")]
for k, (n, lab) in enumerate(names):
    P = footprint(n).sample(X, Y) / 1e6
    im = ax[k].pcolormesh(g, g, P, cmap="Blues", vmin=0, vmax=3.5, shading="auto", rasterized=True)
    ax[k].set_aspect("equal"); ax[k].set_title(lab, fontsize=8); ax[k].set_xlabel("x (m)")
    ax[k].grid(False); ax[k].set_xticks([-0.3, 0, 0.3]); ax[k].set_yticks([-0.3, 0, 0.3])
    if k == 0: ax[k].set_ylabel("y (m)")
cb = fig.colorbar(im, ax=ax[:3], shrink=0.8, pad=0.02)
cb.set_label("p (MPa)")
for n, lab, c in (("rectangulaire", "rect.", C1), ("circulaire", "circ.", C2), ("heterogene", "hétér.", C3)):
    ax[3].plot(g, footprint(n).sample(0 * g, g) / 1e6, color=c, label=lab)
ax[3].set_xlabel("y (m), coupe x = 0"); ax[3].set_ylabel("p (MPa)"); ax[3].legend(fontsize=7)
save(fig, "empreintes")

# --- partition spectrale : pourquoi la FFT seule ne suffit pas -------------------------------------
Vv = 0.66
k = np.logspace(-6, 2, 500)
E = abs(BBGB_KVG.young(k * Vv)) / 1e6
L = 16.0; dk = 2 * np.pi / L
fig, ax = plt.subplots(figsize=(6.0, 2.8))
ax.semilogx(k, E, color=C1, label=r"$|E^*(\omega = k_1 V)|$, KVG, $V$ = 0,66 m/s")
kk = dk * np.arange(1, 60)
ax.semilogx(kk, abs(BBGB_KVG.young(kk * Vv)) / 1e6, "o", ms=3.5, color=C2, label=r"points FFT $k_1 = n\,\Delta k_1$ ($L_x$ = 16 m)")
ax.axvspan(1e-6, 6 * 2 * dk, color="#cde2fb", alpha=0.5, lw=0)
ax.annotate("zone traitée par intégration continue\n" + r"(poids $\varphi(k_1)$, nœuds géométriques)", (2e-6, 15500), fontsize=7, color=INK)
ax.set_xlabel(r"$k_1$ (rad/m)"); ax.set_ylabel("module (MPa)"); ax.legend(fontsize=7, loc="lower right")
save(fig, "partition")
print("figures de base OK")

# --- V5 ------------------------------------------------------------------------------------------
npz = os.path.join(V, "v05_resultats.npz")
if os.path.exists(npz):
    A = np.load(npz)
    R = json.load(open(os.path.join(V, "v05_resultats.json")))
    zp = A["zprof"]
    # (a) signaux en base, empreinte rectangulaire
    fig, ax = plt.subplots(figsize=(6.2, 2.9))
    for law, c, lab in (("elastique", MUTED, "élastique 11 670 MPa"), ("KVG", C1, "KVG (Tab. 7)"), ("2S2P1D", C2, "2S2P1D (Tab. 6)")):
        k = f"{law}_rectangulaire"
        if k + "_base_X" not in A: continue
        X = A[k + "_base_X"]; s = A[k + "_base_eyy"]
        t = (0.0 - X) / 0.66
        o = np.argsort(t)
        ax.plot(t[o], s[o] * 1e6, color=c, lw=2 if law != "elastique" else 1.5, ls="-" if law != "elastique" else "--", label=lab)
    ax.axhline(340.11, color=C3, lw=1, ls=":"); ax.annotate("max mesuré PEP : 340 µdef", (-3.8, 346), color=INK, fontsize=7)
    ax.set_xlabel("t (s) — jauge sous l'axe des roues, roue avant au droit en t = 0")
    ax.set_ylabel(r"$\epsilon_T$ en base (µdef)"); ax.set_xlim(-4, 10); ax.legend(fontsize=7, loc="upper right")
    save(fig, "v5_signaux")
    # (b) profils verticaux de eyz
    fig, ax = plt.subplots(1, 2, figsize=(6.4, 3.0), sharey=True)
    for j, law in enumerate(("elastique", "KVG")):
        for fp, c, lab in (("rectangulaire", C1, "rect."), ("circulaire", C2, "circ."), ("heterogene", C3, "hétér.")):
            k = f"{law}_{fp}_eyz_vert"
            if k in A:
                ax[j].plot(np.abs(A[k]) * 1e6, zp * 1e3, color=c, label=lab)
        ax[j].set_title("élastique" if law == "elastique" else "viscoélastique (KVG)", fontsize=8)
        ax[j].set_xlabel(r"$|\epsilon_{yz}|$ (µdef) = $|\epsilon_{xz}^{TFE}|$")
    ax[0].set_ylabel("z (mm)"); ax[0].invert_yaxis(); ax[0].legend(fontsize=7)
    save(fig, "v5_eyz_profils")
    # (c) cartes eps1 en surface
    fig, ax = plt.subplots(2, 3, figsize=(7.6, 2.7), sharex=True, sharey=True, constrained_layout=True)
    vmax = max(np.max(A[f"{l}_{f}_e1_map"]) for l in ("elastique", "KVG") for f in ("rectangulaire", "circulaire", "heterogene")) * 1e6
    for i, law in enumerate(("elastique", "KVG")):
        for j, fp in enumerate(("rectangulaire", "circulaire", "heterogene")):
            k = f"{law}_{fp}"
            im = ax[i, j].pcolormesh(A[k + "_e1_x"], A[k + "_e1_y"], A[k + "_e1_map"] * 1e6, cmap="Blues", vmin=0, vmax=vmax, shading="auto", rasterized=True)
            ax[i, j].set_aspect("equal"); ax[i, j].grid(False)
            ax[i, j].set_title(f"{'élastique' if law == 'elastique' else 'KVG'}, {dict(rectangulaire='rectangulaire', circulaire='circulaire', heterogene='hétérogène')[fp]} : max {np.max(A[k + '_e1_map'])*1e6:.0f} µdef", fontsize=7)
    for j in range(3): ax[1, j].set_xlabel("x (m)")
    for i in range(2): ax[i, 0].set_ylabel("y (m)")
    fig.colorbar(im, ax=ax, shrink=0.9, label=r"$\epsilon_1$ surface (µdef)")
    save(fig, "v5_e1_cartes")
    print("figures V5 OK")
