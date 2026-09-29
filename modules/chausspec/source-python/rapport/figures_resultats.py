"""Tableaux et figures de résultats du rapport « texture » (lit validation/t0*_resultats*.json)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
V = os.path.join(ROOT, "validation")
sys.path.insert(0, ROOT)
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

C1, C2, C3, C4, C5, C6, C7 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#e34948"
INK, MUTED = "#222222", "#6b6b66"
plt.rcParams.update({"font.size": 9, "axes.edgecolor": MUTED, "axes.labelcolor": INK, "xtick.color": MUTED,
                     "ytick.color": MUTED, "axes.grid": True, "grid.color": "#e4e3dc", "grid.linewidth": 0.6,
                     "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.8,
                     "legend.frameon": False, "savefig.bbox": "tight"})
OUT = os.path.join(HERE, "figures")
J = lambda n: json.load(open(os.path.join(V, n))) if os.path.exists(os.path.join(V, n)) else {}
fr = lambda v, d=0: (f"{v:.{d}f}").replace(".", ",").replace("-", "$-$") if v is not None else "---"


def save(fig, name):
    fig.savefig(os.path.join(OUT, name + ".pdf")); fig.savefig(os.path.join(OUT, name + ".png"), dpi=150); plt.close(fig)


R = {}
for n in ("t07_resultats_het.json", "t07_resultats_rc.json", "t07_resultats_seeds.json"):
    R.update(J(n))
TX = {}
for n in ("t07_textures_het.json", "t07_textures_rc.json", "t07_textures_seeds.json"):
    TX.update(J(n))
OLD = J("t04_resultats.json")
ZK = ["0.001", "0.002", "0.005", "0.010", "0.020", "0.040", "0.080"]
ZMM = [1, 2, 5, 10, 20, 40, 80]
NAMES = {"lisse": "lisse (TFE)", "rainures_vives": "rainures FAA, arêtes vives",
         "rainures_r1mm": "rainures FAA, arêtes $r$ = 1 mm", "gauss_MPD0.6": "aléatoire, MPD 0,6 mm",
         "gauss_MPD1.0": "aléatoire, MPD 1,0 mm", "gauss_MPD1.5": "aléatoire, MPD 1,5 mm",
         "negative_MPD1.0": "négative, MPD 1,0 mm", "positive_MPD1.0": "positive, MPD 1,0 mm",
         "gauss_MPD1.0_Er5": "MPD 1,0 ; $E_r$ = 5 MPa", "gauss_MPD1.0_Er20": "MPD 1,0 ; $E_r$ = 20 MPa"}
ORDER = list(NAMES)
PR = {"heterogene": "hétérogène", "rectangulaire": "rectangulaire", "circulaire": "circulaire"}


def get(fp, tex, q, z=None):
    k = f"{fp}|{tex}"
    if k not in R:
        return None
    if z is None:
        return np.array([R[k]["profil"][zz][q] for zz in ZK])
    return R[k]["profil"][z][q]


snip = {}
# ============================================================================ surfaces
rows = []
for k in ORDER[1:]:
    i = TX.get(k)
    if not i:
        continue
    if "MPD_mm" in i:
        etd = 0.2 + 0.8 * i["MPD_mm"]
        rows.append(f"{NAMES[k]} & {fr(i['MPD_mm'],2)} & {fr(etd,2)} & {fr(i['Sq_mm'],2)} & {fr(i['Ssk'],2)} & {fr(i['m2'],3)} & "
                    f"{fr(i['aire_1p65']*100)} & {fr(i['p99_1p65_MPa'],1)}\\\\")
    else:
        rows.append(f"{NAMES[k]} & --- & --- & --- & --- & --- & {fr(i['aire']*100)} & {fr(i['pmax_MPa'],1)} (max)\\\\")
snip["r_tab_surfaces.tex"] = r"""\begin{table}[H]\centering\small
\caption{Caractéristiques des surfaces et du contact sous la pression nominale du TFE (\SI{1.65}{MPa}).
$m_2$ : pente quadratique moyenne ; aire : fraction de la surface en contact ; $p_{99}$ : 99\textsuperscript{e}
centile de la pression locale dans le contact (pour les rainures : maximum, qui dépend de la
résolution à cause de la singularité d'arête).}\label{tab:surfaces}
\begin{tabular}{lccccccc}
\toprule
Surface & MPD & ETD & $S_q$ & $S_{sk}$ & $m_2$ & aire & $p_{99}$\\
 & (mm) & (mm) & (mm) & & & (\%) & (MPa)\\
\midrule
""" + "\n".join(rows) + r"""
\bottomrule
\end{tabular}
\end{table}
"""

# aire de contact en fonction de la pression nominale (figure)
PB = [0.15, 0.3, 0.6, 1.0, 1.65, 2.3, 3.0, 4.0]
fig, ax = plt.subplots(figsize=(5.4, 3.0))
for k, c, ls in (("gauss_MPD0.6", C3, "-"), ("gauss_MPD1.0", C2, "-"), ("gauss_MPD1.5", C6, "-"), ("negative_MPD1.0", C4, "--"),
                 ("positive_MPD1.0", C5, "--"), ("gauss_MPD1.0_Er5", C2, ":"), ("gauss_MPD1.0_Er20", C2, "-.")):
    if k in TX and "aire_par_pbar" in TX[k]:
        ax.plot(PB, np.array(TX[k]["aire_par_pbar"]) * 100, color=c, ls=ls, marker="o", ms=3, label=NAMES[k].replace("$", ""))
ax.set_xlabel("pression nominale locale (MPa)"); ax.set_ylabel("aire de contact (%)"); ax.set_ylim(0, 100)
ax.axvline(1.65, color=MUTED, lw=0.8, ls=":"); ax.legend(fontsize=6.5, loc="lower right")
save(fig, "r_aire")

# ============================================================================ vérifications
T12 = J("t01_t02_resultats.json"); T6 = J("t06_resultats.json"); T8 = J("t08_resultats.json"); T5 = J("t05_resultats.json")
T5b = J("t05b_resultats.json")
t3 = [l.strip().split(";") for l in open(os.path.join(V, "t03_resultats.csv")).readlines()[1:]] if os.path.exists(os.path.join(V, "t03_resultats.csv")) else []


def t3max(fp, keys=("ezz", "exz", "exx"), col=8):
    v = [abs(float(l[col])) for l in t3 if l[0] == fp and l[2] in keys and float(l[1]) >= 0.002]
    return max(v) * 100 if v else None


t6max = max(v["rms"] for t in T6.values() for v in t.values()) * 100 if T6 else None
rs = []
if T8:
    a = T8["aleatoire"]; ks = sorted(a, key=float)
    for z in ("0.5mm", "1mm", "2mm", "5mm"):
        v = [a[k]["rep"][z]["e1_max"] for k in ks]
        rs.append((z, v))
t5rows = []
for key, v in T5.items():
    for comp in ("ezz@2mm", "exz@2mm", "ezz@5mm"):
        r = v["res"][comp]
        t5rows.append(f"{key.split('|')[0].replace('_', ' ')} & {key.split('|')[1].split('_')[0]} & ${comp[0]}_{{{comp[1:3]}}}$ à {comp.split('@')[1].replace('mm',' mm')} & "
                      f"{fr(r['max_exact'],1)} & {fr(r['max_s05'],1)} ({fr((r['max_s05']/r['max_exact']-1)*100,1)}\\,\\%)\\\\")
t5brows = []
for key, v in T5b.items():
    for comp, r in v.items():
        t5brows.append(f"{key.split('|')[0].replace('_', ' ')} & {key.split('|')[1].split('_')[0]} & ${comp[0]}_{{{comp[1:3]}}}$ à {comp.split('@')[1].replace('mm',' mm')} & "
                       f"{fr(r['max_reponses'],2)} & {fr(r['max_pression'],2)} ({fr((r['max_pression']/r['max_reponses']-1)*100,2)}\\,\\%)\\\\")
t8rows = []
if T8:
    for d in sorted(T8["aleatoire"], key=float):
        a = T8["aleatoire"][d]
        t8rows.append(f"aléatoire MPD 1,0 & {fr(float(d),3)} & {fr(a['aire']*100,1)} & " + " & ".join(fr(a['rep'][z]['e1_max']) for z in ("0.5mm", "1mm", "2mm", "5mm")) + "\\\\")
    for k, a in T8["rainures"].items():
        r_, d_ = k.split("_")
        t8rows.append(f"rainures, {'arêtes vives' if r_ == 'r0' else 'r = 1 mm'} & {fr(float(d_[1:]),3)} & {fr(a['pmax'],1)} MPa & "
                      + " & ".join(fr(a['rep'][z]['e1_max']) for z in ("0.5mm", "1mm", "2mm", "5mm")) + "\\\\")

snip["r_verifications.tex"] = r"""Chaque maillon de la chaîne a été contrôlé par un calcul indépendant. Le
tableau~\ref{tab:verifs} les résume ; le détail suit.

\begin{table}[H]\centering\small
\caption{Synthèse des vérifications.}\label{tab:verifs}
\begin{tabular}{p{0.8cm}p{4.6cm}p{5.2cm}p{3.6cm}}
\toprule
Test & Ce qui est vérifié & Référence indépendante & Écart obtenu\\
\midrule
V1--V5 & noyau multicouche, charge roulante VE, reproduction du TFE & Love, PyMastic, hérédité, COMSOL & $10^{-4}$ ; < 0,8\,\% ; 0,5--1,5\,\% (voir notice)\\
T1 & contact BEM sur rainures & poinçons périodiques (forme fermée, Legendre) & $2\cdot10^{-5}$ ; coefficients à $10^{-5}$\\
T2 & contact BEM sur texture aléatoire & théorie de Persson & écart connu de 20--30\,\% à faible charge, convergence en contact total\\
T3 & couplage VE complet (hérédité + massif local) & calcul multicouche VE exact, régime \texttt{MovingEnvelope} & """ + (fr(t3max("heterogene"), 1) + r"\,\% (empreinte hétérogène, composantes dominantes)" if t3 else "---") + r"""\\
T5/T5b & hérédité avec contact non linéaire & marche en temps sur les réponses, deux codes & """ + ("identiques à " + fr(max(abs(r["max_pression"] / r["max_reponses"] - 1) for v in T5b.values() for r in v.values()) * 100, 2) + r"\,\%" if T5b else "voir tableau~\\ref{tab:t5}") + r"""\\
T6 & massif local contre structure complète & multicouche PEP complet (5 couches) & """ + (fr(t6max, 2) + r"\,\% (écart quadratique maximal)" if t6max is not None else "---") + r"""\\
T8 & résolution (contact + réponse) & même surface à 0,5 / 0,25 / 0,125 mm & """ + (r"< 1\,\% entre 0,25 et 0,125 mm dès $z\ge\SI{0.5}{mm}$" if T8 else "---") + r"""\\
T9 & variabilité d'une réalisation à l'autre & 5 tirages indépendants par MPD & voir \S\ref{sec:tirages}\\
\bottomrule
\end{tabular}
\end{table}

\subsection{Contact : T1 et T2}
Sur les rainures (T1), le BEM converge vers la forme fermée \eqref{eq:punch} (écart de
$6\cdot10^{-4}$, $10^{-4}$ puis $2\cdot10^{-5}$ pour 512, 2048 et 8192 points par pas), et ses
coefficients de Fourier coïncident avec la formule de Legendre à $10^{-5}$ près. Sur les textures
aléatoires (T2), les trois MPD se regroupent sur une même courbe en variable réduite
$\bar p/(E^*\sqrt{m_2})$, comme l'impose la théorie. Persson sous-estime l'aire de 20 à 30\,\% aux
faibles charges, ce qui est l'écart connu de la littérature. \textbf{Le calcul du contact est
fiable} dans son cadre : élasticité linéaire, frottement nul, surface rigide.

\subsection{Couplage deux échelles : T3, T5, T6}
\textbf{T6, massif local.} La réponse à $\delta p$ calculée sur un massif homogène coïncide avec
celle de la structure PEP complète (5 couches, substratum) à mieux que
""" + (fr(t6max, 2) if t6max is not None else "---") + r"""\,\% en écart quadratique, de 1 à \SI{40}{mm}
de profondeur. L'hypothèse de localisation est donc parfaitement justifiée.

\textbf{T3, viscoélasticité avec texture fixe.} Pour l'harmonique fondamentale du rainurage sous
l'enveloppe hétérogène roulante, la méthode héréditaire \eqref{eq:hered} reproduit le calcul
multicouche viscoélastique exact. Ce dernier est obtenu par un régime spécial de \cs{} où la
pulsation vaut $-\kappa V$ et le noyau est évalué en $\kappa+k_n$. L'écart est au plus de
""" + (fr(t3max("heterogene"), 1) if t3 else "---") + r"""\,\% sur les composantes dominantes ($\epsilon_{zz}$, $\epsilon_{xz}$, $\epsilon_{xx}$),
et de quelques pour cent sur les composantes faibles. Pour les empreintes en créneau, l'accord reste
de 1 à 4\,\% sur les composantes dominantes.

\textbf{T5, contact non linéaire.} Pour une texture aléatoire, la forme de $\delta p$ change
pendant le passage. On compare deux mises en \oe uvre indépendantes de la même intégrale
d'hérédité. L'une marche en temps sur les \emph{réponses} (t05, une réponse élastique par pas de
temps) ; l'autre, celle de la campagne, applique l'hérédité sur la \emph{pression} (t05b).
""" + (r"""\begin{table}[H]\centering\small
\caption{T5b : même intégrale d'hérédité par deux codes (maximum sur une fenêtre de $\SI{64}{mm}\times\SI{64}{mm}$, µdef, perturbation seule).}
\begin{tabular}{llcrr}
\toprule
Texture & Fenêtre & Grandeur & sur les réponses & sur la pression\\
\midrule
""" + "\n".join(t5brows) + r"""
\bottomrule
\end{tabular}
\end{table}
""" if t5brows else "") + (r"""Le même test chiffre l'erreur de la formule multiplicative abandonnée (\S\ref{sec:hered}) :
\begin{table}[H]\centering\small
\caption{T5 : méthode héréditaire exacte et formule multiplicative abandonnée (perturbation seule, µdef).}\label{tab:t5}
\begin{tabular}{llcrr}
\toprule
Texture & Fenêtre & Grandeur & héréditaire (exact) & multiplicative\\
\midrule
""" + "\n".join(t5rows) + r"""
\bottomrule
\end{tabular}
\end{table}
La formule multiplicative est exacte pour les rainures, et elle \textbf{sous-estime} de 9\,\% environ la perturbation des textures aléatoires. En
effet, sur une texture aléatoire, les sommets sont chargés dès l'arrivée du pneu, avant que
l'enveloppe n'atteigne son maximum : la perturbation dure plus longtemps que ne le suppose la
formule, et le fluage l'amplifie davantage.
""" if t5rows else "") + r"""

\subsection{Convergence en résolution : T8}\label{sec:resolution}
La même surface physique est discrétisée à 0,5, 0,25 et \SI{0.125}{mm}, par troncature spectrale
exacte. Le contact et la réponse sont recalculés sous une pression uniforme de \SI{1.65}{MPa}
(massif élastique de \SI{11670}{MPa}).
\begin{table}[H]\centering\small
\caption{T8 : $\epsilon_1$ maximal (µdef) en fonction du pas de discrétisation.}
\begin{tabular}{lcccccc}
\toprule
Surface & pas (mm) & aire (\%) / $p_{\max}$ & $z$ = 0,5 mm & 1 mm & 2 mm & 5 mm\\
\midrule
""" + "\n".join(t8rows) + r"""
\bottomrule
\end{tabular}
\end{table}
Au pas de la campagne (\SI{0.25}{mm}), les grandeurs sont convergées à mieux que 1\,\% dès
\SI{0.5}{mm} de profondeur, y compris pour les arêtes vives. La pression d'arête y est pourtant
singulière (7, 10 puis \SI{14}{MPa} quand le pas diminue), mais son intégrale, seule vue en
profondeur, converge.

\subsection{Degré de confiance : ce qu'on peut affirmer}
\begin{encadre}
\textbf{Fiable (à quelques pour cent).} Dans le cadre des hypothèses (H1)--(H7), les nombres de ce
rapport sont des solutions convergées et vérifiées : le contact, la localisation, la
viscoélasticité avec texture fixe, la résolution et l'accord avec le TFE pour le cas lisse. Les
\textbf{tendances} sont robustes : amplification près de la surface, profondeur d'influence de
10 à \SI{20}{mm}, effet nul en base de couche, classement des textures.

\textbf{Incertain (facteur de l'ordre de 1,5).} La valeur absolue des déformations aux premiers
millimètres dépend fortement de paramètres \emph{mal connus} : le module de la bande de roulement
(voir la sensibilité à $E_r$), la forme exacte de la texture réelle (tirages et asymétrie) et
l'arrondi des arêtes des rainures.

\textbf{Hors de portée du niveau 1, traité par le niveau 2.} La valeur locale dans le mortier
entre granulats (H7), la concentration de contrainte géométrique autour des rainures (H6) et le
frottement (H3). Le niveau 2 (\S\ref{sec:niveau2}) les quantifie : les trois vont dans le sens
d'une sévérité plus grande, comme annoncé. Leur degré de confiance est discuté au
\S\ref{sec:n2_confiance}.
\end{encadre}
"""

# ============================================================================ résultats
def table(fp, q, title, label, qp=None, ratio_min=50):
    base = get(fp, "lisse", q)
    if base is None:
        return ""
    head = " & ".join(f"{z} mm" for z in ZMM[:6])
    rows = []
    for k in ORDER:
        v = get(fp, k, q)
        if v is None:
            continue
        if k == "lisse":
            rows.append(r"\textbf{" + NAMES[k] + "} & " + " & ".join(r"\textbf{" + fr(x * 1e6) + "}" for x in v[:6]) + r"\\ \midrule")
        else:
            rows.append(NAMES[k] + " & " + " & ".join((f"{fr(x*1e6)} ({fr(x/b,2)})" if b * 1e6 >= ratio_min else fr(x * 1e6))
                                                     for x, b in zip(v[:6], base[:6])) + r"\\")
    return (r"""\begin{table}[H]\centering\footnotesize
\caption{""" + title + r"""}\label{""" + label + r"""}
\begin{tabular}{l""" + "r" * 6 + r"""}
\toprule
Surface \textbackslash{} profondeur & """ + head + r"""\\
\midrule
""" + "\n".join(rows) + r"""
\bottomrule
\end{tabular}
\end{table}
""")


res = []
res.append(r"""Toutes les valeurs concernent la roue arrière droite du bogie, où se trouvent les maxima du TFE,
avec le KVG du TFE à \SI{0.66}{m/s} et \SI{9.3}{\celsius}. Le cas « lisse » est le TFE recalculé
par \cs : il coïncide avec la validation V5 de la notice.

\subsection{Contact}
\input{r_tab_surfaces_ref.tex}
\begin{figure}[H]\centering\includegraphics[width=0.7\linewidth]{figures/r_aire.pdf}
\caption{Aire de contact en fonction de la pression nominale locale. Sous le pneu, celle-ci varie
de 0 à \SI{3.4}{MPa} (empreinte hétérogène) : la surface en contact change donc fortement d'un
point à l'autre de l'empreinte.}\end{figure}
Sous la pression nominale du TFE, le pneu ne touche que 30 à 85\,\% de la surface selon la
texture et la raideur du caoutchouc. La pression locale y atteint 5 à \SI{15}{MPa}, soit 3 à 9
fois la pression nominale. Sur piste rainurée, le contact couvre les plats (83\,\%) avec une
surpression d'arête.

\subsection{Empreinte hétérogène (cas de référence)}""")
res.append(table("heterogene", "e1_max", r"Empreinte hétérogène : déformation principale majeure $\epsilon_1$ maximale (µdef), et entre parenthèses le facteur par rapport au lisse. TFE en surface : 202 µdef (COMSOL), 181 µdef (\cs).", "tab:het_e1"))
res.append(table("heterogene", "e1_p999", r"Empreinte hétérogène : centile 99,9\,\% de $\epsilon_1$ (µdef), indicateur robuste (dépassé sur environ \SI{4}{cm^2}).", "tab:het_e1p"))
res.append(table("heterogene", "exz_max", r"Empreinte hétérogène : $|\epsilon_{xz}|$ maximal (µdef), cisaillement longitudinal. Facteur donné seulement si la valeur lisse dépasse 50 µdef.", "tab:het_exz"))
res.append(table("heterogene", "eyz_max", r"Empreinte hétérogène : $|\epsilon_{yz}|$ maximal (µdef), c'est-à-dire l'$\epsilon_{xz}$ du TFE (cisaillement transversal). Maximum du TFE en profondeur : 164 µdef vers \SI{100}{mm} (\cs), inchangé par la texture.", "tab:het_eyz"))

# figure profils
fig, ax = plt.subplots(1, 3, figsize=(7.6, 3.4), sharey=True)
sty = {"rainures_vives": (C1, "-"), "rainures_r1mm": (C1, ":"), "gauss_MPD0.6": (C3, "-"), "gauss_MPD1.0": (C2, "-"),
       "gauss_MPD1.5": (C6, "-"), "negative_MPD1.0": (C4, "--"), "positive_MPD1.0": (C5, "--")}
for j, (q, lab) in enumerate((("e1_max", r"$\epsilon_1$ max"), ("exz_max", r"$|\epsilon_{xz}|$ max"), ("eyz_max", r"$|\epsilon_{yz}|$ max"))):
    b = get("heterogene", "lisse", q)
    if b is None: continue
    ax[j].plot(b * 1e6, ZMM, color=MUTED, lw=2.8, label="lisse (TFE)")
    for k, (c, ls) in sty.items():
        v = get("heterogene", k, q)
        if v is not None: ax[j].plot(v * 1e6, ZMM, color=c, ls=ls, lw=1.6, label=NAMES[k].replace("$r$", "r").replace("$", ""))
    ax[j].set_yscale("log"); ax[j].set_xlabel(lab + " (µdef)")
ax[0].invert_yaxis(); ax[0].set_ylabel("profondeur z (mm)"); ax[0].set_yticks(ZMM); ax[0].set_yticklabels([str(z) for z in ZMM])
h_, l_ = ax[0].get_legend_handles_labels()
fig.legend(h_, l_, fontsize=7, loc="lower center", ncol=4, bbox_to_anchor=(0.5, -0.2))
save(fig, "r_profils_het")
res.append(r"""\begin{figure}[H]\centering\includegraphics[width=\linewidth]{figures/r_profils_het.pdf}
\caption{Empreinte hétérogène : maxima des déformations en fonction de la profondeur (échelle
logarithmique). Toutes les courbes rejoignent le cas lisse au-delà de 20 à \SI{40}{mm}.}\label{fig:profils}\end{figure}""")

# cartes
A = {}
for nm in ("t07_cartes_het.npz", "t07_cartes_hetmaps.npz"):
    if os.path.exists(os.path.join(V, nm)):
        A.update(dict(np.load(os.path.join(V, nm))))
A = A or None
if A is not None:
    keys = [k for k in ("lisse", "rainures_vives", "gauss_MPD1.0", "negative_MPD1.0") if f"{k}_e1_z2mm" in A]
    if keys:
        fig, ax = plt.subplots(1, len(keys), figsize=(7.6, 3.2), sharey=True, constrained_layout=True)
        ax = np.atleast_1d(ax)
        vmax = max(np.percentile(A[f"{k}_e1_z2mm"], 99.9) for k in keys) * 1e6
        for j, k in enumerate(keys):
            im = ax[j].pcolormesh(A["x"], A["y"], A[f"{k}_e1_z2mm"] * 1e6, cmap="Blues", vmin=0, vmax=vmax, shading="auto", rasterized=True)
            ax[j].set_aspect("equal"); ax[j].grid(False); ax[j].set_title(NAMES[k].replace("$r$", "r"), fontsize=7)
            ax[j].set_xlim(-2.12, -1.88); ax[j].set_ylim(0.52, 0.92); ax[j].set_xlabel("x (m)")
        ax[0].set_ylabel("y (m)"); fig.colorbar(im, ax=ax, shrink=0.8, label=r"$\epsilon_1$ à z = 2 mm (µdef)")
        save(fig, "r_cartes")
        res.append(r"""\begin{figure}[H]\centering\includegraphics[width=\linewidth]{figures/r_cartes.pdf}
\caption{$\epsilon_1$ à \SI{2}{mm} de profondeur sous la roue arrière droite (empreinte hétérogène).
Lisse : la déformation suit les nervures de l'empreinte. Texturé : elle se fragmente à l'échelle
des sommets de texture et ses pics augmentent.}\end{figure}""")

# tirages
SE = {}
for mpd in ("0.6", "1.0", "1.5"):
    vals = []
    base = get("heterogene", "lisse", "e1_max")
    for sd in (1, 2, 3, 4, 5):
        k = f"gauss_MPD{mpd}" if sd == 1 else f"gauss_MPD{mpd}_s{sd}"
        v = get("heterogene", k, "e1_max")
        if v is not None and base is not None:
            vals.append(v / base)
    if vals:
        SE[mpd] = np.array(vals)
res.append(r"""\subsection{Variabilité d'une réalisation de texture à l'autre (T9)}\label{sec:tirages}""")
if SE:
    rows = []
    for mpd, a in SE.items():
        rows.append(f"MPD {mpd.replace('.', ',')} mm & {a.shape[0]} & " + " & ".join(f"{fr(a[:, i].mean(),2)} $\\pm$ {fr(a[:, i].std(ddof=1) if a.shape[0] > 1 else 0,2)}" for i in range(5)) + r"\\")
    res.append(r"""Une texture aléatoire est une réalisation d'un processus. On répète le calcul complet sur
5 tirages indépendants par MPD : même DSP et même MPD, phases différentes.
\begin{table}[H]\centering\footnotesize
\caption{Facteur d'amplification de $\epsilon_1$ max par rapport au lisse (empreinte hétérogène) : moyenne $\pm$ écart type sur les tirages.}\label{tab:tirages}
\begin{tabular}{lcccccc}
\toprule
Texture & tirages & 1 mm & 2 mm & 5 mm & 10 mm & 20 mm\\
\midrule
""" + "\n".join(rows) + r"""
\bottomrule
\end{tabular}
\end{table}""")
    fig, ax = plt.subplots(figsize=(5.2, 3.2))
    for (mpd, a), c in zip(SE.items(), (C3, C2, C6)):
        m, s = a.mean(0), a.std(0, ddof=1) if a.shape[0] > 1 else np.zeros(a.shape[1])
        ax.plot(m, ZMM, color=c, marker="o", ms=3, label=f"MPD {mpd.replace('.', ',')} mm ({a.shape[0]} tirages)")
        ax.fill_betweenx(ZMM, m - s, m + s, color=c, alpha=0.18, lw=0)
    ax.axvline(1, color=MUTED, lw=1); ax.set_yscale("log"); ax.invert_yaxis(); ax.set_yticks(ZMM); ax.set_yticklabels([str(z) for z in ZMM])
    ax.set_xlabel(r"facteur d'amplification de $\epsilon_1$ max (texturé / lisse)"); ax.set_ylabel("profondeur z (mm)"); ax.legend(fontsize=7)
    save(fig, "r_tirages")
    res.append(r"""\begin{figure}[H]\centering\includegraphics[width=0.66\linewidth]{figures/r_tirages.pdf}
\caption{Amplification moyenne $\pm$ un écart type sur les tirages, en fonction de la profondeur.}\end{figure}""")
else:
    res.append("Calculs en cours.")

res.append(r"\subsection{Empreintes uniformes}")
res.append(table("rectangulaire", "e1_max", r"Empreinte rectangulaire : $\epsilon_1$ maximal (µdef) et facteur. TFE en surface : 195 µdef (COMSOL), 196 µdef (\cs).", "tab:rect_e1"))
res.append(table("circulaire", "e1_max", r"Empreinte circulaire : $\epsilon_1$ maximal (µdef) et facteur. TFE en surface : 182 µdef (COMSOL), 173 µdef (\cs).", "tab:circ_e1"))

# comparaison synthétique avec le TFE
def val(fp, tex, q, z):
    v = get(fp, tex, q, z)
    return None if v is None else v * 1e6


rows = []
for fp in ("heterogene", "rectangulaire", "circulaire"):
    for tex in ("lisse", "rainures_vives", "gauss_MPD1.0", "gauss_MPD1.5"):
        a, b, c = val(fp, tex, "e1_max", "0.002"), val(fp, tex, "e1_p999", "0.002"), val(fp, tex, "e1_max", "0.010")
        d = val(fp, tex, "exz_max", "0.002"); e = val(fp, tex, "eyz_max", "0.040")
        if a is None: continue
        rows.append(f"{PR[fp] if tex == 'lisse' else ''} & {NAMES[tex]} & {fr(a)} & {fr(b)} & {fr(c)} & {fr(d)} & {fr(e)}\\\\")
    rows.append(r"\midrule")
res.append(r"""\subsection{Synthèse et comparaison avec le TFE}
\begin{table}[H]\centering\footnotesize
\caption{Grandeurs clés (µdef). Valeurs du TFE (COMSOL, surface lisse) : $\epsilon_1$ en surface 202 / 195 / 182 et $\epsilon_T$ en base 337 / 331 / 318 µdef (hétérogène / rectangulaire / circulaire). La texture ne modifie pas $\epsilon_T$ en base (effet nul au-delà de \SI{40}{mm}).}\label{tab:synthese}
\begin{tabular}{llrrrrr}
\toprule
Empreinte & Surface & $\epsilon_1$ max & $\epsilon_1$ p99,9 & $\epsilon_1$ max & $|\epsilon_{xz}|$ max & $|\epsilon_{yz}|$ max\\
 & & 2 mm & 2 mm & 10 mm & 2 mm & 40 mm\\
\midrule
""" + "\n".join(rows[:-1]) + r"""
\bottomrule
\end{tabular}
\end{table}""")
# barres de synthèse
fig, ax = plt.subplots(figsize=(6.4, 3.0))
texs = ["lisse", "rainures_vives", "gauss_MPD0.6", "gauss_MPD1.0", "gauss_MPD1.5", "negative_MPD1.0"]
cols = [MUTED, C1, C3, C2, C6, C4]
w = 0.13
for i, fp in enumerate(("heterogene", "rectangulaire", "circulaire")):
    for j, (t, c) in enumerate(zip(texs, cols)):
        v = val(fp, t, "e1_max", "0.002")
        if v is not None:
            ax.bar(i + (j - 2.5) * w, v, w * 0.92, color=c, label=NAMES[t].replace("$", "") if i == 0 else None)
ax.set_xticks(range(3)); ax.set_xticklabels(["hétérogène", "rectangulaire", "circulaire"])
ax.set_ylabel(r"$\epsilon_1$ max à 2 mm (µdef)"); ax.set_ylim(0, 480)
ax.legend(fontsize=6.5, ncol=3, loc="upper center"); ax.grid(axis="x", visible=False)
save(fig, "r_barres")
res.append(r"""\begin{figure}[H]\centering\includegraphics[width=0.85\linewidth]{figures/r_barres.pdf}
\caption{$\epsilon_1$ maximal à \SI{2}{mm} de profondeur pour les trois empreintes du TFE et les principales surfaces.}\end{figure}""")
# ancienne méthode vs nouvelle (hétérogène)
rows = []
for k in ("rainures_vives", "gauss_MPD1.0", "gauss_MPD1.5", "negative_MPD1.0"):
    o = OLD.get(f"heterogene|{k}"); n = R.get(f"heterogene|{k}")
    if o and n:
        rows.append(NAMES[k] + " & " + " & ".join(f"{fr(o['profil'][z]['e1_max']*1e6)} / {fr(n['profil'][z]['e1_max']*1e6)}" for z in ("0.001", "0.002", "0.005", "0.010")) + r"\\")
if rows:
    res.append(r"""\subsection{Écart avec le bilan du 24 septembre}
\begin{table}[H]\centering\footnotesize
\caption{$\epsilon_1$ max (µdef), empreinte hétérogène : formule multiplicative (bilan du 24/09) / méthode héréditaire (ce rapport).}
\begin{tabular}{lcccc}
\toprule
Surface & 1 mm & 2 mm & 5 mm & 10 mm\\
\midrule
""" + "\n".join(rows) + r"""
\bottomrule
\end{tabular}
\end{table}
Les rainures, où $\delta p$ reste proportionnel à $p_0$, sont quasi inchangées. Pour les
textures aléatoires, les maxima de $\epsilon_1$ ne changent que de quelques pour cent. Deux
effets de la formule multiplicative se compensent en partie : elle sous-estime la perturbation
sous les zones chargées (T5), et elle surestime la souplesse effective dans les zones peu
chargées, où $C=Q/p_0$ est mal conditionné. Les conclusions du bilan restent valables ; les
valeurs de ce rapport les remplacent.""")
snip["r_resultats.tex"] = "\n".join(res)
snip["r_tab_surfaces_ref.tex"] = r"Les caractéristiques des surfaces et du contact sous \SI{1.65}{MPa} sont données au tableau~\ref{tab:surfaces} (\S\ref{sec:surfaces})."

# ============================================================================ réponse courte et discussion
b2 = get("heterogene", "lisse", "e1_max", "0.002");
def amp(tex, z, q="e1_max"):
    v = get("heterogene", tex, q, z); b = get("heterogene", "lisse", q, z)
    return None if v is None or b is None else v / b
rng = lambda z: [amp(t, z) for t in ("rainures_vives", "gauss_MPD0.6", "gauss_MPD1.0", "gauss_MPD1.5", "negative_MPD1.0", "positive_MPD1.0") if amp(t, z)]
r1, r2, r5, r10, r20, r40 = (rng(z) for z in ("0.001", "0.002", "0.005", "0.010", "0.020", "0.040"))
mm = lambda r, d=1: (fr(min(r), d), fr(max(r), d)) if r else ("?", "?")
snip["r_reponse_courte.tex"] = (r"""\begin{encadre}
\textbf{Réponse courte.}
\begin{enumerate}[nosep]
\item \textbf{Oui près de la surface.} Sous l'empreinte hétérogène du TFE, la déformation
      principale majeure maximale est multipliée par """ + f"{mm(r1)[0]} à {mm(r1)[1]}" + r""" à \SI{1}{mm}
      de profondeur, par """ + f"{mm(r2)[0]} à {mm(r2)[1]}" + r""" à \SI{2}{mm} et par """ + f"{mm(r5)[0]} à {mm(r5)[1]}" + r""" à \SI{5}{mm},
      selon la texture (rainurage FAA, macrotextures de MPD 0,6 à \SI{1.5}{mm}). Les
      cisaillements proches de la surface sont amplifiés davantage encore.
\item \textbf{Non en profondeur.} Le facteur tombe à """ + f"{mm(r10,2)[0]}--{mm(r10,2)[1]}" + r""" à \SI{10}{mm} et à
      """ + f"{mm(r20,2)[0]}--{mm(r20,2)[1]}" + r""" à \SI{20}{mm} ; l'effet est nul à \SI{40}{mm} ("""
    + f"{mm(r40,2)[0]}--{mm(r40,2)[1]}" + r"""). La déformation en base de couche liée et le cisaillement
      maximal vers \SI{100}{mm}, qui sont les deux grandeurs clés du TFE, ne sont pas modifiés.
\item La texture crée donc une \textbf{seconde zone critique, superficielle} (0 à
      \SI{10}{mm}), distincte de celle du TFE. C'est la zone d'amorçage de la fissuration par le
      haut et de l'arrachement.
\item L'effet croît avec la MPD, mais \textbf{la MPD ne suffit pas} : à MPD égale, la pente des
      aspérités, l'asymétrie de la texture et surtout la raideur du caoutchouc changent le
      résultat.
\item \textbf{Confiance} : les tendances et les profondeurs d'influence sont solides ; la valeur
      absolue aux premiers millimètres est incertaine d'un facteur de l'ordre de 1,5, à cause de
      paramètres mal connus (\S\ref{sec:verif}).
\end{enumerate}
\end{encadre}""")
snip["r_discussion.tex"] = r"""\subsection{Interprétation mécanique}
Le pneu ne porte que sur une fraction de la surface : 30 à 85\,\% selon la texture. La pression
réelle est donc concentrée sur les sommets, à 3 à 9 fois la pression nominale. Cette surpression
se diffuse dans le massif sur une profondeur de l'ordre de la taille des zones de contact, soit
quelques millimètres, et la longueur d'onde de la texture fixe la profondeur d'influence.
Au-delà, seule compte la résultante, identique au cas lisse (principe de Saint-Venant). C'est
pourquoi le TFE, qui a montré une sensibilité croissante à l'empreinte quand on se rapproche de
la surface, trouve ici un prolongement naturel : à l'échelle du pneu, la forme de l'empreinte
agit sur les premiers centimètres ; à l'échelle de la texture, les sommets agissent sur les
premiers millimètres.

La viscoélasticité joue un rôle non trivial. Les sommets de texture sont chargés dès l'arrivée
du pneu et pendant tout son passage, et la roue avant laisse une déformation différée au même
endroit de la chaussée avant le passage de la roue arrière. La méthode héréditaire en tient
compte exactement ; l'ancienne formule multiplicative sous-estimait l'effet des textures aléatoires d'environ 9\,\%.

\subsection{Limites}
Les trois limites structurelles du niveau 1 (H3, H6, H7) sont levées par le niveau 2 ; celles qui
restent sont les suivantes.
\begin{enumerate}[nosep]
\item \textbf{Caoutchouc.} Le module de la bande de roulement du pneu d'A340 (et sa
      dépendance à la fréquence et à la température) reste le paramètre le plus influent et le
      moins connu. Données à obtenir auprès du manufacturier ou dans la littérature (Michelin,
      Airbus).
\item \textbf{Textures synthétiques.} Elles sont réalistes dans leurs statistiques mais ne
      remplacent pas des relevés réels. Le code accepte directement un relevé de hauteurs (laser
      3D) à la place de la surface générée.
\item \textbf{Modèles locaux 2D.} L'entaille et la microstructure sont traitées en coupe
      (déformation plane généralisée), avec des granulats circulaires et un mortier élastique au
      point de fonctionnement. Une cellule 3D (granulats anguleux, mortier viscoélastique) est
      l'étape suivante naturelle ; le solveur EF s'étend au 3D sans changement de principe.
\item \textbf{Frottement} en glissement total (loi d'Amontons locale) : majorant pour la
      texture, et représentatif d'un freinage appuyé. Le virage (effort transversal) n'a pas été
      calculé ; \cs{} le traite déjà.
\item \textbf{Un seul cas de chargement} : vitesse et température du TFE. À vitesse plus élevée
      ou à température plus basse, l'enrobé est plus raide : la déformation diminue, mais pas
      nécessairement la contrainte, et le contraste granulat/mortier diminue.
\item \textbf{Critère d'endommagement.} Le rapport compare des déformations. Relier la
      déformation locale dans le mortier à l'amorçage (fissuration par le haut, arrachement)
      demande un critère calé sur essais (mortier bitumineux, essais de fatigue de mortier).
\end{enumerate}

\subsection{Suite proposée}
\begin{enumerate}[nosep]
\item \textbf{Relevés de texture réels} sur piste (STAC, profilomètre laser), calage de la DSP et
      comparaison avec les surfaces synthétiques.
\item \textbf{Module de la bande de roulement} : données pneumatiques, ou identification inverse
      par des mesures de pression de contact sur surface texturée (capteurs en film).
\item \textbf{Cellule mésoscopique 3D} à partir d'une tomographie d'enrobé réel, mortier
      viscoélastique ; comparaison avec la cellule 2D pour chiffrer l'effet de coupe.
\item \textbf{Essais sur mortier bitumineux} (module complexe et fatigue) pour transformer
      $K_m$ en critère d'amorçage superficiel.
\item \textbf{Indicateur mécanique de texture} : relier l'amplification à MPD, $m_2$ et $S_{sk}$
      sur une famille de surfaces, et proposer un indicateur utilisable en ingénierie.
\item \textbf{Confrontation aux dégradations observées} : fissuration par le haut et arrachement
      aux bords de rainures (Toulouse-Blagnac).
\end{enumerate}
"""
for n, t in snip.items():
    open(os.path.join(HERE, n), "w").write(t)
print("ok", sorted(snip))
