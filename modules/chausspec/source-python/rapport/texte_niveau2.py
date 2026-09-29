"""Génère n2_valeurs_macros.tex, n2_resultats.tex et n2_synthese.tex (valeurs lues dans
n2_valeurs.json, produit par figures_niveau2.py)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
N = json.load(open(os.path.join(HERE, "n2_valeurs.json")))
fr = lambda v, d=0: (f"{v:.{d}f}").replace(".", ",").replace("-", "$-$")


def sci(v):
    e = int(f"{v:.0e}".split("e")[1]); m = v / 10 ** e
    return f"${fr(m, 1)}\\times10^{{{e}}}$"


ZK = ["0.001", "0.002", "0.005", "0.010"]
F = N["frott"]
T11 = N["t11"]; T12 = N["t12"]
CONTR = sorted(T12, key=float)

# ------------------------------------------------------------------ macros (méthode)
t11a = N["t11a"]
hs = sorted(t11a, key=lambda k: -float(k.split("=")[1][:-2]))
first_z = lambda h: sorted(t11a[h], key=lambda z: float(z[:-2]))[0]
mac = {
    "NtNeufHomo": sci(N["t9"]["massif_homogene"]), "NtNeufTFE": sci(N["t9"]["structure_TFE"]),
    "NplanUn": fr(T11["mu0|r0mm"]["plan1"]), "NtroisDUn": fr(F["rainures_vives"]["0.001"][0]),
    "NonzeAgros": fr(100 * t11a[hs[0]][first_z(hs[0])], 1) + "\\,\\%",
    "NonzeAfin": fr(100 * t11a[hs[1]][first_z(hs[1])], 1) + "\\,\\%",
}
open(os.path.join(HERE, "n2_valeurs_macros.tex"), "w").write(
    "\n".join(f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in mac.items()) + "\n")

# ------------------------------------------------------------------ grandeurs dérivées
def e1(t, z, mu=0):
    return F[t][z][[0, 0.3, 0.6].index(mu)]


def k6(z, mu=0, r=0, lc="K"):
    zz = {"0.001": "1", "0.002": "2", "0.005": "5", "0.010": "10"}[z]
    return T11[f"mu{mu:g}|r{r}mm"][lc][zz]


def km(z, c, load="nom+p", q="K_max"):
    zz = {"0.001": "1", "0.002": "2", "0.005": "5", "0.010": "10"}[z]
    return T12[c][f"{load}|{q}"][zz]


conv = N["t11conv"]
ck = sorted(conv, key=lambda k: -float(k[6:]))
p_r = N["points"]["rainures_vives"]; p_g = N["points"]["gauss_MPD1.0"]

# ------------------------------------------------------------------ texte des résultats
L = []
A = L.append
A(r"\subsection{Résultats : frottement}")
A(r"""\begin{figure}[H]\centering
\includegraphics[width=\textwidth]{figures/n2_frottement.pdf}
\caption{Déformation principale majeure maximale en fonction de la profondeur, empreinte
hétérogène, pour trois niveaux de frottement (calcul 3D complet, T10). Échelle de profondeur
logarithmique.}\label{fig:n2_frott}
\end{figure}""")
lis = [e1("lisse", "0.001", mu) for mu in (0, 0.3, 0.6)]
rai = [e1("rainures_vives", "0.001", mu) for mu in (0, 0.3, 0.6)]
g10 = [e1("gauss_MPD1.0", "0.001", mu) for mu in (0, 0.3, 0.6)]
g15 = [e1("gauss_MPD1.5", "0.001", mu) for mu in (0, 0.3, 0.6)]
A(rf"""Le frottement augmente $\epsilon_1$ à toutes les profondeurs superficielles
(figure~\ref{{fig:n2_frott}}, tableau~\ref{{tab:n2_frott}}). Surface lisse, à \SI{{1}}{{mm}} :
{fr(lis[0])}, {fr(lis[1])} puis {fr(lis[2])}~µdef pour $\mu$ = 0, 0,3 et 0,6, soit
$\times${fr(lis[1]/lis[0], 2)} et $\times${fr(lis[2]/lis[0], 2)}. L'effet est \emph{{plus fort sur
les surfaces texturées}}, parce que le frottement se concentre lui aussi sur les sommets : à
\SI{{1}}{{mm}}, les rainures passent de {fr(rai[0])} à {fr(rai[2])}~µdef ($\times${fr(rai[2]/rai[0], 2)})
et la macrotexture MPD \SI{{1.5}}{{mm}} de {fr(g15[0])} à {fr(g15[2])}~µdef
($\times${fr(g15[2]/g15[0], 2)}). Le rapport texturé/lisse, qui résume l'effet de la texture,
\emph{{augmente}} donc avec le frottement : pour la MPD \SI{{1.5}}{{mm}} à \SI{{1}}{{mm}}, il passe de
{fr(g15[0]/lis[0], 2)} sans frottement à {fr(g15[2]/lis[2], 2)} avec $\mu=0{{,}}6$. En profondeur
(\SI{{10}}{{mm}} et au-delà), le frottement agit par l'échelle du pneu et de la même façon sur
toutes les surfaces ; la conclusion du niveau 1 (pas d'effet de la texture au-delà de 20 à
\SI{{40}}{{mm}}) est inchangée. Le frottement modifie en revanche les grandeurs du TFE
elles-mêmes, indépendamment de la texture : sur surface lisse, $\epsilon_1$ augmente encore de
{fr(100 * (F['lisse']['0.010'][2] / F['lisse']['0.010'][0] - 1))}\,\% à \SI{{10}}{{mm}} avec $\mu=0{{,}}6$. Le freinage
(et le virage) mériterait donc une étude propre à l'échelle du TFE.""")
A(r"""\begin{table}[H]\centering\small
\caption{$\epsilon_1$ maximale (µdef) avec frottement ; entre parenthèses, le rapport au cas sans
frottement. Deux dernières colonnes : rapport texturé/lisse sans frottement et avec $\mu=0{,}6$.}\label{tab:n2_frott}
\begin{tabular}{llrrrrr}\toprule
surface & $z$ (mm) & $\mu=0$ & $\mu=0{,}3$ & $\mu=0{,}6$ & tex./lisse, $\mu=0$ & tex./lisse, $\mu=0{,}6$\\\midrule
@@TABF@@
\bottomrule\end{tabular}\end{table}""".replace("@@TABF@@", open(os.path.join(HERE, "n2_tab_frottement.tex")).read()))

