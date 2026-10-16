# Tracer des exports COMSOL dans Thèse

Guide d'utilisation de tout ce que **Figures → Graphes** sait faire avec les fichiers exportés de COMSOL
(versions 1.24.0 à 1.27.0) : les données attendues, ce que l'appli en comprend, les tracés possibles, les
calculs avant tracé, les réglages après coup, l'enregistrement, les exports LaTeX et l'assemblage en planches.

En bref :

1. Dans COMSOL, exporter des **Données** (profil le long d'une ligne, ou coupe sur un plan) ou une **Table**
   (signal en un point au cours du temps) en `.txt`.
2. Dans Thèse, *Figures → Graphes → « Ouvrir des exports COMSOL… »*, en choisissant un ou plusieurs fichiers.
3. **Calculer** si besoin : colonne calculée, changement de repère, A − B / A / B / écart relatif entre deux
   cas, profils interpolés dans une coupe, tableau de synthèse.
4. **Tracer** : profils superposés, carte en couleurs, séries temporelles, barres groupées.
5. **Retoucher** à droite (axes, légendes, couleurs, palette, isolignes, repères, annotations, taille), puis
   **Enregistrer** dans la bibliothèque.
6. **Exporter** en pgfplots, SVG ou PNG, ou **assembler** plusieurs graphes dans une planche (a), (b)…

---

## 1. Les données attendues

### 1.1 Côté COMSOL

Thèse lit les exports **« Données » (Data)** de COMSOL, c'est-à-dire les fichiers texte produits par
*Résultats → Export → Données*, au format tableur par défaut. Concrètement :

| Ce que vous voulez tracer | Jeu de données à exporter dans COMSOL | Ce que Thèse y reconnaît |
|---|---|---|
| Un **profil vertical** (εzz en fonction de la profondeur, par exemple) | une ligne de coupe 3D (*Cut Line*) verticale | « profil vertical (Z) » |
| Un **profil horizontal** (le long de Y, par exemple) | une ligne de coupe horizontale | « profil horizontal (Y) » |
| Une **carte** sur un plan (coupe YZ sous la charge, par exemple) | un plan de coupe (*Cut Plane*) évalué sur une **grille régulière** | « coupe YZ, 263 × 65 points » |

Conseils pour l'export :

- **Plusieurs expressions dans un même fichier**, c'est très bien : chacune devient une colonne, et vous
  choisissez ensuite lesquelles tracer (εxz, εyz, ε1, ε3, εzz…).
- Pour une **carte**, il faut que les points forment une **grille complète**. Chaque couple (y, z) de la
  grille doit être présent une fois, ce qu'on obtient en évaluant le plan de coupe sur une grille régulière
  plutôt qu'aux nœuds du maillage. Un export aux nœuds du maillage reste lisible et ses profils restent
  traçables, mais la carte sera refusée.
- **Un fichier par cas de calcul** (élastique / viscoélastique, cas de charge, géométrie…) : c'est la
  manière la plus simple d'obtenir ensuite des courbes superposées avec des légendes automatiques.
- **Nommer les fichiers avec des mots séparés par `_`**, comme `verticale_max_std_el_lc3_het.txt` ou
  `verticale_max_std_ve_lc1_rect.txt` : les légendes sont tirées des mots qui diffèrent d'un nom à l'autre
  (§ 3.3).

### 1.2 Format du fichier

Extensions acceptées : `.txt`, `.csv`, `.dat`. Exemple réel (tronqué) :

```
% Model:              tfeversion3.mph
% Version:            COMSOL 6.4.0.293
% Date:               Oct 12 2026, 14:37
% Dimension:          3
% Nodes:              21
% Expressions:        7
% Description:        , , , , , ,
% Length unit:        m
% X        Y        Z         1e6*solid.eXZ (1) @ 303: Temps=10 s, lc=3, VE=0, mod_f=0   1e6*solid.eYZ (1) @ 303: …
0.91875    6.589    -0.3199   5.418026085217734    0.5646746260555298   …
0.91875    6.589    -0.304    22.632969102117208   0.027205882719284584 …
```

Ce que l'appli lit :

| Élément | Règle de lecture |
|---|---|
| **Reconnaissance** | Une des 2 000 premières lignes commence par `% Model:`, `% Version:`, `% Dimension:` ou `% Nodes:` (« Modèle » accepté). Le fichier est alors reconnu comme export COMSOL, y compris par le bouton général « Ouvrir des données… ». |
| **Métadonnées** | Lignes `% Clé: valeur` avant les données (modèle, date, version…). Elles sont affichées au survol du fichier dans le panneau. |
| **Unité de longueur** | `% Length unit:` (`m` si absent). Les coordonnées sont converties dans l'unité de tracé choisie (mm, cm ou m). |
| **Coordonnées** | Leur nombre est donné par `% Dimension:` (1, 2 ou 3), sinon déduit de la ligne de titres (X, Y, Z, R). |
| **Ligne de titres** | La dernière ligne `%` qui commence par une coordonnée. Chaque expression s'y écrit `expression (unité) @ solution: param=valeur, …`. |
| **Paramètres de l'étude** | Lus après le `@` (`Temps=10 s`, `lc=3`, `VE=0`, `mod_f=0`), puis utilisés pour les légendes et affichés au survol. |
| **Valeurs** | Séparées par des espaces, des tabulations, des virgules ou des points-virgules, avec le **point décimal** (le format de COMSOL). `NaN` est accepté et donne un trou. Les lignes vides sont ignorées. |
| **Encodage** | UTF-8 (avec ou sans BOM), sinon Windows-1252 (accents des anciens exports). |

Si les titres ne peuvent pas être découpés proprement (format inattendu), les colonnes s'appellent
« Colonne 1 », « Colonne 2 »… et restent traçables.

### 1.3 Ce que l'appli comprend des expressions

Les expressions COMSOL sont traduites en libellés d'axe prêts pour LaTeX :

| Expression COMSOL | Libellé affiché | Unité affichée |
|---|---|---|
| `1e6*solid.eZZ` (unité `1`) | `$\varepsilon_{zz}$` | µdef |
| `1e3*solid.eXX` | `$\varepsilon_{xx}$` | ‰ |
| `100*solid.eYY` | `$\varepsilon_{yy}$` | % |
| `solid.eXZ` (sans facteur) | `$\varepsilon_{xz}$` | - |
| `solid.ep1`, `solid.ep3` (principales), ou des variables nommées `e1`, `e3` | `$\varepsilon_{1}$`, `$\varepsilon_{3}$` | selon le facteur |
| variables nommées `exx`, `ezz`, `exz`…, `eeq`, `sxx`, `szz` | `$\varepsilon_{xx}$`…, `$\varepsilon_{eq}$`, `$\sigma_{xx}$`… | selon facteur et unité |
| titres de table « Déformation, composante zz », « Contrainte, composante xz » | `$\varepsilon_{zz}$`, `$\sigma_{xz}$` | selon l'unité |
| `1e-6*solid.sZZ` (unité `Pa`) | `$\sigma_{zz}$` | MPa |
| `1e-3*solid.sp1` | `$\sigma_{1}$` | kPa |
| `solid.mises` | `$\sigma_{VM}$` | Pa (ou selon le facteur) |
| `1e6*u`, `1e3*w` (unité `m`) | `$u_{x}$`, `$u_{z}$` | µm, mm |
| toute autre expression | l'expression telle quelle | facteur + unité COMSOL |

Facteurs reconnus : `1e6`, `1e3`, `100`, `1` pour les grandeurs sans dimension et les longueurs, `1e-6`, `1e-3`
pour les pascals. Un facteur inconnu s'affiche tel quel (« 1e4 Pa »). Tous ces libellés se corrigent
ensuite à la main (§ 8).

### 1.4 Exports de tables (séries temporelles)

Une **Table** COMSOL (évaluation en un point, *Point Evaluation*, au cours d'une étude temporelle) exportée en
texte est reconnue, avec ou sans les lignes `% Model:`… :

```
% Model:              tfeversion3.mph
% Table:              Table 2 - Évaluation ponctuelle 1
% Temps (s)               1e6*solid.eZZ (1), Point: (0.848, 6.5, -0.08)          Déformation, composante xz (1), Point: (…)
0.0                     -1.09e-11                                               0
0.5                     -1.61e-10                                               4.79e-06
```

- La **dernière ligne d'en-tête** commence par la variable de la table et son unité : `Temps (s)`, `Time (s)`,
  `Fréquence (Hz)`… C'est elle qui distingue une table d'un export « Données » (qui commence par X, Y, Z).
- Les **titres** sont séparés par des tabulations ou au moins deux espaces ; l'unité est la première
  parenthèse sans virgule (`(1)`, `(Pa)`), le reste (`Point: (…)`, `@ …: lc=3`) est gardé comme paramètres.
- Une ligne par instant, valeurs séparées par des blancs. Le fichier est listé « série (Temps en s),
  41 instants, 2 colonne(s) ».

---

## 2. Ouvrir les fichiers

*Figures → Graphes*, panneau **« Exports COMSOL »** (colonne de gauche) → **« Ouvrir des exports COMSOL… »**.

- On peut en choisir **plusieurs d'un coup** (Ctrl+clic) ; d'autres s'ajoutent ensuite à la liste.
- Chaque fichier est listé avec ce que l'appli a détecté : « profil vertical (Z), 161 points », « coupe YZ,
  263 × 65 points », « nuage 3D… ». Le survol affiche le modèle, la date et les paramètres de l'étude.
- **×** retire un fichier de la liste. Les fichiers sont lus, jamais modifiés.
- **ƒ** ouvre les outils du fichier : colonne calculée et changement de repère (§ 5).
- La **case à cocher** devant un profil dit s'il est tracé avec les autres (pour n'en superposer que certains).
- « Ouvrir des données… », le bouton général de Graphes, reconnaît aussi un export COMSOL et l'envoie dans ce
  panneau.
- Lecture rapide : une coupe de 7 Mo s'ouvre en quelques secondes au plus.

### Détection automatique de la géométrie

Pour chaque fichier, l'appli regarde quelles coordonnées **varient** :

| Coordonnées qui varient | Genre | Utilisation |
|---|---|---|
| aucune | point | rien à tracer |
| une seule | **profil** (vertical si c'est Z, horizontal sinon) | courbes |
| deux | **coupe** (grille régulière ou non) | carte (si régulière), profils extraits |
| trois | nuage 3D | non traçable tel quel |
| (table) | **série** | séries temporelles (§ 6) |

### Corriger la lecture si la détection se trompe

Sous chaque fichier, le menu **« Lecture »** :

- **Auto : …** : la détection automatique (rappelle ce qui a été trouvé) ;
- **Profil selon X / Y / Z** : impose la coordonnée qui sert d'abscisse du profil. C'est utile pour une
  ligne oblique, où plusieurs coordonnées varient un peu, ou pour forcer un profil selon Y ;
- **Coupe X (horizontal) × Z (vertical)**, etc. : impose les deux coordonnées d'une coupe **et leur sens**.
  La première est à l'horizontale de la carte, la seconde à la verticale.

La description sous le menu se met à jour. « Détection automatique » revient au réglage de départ.

---

## 3. Profils superposés

Disponible dès qu'au moins un fichier est un profil (section **« Profils »** du panneau).

### 3.1 Choix des grandeurs

Les **expressions communes à tous les profils** apparaissent en cases à cocher (εxz, εyz, ε1, ε3, εzz…).
εzz est cochée par défaut si elle existe.

- **Un fichier, plusieurs grandeurs** : une courbe par grandeur (εxx, εyy, εzz sur le même graphe, par
  exemple).
- **Plusieurs fichiers, une grandeur** : une courbe par fichier, ce qui permet de comparer des cas de calcul.
- **Plusieurs fichiers et plusieurs grandeurs** : une courbe par couple, légende « grandeur — cas ».

### 3.2 Orientation et unités

- **« Longueurs en »** : mm (par défaut), cm ou m. Les coordonnées sont converties depuis l'unité de COMSOL.
- **« Tracé »** :
  - **Auto** : un profil en Z est tracé **valeur en abscisse, cote en ordonnée**, de la surface (0) vers le
    bas, comme une coupe de chaussée. Un profil en X ou Y est tracé position en abscisse, valeur en ordonnée ;
  - **Valeur en abscisse, position en ordonnée** : à imposer pour un profil non vertical qu'on veut lire
    « en profondeur » ;
  - **Position en abscisse, valeur en ordonnée** : à imposer pour un profil vertical qu'on veut à plat.
- **« profondeur positive (vers le bas) »** (profil vertical) : l'axe devient « Profondeur (mm) » de 0 vers
  le bas, au lieu de z négatif.
- La **borne basse** de l'axe des cotes est arrondie au point le plus bas, l'autre borne est la surface (0).

### 3.3 Légendes automatiques

Pour chaque fichier, la légende est choisie ainsi :

1. Les **mots qui diffèrent entre les noms de fichiers**, découpés sur `_`, `-` et les espaces. Avec
   `verticale_max_std_el_lc3_het` et `verticale_max_std_ve_lc1_rect`, on obtient « el lc3 het » et
   « ve lc1 rect ».
2. À défaut (noms identiques ou ambigus), les **paramètres de l'étude qui diffèrent** : « lc=3, VE=0 » et
   « lc=1, VE=1 ».
3. À défaut, le nom du fichier.

« **Légendes depuis** » impose la source : mots du nom de fichier, paramètres de l'en-tête (`@ lc=3, VE=1`),
ou les deux (« VE het — Hétérogène, Viscoélastique »).

**Table de correspondances** (« Correspondances et couches », réglée une fois pour **toute la
bibliothèque**, fichier `_comsol/reglages.json`, partagé entre les deux PC) : chaque ligne traduit un mot du
nom de fichier (`het` → « Hétérogène », `VE` → « Viscoélastique ») ou un paramètre de l'en-tête (`lc=1` →
« Rectangulaire », `VE=0` → « Élastique »). Valeurs proposées au départ : lc=1/2/3 → Rectangulaire /
Circulaire / Hétérogène, VE=0/1 → Élastique / Viscoélastique. « Enregistrer » sous le tableau.

Chaque légende se **modifie encore à la main** dans le champ « Légende » sous le fichier, avant de tracer. La
légende du graphe est placée dans le **coin le moins chargé** en points.

### 3.4 Tracer

**« Tracer le profil »** ou **« Tracer les N profils »** remplace le graphe en cours, après confirmation
s'il y en a un. Le résultat est un **graphe ordinaire**, modifiable entièrement (§ 8) :

- titre proposé : « εzz — 3 profil(s) COMSOL » ;
- taille de départ : 90 × 110 mm pour un profil vertical, 130 × 80 mm pour un profil horizontal ;
- quadrillage, thème « these », courbes en traits continus ;
- **« Repères des couches »** coché : une ligne en tirets à chaque interface de couches (§ 3.5).

### 3.5 Repères des couches

Les **interfaces de couches** (cote z dans les coordonnées des fichiers, en m, z = 0 en surface) se règlent
une fois pour toute la bibliothèque, avec les correspondances : par défaut z = −0,08 « BB/GB » et z = −0,32
« GB/GRH ». La case « Repères des couches » les ajoute aux profils verticaux et aux cartes dont un axe est z,
converties dans l'unité de tracé et dans le repère choisi (profondeur positive comprise). Sur n'importe quel
graphe, le bloc « Repères et annotations » → « Interfaces de couches » les ajoute aussi (axe, unité, sens).

---

## 4. Coupes : carte en couleurs

Disponible pour une coupe sur **grille régulière** (section **« Coupe »** du panneau). S'il y a plusieurs
coupes, on choisit laquelle.

1. **« Grandeur »** : l'expression à cartographier (εzz par défaut).
2. **« Tracer la carte »** : la carte devient le graphe en cours. Comme tout graphe, elle se modifie,
   s'enregistre et s'exporte.

Ce qui est fait automatiquement :

- **palette rouge-bleu centrée sur 0** si les valeurs changent de signe (traction / compression), sinon
  **viridis** ;
- **24 teintes** (paliers), avec la barre de couleurs à droite titrée « $\varepsilon_{zz}$ (µdef) » ;
- axes « $y$ (mm) » et « $z$ (mm) » bornés exactement à la grille, largeur 160 mm, hauteur calculée d'après
  les proportions de la coupe (45 à 140 mm) ;
- chaque valeur colore une cellule centrée sur son nœud de grille. Les valeurs absentes (`NaN`) restent
  blanches.

### 4.1 Réglages de la carte (bloc « Carte en couleurs », à droite)

| Réglage | Effet |
|---|---|
| **Palette** | Rouge-bleu (centrée sur 0), Viridis, Inferno, Turbo (arc-en-ciel lisible), Niveaux de gris |
| **Inverser** | renverse l'échelle de couleurs |
| **Min / Max couleurs** | bornes de l'échelle. Vide = automatique : extrêmes des valeurs, ou ± le plus grand écart à 0 en rouge-bleu. Les valeurs hors bornes prennent la teinte extrême. |
| **Nombre de teintes** | 2 à 64 paliers |
| **Titre de la barre** | texte libre, `$…$` pour les maths |
| **Échanger les axes** | transpose la carte : y ↔ z, avec les libellés et les bornes des axes |
| **Retirer la carte** | garde le graphe et ses éventuelles courbes, sans la carte |

Le reste se règle comme pour n'importe quel graphe : les **bornes des axes** (pour zoomer sur la zone sous la
charge, par exemple), les libellés, la taille du graphe, la police. On peut aussi **superposer des courbes**
à la carte, par exemple la position des interfaces entre couches importée d'un tableau.

