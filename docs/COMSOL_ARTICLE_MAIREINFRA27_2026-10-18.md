# Mise à jour de l'application thèse : calculs COMSOL de l'article MAIRE INFRA27 (état au 18/10/2026)

Document de passation destiné à l'agent qui maintient l'application thèse de Lucas David (doctorant LTDS/ENTPE, partenariat STAC).
Il décrit **exactement** ce qui a été calculé, où sont les fichiers, comment ils sont nommés et lus, quelles valeurs en sortent, et ce qui a été vérifié.
Objectif : que l'application puisse **ingérer, indexer et comparer** tous ces résultats sans retravail manuel.

Règle générale : rien dans ce document n'est une hypothèse non signalée. Les points non vérifiés sont marqués **[non vérifié]**.

---

## 0. Résumé en 10 lignes

- Modèle : `tfeversion3.mph` (COMSOL 6.4.0.293), chaussée souple PEP de Toulouse-Blagnac sous atterrisseur principal A340 (2 roues modélisées, 370 kN/roue, 0,66 m/s).
- Variables comparées : **3 empreintes** (`lc` = 1 rect, 2 cercle, 3 hétérogène) × **2 lois** (`VE` = 0 élastique, 1 viscoélastique) × **maillages** (`mlev` −2…3, `mesh1`).
- Élastique (EL) : stationnaire, bogie figé à t = 10 s, E_eq = 14 700 MPa (vérifié dans les exports par la loi de Hooke).
- Viscoélastique (VE) : temporel 0 → 20 s, KVG 9 branches (approximation du 2S2P1D), mesh1 (production) + mlev −1 et 0 (convergence).
- Balayage du module élastique E_eq (8 valeurs de 4 000 à 18 000 MPa) × 3 empreintes sur mesh1 → module équivalent par critère.
- Contrôles faits : charge appliquée (0,3 %), charge retrouvée (0,4 %), pas de temps (< 0,1 %), convergence élastique 6 niveaux, stabilité du rapport VE/EL.
- Exports : `C:\Users\DAVID\OneDrive - entpe.fr\Thèse\En cours\article_v2\article_v2\` (≈ 1,5 Go, ~430 fichiers texte COMSOL).
- Traitement : pipeline Python `build_article.py` → 922 valeurs nommées (`values.tex`) + `rapport_valeurs.md` + figures.
- Résultat principal : l'empreinte change peu les critères de dimensionnement (≤ 8,5 %) mais beaucoup le cisaillement près de la surface (+70 %) ; la viscoélasticité augmente εxx en base de +87 % ; l'élastique à 14 700 MPa sous-estime la mesure PEP de 48 %.

---

## 1. Le modèle

### 1.1 Géométrie, couches, conditions aux limites

| Élément | Valeur |
|---|---|
| Domaine | 8 × 16 × 4,92 m (symétrie : 2 roues sur 4) |
| Repère | **x transversal**, **y longitudinal** (sens de déplacement), z vertical (0 = surface, négatif vers le bas) |
| BB (béton bitumineux) | 8 cm, z ∈ [−0,08 ; 0] |
| GB (grave-bitume) | 24 cm, z ∈ [−0,32 ; −0,08] — BB et GB = une seule couche bitumineuse |
| GRH (grave non traitée) | 60 cm, 150 MPa |
| SG1 / SG2 (sol support) | 75 / 150 MPa |
| Substratum | 30 000 MPa |
| ν | 0,35 partout |
| Interfaces | collées |
| CL | faces latérales u = v = 0 ; fond w = 0 ; pas d'inertie |

### 1.2 Charge

| Élément | Valeur |
|---|---|
| Atterrisseur | A340 principal, 4 roues (1,40 m transversal × 1,98 m longitudinal), 370 kN/roue |
| Roues modélisées | R1 et R2 (même file), entraxe d_y = 1,98 m |
| Vitesse | v = 0,66 m/s (2,38 km/h) |
| Position | R1 en y = 6,60 m à t = 10 s ; R2 en y ≈ 4,62 m ; axe du pneu x_w = 0,7 m |
| Jauge (PEP) | (x, y, z) = (0,7 ; 5,61 ; −0,3195) — base de la GB |
| Charge appliquée | `FperArea = {tau_x, tau_y, −P_tot}` ; **seule la composante verticale est active** (mod_f = 0 ⇒ tau = 0) |
| En stationnaire | bogie figé à t_st = 10 s (groupe de variables `var_pos_st`) |
| En temporel | position = f(t) (groupe `var_pos_tr`) |

Attention : les cas VE portent `k_x = 0.6` dans leur en-tête, mais avec `mod_f = 0` l'effort tangentiel est nul. **k_x n'a aucun effet dans les calculs de l'article.**

### 1.3 Empreintes (paramètre `lc`)

| lc | Nom (code) | Description | Charge intégrée (1 roue) |
|---|---|---|---|
| 1 | `rect` | rectangle lx 0,40 × Ly 0,56 m, p0 = 1,65 MPa uniforme | 370 kN |
| 2 | `circ` | disque R_eq = 0,267 m, p0 = 1,65 MPa | 370 kN |
| 3 | `het` | hétérogène en « M » : 3 gaussiennes transversales × demi-ellipse longitudinale (K_charge = 2,621), pmax 3,46 MPa | **372,47 kN** (analytique) |

L'empreinte `het` applique 372,47 kN dans COMSOL ; le post-traitement **normalise ses résultats par 370/372,47 = 0,9934** (clé `fp@norm`). L'application doit appliquer ou afficher cette normalisation de façon explicite.

### 1.4 Matériau des enrobés

| Loi | Paramètre COMSOL | Description |
|---|---|---|
| Élastique | `VE = 0` | E_eq = 14 700 MPa (règle de Perret, f = 0,45·V = 1,07 Hz ; proche de la valeur KVG à cette fréquence). Le sous-nœud viscoélastique `solid/lemm2/vise1` est **désactivé** dans les études stationnaires. |
| Viscoélastique | `VE = 1` | Kelvin-Voigt généralisé 9 branches, E_g = 30 000 MPa, calé sur le 2S2P1D (E00 = 65, E0 = 30 000 MPa, k = 0,25, h = 0,787, δ = 1,58, τ(9,3 °C) = 1,22 s, β = ∞). Le KVG est 7 à 13 % plus souple que le 2S2P1D entre 0,03 et 0,3 Hz. |

### 1.5 Maillages

| Niveau | Maillage COMSOL | Densité en plan (éléments/m) | Éléments | DDL (EL) |
|---|---|---|---|---|
| mlev −2 | mesh2, `mlev=-2` | 7,9 | à compléter | à compléter |
| mlev −1 | mesh2, `mlev=-1` | 11,2 | à compléter | à compléter |
| mlev 0 | mesh2, `mlev=0` | 15,7 | 38 280 | à compléter |
| **mesh1** (production) | mesh1 | 22,5 | 77 672 | 985 839 |
| mlev 1 | mesh2, `mlev=1` | 22,5 | supposé identique à mesh1 **[non vérifié]** | — |
| mlev 2 | mesh2, `mlev=2` | 31,8 | 159 936 | à compléter |
| mlev 3 (référence fine) | mesh2, `mlev=3` | 44,9 | 348 726 | 4 337 832 |

Rapport ≈ √2 entre niveaux en plan (doublement du nombre d'éléments). Coûts dans `couts_calcul.csv` (voir § 6).

---

## 2. Les études COMSOL (inventaire au 18/10, relevé par le bloc C1d)

| Tag | Libellé COMSOL | Type | Maillage | Cas (lc / VE / mod_f) | Statut | Utilisée pour |
|---|---|---|---|---|---|---|
| `std_ve5` | 2 - Viscoelastique (mesh1) : het. et rect., sans / avec effort transversal | temporel | mesh1 | lc 3,3,1,1 ; VE 1 ; mod_f 0,1,0,1 | calculée | **VE production** het et rect (mod_f = 0) ; référence du pas de temps (mod_f = 1) |
| `std_ve5dt` | 2b - VE mesh1, het AVEC effort transversal, pas 0,025 s | temporel, pas fixe | mesh1 | lc 3, mod_f 1 | calculée | contrôle du pas de temps |
| `std_ve_circ` | 4 - Viscoélastique mesh1 : cercle | temporel | mesh1 | lc 2 | calculée | **VE production** cercle |
| `std_el_m1` | 3 - Élastique mesh1 | stationnaire | mesh1 | lc 1,2,3 ; VE 0 | calculée | **EL production** |
| `std_el_m3` | 2 - Élastique mlev 3 | stationnaire paramétrique | mesh2 (mlev 3) | lc 1,2,3 | calculée | **EL fin** (référence de convergence, base de VE*) |
| `std_el_m2` | 5 - Élastique mlev 2 | stationnaire | mesh2 (mlev 2) | lc 1,2,3 | calculée | convergence EL |
| `std_el_cm2` | 1a - Élastique mlev −2 | stationnaire | mesh2 (mlev −2) | lc 1,2,3 | calculée | convergence EL |
| `std_el_cm1` | 1b - Élastique mlev −1 | stationnaire | mesh2 (mlev −1) | lc 1,2,3 | calculée | convergence EL |
| `std_el_c0` | 1c - Élastique mlev 0 | stationnaire | mesh2 (mlev 0) | lc 1,2,3 | calculée | convergence EL |
| `std_el_c1` | 1d - Élastique mlev 1 | stationnaire | mesh2 (mlev 1) | lc 1,2,3 | calculée | non utilisée (doublon probable de `std_el_m1`) |
| `std_ve_cm1` | 1f - Viscoélastique mlev −1 | temporel | mesh2 (mlev −1) | lc 1,2,3 | calculée | convergence VE |
| `std_ve_c0` | 1g - Viscoélastique mlev 0 | temporel | mesh2 (mlev 0) | lc 1,2,3 | calculée | convergence VE |
| `std_ve_cm2` | 1e - Viscoélastique mlev −2 | temporel | mesh2 (mlev −2) | lc 1,2,3 | **non calculée** (aucune solution trouvée) | — |
| `std_ve_cm2_2` | Etude 2 | — | — | — | vide | — (déchet) |
| `std_ve_m2_het`, `_2`, `_3`, `std_ve_m2_rect`, `std_ve_m2_circ` | 6, 6b, 6c, 7b, 8b - Viscoélastique mlev 2 | temporel | mesh2 (mlev 2) | — | **échec mémoire** (direct puis GMG) | seulement la mention « VE mlev 2 hors mémoire » |
| `std_balE` | EL balayage Eeq mesh1 | stationnaire, balayage auxiliaire | mesh1 | E_eq ∈ {4000, 5000, 6000, 7500, 9000, 11000, 14700, 18000} × lc 1,2,3 ; VE 0 | calculée le 18/10 (13 min) | **module équivalent** |

Note sur `std_balE` : créée par script ; son premier calcul a échoué car elle n'héritait pas des réglages « Modifier les physiques et variables » des études EL. Corrigé en recopiant ceux de `std_el_m1` : `useadvanceddisable = on`, `disabledphysics = solid/lemm2/vise1`, `disabledvariables = var_pos_tr`.

### 2.1 Correspondance jeux de données → cas (sélections utilisées pour les exports)

| Famille | Empreinte | Dataset | Sélection |
|---|---|---|---|
| EL (mesh1) | rect / circ / het | `dset13` | `solnum` 1 / 2 / 3 |
| EL-fin (mlev 3) | rect / circ / het | `dset11` | `solnum` 1 / 2 / 3 |
| EL mlev 2 | rect / circ / het | `dset14` | `solnum` 1 / 2 / 3 |
| EL mlev 0 | — | `dset25` | `solnum` 1 / 2 / 3 |
| EL mlev −1 | — | `dset23` | `solnum` 1 / 2 / 3 |
| EL mlev −2 | — | `dset21` | `solnum` 1 / 2 / 3 |
| VE mesh1 | rect | `dset3` | `looplevel` (61, 3) — t = 10 s = pas de sortie 61 |
| VE mesh1 | circ | `dset18` | `looplevel` (23, 1) |
| VE mesh1 | het | `dset3` | `looplevel` (61, 1) |
| VE mesh1, het, mod_f = 1 (réf. pas de temps) | het | `dset3` | `looplevel` (61, 2) |
| VE dt = 0,025 s | het | `dset9` | `looplevel` (37, 1) |
| VE mlev −1 | rect / circ / het | `dset31` | `looplevel` (23, k), k = 1 / 2 / 3 |
| VE mlev 0 | rect / circ / het | `dset33` | `looplevel` (23, k) |
| Balayage E_eq | 24 cas | `dset35` | `solnum` 1…24 (E et lc lus dans l'export) |

Chaque sélection a été **validée automatiquement** à l'export : on exporte `lc`, `mod_f` (et `t` en temporel) au point (0,7 ; 6,6 ; −0,1) et on refuse le cas si lc ≠ empreinte attendue, mod_f ≠ 0 ou t ≠ 10 s. Les choix retenus sont dans les `journal_bloc*.txt`.

---

## 3. Les exports

### 3.1 Emplacement

```
C:\Users\DAVID\OneDrive - entpe.fr\Thèse\En cours\article_v2\article_v2\
├── *.txt                 # 99 fichiers « article » (cartes, coupes, profils, signaux) — blocs F/B
├── convergence\          # 108 fichiers — convergence élastique (blocs B, B2)
├── convergence_VE\       # 54 fichiers — convergence viscoélastique (bloc A)
├── balayage_Eeq\         # 72 fichiers — balayage du module (bloc C2)
├── pas_de_temps\         # 4 fichiers — contrôle du pas de temps (bloc G)
└── journal_bloc*.txt     # journaux de chaque bloc (A, B, B2, C1, C1d, C1r, C2, D, F, G)
```

Copie de travail identique sur le poste COMSOL (ltds-aa04531) : `Desktop\export_article\article_v2\`.

### 3.2 Format de fichier (commun à tous)

Export « Data » COMSOL sur grille régulière, texte, en-tête `%`, pleine précision.

```
% Model:              tfeversion3.mph
% Version:            COMSOL 6.4.0.293
% Date:               Oct 18 2026, 15:26
% ...
% X   Y   Z   1e6*solid.eXX (1) @ 61: Temps=10 s, lc=3, VE=1, mod_f=0, s_f=0, k_x=0.6   1e6*solid.eYY (1) @ ...
0.3  6.6  -0.32  <11 valeurs>
```

- **Colonnes** : `X Y Z` (m) puis 11 expressions, dans cet ordre :

| # | Expression | Unité dans le fichier | Clé courte |
|---|---|---|---|
| 1 | `1e6*solid.eXX` | µε | exx |
| 2 | `1e6*solid.eYY` | µε | eyy |
| 3 | `1e6*solid.eZZ` | µε | ezz |
| 4 | `1e6*solid.eXZ` | µε (tenseur, pas γ) | exz |
| 5 | `1e6*solid.eYZ` | µε | eyz |
| 6 | `1e6*solid.eXY` | µε | exy |
| 7 | `1e6*solid.ep1` | µε (déformation principale max) | e1 |
| 8 | `1e6*solid.ep3` | µε (déformation principale min) | e3 |
| 9 | `1e-6*solid.sxx` | MPa | sxx |
| 10 | `1e-6*solid.szz` | MPa | szz |
| 11 | `1e3*w` | mm | w |

- **Stationnaire / instant unique** : une colonne par expression ; l'en-tête porte les paramètres du cas (`@ 3: k_x=0, lc=3, VE=0, ...` en EL, `@ 61: Temps=10 s, lc=..., VE=1, ...` en VE).
- **Signaux temporels** (`signal_*`) : **une seule ligne de données** (un point), et 11 × N_t colonnes ; chaque colonne porte son instant `@ k: Temps=… s`. Attention : l'en-tête écrit **`Temps=`** (COMSOL en français), pas `t=`.
- Compression : fichiers texte, 0,1 à 30 Mo chacun ; total ≈ 1,5 Go.
- Lecture recommandée : `numpy.loadtxt(f, comments='%')` pour les données ; parser la ligne d'en-tête commençant par `% X` pour les paramètres.

### 3.3 Nomenclature et grilles

**Fichiers « article » (racine)** — motif `<coupe>_<famille>_<empreinte>.txt`, famille ∈ {`EL`, `EL-fin`, `VE`}, empreinte ∈ {`rect`, `circ`, `het`} :

| Coupe | Grille x | Grille y | Grille z | Contenu |
|---|---|---|---|---|
| `planXY_surface` | 0 → 1,4 pas 0,02 | 3,9 → 7,3 pas 0,02 | −0,001 | carte en surface (2 roues) |
| `planXY_baseGB` | idem | idem | −0,3195 | carte en base de GB |
| `planXY_sommetSG` | idem | idem | −0,921 | carte au sommet du sol support |
| `coupeXZ_R1` | 0 → 1,4 pas 0,01 | 6,6 | −0,32 → −0,025 pas 0,005 puis −0,0225 → 0 pas 0,0025 | coupe transversale sous R1 |
| `coupeYZ_axe` | 0,7 | 5,9 → 7,3 pas 0,01 | −0,32 → 0 pas 0,005 | coupe longitudinale dans l'axe |
| `profilV_axeR1` | 0,7 | 6,6 | −0,32 → 0 pas 0,002 | verticale sous R1 |
| `profilV_jauge` | 0,7 | 5,61 | −0,32 → 0 pas 0,002 | verticale à la jauge |
| `profilT_baseGB` | 0 → 1,4 pas 0,005 | 6,6 | −0,3195 | transversale en base |
| `profilL_baseGB` | 0,7 | 3,9 → 7,3 pas 0,005 | −0,3195 | longitudinale en base |
| `signal_jauge_baseGB_VE_<emp>` | 0,7 | 5,61 | −0,3195 | signal temporel 0 → 20 s (VE seulement) |

**`convergence\`** (élastique) — motif `<ligne>_<niveau>_<empreinte>.txt`, niveau ∈ {`mlev-2`, `mlev-1`, `mlev0`, `mesh1`, `mlev2`, `mlev3`} :

| Ligne | Grille | Usage |
|---|---|---|
| `convT_baseGB` | x 0 → 1,4 pas 0,005 ; y 6,6 ; z −0,3195 | max εxx en base |
| `convL_baseGB` | x 0,7 ; y 3,9 → 7,3 pas 0,005 ; z −0,3195 | idem, sens longitudinal |
| `convT_surface` | x 0 → 1,4 pas 0,005 ; y 6,6 ; z −0,001 | e1 en surface |
| `convV_axeR1` | x 0,7 ; y 6,6 ; z −0,32 → 0 pas 0,002 | profil vertical |
| `convXZ_R1` | x 0,3 → 1,1 pas 0,005 ; y 6,6 ; z = grille XZ | εxz max et 0–20 mm |
| `convS_R1` | x 0,3 → 1,1 pas 0,01 ; y 6,1 → 7,1 pas 0,01 ; z −0,001 | carte de surface sous R1 |

6 lignes × 6 niveaux × 3 empreintes = 108 fichiers.

**`convergence_VE\`** — mêmes 6 lignes, niveaux {`mlev-1`, `mlev0`, `mesh1`} × 3 empreintes = 54 fichiers. (mlev −2 VE absent : étude non calculée.)

**`balayage_Eeq\`** — motif `<ligne>_E<module>_<empreinte>.txt`, module ∈ {4000, 5000, 6000, 7500, 9000, 11000, 14700, 18000} :

| Ligne | Grille |
|---|---|
| `base_R1` | x 0,3 → 1,1 pas 0,01 ; y 4,3 → 7,0 pas 0,01 ; z −0,3195 |
| `surf_R1` | x 0,3 → 1,1 pas 0,01 ; y 6,1 → 7,1 pas 0,01 ; z −0,001 |
| `xz_R1` | x 0,3 → 1,1 pas 0,01 ; y 6,6 ; z = grille XZ |

3 lignes × 8 modules × 3 empreintes = 72 fichiers.

**`pas_de_temps\`** — `signal_jauge_{ref,dt0025}_het.txt` et `coupeXZ_R1_{ref,dt0025}_het.txt` (het, mod_f = 1, production contre pas fixe 0,025 s).

### 3.4 Journaux

| Fichier | Contenu |
|---|---|
| `journal_blocA.txt` | VE convergence : dataset + sélection retenus par niveau/empreinte ; « INTROUVABLE mlev-2 » ×3 |
| `journal_blocB.txt`, `journal_blocB2.txt` | EL convergence : dataset + sélection par niveau/empreinte |
| `journal_blocF.txt` | fichiers « article » : dataset + sélection par famille/empreinte. Les lignes « ERR signal … : ok » sont des **faux positifs** (le contrôle cherchait `t=` au lieu de `Temps=`) : les signaux sont corrects. |
| `journal_blocC1*.txt` | création / diagnostic / correction de `std_balE` |
| `journal_blocC2.txt` | correspondance `solnum` → (E, lc) du balayage |
| `journal_blocD.txt` | charge appliquée et retrouvée (voir § 5) |
| `journal_blocG.txt` | sélections du contrôle de pas de temps |

---

## 4. Le traitement

### 4.1 Code

Dossier `Article_MAIREINFRA27\` (zip joint à ce document : `Article_MAIREINFRA27_pipeline_2026-10-18.zip`) :

| Fichier | Rôle |
|---|---|
| `pipeline/build_article.py` | lit tous les exports, calcule les valeurs, trace les figures, écrit `article/values.tex` et `rapport_valeurs.md` |
| `pipeline/comsol_io.py` | lecture des fichiers COMSOL (en-têtes, grilles, signaux) |
| `pipeline/footprints.py` | définitions analytiques des 3 empreintes (charge, pmax, normalisation) |
| `pipeline/materials.py` | 2S2P1D et KVG (|E*|(f), fréquence pour un module donné) |
| `pipeline/export_docx.py` | version Word de l'article |
| `couts_calcul.csv`, `machine.csv` | coûts de calcul (à compléter) et machine |

Commande :
```
python build_article.py --exports "<...>\article_v2\article_v2"
```

### 4.2 Définitions des grandeurs (à reprendre telles quelles dans l'application)

| Grandeur | Définition exacte |
|---|---|
| `base@exx` | max de εxx sur `planXY_baseGB` (z = −0,3195) |
| `base@exxgauge` | εxx au point jauge (0,7 ; 5,61 ; −0,3195) à t = 10 s |
| `base@eyy` | max de εyy sur `planXY_baseGB` |
| `sg@ezz` | max de −εzz sur `planXY_sommetSG` (compression positive) |
| `surf@e1` | max de ε1 sur `planXY_surface` |
| `surf@w` | max de |w| sur `planXY_surface` (mm) |
| `xz@exzmax` | max de |εxz| sur `coupeXZ_R1`, **en excluant z < −0,3175** (discontinuité à l'interface GB/GRH, voir § 7) |
| `xz@exz20` | max de |εxz| sur `coupeXZ_R1` pour z ≥ −0,020 m |
| `xz@zexz` | profondeur (mm) du max de |εxz| |
| `xz@xexz20` | distance (mm) à l'axe du pneu du max de |εxz| dans les 20 premiers mm |
| `yz@eyzmax` | max de |εyz| sur `coupeYZ_axe` |
| `sig@…` | sur le signal de jauge VE : pics p1 (R1), p2 (R2), rapport p2/p1, résidu à 20 s, écart au max PEP 340 µε |
| `het` | toujours multiplié par 0,9934 (normalisation à 370 kN) |

### 4.3 Grandeurs dérivées

| Clé | Définition |
|---|---|
| `fp@<g>@<fam>@<emp>` | effet d'empreinte : 100·(g_emp / g_rect − 1) |
| `amp@<g>@<fam>` | amplitude entre empreintes : 100·(max − min)/g_rect |
| `veel@<g>@<emp>` | effet de la loi : 100·(g_VE / g_EL − 1) ; `@moy` = moyenne des 3 empreintes |
| `conv1@<fam>@<g>@<niv>@<emp>` | écart au maillage de référence (EL : mlev 3 ; VE : mesh1), % |
| `ratio@<g>@<niv>@<emp>` | g_VE / g_EL au même niveau de maillage |
| `ratiodisp@<g>@<emp>` | dispersion du rapport sur mlev −1, 0, mesh1 : 100·(max − min)/moyenne |
| `ratiolast@<g>@<emp>` | 100·|ratio(mesh1)/ratio(mlev0) − 1| |
| `corr@<g>@<emp>` (VE*) | valeur VE « convergée » = g_EL(mlev 3) × ratio(mesh1) |
| `corramp@<g>`, `corrfp@<g>@<emp>` | amplitude / effet d'empreinte sur VE* |
| `veelfin@<g>@<emp>` | 100·(VE* / EL-fin − 1) |
| `eeq@E@<g>@<emp>` | E_match : module élastique (interpolation log sur le balayage) qui donne la même valeur que le VE mesh1 |
| `eeq@f@<g>@<emp>` | fréquence à laquelle |E*_KVG(f)| = E_match |
| `loadapp@absmax`, `loadszz@absmax` | écarts de charge (bloc D), % |
| `dt@jauge`, `dt@xz` | écarts dus au pas de temps, % |

Toutes les valeurs (922 clés) sont dans `article/values.tex` (format `\expandafter\def\csname val@<clé>\endcsname{<valeur formatée>}`) et listées en clair dans `rapport_valeurs.md`, section « Valeurs (clé = valeur) ». **Pour l'application, le plus simple est de parser `rapport_valeurs.md` ou de faire écrire au pipeline un JSON/CSV (`clé, valeur, unité`)** — voir § 8.

---

## 5. Résultats (valeurs au 18/10/2026)

### 5.1 Tableau principal (t = 10 s, mesh1 sauf mention ; µε)

| Grandeur | EL rect | EL circ | EL het | VE rect | VE circ | VE het | Ampl. EL % | Ampl. VE % |
|---|---|---|---|---|---|---|---|---|
| εxx base GB | 178 | 172 | 177 | 334 | 321 | 328 | 3,1 | 4,0 |
| εyy base GB | 167 | 180 | 181 | 209 | 222 | 223 | 8,5 | 6,6 |
| −εzz sommet sol | 1017 | 1023 | 1017 | 1223 | 1231 | 1225 | 0,6 | 0,6 |
| Déflexion w (mm) | 1,62 | 1,62 | 1,61 | 1,90 | 1,91 | 1,90 | 0,6 | 0,6 |
| \|εxz\| max couche bitumineuse | 79,7 | 81,6 | 92,9 | 117 | 116 | 131 | 17 | 13 |
| ε1 surface (EL mlev 3 / VE*) | 128 | 122 | 131 | 177 | 163 | 185 | 7,4 | 12 |
| \|εxz\| 0–20 mm (EL mlev 3 / VE*) | 41,1 | 41,5 | 71,2 | 59,9 | 54,1 | 96,0 | 73 | 70 |

Valeurs brutes mesh1 avant transfert du rapport, pour mémoire : ε1 surface EL 129 / 122 / 136, VE 178 / 164 / 191 ; |εxz| 0–20 mm EL 40,0 / 43,1 / 74,9, VE 58,2 / 56,3 / 101.

### 5.2 Comparaison à la mesure PEP (εxx max à la jauge, 340 µε)

- VE : pics 334,3 / 321,4 / 330,1 µε → écart max 5,5 %.
- EL (E_eq 14 700 MPa) : 178 / 172 / 177 µε → −48 à −49 %.
- Signal VE : second pic (R2) 22 % plus haut que le premier ; résidu 64 µε à t = 20 s.

### 5.3 Module équivalent E_match (MPa) et fréquence KVG correspondante (Hz)

| Critère | rect | circ | het | f (het) |
|---|---|---|---|---|
| εxx base GB | 6 000 | 6 000 | 6 100 | 0,05 |
| w surface | 5 700 | 5 800 | 6 000 | 0,05 |
| ε1 surface | 8 400 | 8 700 | 8 600 | 0,13 |
| |εxz| max | 9 600 | 10 000 | 10 200 | 0,24 |
| |εxz| 0–20 mm | 9 900 | 11 100 | 10 800 | 0,29 |
| Règle de Perret | 14 700 | 14 700 | 14 700 | 1,07 |

Lecture : l'ordre suit la forme du signal (cumul des deux roues en base → chargement long → module faible ; cisaillement qui change de signe → chargement court → module élevé), pas seulement la profondeur.

### 5.4 Convergence

Élastique : écart maximal (% , 3 empreintes) de chaque niveau au maillage le plus fin mlev 3 (clés `convmax@<g>@<niv>`) :

| Grandeur | mlev −2 | mlev −1 | mlev 0 | mesh1 | mlev 2 |
|---|---|---|---|---|---|
| εxx base | 11 | 1,4 | 0,5 | **0,1** | 0,1 |
| εzz base | 14 | 1,7 | 1,6 | **0,6** | 0,2 |
| w surface | 9,2 | 1,8 | 1,1 | **1,1** | 0,4 |
| \|εxz\| max | 7,0 | 3,4 | 4,8 | **1,3** | 1,5 |
| ε1 surface | 4,5 | 7,9 | 2,3 | **3,1** | 0,4 |
| \|εxz\| 0–20 mm | 25 | 12 | 14 | **8,0** | 8,0 |

Viscoélastique, empreinte het : écart à mesh1 (%, clés `conv1@VE@<g>@<niv>@het`) :

| Grandeur | mlev −1 | mlev 0 |
|---|---|---|
| εxx base | +1,2 | −0,7 |
| \|εxz\| max | +3,3 | +3,9 |
| ε1 surface | +1,7 | +2,8 |
| \|εxz\| 0–20 mm | +2,6 | −4,6 |

Stabilité du rapport VE/EL (het) : εxx base 0,3 % ; ε1 surface 6,4 % (3,4 % entre mlev 0 et mesh1) ; εxz 0–20 mm 5,5 % (1,5 %).

### 5.5 Vérifications

| Contrôle | Résultat | Source |
|---|---|---|
| Module EL dans COMSOL | 14 700 MPa exactement (Hooke sur sxx, szz et les déformations) | fichiers `planXY_*_EL*` |
| Charge appliquée (intop de P_tot) | het 742,8 kN (analytique 744,9 ; −0,3 %) ; rect 739,1 (740 ; −0,1 %) ; identique EL/VE | `journal_blocD.txt` |
| Charge retrouvée (intop de −σzz sur la surface) | à 0,4 % près | `journal_blocD.txt` |
| Pas de temps (production vs 0,025 s) | < 0,1 % à la jauge et sur εxz | `pas_de_temps\` |
| Contrôle « charge sur grille à 1 mm » | **ne pas utiliser** : grille de 2 cm trop grossière pour les nervures het (donnait −3,7 % en VE het, faux) | — |

---

## 6. Coûts de calcul (`couts_calcul.csv`)

| Cas | Temps / empreinte | Mémoire | Solveur |
|---|---|---|---|
| EL mlev −2, −1, 0 | 1,3 min | — | direct |
| EL mlev 3 | 4,7 min | 48 Go | GCRO-DR + multigrille |
| VE mlev −1 | 75 min | à compléter | direct |
| VE mlev 0 | 148 min | ~80 Go | direct |
| VE mesh1 | 345 min | 78 Go | direct |
| VE mlev 2 | — | hors mémoire | direct puis GMG : échec |
| Balayage E_eq (24 cas EL mesh1) | 13 min au total | — | direct |

Machine : poste ltds-aa04531, AMD Threadripper 64 cœurs, 256 Go.

---

## 7. Pièges connus (à coder dans l'application)

1. **Interface GB/GRH (z = −0,32)** : les points de grille à z = −0,32 tombent côté GRH, où la déformation est discontinue ; |εxz| y est jusqu'à 3× trop grand. Exclure z < −0,3175 pour les maxima dans la couche bitumineuse.
2. **En-têtes en français** : `Temps=` et non `t=`.
3. **k_x = 0,6 inactif** dans les cas VE (mod_f = 0) : ne pas en faire un paramètre de comparaison.
4. **Normalisation het** : 370/372,47 sur tous les résultats het.
5. **mesh1 ≡ mlev 1** : supposé, non vérifié ; l'étude `std_el_c1` (mlev 1) existe et pourrait servir à le vérifier.
6. **VE mlev −2** : absent (étude 1e non calculée) ; ne pas l'afficher comme manquant par erreur d'export.
7. **Ordres des balayages** : dans `dset35`, l'ordre des `solnum` n'est pas « E puis lc » de façon garantie ; toujours lire E et lc dans le fichier (c'est ce que fait C2 ; le nom de fichier est donc fiable).
8. **VE circ** vient d'une autre étude (`std_ve_circ`, `dset18`) que VE rect/het (`std_ve5`, `dset3`) : même maillage et mêmes réglages, mais deux solveurs distincts.
9. Le contrôle `signalFait` des anciens blocs F écrit « ERR signal … : ok » : faux positif.

---

## 8. Ce que je propose pour l'application

### 8.1 Modèle de données

- **Étude** : tag, libellé, type (stationnaire / temporel), maillage, statut, coût.
- **Cas** : (famille ∈ EL, EL-fin, VE, VE-mlev…, balayage), lc, VE, mod_f, mlev, E_eq (balayage), dataset, sélection, t.
- **Export** : chemin, coupe/ligne, grille (x, y, z), cas, date, empreinte de fichier (taille + date) pour détecter les mises à jour.
- **Grandeur** : nom court (`base@exx`…), définition (§ 4.2), unité.
- **Valeur** : (grandeur, cas) → nombre ; plus les dérivées du § 4.3.

### 8.2 Ingestion

1. Parcourir `article_v2\article_v2\` ; associer chaque fichier à un cas par son nom (§ 3.3) **et** vérifier par l'en-tête (lc, VE, mod_f, Temps).
2. Lancer `build_article.py` (ou le réutiliser comme bibliothèque) ; lui ajouter une sortie `valeurs.json` / `valeurs.csv` (clé, valeur numérique non formatée, unité, cas, source) — c'est la seule modification de code nécessaire.
3. Lire `rapport_valeurs.md` § « Contrôle des affirmations » : afficher chaque contrôle avec son état (OK / À REVOIR / NON VÉRIFIABLE).

### 8.3 Vues de comparaison utiles

- **Matrice empreinte × loi** pour chaque grandeur (tableau 5.1), avec effet d'empreinte et effet de loi.
- **Convergence** : grandeur vs densité (log), une courbe par empreinte, EL et VE superposés, plus le rapport VE/EL.
- **Module équivalent** : rapport EL/VE vs E (8 points) par critère, avec E_match et la fréquence.
- **Signal de jauge** : VE (3 empreintes) + EL + ligne PEP 340 µε.
- **Cartes et coupes** : |εxz| en coupe XZ sous R1 (6 panneaux), cartes de surface ε1.
- **Contrôles** : tableau § 5.5, avec date et source.

### 8.4 À ne pas faire

- Ne pas recalculer les maxima sans l'exclusion de l'interface (§ 7.1).
- Ne pas comparer VE mesh1 et EL mlev 3 directement près de la surface : utiliser VE* (rapport transféré).
- Ne supprimer aucune étude ni solution COMSOL sans accord explicite de Lucas.

---

## 9. Points ouverts au 18/10/2026

- Compléter `couts_calcul.csv` (éléments, DDL, temps, mémoire manquants — à lire dans le Log COMSOL).
- Éventuellement : VE mlev 4 (raffinement vertical seul) sur het pour vérifier le transfert du rapport au-delà de mesh1 (~7–8 h, ~100 Go estimés).
- Piste de recherche : fréquence équivalente par transformée de Fourier des fonctions de chargement analytiques (vitesse, lc, profondeur), à valider contre les E_match du § 5.3.
- Article : soumission MAIRE INFRA27 (Springer LNCE, 10 pages) avant le 1er novembre 2026 ; co-auteurs, adresse STAC et financement à compléter.