A(r"\subsection{Résultats : entaille des rainures}")
b = T11["mu0|r0mm"]; b1 = T11["mu0|r1mm"]; b3 = T11["mu0.3|r0mm"]; b6 = T11["mu0.6|r0mm"]
A(r"""\begin{figure}[H]\centering
\includegraphics[width=\textwidth]{figures/n2_rainures_cartes.pdf}
\caption{Déformation principale majeure (moyennée sur $L_c$ = 0,5 mm) dans les 15 premiers
millimètres d'un pas de rainurage, au point critique, sans frottement. La rainure est centrée ;
la pression de contact n'est appliquée que sur les plateaux.}\label{fig:n2_rain_cartes}
\end{figure}""")
A(r"""\begin{figure}[H]\centering
\includegraphics[width=\textwidth]{figures/n2_rainures_profils.pdf}
\caption{À gauche : facteur d'entaille $K_{H6}(z)$ (rapport des maxima de $\epsilon_1$ à la
profondeur $z$, avec et sans rainure, $L_c$ = 0,5 mm). À droite : convergence en maillage du
maximum global et du maximum à 1 mm, pour trois longueurs de moyenne.}\label{fig:n2_rain_prof}
\end{figure}""")
sn, sp = N["t11seul"]["seul_nom"], N["t11seul"]["seul_p"]
A(rf"""\paragraph{{Ce que montre le calcul.}} La rainure modifie fortement le champ des premiers
millimètres (figure~\ref{{fig:n2_rain_cartes}}). Deux zones se distinguent :
\begin{{itemize}}[nosep]
\item \textbf{{L'arête supérieure du plateau.}} La surpression de contact au bord (T1) et la face
      libre de la rainure s'y combinent : sous la surface, le matériau n'est plus confiné
      latéralement et s'étend vers la rainure. C'est là que se trouve le maximum global :
      {fr(b['max'])}~µdef à $z$ = {fr(b['zmax'], 2)}~mm au maillage de référence (valeur non convergée
      pour une arête parfaitement vive, voir plus bas) ($L_c$ = 0,5 mm ; {fr(b['max_Lc1'])}~µdef
      avec $L_c$ = 1 mm), contre {fr(b['planmax'])}~µdef au maximum dans la cellule plane.
\item \textbf{{Le fond et les coins inférieurs de la rainure}}, à \SI{{6.35}}{{mm}} : la
      déformation nominale, qui ne peut plus passer par la partie évidée, se concentre autour du
      fond. On y trouve {fr(b['g']['6.35'])}~µdef, contre {fr(b['f']['6.35'])} à la même profondeur
      dans la cellule plane ($K_{{H6}}$ = {fr(b['K']['6.35'], 1)}). C'est le second point chaud, un peu
      moins sollicité que l'arête pour des arêtes vives.
\end{{itemize}}
Le facteur d'entaille vaut $K_{{H6}}$ = {fr(b['K']['1'], 2)} à \SI{{1}}{{mm}},
{fr(b['K']['2'], 2)} à \SI{{2}}{{mm}} et {fr(b['K']['5'], 2)} à \SI{{5}}{{mm}}. Il vaut encore
{fr(b['K']['10'], 2)} à \SI{{10}}{{mm}}, soit \SI{{3.65}}{{mm}} sous le fond de rainure, et
{fr(b['K']['20'], 2)} à \SI{{20}}{{mm}} (figure~\ref{{fig:n2_rain_prof}}) : la profondeur d'influence
de l'entaille est fixée par la profondeur de la rainure, et non plus par la seule taille des
zones de contact. Au-delà de \SI{{5}}{{mm}}, ce facteur ne doit pas être appliqué au maximum du
calcul 3D, qui se trouve ailleurs dans l'empreinte ; il décrit l'état local sous la rainure.

\paragraph{{Décomposition.}} Sous les seules déformations nominales, la rainure donne
$K$ = {fr(sn['K1'], 2)} à \SI{{1}}{{mm}} (maximum {fr(sn['max'])}~µdef à {fr(sn['zmax'], 2)}~mm, contre
{fr(sn['planmax'])}~µdef en cellule plane) ; sous la seule pression de contact, $K$ = {fr(sp['K1'], 2)}
(maximum {fr(sp['max'])}~µdef à {fr(sp['zmax'], 2)}~mm, contre {fr(sp['planmax'])}). La
déformation nominale seule est même \emph{{soulagée}} sur le plateau à \SI{{1}}{{mm}} (la rainure
libère la compression horizontale), mais elle est concentrée au fond. C'est la pression de
contact, concentrée au bord du plateau libre, qui fait le maximum près de la surface.

\paragraph{{Arrondis et frottement.}} Des arêtes et des fonds arrondis à \SI{{1}}{{mm}} réduisent le
maximum global de {fr(b['max'])} à {fr(b1['max'])}~µdef et le facteur à \SI{{1}}{{mm}} de
{fr(b['K']['1'], 2)} à {fr(b1['K']['1'], 2)}. Le point chaud se déplace alors au fond de la
rainure ($z$ = {fr(b1['zmax'], 1)}~mm), où l'arrondi de \SI{{1}}{{mm}} ne suffit pas à faire disparaître la
concentration : {fr(b1['g']['6.35'])}~µdef à \SI{{6.35}}{{mm}}. L'arrondi des arêtes, que l'usure et le
trafic produisent naturellement, est donc bénéfique près de la surface mais ne supprime pas
l'effet. Avec frottement, $K_{{H6}}$ à \SI{{1}}{{mm}}
vaut {fr(b3['K']['1'], 2)} ($\mu=0{{,}}3$) et {fr(b6['K']['1'], 2)} ($\mu=0{{,}}6$) pour des arêtes vives ;
avec des arêtes arrondies, le maximum global atteint {fr(T11['mu0.3|r1mm']['max'])} ($\mu=0{{,}}3$) puis
{fr(T11['mu0.6|r1mm']['max'])}~µdef ($\mu=0{{,}}6$), contre {fr(b1['max'])}~µdef sans frottement.

\paragraph{{Robustesse numérique.}} L'étude de maillage (cellule de \SI{{30}}{{mm}} de profondeur,
pour tenir en mémoire au maillage le plus fin ; $h$ = {' ; '.join(k[6:].replace('.', ',') for k in ck)}~mm)
sépare deux types de grandeurs.
\begin{{itemize}}[nosep]
\item \textbf{{Stables à quelques pour cent}} : le maximum à \SI{{1}}{{mm}} ({fr(conv[ck[0]]['Lc0.5']['z1'])},
      {fr(conv[ck[1]]['Lc0.5']['z1'])} puis {fr(conv[ck[-1]]['Lc0.5']['z1'])}~µdef, soit
      $K_{{H6}}(1\,\text{{mm}})$ de {fr(conv[ck[0]]['Lc0.5']['z1'] / conv[ck[0]]['Lc0.5']['plan1'], 2)} à
      {fr(conv[ck[-1]]['Lc0.5']['z1'] / conv[ck[-1]]['Lc0.5']['plan1'], 2)}), et plus généralement tout ce qui
      est à plus d'un demi-millimètre des arêtes.
\item \textbf{{Non convergé}} : le maximum global au coin supérieur d'une arête vive
      ({fr(conv[ck[0]]['Lc0.5']['max'])}, {fr(conv[ck[1]]['Lc0.5']['max'])} puis
      {fr(conv[ck[-1]]['Lc0.5']['max'])}~µdef avec $L_c$ = 0,5 mm). Il est piloté par la surpression de
      contact à l'arête, elle-même singulière pour une arête parfaitement vive (T1). Ce maximum
      n'a pas de valeur physique : une arête réelle est toujours émoussée. On retient la variante
      arrondie, qui supprime la singularité de contact.
\end{{itemize}}

\paragraph{{Limite propre à ce calcul.}} La coupe est 2D : elle représente une rainure infiniment
longue sous une déformation hors plan imposée. C'est exact pour la géométrie (les rainures sont
continues sur la largeur de la piste) mais approché pour $\epsilon_{{yz}}$, qui n'est pas perturbé
dans la cellule ; au point critique, $\epsilon_{{yz}}$ nominal est faible
({fr(p_r['nominal']['eyz'] * 1e6, 1)}~µdef), et l'erreur induite est donc négligeable.""")