En plus (1.27.0) :

| Réglage | Effet |
|---|---|
| **Isolignes** | valeurs séparées par `;` (« −200 ; −100 ; 0 »), ou « 3 / 7 niveaux réguliers » entre les bornes des couleurs. Tracées en noir fin, valeur écrite au milieu de la plus longue ligne (carrés marchants sur la grille ; une maille avec un trou est sautée). |
| **Contour d'empreinte…** | superpose un **cercle** (centre, rayon), un **rectangle** (centre, lx × Ly) ou une **courbe collée** (x y par ligne), en unités des axes (mm si les longueurs sont en mm). C'est une série en trait noir hors légende, modifiable ou supprimable dans « Séries ». |
| **Échelles égales (1 m = 1 m)** | sous la taille du graphe : la hauteur suit la largeur et les bornes des axes, pour une coupe à ses vraies proportions. Recalculée à chaque changement de bornes. |
| **Sens inversé** (axe) | profondeur croissante vers le bas ; posé tout seul quand z est passé en profondeur positive (§ 5). |

### 4.2 Profils extraits d'une coupe (interpolés, plusieurs d'un coup)

Sous « Profils extraits » : choisir la **coordonnée fixe** (X = …, Y = … ou Z = …, unité du fichier) et taper
une ou **plusieurs valeurs** (« 0,70 ; 0,848 ; 0,90 ; 0,967 »), puis **« Ajouter les N profils »**. Une valeur
entre deux lignes de la grille est **interpolée linéairement** (exacte sur une ligne de la grille) ; une valeur
hors de la coupe est refusée. Les profils rejoignent la liste, cochés, légendés « $x$ = 0,848 m », et se
tracent ensemble (« Tracer les 4 profils »), avec orientation, profondeur et repères des couches. Décocher
les autres profils de la liste pour ne superposer que ceux-là.

