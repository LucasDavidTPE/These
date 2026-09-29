"""Génère notice/bilan.tex (synthèse de 3 pages) à partir des résultats définitifs."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); V = os.path.join(ROOT, "validation")
J = lambda n: json.load(open(os.path.join(V, n)))
R = {}; [R.update(J(n)) for n in ("t07_resultats_het.json", "t07_resultats_rc.json", "t07_resultats_seeds.json")]
V5 = J("v05_resultats.json")
f = lambda v, d=0: (f"{v:.{d}f}").replace('.', ',')
Z = ["0.001", "0.002", "0.005", "0.010", "0.040"]
names = [("lisse", "lisse (TFE)"), ("rainures_vives", "rainures FAA"), ("gauss_MPD0.6", "MPD 0,6 mm"), ("gauss_MPD1.0", "MPD 1,0 mm"),
         ("gauss_MPD1.5", "MPD 1,5 mm"), ("negative_MPD1.0", "texture négative, MPD 1,0 mm")]
b = [R["heterogene|lisse"]["profil"][z]["e1_max"] for z in Z]
rows = []
for k, n in names:
    v = [R[f"heterogene|{k}"]["profil"][z]["e1_max"] for z in Z]
    rows.append(n + " & " + " & ".join(f(x * 1e6) if k == "lisse" else f"{f(x*1e6)} (×{f(x/y,2)})" for x, y in zip(v, b)) + r"\\")
tex = r"""\documentclass[11pt,a4paper]{article}
\usepackage[T1]{fontenc}\usepackage[utf8]{inputenc}\usepackage{mathptmx}\usepackage[french]{babel}
\usepackage[margin=2.2cm]{geometry}\usepackage{amsmath,graphicx,booktabs,xcolor,tcolorbox,enumitem,float,caption}
\usepackage[hidelinks]{hyperref}\usepackage{siunitx}\sisetup{output-decimal-marker={,}}
\definecolor{bleu}{HTML}{2a78d6}\definecolor{fond}{HTML}{f4f7fb}
\definecolor{orange}{HTML}{eb6834}\newtcolorbox{encadre}[1][]{colback=fond,colframe=bleu!60,boxrule=0.5pt,arc=2pt,#1}
\renewcommand{\epsilon}{\varepsilon}
\begin{document}\sloppy
\begin{center}{\LARGE\bfseries Bilan de travail --- version 2, 25 septembre 2026}\\[4pt]
{\large Outil semi-analytique \texttt{chausspec} et influence de la texture de surface}\\[4pt]
Lucas \textsc{David} --- LTDS / ENTPE / STAC\end{center}
\begin{encadre}
\textbf{Contenu de ce PDF.} Partie A (ces pages) : bilan. Partie B : notice de \texttt{chausspec}
(formalisme, validation V1--V5, mode d'emploi). Partie C : \textbf{rapport complet sur la
texture} (construction des surfaces, contact, couplage deux échelles, vérifications, degré de
confiance, résultats et comparaison avec le TFE, puis \textbf{niveau 2} : frottement, entaille des
rainures, granulats et mortier). Code et résultats bruts : archive \texttt{chausspec\_v0.4.zip}.
\end{encadre}
\section*{1. Ce qui a été construit}
\begin{enumerate}[nosep]
\item \textbf{\texttt{chausspec}} : calcul semi-analytique (double transformée de Fourier) d'un
multicouche élastique ou viscoélastique (2S2P1D, KVG) sous empreintes quelconques, en statique,
en harmonique (HWD) ou en charge roulante. Il reproduit le modèle COMSOL du TFE (7,4 M ddl) en
environ \SI{2}{min}.
\item \textbf{Cadre texture} : génération de surfaces (rainurage FAA, macrotextures de MPD
imposée), contact bande de roulement / texture, couplage deux échelles par une méthode
héréditaire exacte, 9 familles de vérifications indépendantes.
\item \textbf{Niveau 2 (version 2)} : frottement au freinage (calcul 3D complet, réponse locale
tangentielle vérifiée), solveur éléments finis 2D « pixel » (\texttt{chausspec/fe2d.py}) pour
l'entaille des rainures et la microstructure granulats--mortier, chargé au point critique du
calcul 3D.
\end{enumerate}
\section*{2. TFE (surface lisse)}
\begin{center}\small
\begin{tabular}{lrrrr}
\toprule
& \multicolumn{2}{c}{$\epsilon_T$ base (µdef)} & \multicolumn{2}{c}{$\epsilon_1$ surface (µdef)}\\
KVG & COMSOL & \texttt{chausspec} & COMSOL & \texttt{chausspec}\\
\midrule
rectangulaire & 331,1 & """ + f(V5["KVG_rectangulaire"]["eyy_base_max"]*1e6,1) + " & 195,3 & " + f(V5["KVG_rectangulaire"]["e1_surf_max"]*1e6,1) + r"""\\
circulaire & 318,0 & """ + f(V5["KVG_circulaire"]["eyy_base_max"]*1e6,1) + " & 181,5 & " + f(V5["KVG_circulaire"]["e1_surf_max"]*1e6,1) + r"""\\
hétérogène & 336,6 & """ + f(V5["KVG_heterogene"]["eyy_base_max"]*1e6,1) + " & 202,1 & " + f(V5["KVG_heterogene"]["e1_surf_max"]*1e6,1) + r"""\\
\bottomrule
\end{tabular}
\end{center}
\textbf{Points à reprendre avant l'article MAIREINFRA :}
\begin{itemize}[nosep]
\item $\epsilon_{xz}$ est nul en surface : les valeurs « en surface » du Tableau 13 sont des artefacts ; les maxima réels sont à 100--\SI{140}{mm}.
\item $|E^*(\SI{1}{Hz})|=\SI{14877}{MPa}$ avec les paramètres du Tableau 6, et non 11\,670.
\item Le 2S2P1D direct donne des déformations environ 6\,\% plus faibles que le KVG.
\item L'intégrale exacte de l'empreinte de l'Annexe III vaut \SI{142.1}{kN} ; l'empreinte simulée sous COMSOL est à vérifier.
\end{itemize}
\section*{3. Texture : résultats définitifs (empreinte hétérogène, KVG)}
$\epsilon_1$ maximal sous la roue arrière droite (µdef), et facteur par rapport au cas lisse :
\begin{center}\small
\begin{tabular}{lrrrrr}
\toprule
Surface & 1 mm & 2 mm & 5 mm & 10 mm & 40 mm\\
\midrule
""" + "\n".join(rows) + r"""
\bottomrule
\end{tabular}
\end{center}
Sur 5 tirages de texture par MPD, l'écart type du facteur ne dépasse pas 0,04.
\begin{figure}[H]\centering\includegraphics[width=\linewidth]{../rapport/figures/r_profils_het.pdf}\end{figure}
\textbf{À retenir (niveau 1).} La texture amplifie d'un facteur 1,5 à 2 les déformations des premiers
millimètres ; l'effet devient négligeable au-delà de 20 à \SI{40}{mm}. Les conclusions du TFE
(base de couche, cisaillement à \SI{100}{mm}) ne changent pas. La texture crée une seconde zone
critique, superficielle.
\section*{4. Niveau 2 : frottement, entaille, granulats et mortier}
@@RC@@
\begin{center}\scriptsize\setlength{\tabcolsep}{4pt}
\begin{tabular}{llr ccc ccc}\toprule
& & niveau 1 & \multicolumn{3}{c}{niveau 2} & \multicolumn{3}{c}{rapport à la surface lisse}\\
\cmidrule(lr){4-6}\cmidrule(lr){7-9}
surface & $z$ (mm) & $\mu=0$ & $\mu=0$ & $\mu=0{,}3$ & $\mu=0{,}6$ & niveau 1 & niv. 2, $\mu=0$ & niv. 2, $\mu=0{,}6$\\\midrule
@@TABS@@
\bottomrule\end{tabular}\end{center}
$\epsilon_1$ maximale (µdef) dans l'enrobé équivalent ; pour les rainures, fourchette due à la
distance critique et à l'arrondi des arêtes. Détails : partie C, section « Niveau 2 ».
\end{document}
"""
RC = open(os.path.join(ROOT, "rapport", "n2_reponse_courte.tex")).read().replace(r"(\S\ref{sec:n2_confiance})", "(partie C)")
tex = tex.replace("@@RC@@", RC).replace("@@TABS@@", open(os.path.join(ROOT, "rapport", "n2_tab_synthese.tex")).read())
open(os.path.join(ROOT, "notice", "bilan.tex"), "w").write(tex)
print("ok")