A(r"\subsection{Résultats : granulats et mortier}")
A(r"""\begin{figure}[H]\centering
\includegraphics[width=\textwidth]{figures/n2_mortier_cartes.pdf}
\caption{Déformation principale majeure dans les 15 premiers millimètres (fenêtre de 20 mm de
large, à l'échelle), sous la pression de contact de la texture MPD 1,0 mm au point critique : enrobé homogène équivalent (niveau 1) et
microstructure granulats--mortier (premier tirage) pour deux contrastes de module $c$. Contours
blancs : granulats.}\label{fig:n2_mort_cartes}
\end{figure}""")
A(r"""\begin{figure}[H]\centering
\includegraphics[width=\textwidth]{figures/n2_mortier_profils.pdf}
\caption{Facteur de concentration dans le mortier $K_m(z)$ sous la texture (à gauche) et sous une
surface lisse (au centre) : maximum (trait plein, bande = min--max sur 3 tirages) et quantile à
99\,\% (tirets). À droite : rapport $K_m^{\text{texture}}/K_m^{\text{lisse}}$ (maximum en trait
plein, quantile à 99\,\% en tirets) ; une valeur inférieure à 1 signifie que la microstructure
atténue l'écart relatif entre texture et surface lisse.}\label{fig:n2_mort_prof}
\end{figure}""")
rows = []
for c in CONTR:
    i = T12[c]["info"]
    rows.append(f"{c} & {fr(i['frac'], 2)} & {fr(i['Ehom'], 2)} & "
                + " & ".join(fr(km(z, c), 2) for z in ZK[:3]) + " & "
                + " & ".join(fr(km(z, c, 'lisse'), 2) for z in ZK[:3]) + " & "
                + " & ".join(fr(T12[c]['rk'][zz], 2) for zz in ("1", "2", "5")) + "\\\\")
