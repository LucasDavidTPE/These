"""Figures de méthodologie du rapport « texture » : construction des surfaces et du contact."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from chausspec.contact import (ContactLibrary, Tread, GROOVE_PITCH, grooves_profile, mpd_iso13473, random_texture,
                               solve_contact, surface_stats)

C1, C2, C3, C4, C5, C6 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7"
INK, MUTED = "#222222", "#6b6b66"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                     "ytick.color": MUTED, "axes.grid": True, "grid.color": "#e4e3dc", "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.8,
                     "legend.frameon": False, "savefig.bbox": "tight"})
OUT = os.path.join(HERE, "figures")


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".pdf")); fig.savefig(os.path.join(OUT, name + ".png"), dpi=150); plt.close(fig)


L, N = 0.128, 512; d = L / N
# 1) densité spectrale imposée et obtenue
lam_min, lam_max, lam_roll, H = 1e-3, 50e-3, 20e-3, 0.8
q = np.logspace(np.log10(2 * np.pi / 0.2), np.log10(2 * np.pi / 0.3e-3), 400)
qr, q0, q1 = 2 * np.pi / lam_roll, 2 * np.pi / lam_max, 2 * np.pi / lam_min
Cq = np.where(q < qr, 1.0, (q / qr) ** (-2 * (1 + H))); Cq[(q < q0) | (q > q1)] = np.nan
h = random_texture(L=L, N=N, mpd=1.0e-3, seed=1)
Hk = np.abs(np.fft.fft2(h)) ** 2
k = 2 * np.pi * np.fft.fftfreq(N, d); KX, KY = np.meshgrid(k, k); Q = np.hypot(KX, KY)
bins = np.logspace(np.log10(2 * np.pi / L), np.log10(np.pi / d), 50)
idx = np.digitize(Q.ravel(), bins)
radial = np.array([Hk.ravel()[idx == i].mean() if np.any(idx == i) else np.nan for i in range(1, bins.size)])
qc = np.sqrt(bins[1:] * bins[:-1])
fig, ax = plt.subplots(figsize=(5.6, 3.0))
sc = np.nanmax(radial) / 1.0
ax.loglog(qc, radial / sc, "o", ms=3.5, color=C2, mfc="none", label="densité spectrale de la surface générée (moyenne radiale)")
ax.loglog(q, Cq, color=C1, label=r"modèle imposé $C(q)$ (unités arbitraires)")
for lam_, lab in ((lam_max, "50 mm"), (lam_roll, "20 mm"), (lam_min, "1 mm")):
    ax.axvline(2 * np.pi / lam_, color=MUTED, lw=0.8, ls=":"); ax.annotate(lab, (2 * np.pi / lam_ * 1.05, 2e-6), fontsize=7, color=MUTED)
ax.set_xlabel(r"nombre d'onde $q = 2\pi/\lambda$ (rad/m)"); ax.set_ylabel("densité spectrale (normalisée)")
ax.set_ylim(1e-7, 3); ax.legend(fontsize=7, loc="lower left")
save(fig, "m_psd")

# 2) cartes des trois asymétries + histogrammes
fig, ax = plt.subplots(2, 3, figsize=(7.4, 4.8), gridspec_kw=dict(height_ratios=[1.3, 1]))
g_ = np.arange(N) * d * 1e3
for j, (sk, lab, c) in enumerate((("gauss", "gaussienne", C1), ("negative", "négative (enrobé)", C4), ("positive", "positive (enduit)", C5))):
    hh = random_texture(L=L, N=N, mpd=1.0e-3, skew=sk, seed=1)
    st = surface_stats(hh, d)
    im = ax[0, j].pcolormesh(g_, g_, hh * 1e3, cmap="RdBu_r", vmin=-2.5, vmax=2.5, shading="auto", rasterized=True)
    ax[0, j].set_aspect("equal"); ax[0, j].grid(False); ax[0, j].set_title(f"{lab}\nMPD 1,0 mm, $S_{{sk}}$ = {st['Ssk']:.2f}".replace(".", ","), fontsize=8)
    ax[0, j].set_xlabel("x (mm)")
    ax[1, j].hist(hh.ravel() * 1e3, bins=80, color=c, alpha=0.85)
    ax[1, j].set_xlabel("h (mm)"); ax[1, j].set_yticks([])
ax[0, 0].set_ylabel("y (mm)"); ax[1, 0].set_ylabel("fréquence")
fig.colorbar(im, ax=ax[0, :], shrink=0.8, label="h (mm)")
save(fig, "m_textures")

# 3) illustration du calcul de la MPD sur un profil de 100 mm
row = h[200, :400]; xs = np.arange(row.size) * d * 1e3
s_ = np.arange(row.size); a, b = np.polyfit(s_, row, 1); seg = row - (a * s_ + b)
half = seg.size // 2
p1, p2 = seg[:half].max(), seg[half:].max(); mean = seg.mean()
fig, ax = plt.subplots(figsize=(6.4, 2.4))
ax.plot(xs, seg * 1e3, color=C1, lw=1.2)
ax.axhline(mean * 1e3, color=MUTED, lw=1, ls="--"); ax.annotate("niveau moyen", (2, mean * 1e3 - 0.35), fontsize=7, color=MUTED)
ax.hlines([p1 * 1e3], 0, xs[half], color=C2, lw=1.2); ax.hlines([p2 * 1e3], xs[half], xs[-1], color=C2, lw=1.2)
ax.axvline(xs[half], color=MUTED, lw=0.8, ls=":")
ax.annotate(f"pic 1", (5, p1 * 1e3 + 0.1), fontsize=7, color=C2); ax.annotate(f"pic 2", (xs[half] + 5, p2 * 1e3 + 0.1), fontsize=7, color=C2)
ax.set_xlabel("x (mm) — segment de 100 mm redressé"); ax.set_ylabel("h (mm)")
ax.set_title(f"profondeur du segment = (pic1 + pic2)/2 − niveau moyen = {((p1 + p2) / 2 - mean) * 1e3:.2f} mm".replace(".", ","), fontsize=8)
save(fig, "m_mpd")

# 4) profil de rainures, arêtes vives / arrondies, et pression
x = np.arange(608) * GROOVE_PITCH / 608
fig, ax = plt.subplots(2, 1, figsize=(6.2, 3.8), sharex=True, gridspec_kw=dict(height_ratios=[1, 1.4]))
for r_, c, lab in ((0.0, C1, "arêtes vives"), (1e-3, C2, "arêtes arrondies, r = 1 mm")):
    hp = grooves_profile(x, edge_radius=r_)
    ax[0].plot(x * 1e3, hp * 1e3, color=c, label=lab)
    sol = solve_contact(hp, x[1] - x[0], 1.65e6, Tread(10, 0.49, 0.010))
    ax[1].plot(x * 1e3, sol.p / 1e6, color=c, label=f"{lab} : p max {sol.p.max()/1e6:.1f} MPa".replace(".", ","))
ax[0].set_ylabel("h (mm)"); ax[0].legend(fontsize=7, loc="lower left")
ax[1].axhline(1.65, color=MUTED, lw=1, ls="--"); ax[1].annotate("pression nominale 1,65 MPa", (20, 1.3), fontsize=7, color=MUTED)
ax[1].set_ylim(0, 6); ax[1].set_ylabel("p (MPa)"); ax[1].set_xlabel("x (mm) — un pas de rainurage (38,1 mm)"); ax[1].legend(fontsize=7, loc="upper center")
save(fig, "m_rainures")

# 5) bibliothèque de contact : cartes à trois pressions nominales + courbes aire(p)
tr = Tread(10, 0.49, 0.010)
lib = ContactLibrary.build(h, d, np.array([0.3, 1.65, 4.0]) * 1e6, tr, tol=1e-7)
fig, ax = plt.subplots(1, 3, figsize=(7.4, 2.8), constrained_layout=True)
for j, pb in enumerate((0.3, 1.65, 4.0)):
    im = ax[j].pcolormesh(g_, g_, lib.m[j] * pb, cmap="Blues", vmin=0, vmax=12, shading="auto", rasterized=True)
    ax[j].set_aspect("equal"); ax[j].grid(False); ax[j].set_xlabel("x (mm)")
    ax[j].set_title(f"p nominal {pb} MPa : aire {lib.area[j]*100:.0f} %".replace(".", ","), fontsize=8)
ax[0].set_ylabel("y (mm)"); fig.colorbar(im, ax=ax, shrink=0.8, label="p (MPa)")
save(fig, "m_bibliotheque")
json.dump(dict(stats=surface_stats(h, d)), open(os.path.join(OUT, "m_stats.json"), "w"))
print("OK")
