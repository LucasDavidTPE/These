# ChaussSpec expliqué simplement

Notice pour comprendre **ce que calcule ChaussSpec et pourquoi ça marche**, sans avoir à lire
le code. Les noms entre `code` renvoient aux fichiers de `modules/chausspec/core/`.

---

## 1. Le problème

Une chaussée est un **empilement de couches** (béton bitumineux, grave, sol…) posé sur un massif
que l'on suppose infini vers le bas. Une roue appuie en surface. On veut savoir, **en tout point
et à toute profondeur** : les déplacements (la flèche `uz`), les déformations (`exx`, `ezz`…)
et les contraintes (`sxx`, `szz`…).

Les couches sont **infinies horizontalement** : on peut donc utiliser cette symétrie. C'est
toute l'astuce.

## 2. L'idée en une phrase

> On décompose la charge en **ondes** (transformée de Fourier en x et y). Pour **une** onde,
> le problème 3D devient un problème **1D en profondeur**, qui se résout **à la main**
> (des exponentielles). On fait ça pour beaucoup d'ondes, puis on **recompose**.

« Semi-analytique » veut dire exactement ça : **analytique en profondeur** (formules
exactes, pas de maillage vertical) et **numérique dans le plan** (on somme des ondes).
C'est pour cela que c'est bien plus rapide et précis qu'un calcul aux éléments finis 3D.

```
 charge p(x, y)                                     champs u, ε, σ (x, y, z)
      │                                                     ▲
      │ 1. transformée de Fourier 2D                        │ 4. transformée inverse
      ▼                                                     │    (FFT + intégrale)
 p̂(k1, k2)  ──►  2. pour chaque onde :  ◄── matériaux ──►  champs̃(k1, k2, z)
                    résolution en z      (λ, μ selon ω)     3. multiplier par p̂
```

## 3. Les étapes, une par une

### 3.1 Transformer la charge (`loads.ts`)

Une charge de surface (rectangle uniforme, cercle, carte de pression, roue avec effort
tangentiel…) est remplacée par son spectre `p̂(k1, k2)` : « combien de chaque onde
`exp(i(k1·x + k2·y))` faut-il pour refaire la charge ». Les formes simples ont un spectre
connu exactement (un cercle donne du `J1`, un rectangle des sinus cardinaux) ; une carte de
pression est transformée numériquement.

Le nombre d'onde `ξ = √(k1² + k2²)` est l'inverse d'une longueur : grand `ξ` = détails fins et
faible profondeur, petit `ξ` = grandes longueurs d'onde qui vont chercher loin.

### 3.2 Résoudre en profondeur pour une onde (`kernel.ts`)

Dans chaque couche (élastique, isotrope), les équations de l'élasticité, une fois transformées,
n'ont plus que la profondeur `z` comme variable. Leur solution est une combinaison de
**quatre exponentielles** (deux qui décroissent en descendant, deux en montant), pour le
mouvement « dans le plan de l'onde » (appelé **P-SV**, comme en sismologie) :

```
famille descendante :  W = (A + B·τ)·e^(−τ)        τ = ξ·s   (s = profondeur dans la couche)
famille montante    :  W = (C + D·t)·e^(−t)        t = ξ·(h − s)
```

plus **deux** constantes pour le mouvement horizontal perpendiculaire à l'onde (**SH**), qui ne
sert que s'il y a un effort tangentiel. Le massif semi-infini n'a que les deux familles qui
décroissent (rien ne remonte de l'infini).

Toutes les exponentielles sont **décroissantes** : les nombres restent raisonnables même pour
de très grands `ξ·h`. C'est ce qui rend le calcul stable (un choix numérique important).

Il reste à trouver les constantes A, B, C, D de chaque couche. On les obtient en écrivant :

| Où | Condition |
|---|---|
| Surface (z = 0) | contrainte verticale `σzz = −p̂` (et cisaillements = −effort tangentiel) |
| Interface **collée** | déplacements et contraintes identiques des deux côtés |
| Interface **glissante** | contrainte verticale continue, cisaillement nul, glissement libre |
| Fond du massif | seulement les solutions qui décroissent |

Ça donne un petit système linéaire (4 inconnues par couche) **pour chaque `ξ`**. La classe
`StiffnessKernel` le résout couche par couche avec de petites matrices (`inv2`, `inv4Blocks`)
et fournit, à n'importe quelle profondeur, les amplitudes `U, W, dU, dW` (`atDepth`). C'est le
« **noyau** » : il ne dépend **que** de la structure et des modules, pas de la charge.

### 3.3 Fabriquer les champs (`spectral.ts`)

`componentsFromAmplitudes` multiplie le noyau par le spectre de la charge puis applique de
simples formules de dérivation pour obtenir chaque composante. Par exemple `ezz = dW / μ_ref` et
`sxx = λ·tr(ε) + 2μ·exx`. Les angles `c1 = k1/ξ`, `c2 = k2/ξ` servent à repasser de la base
« dans le plan de l'onde / perpendiculaire » aux axes x, y.

`spectralFields` est la fonction qui enchaîne tout ça pour un paquet de nombres d'onde.

### 3.4 La viscoélasticité : le régime (`regimes.ts`, `materials.ts`)

Pour un matériau viscoélastique (2S2P1D, Kelvin-Voigt généralisé, Maxwell généralisé), on
utilise le **principe de correspondance** : on résout comme en élasticité, mais avec des
modules **complexes** `E*(ω)` (donc `λ`, `μ` complexes) qui dépendent de la pulsation `ω`.
C'est la même chose que ton essai de module complexe, mais au sein de la chaussée.

Il reste à dire quelle pulsation « voit » le matériau pour chaque onde. C'est le rôle du
**régime** :

| Régime | Situation | Pulsation utilisée |
|---|---|---|
| `Static` | charge posée, temps long | `ω = 0` (module statique, E₀₀ pour un 2S2P1D) |
| `Harmonic(f)` | charge qui pulse (HWD) | `ω = 2πf`, résultats **complexes** (amplitude + déphasage) |
| `Moving(V)` | roue qui roule à vitesse V | `ω = −k1·V` |

Le dernier cas est le plus parlant : une onde de longueur `λ = 2π/k1` passe devant un point de
la chaussée en un temps `λ/V`, il la « voit » donc à la fréquence `k1·V/2π`. Une roue
rapide sollicite le matériau à haute fréquence (bitume plus raide), une roue lente à basse
fréquence (bitume plus mou et déformations plus grandes). Et comme chaque onde a sa propre
pulsation, **le matériau a un module différent pour chaque onde** : c'est pourquoi on garde des
tableaux de complexes (`CArray`, dans `carray.ts`) au lieu de simples nombres.

À noter : c'est un régime **quasi-stationnaire** (l'inertie est négligée, pas d'ondes qui se
propagent dans le sol), ce qui est très raisonnable aux vitesses de circulation.