A(r"""\begin{table}[H]\centering\small
\caption{Granulats et mortier (moyenne de 3 tirages, chargement étalonné). $K_m$ : rapport du
maximum de $\epsilon_1$ dans le mortier au maximum dans l'enrobé homogène équivalent, à la même
profondeur et sous le même chargement. Trois dernières colonnes : $K_m$ texture / $K_m$ lisse.}\label{tab:n2_mort}
\begin{tabular}{rrr ccc ccc ccc}\toprule
& & & \multicolumn{3}{c}{$K_m$, texture} & \multicolumn{3}{c}{$K_m$, lisse} & \multicolumn{3}{c}{rapport}\\
\cmidrule(lr){4-6}\cmidrule(lr){7-9}\cmidrule(lr){10-12}
$c$ & fraction & $E_{\text{hom}}/E_m$ & 1 mm & 2 mm & 5 mm & 1 mm & 2 mm & 5 mm & 1 mm & 2 mm & 5 mm\\\midrule
""" + "\n".join(rows) + r"""
\bottomrule\end{tabular}\end{table}""")
cL, cH = CONTR[0], CONTR[-1]
rk1 = [T12[c]["rk"]["1"] for c in CONTR]
cal = N["t12cal"]; brut = N.get("t12brut", {})
g10_0, lis_0 = e1("gauss_MPD1.0", "0.001"), e1("lisse", "0.001")
A(rf"""\paragraph{{Ce que montre le calcul.}} Dans un enrobé réel, le mortier se déforme beaucoup plus
que la moyenne : les granulats, 10 à 100 fois plus raides, ne se déforment presque pas, et la
déformation se reporte sur les films de mortier qui les séparent
(figure~\ref{{fig:n2_mort_cartes}}). Sous la texture, le facteur de concentration $K_m$ vaut
{fr(km('0.001', cL), 1)} à {fr(km('0.001', cH), 1)} à \SI{{1}}{{mm}} selon le contraste
(tableau~\ref{{tab:n2_mort}}) ; le quantile à 99\,\%, moins sensible aux films les plus minces, vaut
{fr(km('0.001', cL, q='K_p99'), 1)} à {fr(km('0.001', cH, q='K_p99'), 1)}. $K_m$ croît avec le contraste,
mais de moins en moins : au-delà de $c\approx30$, les granulats sont pratiquement indéformables.

\paragraph{{Cette concentration existe aussi sous une surface lisse, et elle y est plus forte.}} Sous
une pression uniforme, $K_m$ vaut {fr(km('0.001', cL, 'lisse'), 1)} à {fr(km('0.001', cH, 'lisse'), 1)} à \SI{{1}}{{mm}}
et reste du même ordre à \SI{{10}}{{mm}} ({fr(km('0.010', cL, 'lisse'), 1)} à {fr(km('0.010', cH, 'lisse'), 1)}).
C'est une propriété du matériau, et non de la texture : elle concerne aussi le TFE, à toutes les
profondeurs. Les lois de fatigue, calées sur des déformations moyennes d'enrobé, la contiennent
implicitement ; il ne faut pas l'ajouter une seconde fois à une vérification en déformation moyenne.

\paragraph{{Conséquence : dans le mortier, l'effet \emph{{relatif}} de la texture est atténué.}} Le rapport
$K_m^{{\text{{texture}}}}/K_m^{{\text{{lisse}}}}$ vaut {fr(min(rk1), 2)} à {fr(max(rk1), 2)} à \SI{{1}}{{mm}}
(figure~\ref{{fig:n2_mort_prof}}, à droite). Sous une surface lisse, la déformation nominale se
concentre dans tous les films de mortier ; sous la texture, le maximum est imposé par les
sommets chargés, qui s'appuient souvent sur des granulats affleurants. Dans le mortier, le rapport
texturé/lisse du niveau 1 ({fr(g10_0 / lis_0, 2)} à \SI{{1}}{{mm}} pour la MPD \SI{{1.0}}{{mm}}) devient
donc environ {fr(g10_0 / lis_0 * min(rk1), 1)} à {fr(g10_0 / lis_0 * max(rk1), 1)}. En valeur absolue, en
revanche, la déformation dans le mortier sous une texture est bien plus forte que la déformation
moyenne du niveau 1 : $\epsilon_1\approx$ {fr(g10_0 * km('0.001', cL))} à {fr(g10_0 * km('0.001', cH))}~µdef à
\SI{{1}}{{mm}} au lieu de {fr(g10_0)}. Les écarts entre tirages (bandes de la
figure~\ref{{fig:n2_mort_prof}}) sont importants sur le maximum ponctuel, qui dépend de la position d'un
film mince sous un sommet de texture, et plus faibles sur le quantile à 99\,\%.

\paragraph{{Sensibilité au chargement 2D.}} Une ligne de pression extraite de la carte de contact 3D
et prolongée indéfiniment dans la coupe (déformation plane) charge davantage que les taches de
contact réelles. La modulation a donc été étalonnée, $m_{{\text{{cal}}}}=1+\alpha(m-1)$, pour que la
cellule homogène reproduise $\epsilon_1$ du calcul 3D au point critique à \SI{{1}}{{mm}}
({fr(cal['cible_3D'] * 1e6)}~µdef ; la ligne brute donne {fr(cal['e1_2D_brut'] * 1e6)}~µdef) :
$\alpha$ = {fr(cal['alpha'], 2)}.""" + (rf""" Avec la ligne brute, $K_m$ à \SI{{1}}{{mm}} vaut
{fr(brut[cL]['K1'], 1)} à {fr(brut[cH]['K1'], 1)} : le facteur de concentration est peu sensible à la sévérité du
chargement, ce qui rend le résultat robuste à cet étalonnage.""" if brut else "") + r"""

\paragraph{Limites propres à ce calcul.} Coupe 2D (les films de mortier y sont plus continus
qu'en 3D, ce qui majore un peu $K_m$), granulats circulaires (les granulats concassés anguleux
concentrent davantage aux arêtes), mortier élastique au module du point de fonctionnement, et
interface granulat--mortier parfaite (pas de décohésion).""")