---

## 5. Calculs avant le tracé

### 5.1 Colonnes calculées (bouton ƒ d'un fichier)

Une **formule** sur les colonnes du fichier, évaluée point par point ; la nouvelle colonne s'ajoute au
fichier et se trace, se cartographie ou se synthétise comme les autres.

- **Noms** : le nom de variable COMSOL (`1e6*solid.eZZ` → `ezz`, `solid.ep1` → `ep1` ou `e1`, `w`), les
  coordonnées (`x`, `y`, `z`, `t` pour une table) et `c1`, `c2`… (n° de colonne). La liste est affichée sous la
  formule ; un nom porté par deux colonnes n'est accessible que par `cN`.
- **Opérations** : `+ − * / ^`, parenthèses, `abs`, `max(·,·)`, `min`, `sqrt`, `exp`, `ln`, `log10`, `sign`.
  Point décimal. Une division par zéro donne un trou, pas une erreur.
- **Exemples** : `abs(ezz)`, `max(e1, 0)` (traction seule), `0.5*(exx + eyy)`, `-ezz` (changement de signe),
  `1e-3*ezz` (µdef → ‰), `e1 - e3`.
- **Nom** et **unité** de la colonne : ce qui s'affiche sur l'axe et dans les listes.

### 5.2 Changement de repère (bouton ƒ d'un fichier)

