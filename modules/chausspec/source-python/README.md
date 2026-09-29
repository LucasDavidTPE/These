# chausspec

Calcul **semi-analytique spectral** de chaussées multicouches élastiques / viscoélastiques
(2S2P1D, KVG, Maxwell) sous **chargements de surface quelconques** : empreintes uniformes,
empreintes hétérogènes, cartes de pression mesurées, atterrisseurs multi-roues, efforts
tangentiels. Régimes statique, harmonique (HWD) et **charge roulante** en régime permanent.

Lucas DAVID — LTDS / ENTPE, thèse STAC — v0.4, septembre 2026.

La théorie, la validation et le mode d'emploi complet sont dans `notice/notice_chausspec.pdf`.

## Démarrage rapide

```bash
pip install numpy scipy matplotlib pytest
python -m pytest tests                      # 23 tests, environ 1 min
python exemples/tfe_a340.py                 # bogie A340 du TFE
python -m chausspec exemples/cas_tfe_rectangulaire.json   # même chose par fichier JSON
```

```python
import chausspec as cs
st = cs.Structure([cs.Layer(cs.TwoS2P1D(E00=65, E0=30000, k=0.25, h=0.787, delta=1.58,
                                        tau_ref=1.22, T_ref=9.3), 0.32),
                   cs.Layer(cs.Elastic(150), 0.6), cs.Layer(cs.Elastic(75), 1.0)],
                  bottom="halfspace")
load = cs.Loading([cs.Wheel(cs.UniformRect(1.0, 0.56, 0.40).scaled_to(370e3))])
res = cs.solve_grid(st, load, cs.Moving(0.66), depths=[0.32], comps=("eyy",),
                    L=(16, 8), N=(512, 256))
print(res.argmax("eyy", 0.32))
```

## Axes et signes

x = longitudinal (sens de roulement, la charge avance vers +x), y = transversal, z vers le bas.
Extension positive, compression négative. Déformations tensorielles (exz = γxz/2).
**Le TFE utilise x transversal** : εxx(TFE) = eyy et εxz(TFE) = eyz ici.

## Contenu

| dossier | rôle |
|---|---|
| `chausspec/` | le code (lois, structure, empreintes, noyau spectral, solveurs FFT et Hankel, E/S JSON) |
| `validation/` | V1 Love, V2 PyMastic, V3 interfaces glissantes, V4 intégrale d'hérédité, V5 modèle COMSOL du TFE |
| `tests/` | tests unitaires (pytest) |
| `exemples/` | cas du TFE en Python et en JSON, exemple de carte de pression mesurée |
| `derivation/` | dérivation SymPy de la solution générale |
| `notice/` | notice LaTeX et figures |

V2 nécessite PyMastic (`git clone https://github.com/Mostafa-Nakhaei/PyMastic`, puis variable
d'environnement `PYMASTIC` pointant sur le dossier).

## Module texture (v0.3, niveau 2 en v0.4)

`chausspec/contact.py` (surfaces rainurées et aléatoires, MPD ISO 13473-1, contact bande de
roulement / texture) et `chausspec/texture.py` (couplage deux échelles, méthode héréditaire ;
réponse locale aux efforts normaux **et tangentiels** depuis la v0.4).

Niveau 2 (v0.4) : `chausspec/fe2d.py`, éléments finis 2D « pixel » en déformation plane
généralisée (cellule périodique, vides, matériaux par pixel, déformation nominale imposée), pour
l'entaille des rainures et la microstructure granulats / mortier.

Rapport complet (version 2) : `rapport/rapport_texture.pdf`. Campagnes et vérifications :
`validation/t0*.py` (niveau 1), `t09` à `t12` (niveau 2) ; procédure de reproduction dans
l'annexe B du rapport.