open(os.path.join(HERE, "n2_resultats.tex"), "w").write("\n\n".join(L) + "\n")

# ------------------------------------------------------------------ synthèse (utilisée par la réponse courte et la discussion)
S = {}
for t in ("lisse", "rainures_vives", "gauss_MPD1.0", "gauss_MPD1.5"):
    for z in ZK[:3]:
        v = {}
        for mu in (0, 0.3, 0.6):
            base = e1(t, z, mu)
            if t == "rainures_vives":
                kk = [k6(z, mu, 0, "K"), k6(z, mu, 0, "K_Lc1")]
                if mu == 0:
                    kk += [k6(z, 0, 1, "K"), k6(z, 0, 1, "K_Lc1")]
                base_lo, base_hi = base * min(kk), base * max(kk)
            else:
                base_lo = base_hi = base
            v[mu] = (base, base_lo, base_hi)
        S[f"{t}|{z}"] = v
json.dump(S, open(os.path.join(HERE, "n2_synthese.json"), "w"), indent=1)
rows = []
for t, name in (("lisse", "lisse (TFE)"), ("rainures_vives", "rainures FAA"), ("gauss_MPD1.0", "aléatoire MPD 1,0 mm"),
                ("gauss_MPD1.5", "aléatoire MPD 1,5 mm")):
    for z, zm in zip(ZK[:3], (1, 2, 5)):
        v = S[f"{t}|{z}"]
        cell = lambda mu: (fr(v[mu][1]) if abs(v[mu][1] - v[mu][2]) < 1 else f"{fr(v[mu][1])}--{fr(v[mu][2])}")
        l0 = S[f"lisse|{z}"]
        rat = lambda mu: (fr(v[mu][1] / l0[mu][0], 2) if abs(v[mu][1] - v[mu][2]) < 1 else
                          f"{fr(v[mu][1] / l0[mu][0], 1)}--{fr(v[mu][2] / l0[mu][0], 1)}")
        rows.append(f"{name if zm == 1 else ''} & {zm} & {fr(v[0][0])} & {cell(0)} & {cell(0.3)} & {cell(0.6)} & "
                    f"{fr(v[0][0] / l0[0][0], 2)} & {rat(0)} & {rat(0.6)}\\\\")
    rows.append("\\addlinespace")
