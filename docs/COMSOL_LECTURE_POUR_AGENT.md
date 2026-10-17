# Ce que l'atelier COMSOL de Thèse sait lire, et comment

À l'intention d'un agent qui prépare, exporte ou génère des résultats COMSOL pour Lucas (ou qui écrit les
scripts d'export). Thèse est l'application de bureau de la thèse (Tauri, Windows) ; son **atelier COMSOL**
(Figures → COMSOL) trace et compare des résultats de calcul de chaussée. Il **ne lit pas les .mph** : tout passe
par des **fichiers texte exportés de COMSOL**. Ce document dit exactement ce qui est accepté, ce qui en est
déduit, et ce qu'il faut pour que chaque outil de l'atelier s'allume. Les règles viennent du code
(`modules/figures/core/graph/comsol*.ts`), version 1.43.

---

## 1. Deux formats de fichier

Extensions : `.txt`, `.csv`, `.dat`. Encodage : UTF-8 (BOM permis), sinon Windows-1252.

Un fichier est reconnu comme export COMSOL si, dans ses 2 000 premiers caractères, une ligne commence par
`% Model:`, `% Modèle:`, `% Version:`, `% Dimension:`, `% Nodes:`, `% Table:` ou `% Tableau:`, ou par un
en-tête de table `% Temps (s)` / `% Time (s)` / `% Fréquence (Hz)`.

### 1.1 Export « Données » (Résultats → Export → Données) : points dans l'espace

```
% Model:              tfeversion3.mph
% Version:            COMSOL 6.4.0.293
% Date:               Oct 12 2026, 14:37
% Dimension:          3
% Nodes:              17095
% Expressions:        4
% Description:        exemple
% Length unit:        m
% X                       Y                        Z                        1e6*solid.eXX (1) @ 1: lc=3, VE=0 1e6*solid.eZZ (1) @ 1: lc=3, VE=0 1e3*w (m) @ 1: lc=3, VE=0
0.3 6.5 -0.8 12.5 -38.1 -0.21
0.33 6.5 -0.8 13.0 -39.4 -0.22
```

| Élément | Règle exacte |
|---|---|
| Métadonnées | Lignes `% Clé: valeur` avant les données. Seule `Length unit` (ou `Unité de longueur`) sert au calcul (défaut `m`) ; `Dimension` donne le nombre de coordonnées. Les autres sont affichées. |
| Ligne de titres | La **dernière** ligne `%` qui commence par une coordonnée (`X`, `Y`, `Z` ou `R`). |
| Coordonnées | Les `Dimension` premières colonnes (sinon déduites des titres : 1 à 3 lettres X/Y/Z/R en tête). |
| Titre d'une expression | `expression (unité)`, puis facultativement ` @ solution: param=valeur, param=valeur`. **L'expression ne doit pas contenir d'espace** (`1e6*solid.eXX`, pas `1e6 * solid.eXX`) : le découpage cherche `motSansEspace (unité)`. |
| Échec du découpage | Si le nombre de titres trouvés ≠ nombre de colonnes de valeurs, les colonnes s'appellent « Colonne 1 », « Colonne 2 »… (traçables, mais sans libellé ni unité). |
| Paramètres | Après `@` : `303: Temps=10 s, lc=3, VE=0` (n° de solution facultatif avant `:`), ou `t=9`. Chaque `nom=valeur` devient un paramètre de la colonne. |
| Valeurs | Une ligne par point. Séparateurs : blancs, tabulations, `;` ; ou virgules si la première ligne n'a pas de blanc (CSV). **Point décimal obligatoire** (pas de virgule décimale dans un export). `NaN` = trou. Lignes vides ignorées. |

### 1.2 Export d'une **Table** (évaluation en un point au cours du temps, ou d'un balayage)

```
% Model:              tfeversion3.mph
% Table:              Table 2 - Évaluation ponctuelle 1
% Temps (s)               1e6*solid.eXX (1), Point: (0.9, 6.5, -0.32)          Déformation, composante zz (1), Point: (0.9, 6.5, -0.08)
8                       -12.4                                                   3.1
8.05                    -13.0                                                   3.3
```

- La dernière ligne d'en-tête commence par la **variable et son unité** : `Temps (s)`, `Time (s)`,
  `Fréquence (Hz)`, ou tout `nom (unité)` qui n'est pas X/Y/Z/R. C'est ce qui distingue une table d'un export
  « Données ».
- Titres séparés par une **tabulation ou au moins deux espaces**. Unité = la première parenthèse sans
  virgule (`(1)`, `(Pa)`) ; `Point: (…)` et `@ …: lc=3` sont gardés comme paramètres.
- Une ligne par instant ; la première colonne est l'abscisse (le temps).

---

## 2. Ce que l'atelier déduit de chaque fichier

### 2.1 Sa forme (calculée sur les coordonnées)

| Coordonnées qui varient | Forme | Utilisée pour |
|---|---|---|
| aucune | point | — |
| une | **profil** (ligne verticale si c'est Z, horizontale sinon) | courbes superposées, critères (si Z), bassin (si horizontale) |
| deux | **coupe** ; **régulière** si nx × ny = nombre de lignes (grille complète) | cartes, profils extraits, sonde, critères, bassin, convergence, vue d'ensemble |
| trois | nuage | peu de choses |
| (table) | **série** | signal dans le temps, mesures |

- Valeurs comparées à 10 chiffres significatifs près. Une coupe exportée **aux nœuds du maillage** n'est pas
  une grille complète : elle reste lisible, mais **pas de carte**. Il faut évaluer le plan de coupe **sur une
  grille régulière** (dans COMSOL : jeu de données *Cut Plane* + export sur grille).
- L'utilisateur peut forcer la lecture (« Pas la bonne forme ? ») si la détection se trompe.

### 2.2 Le sens des expressions

| Expression | Libellé | Unité affichée |
|---|---|---|
| `1e6*solid.eZZ` (unité `1`) | εzz | µdef |
| `1e3*solid.eXX` / `100*solid.eYY` / `solid.eXZ` | εxx / εyy / εxz | ‰ / % / - |
| `solid.ep1`, `solid.ep3`, variables `e1`, `e3` | ε1, ε3 | selon le facteur |
| variables nommées `exx`, `ezz`, `exz`, `eeq`, `sxx`, `szz`… | εxx…, εeq, σxx… | selon facteur et unité |
| `1e-6*solid.sZZ` (unité `Pa`) / `1e-3*solid.sp1` / `solid.mises` | σzz / σ1 / σVM | MPa / kPa / Pa |
| `1e6*u`, `1e3*w` (unité `m`) | ux, uz (déflexion) | µm, mm |
| titres de table « Déformation, composante zz », « Contrainte, composante xz » | εzz, σxz | selon l'unité |
| autre chose | l'expression telle quelle | facteur + unité |

Facteurs reconnus : `1e6`, `1e3`, `100`, `1` (sans dimension, longueurs) ; `1e-6`, `1e-3` (Pa). **Exporter la
même grandeur avec la même expression et le même facteur dans tous les fichiers** : sinon « Vérifier » signale
des unités différentes, et les courbes ne se comparent pas.

### 2.3 Plusieurs instants (ou valeurs d'un paramètre) dans un même fichier

COMSOL écrit **une colonne par grandeur et par instant** :
`1e6*solid.eZZ (1) @ t=8  1e3*w (m) @ t=8  1e6*solid.eZZ (1) @ t=8.5 …` ou `… @ 3: Temps=10 s, lc=3`.
Les colonnes de même expression et même unité sont regroupées ; le paramètre dont la valeur change entre elles
(`t`, `Temps`, `lc`…) devient un **curseur** (instant par instant, ▶ animation, enveloppe max/min/|max|).
Valeurs numériques avec unité facultative (`10 s`) ; triées par valeur.

### 2.4 Les noms de fichiers (légendes, rangement, paires)

- **Mots séparés par `_`** (ou espaces), extension retirée : `coupeXZ_R1_VE_het.txt` → `coupeXZ`, `R1`, `VE`,
  `het`. Les **mots qui diffèrent d'un fichier à l'autre** font les légendes (« VE het ») et rangent la vue
  d'ensemble en matrice (1er mot variable en lignes, 2e en colonnes). Les mots communs sont ignorés.
- Un même **ordre des mots** dans tous les noms d'une série (`coupeXZ_R1_<matériau>_<empreinte>`).
- **Paire de maillages** (convergence) : le même nom, dont un mot porte le suffixe `fin`, `fine`, `raffine`,
  `raffiné` ou `refined`, collé ou après `-`, `_` ou une espace : `coupeXZ_R1_EL_het.txt` +
  `coupeXZ_R1_EL-fin_het.txt` (ou `…_EL_fin_het.txt`).
- Des correspondances de légende (`het` → « Hétérogène », `lc=1` → « Rectangulaire ») se règlent dans l'appli.

### 2.5 Un paramètre qui change **d'un fichier à l'autre** (sensibilité)

Si plusieurs fichiers portent, dans les paramètres de leurs titres (après `@`), un même paramètre **numérique**
avec des valeurs différentes (`… @ 1: lc=3, VE=0, E_GB=9000 MPa`, `… E_GB=11000 MPa`…), l'outil Sensibilité
trace le pic en fonction de ce paramètre. (Un paramètre qui change *dans* un fichier passe par le curseur, §2.3.)

---

## 3. Ce qu'il faut pour chaque outil de l'atelier

| Outil | Il faut |
|---|---|
| Comparer des profils | des profils (lignes) ou des coupes ; mêmes expressions entre fichiers |
| Carte d'une coupe | une **coupe régulière** |
| Profils dans une coupe / sur un segment | une coupe régulière |
| Signal dans le temps | une **table** (§1.2), ou un fichier à plusieurs instants (signal extrait en un point épinglé) |
| Comparer deux cas (A − B, A / B, écart %) | deux fichiers sur **la même grille** (idéal : mêmes points dans le même ordre) avec une expression commune |
| Tableau de synthèse | n'importe quels fichiers « Données » |
| Critères de dimensionnement | une coordonnée **`Z`**, **surface en z = 0 et profondeur négative** (en unité de longueur du fichier : `-0.08` = 8 cm sous la surface), des colonnes nommées `exx` / `eyy` (traction à la base des couches liées) et `ezz` (sommet du sol) — le nom est le dernier segment de l'expression sans facteur, casse ignorée : `1e6*solid.eXX` → `exx` ; cotes des couches réglées dans l'appli (par défaut BB 0–8 cm, GB 8–32 cm, GRH dessous) |
| Bassin de déflexion | une **ligne horizontale à la surface**, ou une coupe contenant Z (la ligne la plus haute est prise), et une colonne de déflexion `w` / `uz` (`1e3*w` en mm, ou `w` en m) |
| Convergence du maillage | une paire grossier / fin (§2.4), même expression |
| Sensibilité | un fichier à plusieurs valeurs d'un paramètre (§2.3), ou plusieurs fichiers dont un paramètre d'en-tête varie (§2.5) |
| Vue d'ensemble | plusieurs coupes régulières (ou plusieurs lignes) nommées selon §2.4 |
| Rapport LaTeX / Word | n'importe quels fichiers ; plus riche avec critères, bassin, paires de maillage |

---

## 4. Données collées (pas des fichiers COMSOL)

- **Mesure de jauge / capteur** (« Mesures superposées ») : colonnes collées depuis Excel ou un fichier texte.
  1re colonne = abscisse (temps en s, ou coordonnée dans l'unité de tracé), colonnes suivantes = une mesure
  chacune, dans l'unité de la grandeur calculée (facteur et signe réglables). Séparateurs : tabulation ou `;`
  (virgule décimale permise), sinon blancs, sinon virgules. Une 1re ligne de texte donne les noms.
  ```
  Temps (s)	Jauge T1 (µdef)
  8,20	-11,4
  8,30	-12,9
  ```
- **Bassin mesuré (HWD)** : deux colonnes, distance au centre puis déflexion (unités choisies dans l'appli :
  distance en mm/cm/m, déflexion en µm, mm ou 1/100 mm) ; virgule décimale permise.
  ```
  0	412
  200	351
  300	305
  ```

---

## 5. Pièges fréquents

1. Espace dans une expression (`1e6 * solid.eZZ`) → titres non découpés, colonnes « Colonne n ».
2. Plan de coupe exporté aux nœuds du maillage → pas de carte (grille incomplète).
3. Même grandeur avec des facteurs différents selon les fichiers (`solid.eZZ` ici, `1e6*solid.eZZ` là) →
   unités différentes ; l'appli propose une conversion, mais mieux vaut exporter pareil partout.
4. Virgule décimale dans les valeurs d'un export → lecture fausse (le format COMSOL est au point).
5. Surface ailleurs qu'en z = 0, ou z positif vers le bas → critères et bassin à côté (un changement de repère
   existe dans l'appli, mais la convention attendue est z = 0 en surface, négatif en profondeur).
6. Noms de fichiers sans structure commune → légendes illisibles et vue d'ensemble non rangée.
7. Deux fichiers qui ne diffèrent que par un mot non significatif → même légende (« Vérifier » le signale).

## 6. Liste de contrôle pour produire une série d'exports

- [ ] Un fichier par cas ; noms `<type>_<repère>_<cas1>_<cas2>.txt` dans le même ordre pour tous.
- [ ] En-tête COMSOL complet (au moins `% Dimension:`, `% Length unit:`, la ligne de titres `% X Y Z …`).
- [ ] Expressions sans espace, identiques (même facteur) d'un fichier à l'autre.
- [ ] Coupes évaluées sur **grille régulière**, la même pour tous les cas à comparer.
- [ ] z = 0 en surface, profondeur négative ; unité de longueur déclarée.
- [ ] Étude temporelle : toutes les valeurs de t dans un seul fichier (une colonne par grandeur et par instant).
- [ ] Maillage raffiné : même nom avec `-fin`.
- [ ] Balayage d'un module entre fichiers : paramètre numérique dans les titres (`E_GB=9000 MPa`).

## 7. Exemples et code de référence

- **Exemples valides, testés** : `modules/figures/core/graph/comsolExemple.ts` génère les 16 fichiers du jeu
  d'exemple (coupes EL/VE × het/rect/circ, maillage fin, charge roulante à 9 instants, ligne de surface, profils
  verticaux, balayage E_GB, table) ; `comsolExemple.test.ts` vérifie que tous les outils les tracent sans
  avertissement. Le plus sûr pour un nouveau script d'export est d'imiter ce format.
- Fichiers réels d'essai : `modules/figures/core/graph/fixtures/`.
- Lecture : `comsol.ts` (`lireComsol`, `lireTitres`, `lireTable`, `geometrie`, `libelleExpression`) ;
  instants : `comsolInstants.ts` ; paires de maillage : `comsolMaillage.ts` ; sensibilité :
  `comsolSensibilite.ts` ; critères : `comsolCriteres.ts` ; bassin : `comsolBassin.ts` ; mesures collées :
  `comsolMesures.ts` ; contrôles « Vérifier » : `comsolDiagnostic.ts`.
- Guide utilisateur complet : `docs/GUIDE_COMSOL.md`.
