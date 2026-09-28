# Module ChaussSpec

Portage TypeScript de **chausspec v0.4** (L. David, LTDS / ENTPE, 2026) : calcul semi-analytique
spectral de chaussées multicouches élastiques / viscoélastiques (2S2P1D, KVG, Maxwell généralisé)
sous chargements de surface quelconques, en régime statique, harmonique ou de charge roulante.

| Fichier | Porte |
|---|---|
| `core/numerique.ts` | complexes, FFT radix 2, Bessel J0/J1, Gauss-Legendre |
| `core/materiaux.ts` | `materials.py` (Élastique, 2S2P1D + WLF, KVG, Maxwell généralisé, module figé) |
| `core/structure.ts` | `structure.py` |
| `core/chargements.ts` | `loads.py` (rectangle, disque, séparable, carte de pression, roues, efforts tangentiels) |
| `core/noyau.ts` | `kernel.py`, solveur par rigidités (`StiffnessKernel`) |
| `core/spectral.ts` | `regimes.py`, `spectral.py` |
| `core/grille.ts` | `grid.py` (FFT + partition de l'unité ; sans `sym_y`, `k1_shift`, `specfun`) |
| `core/axisym.ts` | `axisym.py` |
| `core/cas.ts`, `core/resultats.ts` | `io.py` (même format JSON ; cartes incluses possibles) |

Non porté (phase suivante) : le module texture (`contact.py`, `texture.py`, `fe2d.py`).

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