open(os.path.join(HERE, "n2_tab_synthese.tex"), "w").write("\n".join(rows[:-1]))

# ------------------------------------------------------------------ synthèse et confiance (suite de n2_resultats.tex)
C12c = {}
pc = os.path.join(os.path.dirname(HERE), "validation", "t12_resultats_hfin.json")
if os.path.exists(pc):
    d = json.load(open(pc))["cas"]
    k = list(d)[0]
    C12c = dict(K1=d[k]["nom+p"]["1"]["K_max"], K1p=d[k]["nom+p"]["1"]["K_p99"], a1=d[k]["nom+p"]["1"]["K_max"] / d[k]["lisse"]["1"]["K_max"])
    R0 = json.load(open(os.path.join(os.path.dirname(HERE), "validation", "t12_resultats.json")))["cas"]
    k0 = [kk for kk in R0 if kk.startswith("c30|s1")][0]
    C12c.update(K1_ref=R0[k0]["nom+p"]["1"]["K_max"], K1p_ref=R0[k0]["nom+p"]["1"]["K_p99"],
                a1_ref=R0[k0]["nom+p"]["1"]["K_max"] / R0[k0]["lisse"]["1"]["K_max"])
M = []
M.append(r"\subsection{Synthèse : résultats corrigés}\label{sec:n2_synthese}")
g = lambda t, z, mu, i=0: S[f"{t}|{z}"][mu][i]
rl, rh = g("rainures_vives", "0.001", 0.3, 1), g("rainures_vives", "0.001", 0.3, 2)
M.append(rf"""Le tableau~\ref{{tab:n2_synthese}} rassemble les déformations de l'enrobé équivalent
(déformation moyenne, celle que vérifient les méthodes de dimensionnement), corrigées du
frottement (calcul 3D, T10) et, pour les rainures, de l'entaille (T11 : fourchette entre $L_c$ =
0,5 et 1 mm et, sans frottement, entre arêtes vives et arrondies). La déformation locale dans
le mortier s'en déduit en multipliant par $K_m$ (tableau~\ref{{tab:n2_mort}}).
\begin{{table}}[H]\centering\small
\caption{{$\epsilon_1$ maximale (µdef) dans l'enrobé équivalent, empreinte hétérogène du TFE.
Niveau 1 : sans frottement, surface plane. Niveau 2 : avec frottement $\mu$ et, pour les rainures,
entaille géométrique. Trois dernières colonnes : rapport à la surface lisse dans les mêmes
conditions.}}\label{{tab:n2_synthese}}
\begin{{tabular}}{{llr ccc ccc}}\toprule
& & niveau 1 & \multicolumn{{3}}{{c}}{{niveau 2}} & \multicolumn{{3}}{{c}}{{rapport à la surface lisse}}\\
\cmidrule(lr){{4-6}}\cmidrule(lr){{7-9}}
surface & $z$ (mm) & $\mu=0$ & $\mu=0$ & $\mu=0{{,}}3$ & $\mu=0{{,}}6$ & niveau 1 & niv. 2, $\mu=0$ & niv. 2, $\mu=0{{,}}6$\\\midrule
@@TABS@@
\bottomrule\end{{tabular}}\end{{table}}
Lecture :
\begin{{itemize}}[nosep]
\item \textbf{{Surface lisse (TFE).}} Le frottement seul ajoute {fr(100 * (g('lisse', '0.001', 0.3) / g('lisse', '0.001', 0) - 1))} à
      {fr(100 * (g('lisse', '0.001', 0.6) / g('lisse', '0.001', 0) - 1))}\,\% à \SI{{1}}{{mm}}.
\item \textbf{{Rainures.}} C'est la surface la plus modifiée par le niveau 2 : l'entaille et le
      frottement se cumulent. Avec $\mu=0{{,}}3$, $\epsilon_1$ à \SI{{1}}{{mm}} vaut {fr(rl)} à {fr(rh)}~µdef,
      soit {fr(rl / g('lisse', '0.001', 0.3), 1)} à {fr(rh / g('lisse', '0.001', 0.3), 1)} fois la
      surface lisse, contre {fr(g('rainures_vives', '0.001', 0) / g('lisse', '0.001', 0), 2)} au niveau 1.
      Le niveau 1 sous-estimait donc nettement la sévérité des rainures, comme il l'annonçait
      (« borne inférieure »).
\item \textbf{{Macrotextures aléatoires.}} Seul le frottement les modifie dans ce tableau (pas
      d'entaille) : le rapport à la surface lisse passe de {fr(g('gauss_MPD1.5', '0.001', 0) / g('lisse', '0.001', 0), 2)} à
      {fr(g('gauss_MPD1.5', '0.001', 0.6) / g('lisse', '0.001', 0.6), 2)} pour la MPD \SI{{1.5}}{{mm}} à \SI{{1}}{{mm}}. Dans le
      mortier, les déformations absolues sont {fr(km('0.001', CONTR[0]), 1)} à {fr(km('0.001', CONTR[-1]), 1)} fois
      plus fortes, mais l'écart relatif entre texture et surface lisse est atténué
      (tableau~\ref{{tab:n2_mort}}).
\item \textbf{{En profondeur}}, la conclusion du niveau 1 tient : à \SI{{40}}{{mm}}, les écarts entre
      surfaces restent nuls (moins de 0,3\,\%) avec ou sans frottement. À \SI{{20}}{{mm}}, ils
      atteignent 5 à 7\,\% avec $\mu=0{{,}}6$, contre 1 à 2\,\% sans frottement
      (figure~\ref{{fig:n2_frott}}).
\end{{itemize}}""")
M.append(r"\subsection{Degré de confiance du niveau 2}\label{sec:n2_confiance}")
conv_txt = ""
if C12c:
    conv_txt = (rf""" Pour la microstructure, le passage de 0,1 à \SI{{0.067}}{{mm}} (contraste 30, premier tirage)
change $K_m$ à \SI{{1}}{{mm}} de {fr(C12c['K1_ref'], 2)} à {fr(C12c['K1'], 2)} (maximum) et de
{fr(C12c['K1p_ref'], 2)} à {fr(C12c['K1p'], 2)} (quantile à 99\,\%), et le rapport
$K_m^{{\text{{texture}}}}/K_m^{{\text{{lisse}}}}$ de {fr(C12c['a1_ref'], 2)} à {fr(C12c['a1'], 2)}.""")
M.append(rf"""\begin{{encadre}}
\textbf{{Fiable.}} Le solveur EF est vérifié contre la solution fermée (T11a, moins de 1\,\% à
\SI{{1}}{{mm}}), la cellule plane reproduit le calcul 3D, et la réponse au frottement est vérifiée à
la précision machine (T9). Les \emph{{sens}} de variation sont sûrs : frottement, entaille et
microstructure augmentent tous les trois la déformation superficielle, et l'effet de la texture
reste confiné aux 10 à \SI{{20}}{{mm}} supérieurs.{conv_txt}

\textbf{{Semi-quantitatif (facteur 1,5 à 2).}} Les facteurs du niveau 2 dépendent de paramètres
que seules des mesures fixeront : la distance critique $L_c$ et l'arrondi réel des arêtes pour
les rainures ; le contraste granulat/mortier et la forme des granulats pour $K_m$ ; le coefficient
de frottement mobilisé. Les fourchettes des tableaux couvrent ces incertitudes.

\textbf{{À ne pas faire.}} Multiplier les résultats du TFE par $K_m$ pour une vérification en
fatigue classique : les lois de fatigue sont calées sur des déformations moyennes d'enrobé, qui
contiennent déjà implicitement la concentration dans le mortier. $K_m$ sert à comparer des
situations entre elles (texturé contre lisse, rainuré contre plan) et, à terme, à un critère
d'amorçage calé sur essais de mortier.
\end{{encadre}}""")
open(os.path.join(HERE, "n2_resultats.tex"), "a").write("\n\n".join(M).replace("@@TABS@@", open(os.path.join(HERE, "n2_tab_synthese.tex")).read()) + "\n")

