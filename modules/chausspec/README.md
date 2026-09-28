# Module ChaussSpec

Portage TypeScript de **chausspec v0.4** (L. David, LTDS / ENTPE, 2026) : calcul semi-analytique
spectral de chaussées multicouches élastiques / viscoélastiques (2S2P1D, KVG, Maxwell généralisé)
sous chargements de surface quelconques, en régime statique, harmonique ou de charge roulante.

**Pas à pas, sans le code : [`docs/CHAUSSSPEC_EXPLIQUE.md`](../../docs/CHAUSSSPEC_EXPLIQUE.md)** (le modèle semi-analytique et la méthode spectrale expliqués simplement).

## Lire le code

`core/` suit le paquet Python **fichier par fichier** : mêmes classes, mêmes fonctions (en
camelCase), mêmes étapes dans le même ordre, mêmes commentaires. Pour retrouver un calcul, ouvrir
le fichier du même nom.

| TypeScript | Python | Contenu |
|---|---|---|
| `core/structure.ts` | `structure.py` | `Layer`, `Structure` (`locate`, `thicknesses`, `tops`) |
| `core/materials.ts` | `materials.py` | `Elastic`, `TwoS2P1D` (+ WLF), `GeneralizedKelvinVoigt`, `GeneralizedMaxwell`, `FrozenModulus` |
| `core/regimes.ts` | `regimes.py` | `Static`, `Harmonic`, `Moving` |
| `core/loads.ts` | `loads.py` | profils 1D, empreintes (`UniformRect`, `UniformCircle`, `Separable`, `PressureMap`), `Wheel`, `Loading` |
| `core/kernel.ts` | `kernel.py` | `psvBasis`, `shBasis`, `mm`, `inv2`, `inv4Blocks`, `StiffnessKernel` |
| `core/spectral.ts` | `spectral.py` | `layerModuli`, `componentsFromAmplitudes`, `tangentialDecomposition`, `spectralFields` |
| `core/grid.ts` | `grid.py` | `bandNodes`, `solveGrid`, `GridResult` |
| `core/axisym.ts` | `axisym.py` | `solveAxisym` |
| `core/io.ts` | `io.py` | lecture du cas JSON (`caseFromDict`…), `runCase`, CSV au format `np.savetxt` |
| `core/carray.ts` | numpy | tableaux complexes (voir ci-dessous) |
| `core/fft.ts` | `numpy.fft` | `ifft2`, `irfft2`, `fftfreq`, `rfftfreq` |
| `core/special.ts` | `scipy.special` | `j0`, `j1`, `j1x`, `sinc`, `leggauss` |

### Écriture des formules

Comme en numpy, une grandeur est un tableau de valeurs complexes, une par nombre d'onde du
paquet (`CArray`). TypeScript n'ayant pas d'opérateurs sur les tableaux, `+ - * /` s'écrivent
`.add .sub .mul .div`, dans l'ordre de la formule :

```
Python :  T = mu / mr * (dU + W)                  S = ((lam + 2 * mu) * dW - lam * U) / mr
ici    :  mu.div(mr).mul(dU.add(W))               lam.add(mu.mul(2)).mul(dW).sub(lam.mul(U)).div(mr)
```

Quand la formule commence par un nombre, les fonctions libres gardent l'ordre :
`(1.0 - tau) * e1` s'écrit `mul(sub(1, tau), e1)`. Un opérande peut être un `CArray`, un tableau
réel (`Float64Array`) ou un nombre.

Les « matrices empilées » (M, p, q) du Python sont des tableaux p × q de `CArray` (type `Mat`) :
`D = [U0, W0, Uh, Wh]` se lit comme `np.stack([U0, W0, Uh, Wh], 1)`, et `mm`, `inv2`,
`inv4Blocks` sont les `_mm`, `_inv2`, `_inv4_blocks` du Python. `at(K, i, j)` est `K[:, i, j]`.

Autres petites différences d'écriture, signalées en commentaire là où elles se trouvent :

- une clé de champ `(comp, z)` s'écrit `fieldKey(comp, z)`, soit « comp@z » ;
- les tableaux 2D (grilles, champs) sont rangés ligne par ligne (ligne j = y[j]) ;
- `spectralFields` reçoit les deux axes de la grille de nombres d'onde au lieu de `np.meshgrid` ;
  les empreintes ont une méthode `ftGrid` pour cette grille (le Python la reconnaît dans `ft`) ;
- dans `solveGrid`, la troisième partie multiplie par `E2` une seule fois après la somme des
  paquets au lieu de le faire à chaque paquet (même résultat, beaucoup moins de calcul sans le
  produit matriciel optimisé de numpy) ;
- `carray.ts` prend les tableaux temporaires d'un paquet dans une réserve réutilisée
  (`scratch`) : sans elle, le calcul est environ deux fois plus lent dans l'application (Chromium).
  C'est invisible dans les formules ;
- l'écart assumé ci-dessous (effort tangentiel + interface glissante).

Non porté : `DenseKernel` (vérification en Python), `MovingEnvelope`, `sym_y`, `k1_shift`,
`specfun`, les tracés matplotlib, et le module texture (`contact.py`, `texture.py`, `fe2d.py`,
phase suivante).

## Conformité

`tests/reference/*.json` est produit par le code Python d'origine (numpy, scipy), jamais par
l'application : noyau (6 structures, fonds et interfaces, charges normale et tangentielle,
à 1e-9), lois, transformées, six grilles (statique, roulant 2S2P1D, harmonique KVG,
tangentiel, carte, De Beer filtrée) et axisymétrique. Pour régénérer (outil de développement,
non livré) : dans le dossier `chausspec` du zip v0.4, avec numpy et scipy,
`python tests/reference/generer/ref_noyau.py noyau.json` et `… ref_grille.py calculs.json`.

## Écart assumé avec le Python

Effort tangentiel + interface glissante : rien ne retient horizontalement les couches au-dessus
de l'interface, le problème est mal posé. Le Python renvoie des NaN (0/0 dans la résolution SH
aux petits nombres d'onde) ; le module refuse le calcul avec un message.