Nouvelle coordonnée = ± (ancienne − origine), sur X, Y ou Z, dans l'unité du fichier :

- **z en profondeur positive** : coordonnée Z, origine 0, « Changer le sens » → l'axe devient « Profondeur »,
  dirigé vers le bas sur les cartes ;
- **centrer sur la roue** : coordonnée Y, origine y0 (6,5 m, par exemple) → l'axe devient « $y - y_0$ ».

Les changements se composent ; « Repère d'origine » revient aux coordonnées du fichier. Les interfaces de
couches suivent le repère.

### 5.3 Opérations entre deux fichiers (« Opérations entre fichiers »)

**A − B**, **A / B** ou **écart relatif (A − B) / |B|** en %, point à point, sur les expressions communes aux
deux fichiers (VE / EL, het / circ…). Les deux fichiers doivent avoir **les mêmes points** (dans n'importe quel
ordre) ; sinon l'opération est **refusée** avec le nombre de points qui manquent et un exemple
(« Grilles différentes : 9 points dans A, 9 dans B, dont 3 de A absents de B (par exemple X = 0,8, …) »).
Le résultat **s'ajoute à la liste** comme un fichier (légende « VE het / EL het ») : carte, profils,
profils extraits ou synthèse, puis « Enregistrer » comme tout graphe. Les libellés suivent :
« Δε_zz (µdef) », « ε_zz (rapport) (-) », « Écart relatif ε_zz (%) ».