### 3.5 Revenir dans l'espace (`grid.ts`, `fft.ts`)

Il faut maintenant sommer toutes les ondes pour retrouver les champs en (x, y). Deux difficultés
et leur remède :

1. **La FFT suppose un domaine périodique** (taille `L`, `N` points) : elle « répète » la charge
   tous les `L` mètres. Les petites longueurs d'onde ne posent pas de souci, mais les grandes
   (petits `k`) ressentent les charges voisines fictives ; la flèche absolue est fausse.
2. **Petits `k` et matériaux à temps de relaxation longs** : le noyau varie très vite près de
   `k = 0`, la FFT n'a pas assez de points là.

Remède (`solveGrid`, appelé « partition de l'unité ») : on découpe le spectre en deux,
`F = (1 − φ)·F + φ·F`, avec `φ(k)` une gaussienne qui vaut 1 près de `k = 0` et 0 loin :

- `(1 − φ)·F` (les ondes courtes) est sommé par **FFT** (rapide) ;
- `φ·F` (les ondes longues) est **intégré continûment** en `k`, avec des points très serrés
  près de 0 (`bandNodes`, quadrature de Gauss-Legendre) et des phases exactes : ce n'est plus
  périodique.

La somme donne des champs corrects, sans effet de bord et sans erreur sur la flèche. Le
réglage `band` (défaut 2) fixe la largeur de la gaussienne.

Le cas `k = 0` exact est exclu (division par ξ) : il est traité par une moyenne de cellule.

### 3.6 Cas de révolution (`axisym.ts`)

Pour une charge **circulaire uniforme** sur une structure, tout est symétrique : la transformée
de Fourier 2D devient une **transformée de Hankel** (fonctions de Bessel `J0`, `J1`, dans
`special.ts`), une intégrale 1D. C'est très rapide et sert aussi de référence pour vérifier le
calcul 2D.

## 4. Comment lire le code sans s'y perdre

Ordre conseillé (du plus simple au plus technique) :

1. `structure.ts`, `regimes.ts` : de petites classes, lisibles d'un coup d'œil ;
2. `materials.ts` : lois de comportement (`lame(omega)` renvoie `λ` et `μ`) ;
3. `loads.ts` : les charges et leur spectre ;
4. `spectral.ts` : le montage (`spectralFields`), avec les formules en commentaire ;
5. `kernel.ts` : le cœur mathématique (long, mais son en-tête donne toutes les notations) ;
6. `grid.ts` : la recomposition (FFT + partition de l'unité).

Notations utiles : `ξ` = |k| ; `κ = 3 − 4ν` ; `U, W` = amplitudes horizontale (dans le plan de
l'onde) et verticale ; `V` = horizontale perpendiculaire (SH) ; `mu_ref` = un module de
référence qui met les inconnues à l'échelle.

Pour la traduction du Python (qui a servi de référence), voir `modules/chausspec/README.md` : les
formules numpy y sont recopiées à l'identique, `.add .mul` remplaçant les opérateurs.

## 5. Comment on sait que c'est juste

Le code n'est pas seulement testé « à peu près ». `tests/reference/*.json` contient des résultats
produits par le **code Python d'origine** (numpy, scipy) : le noyau (6 structures, charges
normale et tangentielle) est comparé à **1e-9** près, ainsi que les lois de comportement, les
transformées, six grilles complètes (statique, roulant 2S2P1D, harmonique KVG, tangentiel,
carte de pression, filtre De Beer) et le cas de révolution. Ces tests ne sont jamais assouplis.

## 6. Limites (ce que le modèle ne fait pas)

- Couches **horizontales, infinies**, chacune **homogène** et isotrope ; pas de fissure, pas
  de bord, pas de gradient de température à l'intérieur d'une couche.
- Comportement **linéaire** : pas de non-linéarité du sol ni de plasticité (donc pas d'orniérage).
- **Quasi-statique** : pas d'inertie, pas de propagation d'ondes dans le sol.
- Effort tangentiel avec une interface glissante : problème mal posé, le calcul est refusé.

## 7. En pratique dans l'application

Dans l'onglet ChaussSpec : on décrit la structure (couches, matériaux, interfaces collées ou
glissantes), le **régime** (statique, harmonique, roulant), la **charge**, les **profondeurs** et
composantes voulues, la taille et la finesse de la grille (`L`, `N`), puis on lance. Une grille
plus grande (`L`) ou plus fine (`N`) donne plus de détails mais plus de temps de calcul.
Pour un cas de référence, comparer avec `solveAxisym` (cercle, statique).