# ------------------------------------------------------------------ réponse courte, niveau 2
b = T11["mu0|r0mm"]
RC = rf"""\begin{{encadre}}[colframe=orange!70]
\textbf{{Ce que change le niveau 2 (frottement, entaille des rainures, granulats et mortier).}}
\begin{{enumerate}}[nosep]
\item \textbf{{Les conclusions du niveau 1 tiennent}} : amplification près de la surface, effet nul
      au-delà de 20 à \SI{{40}}{{mm}}, résultats du TFE en profondeur inchangés.
\item \textbf{{Mais le niveau 1 sous-estimait la sévérité superficielle}}, surtout pour les
      rainures. L'entaille multiplie encore $\epsilon_1$ par {fr(b['K']['1'], 1)} à \SI{{1}}{{mm}}
      (arêtes vives ; {fr(T11['mu0|r1mm']['K']['1'], 1)} avec des arêtes arrondies), avec deux points chauds :
      le bord supérieur des plateaux et le fond de la rainure. Avec un freinage courant ($\mu=0{{,}}3$), une surface rainurée
      atteint {fr(g('rainures_vives', '0.001', 0.3, 1) / g('lisse', '0.001', 0.3), 1)} à
      {fr(g('rainures_vives', '0.001', 0.3, 2) / g('lisse', '0.001', 0.3), 1)} fois la déformation
      de la surface lisse à \SI{{1}}{{mm}}, contre {fr(g('rainures_vives', '0.001', 0) / g('lisse', '0.001', 0), 1)} au niveau 1.
\item \textbf{{Le frottement}} augmente $\epsilon_1$ superficielle de {fr(100 * (g('lisse', '0.001', 0.6) / g('lisse', '0.001', 0) - 1))}\,\%
      (surface lisse) à {fr(100 * (g('gauss_MPD1.5', '0.001', 0.6) / g('gauss_MPD1.5', '0.001', 0) - 1))}\,\% (MPD \SI{{1.5}}{{mm}})
      pour $\mu=0{{,}}6$ : il accentue l'effet de la texture.
\item \textbf{{Dans le mortier}} entre granulats, la déformation locale sous une texture vaut
      {fr(km('0.001', CONTR[0]), 1)} à {fr(km('0.001', CONTR[-1]), 1)} fois la déformation moyenne de l'enrobé.
      Cette concentration existe aussi, et plus forte, sous une surface lisse : c'est une propriété
      du matériau. L'écart \emph{{relatif}} entre texture et surface lisse est donc atténué dans le
      mortier (facteur {fr(min(T12[c]['rk']['1'] for c in CONTR), 2)} à {fr(max(T12[c]['rk']['1'] for c in CONTR), 2)}),
      alors que la déformation \emph{{absolue}} y est bien plus forte.
\item \textbf{{Confiance}} : les sens de variation sont sûrs ; les facteurs du niveau 2 sont
      semi-quantitatifs (facteur 1,5 à 2), car ils dépendent de paramètres à mesurer : distance
      critique, arrondi des arêtes, contraste granulat/mortier (\S\ref{{sec:n2_confiance}}).
\end{{enumerate}}
\end{{encadre}}"""
open(os.path.join(HERE, "n2_reponse_courte.tex"), "w").write(RC + "\n")
print("ok")