> L'écart relatif est rapporté à |B| : pour des déformations négatives (compression), un VE plus comprimé que
> l'EL donne un écart **négatif**. Pour comparer des amplitudes, prendre le rapport, ou une colonne `abs(ezz)`
> avant l'opération.

### 5.4 Tableau de synthèse (« Tableau de synthèse »)

Pour une sélection de fichiers (par défaut : les fichiers d'origine, ni tables ni résultats de calcul) et de
grandeurs : le **max**, le **min** et leur **position** (x, y, z dans l'unité de tracé ; l'instant pour une
table), une ligne par fichier × grandeur, avec la légende du cas (correspondances comprises).

- **« Copier LaTeX (booktabs) »** / **« Exporter .tex… »** : un `table` + `tabular` avec `\toprule`,
  `\cmidrule` (Maximum / Minimum), `\midrule`, `\bottomrule` (paquet `booktabs`) ; virgule décimale en
  option.
- **Barres groupées** : une grandeur, une valeur (extremum en valeur absolue, max ou min), les **catégories**
  en abscisse = un mot du nom de fichier (l'empreinte : mot n° 4 de `coupeXZ_R1_VE_het`), les **séries** = un
  autre mot (le matériau : mot n° 3). Les correspondances s'appliquent (« het » → « Hétérogène »). Le
  graphe a des catégories nommées en abscisse (modifiables : axe x → « Catégories »).

---

## 6. Séries temporelles (exports de tables)

Section **« Séries temporelles »** dès qu'une table est ouverte :

- **Colonnes** à tracer (communes aux tables) ; plusieurs fichiers = courbes superposées, légendes comme
  pour les profils.
- **Référence (trait horizontal)** : aucune, une **valeur saisie** (et son texte, « Élastique »), ou
  l'**extremum** de la même grandeur dans un autre fichier ouvert (le cas élastique, table ou données).
- **Instant repère** (10 s par défaut) : un trait vertical pointillé « t = 10 s ».
- **Pic annoté** : plus grande valeur absolue, maximum ou minimum de chaque courbe ; le point est marqué et
  commenté « −150 µdef à 11 s ; Δt = +1 s » (décalage par rapport à l'instant repère). Le texte se place
  vers l'intérieur du graphe et se déplace ou se corrige dans « Repères et annotations ».

---

## 7. Ce qui n'est pas (encore) possible

- **Nuage 3D** (trois coordonnées qui varient) : pas de carte ni de profil direct. Exporter plutôt une ligne
  ou un plan de coupe.
- **Coupe aux nœuds du maillage** (grille non régulière) : pas de carte ni de profil interpolé, ni
  d'opération avec un export sur grille ; il faut réexporter sur une grille régulière.
- **Virgule décimale** dans les valeurs (export retouché dans Excel en français) : non lue, il faut garder
  le point de COMSOL.
- **Interpolation lisse** de la carte : non faite. La carte est en cellules (paliers), comme `matrix plot`
  de pgfplots ; les isolignes sont linéaires par maille.
- **Opérations entre plus de deux fichiers** en une fois : les enchaîner (le résultat est un fichier).
- La **liste des fichiers ouverts** (et les colonnes calculées) n'est pas enregistrée : seul le graphe tracé
  l'est. Pour refaire un tracé d'un autre fichier, il faut le rouvrir.

---

## 8. Retoucher le graphe (tout est modifiable après coup)

Une fois tracé, un profil ou une carte est un graphe normal de la page Graphes. Tout se règle à droite :

- **Axes** : libellés (`$…$` pour LaTeX), bornes, échelle log, **sens inversé**, catégories (barres),
  graduations, axes FR/EN.
- **Séries** : nom (légende), couleur, style de trait, marqueurs, épaisseur. On peut aussi en ajouter, en
  dupliquer ou en retirer.
- **Données** (colonne de gauche) : gomme, tableau x ↹ y, ×/+ sur x ou y (changement d'unité, de signe),
  moyenne glissante, échange des axes. Annuler / Rétablir sont disponibles.
- **Apparence** : taille en mm, thème, palettes, styles enregistrés, position de la légende, quadrillage.
- **Carte** : le bloc « Carte en couleurs » (§ 4.1).
- **Repères et annotations** : lignes horizontales ou verticales (valeur, texte, trait continu / tirets /
  pointillé), interfaces de couches, points commentés (x, y, texte, côté du texte). Exportés en SVG et en
  pgfplots (`\draw … node`, `\fill … circle`, `\node`).

---

## 9. Enregistrer et exporter

- **« Enregistrer »** range le graphe dans la **Bibliothèque de figures** (`FIG-xxxx`), avec `graph.json`
  (toutes les données et tous les réglages, carte comprise), la vignette et les exports. Il se rouvre et se
  modifie plus tard comme les autres graphes.
- **« Copier pgfplots » / export `.tex`** produit le code à coller dans LaTeX (nécessite
  `\usepackage{figurine}`) :
  - profils : un `axis` avec une `\addplot` par courbe, couleurs `xcolor` explicites ;
  - carte : `\addplot[matrix plot*, mesh/cols=…, mesh/rows=…, point meta=explicit]` avec la grille en
    table (ou dans un fichier `.dat` séparé), la palette écrite en `colormap={carte}{rgb255=…}` en paliers
    (`colormap access=piecewise constant`, donc les mêmes teintes que l'aperçu), `point meta min/max`, et la
    barre de couleurs (`colorbar`) avec son titre. Les trous (`NaN`) sont gérés (`unbounded coords=jump`) ;
  - isolignes : une `\addplot[black, …] coordinates {…}` par ligne, calculées comme dans l'aperçu, et la
    valeur en `\node` ; axe inversé : `y dir=reverse` ; catégories : `xticklabels={…}`.
- **SVG** et **PNG** (300 / 600 dpi) : identiques à l'aperçu.

> Pour une carte très fine (plusieurs dizaines de milliers de cellules), la compilation LaTeX peut être lente.
> Dans ce cas, réexporter de COMSOL sur une grille plus lâche, ou utiliser le PNG.

---

## 10. Assembler plusieurs graphes : les planches

*Figures → **Planches*** (1.25.0) : plusieurs graphes de la bibliothèque réunis en une seule figure, par
exemple la carte εzz en (a) et les profils verticaux en (b).

1. Enregistrer d'abord chaque graphe dans la bibliothèque (§ 9).
2. Dans Planches, colonne de gauche : rechercher (titre, tag, `FIG-…`) puis **+** pour ajouter. Depuis la
   Bibliothèque, le bouton « Ajouter à une planche » d'un graphe fait la même chose.
3. Régler à droite :
   - l'**ordre** (↑ ↓) et le retrait (×) des graphes ;
   - le nombre de **graphes par ligne** (1 à 6) et l'**espacement** (mm) ;
   - les **étiquettes** : (a), (b)… / a), b)… / (A), (B)… / aucune ;
   - **« Même taille pour tous les graphes »** (largeur × hauteur en mm), sinon chacun garde la sienne.
     Les colonnes prennent alors la largeur de leur plus large graphe. Un graphe à « Échelles égales » garde
     ses proportions (la hauteur suit la largeur imposée) ;
   - **« Même échelle de couleurs pour toutes les cartes »** (dès deux cartes) : bornes communes (la plus
     petite et la plus grande, symétriques autour de 0 si toutes sont en rouge-bleu), pour comparer les
     cartes d'un coup d'œil.
4. **« Enregistrer »** crée une figure de type « Planche » dans la Bibliothèque, rouvrable par « Ouvrir dans
   Planches ».
5. Exports : **pgfplots** (une seule `tikzpicture`, un `axis` par graphe placé au millimètre près comme dans
   l'aperçu, étiquettes en gras), **SVG**, **PNG 600 dpi**, ou copie dans le presse-papiers.

La planche **référence** les graphes, elle ne les copie pas. Pour corriger un graphe : **✎** (l'ouvre dans
Graphes), modifier, « Enregistrer », revenir dans Planches puis **« Relire les graphes »**. La planche est
alors à jour.

---

## 11. Recettes rapides

**Comparer élastique et viscoélastique sur la verticale sous la charge**
Ouvrir `verticale_…_el_….txt` et `verticale_…_ve_….txt` → cocher εzz → « Tracer les 2 profils » → renommer
les légendes « Élastique » / « Viscoélastique » si besoin → Enregistrer.

**Les trois composantes de déformation sur un même profil**
Ouvrir un seul fichier → cocher εxx, εyy, εzz → Tracer.

**Carte εzz sous la roue, zoomée**
Ouvrir la coupe YZ → Grandeur εzz → « Tracer la carte » → bornes de l'axe y resserrées autour de la charge
→ « Min / Max couleurs » symétriques (−200 / 200, par exemple) → Enregistrer.

**Profil extrait d'une coupe, comparé à un profil exporté**
Ouvrir la coupe et le profil → « à Y = … » → « Ajouter ce profil » → cocher la grandeur → « Tracer les 2
profils ».

**Article : 3 empreintes × EL / EL-fin / VE (fichiers `coupeXZ_R1_VE_het.txt`…)**
1. Ouvrir toutes les coupes. Dans « Correspondances et couches » : `het` → Hétérogène, `circ` → Circulaire,
   `rect` → Rectangulaire, `VE` → Viscoélastique, `EL` → Élastique, `EL-fin`… (Enregistrer, une fois).
2. Pour chaque coupe : ƒ → repère Z, origine 0, « Changer le sens » (profondeur), puis repère X, origine x0.
3. Cartes εzz : Tracer la carte, isolignes, contour d'empreinte, « Échelles égales », Enregistrer ; puis une
   planche des trois empreintes avec « Même échelle de couleurs ».
4. Écarts : Opérations → A = VE het, B = EL het, « A / B » → carte du rapport ; idem het / circ.
5. Profils : sur une coupe, « Profils extraits » X = 0,70 ; 0,848 ; 0,90 ; 0,967 → décocher les autres →
   Tracer, « Repères des couches ».
6. Synthèse : toutes les coupes, εzz, ε1, εeq → « Copier LaTeX (booktabs) » ; barres : catégories mot 4
   (empreinte), séries mot 3 (matériau).
7. Signal en un point : ouvrir les tables VE et EL → Référence « Extremum de EL… », instant 10 s, pic → Tracer.

**Figure (a) carte + (b) profils pour le manuscrit**
Enregistrer les deux graphes → Planches → + carte, + profils → 2 par ligne, étiquettes (a) → « Même taille »
si on veut des boîtes alignées → Enregistrer → « Copier pgfplots » ou PNG 600 dpi.

---

## 12. En cas de souci

| Message ou symptôme | Cause probable | Que faire |
|---|---|---|
| « Pas des exports COMSOL (en-tête « % Model: … » attendu) » | fichier retouché, ou export d'un autre type | réexporter depuis COMSOL *Export → Données* sans retirer les lignes `%` |
| « … : aucune valeur (export COMSOL vide ?) » | export sans points (ligne de coupe hors du domaine…) | vérifier le jeu de données dans COMSOL |
| Fichier vu comme « coupe » au lieu de « profil » | ligne légèrement oblique | « Lecture » → « Profil selon Z » |
| Carte refusée (« grille régulière ») | plan exporté aux nœuds du maillage | réexporter sur une grille régulière, ou extraire / forcer un profil |
| Carte « couchée » ou axes inversés | ordre des coordonnées | « Lecture » → « Coupe Y × Z » dans l'ordre voulu, ou « Échanger les axes » |
| Libellé ou unité faux | expression non reconnue (§ 1.3) | corriger le libellé de l'axe ou le titre de la barre à la main |
| Légendes peu parlantes (préfixes, mots en trop) | noms de fichiers | renommer les légendes dans le panneau avant de tracer, ou plus tard dans les séries |
| Trous blancs dans la carte | valeurs `NaN` (hors domaine) | normal ; ajuster les bornes des axes pour cadrer la zone utile |
| « Grilles différentes : … » | les deux cas n'ont pas été exportés sur les mêmes points | réexporter les deux sur la même grille régulière (même jeu de données de coupe) |
| « Formule : « … » ne désigne aucune colonne » | nom inconnu ou ambigu | utiliser un nom de la liste sous la formule, ou `c3` |
| « … est hors de la coupe » | valeur de profil en dehors de la grille | vérifier l'unité (m du fichier) et le repère appliqué |
| Table vue comme « Données » | première colonne nommée X, Y ou Z | renommer la colonne de la table dans COMSOL (Temps…) |
| Contour d'empreinte invisible | centre ou rayon dans une autre unité que les axes | les saisir en unités des axes (mm si « Longueurs en mm ») |

---

*Pour les détails techniques (format `graph.json`, champs `carte`, `reperes`, `annotations`, `egalite`,
`planche.json`, `_comsol/reglages.json`), voir `docs/SPEC.md`, section Figures → Graphes.*
