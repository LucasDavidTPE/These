# Tracer des exports COMSOL dans Thèse

Guide d'utilisation de tout ce que **Figures → Graphes** sait faire avec les fichiers exportés de COMSOL
(versions 1.24.0 à 1.25.0) : les données attendues, ce que l'appli en comprend, les tracés possibles, les
réglages après coup, l'enregistrement, les exports LaTeX et l'assemblage en planches.

En bref :

1. Dans COMSOL, exporter des **Données** (profil le long d'une ligne, ou coupe sur un plan) en `.txt`.
2. Dans Thèse, *Figures → Graphes → « Ouvrir des exports COMSOL… »*, en choisissant un ou plusieurs fichiers.
3. **Tracer** : les profils superposés, la carte en couleurs d'une coupe, ou un profil extrait d'une coupe.
4. **Retoucher** à droite (axes, légendes, couleurs, palette, taille), puis **Enregistrer** dans la bibliothèque.
5. **Exporter** en pgfplots, SVG ou PNG, ou **assembler** plusieurs graphes dans une planche (a), (b)…

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
| `solid.ep1`, `solid.ep3` (principales) | `$\varepsilon_{1}$`, `$\varepsilon_{3}$` | selon le facteur |
| `1e-6*solid.sZZ` (unité `Pa`) | `$\sigma_{zz}$` | MPa |
| `1e-3*solid.sp1` | `$\sigma_{1}$` | kPa |
| `solid.mises` | `$\sigma_{VM}$` | Pa (ou selon le facteur) |
| `1e6*u`, `1e3*w` (unité `m`) | `$u_{x}$`, `$u_{z}$` | µm, mm |
| toute autre expression | l'expression telle quelle | facteur + unité COMSOL |

Facteurs reconnus : `1e6`, `1e3`, `100`, `1` pour les grandeurs sans dimension et les longueurs, `1e-6`, `1e-3`
pour les pascals. Un facteur inconnu s'affiche tel quel (« 1e4 Pa »). Tous ces libellés se corrigent
ensuite à la main (§ 6).

---

## 2. Ouvrir les fichiers

*Figures → Graphes*, panneau **« Exports COMSOL »** (colonne de gauche) → **« Ouvrir des exports COMSOL… »**.

- On peut en choisir **plusieurs d'un coup** (Ctrl+clic) ; d'autres s'ajoutent ensuite à la liste.
- Chaque fichier est listé avec ce que l'appli a détecté : « profil vertical (Z), 161 points », « coupe YZ,
  263 × 65 points », « nuage 3D… ». Le survol affiche le modèle, la date et les paramètres de l'étude.
- **×** retire un fichier de la liste. Les fichiers sont lus, jamais modifiés.
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

Chaque légende se **modifie à la main** dans le champ « Légende » sous le fichier, avant de tracer. La
légende du graphe est placée dans le **coin le moins chargé** en points.

### 3.4 Tracer

**« Tracer le profil »** ou **« Tracer les N profils »** remplace le graphe en cours, après confirmation
s'il y en a un. Le résultat est un **graphe ordinaire**, modifiable entièrement (§ 6) :

- titre proposé : « εzz — 3 profil(s) COMSOL » ;
- taille de départ : 90 × 110 mm pour un profil vertical, 130 × 80 mm pour un profil horizontal ;
- quadrillage, thème « these », courbes en traits continus.

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

### 4.2 Extraire un profil d'une coupe

Sous « Ou extraire un profil » : choisir une ligne de la grille (« à Y = … » ou « à Z = … », valeurs
proposées dans la grille), puis **« Ajouter ce profil »**. Le profil rejoint la liste des fichiers sous le
nom `coupe_… (Y = 4.6 m)` et se trace avec les autres profils, avec légende, superposition et orientation.
C'est l'outil idéal pour comparer « au droit de la roue » et « entre les roues » à partir d'un seul export de
plan.

---

## 5. Ce qui n'est pas (encore) possible

- **Nuage 3D** (trois coordonnées qui varient) : pas de carte ni de profil direct. Exporter plutôt une ligne
  ou un plan de coupe.
- **Coupe aux nœuds du maillage** (grille non régulière) : pas de carte, il faut réexporter sur une grille
  régulière. On peut encore forcer la lecture en profil.
- **Virgule décimale** dans les valeurs (export retouché dans Excel en français) : non lue, il faut garder
  le point de COMSOL.
- **Isolignes** (contours) et **interpolation lisse** de la carte : non faits. La carte est en cellules
  (paliers), comme `matrix plot` de pgfplots.
- **Calculs entre colonnes** (ε1 − ε3, rapport de deux cas…) : à faire dans COMSOL, en exportant
  l'expression voulue directement.
- La **liste des fichiers ouverts** n'est pas enregistrée : seul le graphe tracé l'est. Pour refaire un tracé
  d'un autre fichier, il faut le rouvrir.

---

## 6. Retoucher le graphe (tout est modifiable après coup)

Une fois tracé, un profil ou une carte est un graphe normal de la page Graphes. Tout se règle à droite :

- **Axes** : libellés (`$…$` pour LaTeX), bornes, échelle log, graduations, axes FR/EN.
- **Séries** : nom (légende), couleur, style de trait, marqueurs, épaisseur. On peut aussi en ajouter, en
  dupliquer ou en retirer.
- **Données** (colonne de gauche) : gomme, tableau x ↹ y, ×/+ sur x ou y (changement d'unité, de signe),
  moyenne glissante, échange des axes. Annuler / Rétablir sont disponibles.
- **Apparence** : taille en mm, thème, palettes, styles enregistrés, position de la légende, quadrillage.
- **Carte** : le bloc « Carte en couleurs » (§ 4.1).

---

## 7. Enregistrer et exporter

- **« Enregistrer »** range le graphe dans la **Bibliothèque de figures** (`FIG-xxxx`), avec `graph.json`
  (toutes les données et tous les réglages, carte comprise), la vignette et les exports. Il se rouvre et se
  modifie plus tard comme les autres graphes.
- **« Copier pgfplots » / export `.tex`** produit le code à coller dans LaTeX (nécessite
  `\usepackage{figurine}`) :
  - profils : un `axis` avec une `\addplot` par courbe, couleurs `xcolor` explicites ;
  - carte : `\addplot[matrix plot*, mesh/cols=…, mesh/rows=…, point meta=explicit]` avec la grille en
    table (ou dans un fichier `.dat` séparé), la palette écrite en `colormap={carte}{rgb255=…}` en paliers
    (`colormap access=piecewise constant`, donc les mêmes teintes que l'aperçu), `point meta min/max`, et la
    barre de couleurs (`colorbar`) avec son titre. Les trous (`NaN`) sont gérés (`unbounded coords=jump`).
- **SVG** et **PNG** (300 / 600 dpi) : identiques à l'aperçu.

> Pour une carte très fine (plusieurs dizaines de milliers de cellules), la compilation LaTeX peut être lente.
> Dans ce cas, réexporter de COMSOL sur une grille plus lâche, ou utiliser le PNG.

---

## 8. Assembler plusieurs graphes : les planches

*Figures → **Planches*** (1.25.0) : plusieurs graphes de la bibliothèque réunis en une seule figure, par
exemple la carte εzz en (a) et les profils verticaux en (b).

1. Enregistrer d'abord chaque graphe dans la bibliothèque (§ 7).
2. Dans Planches, colonne de gauche : rechercher (titre, tag, `FIG-…`) puis **+** pour ajouter. Depuis la
   Bibliothèque, le bouton « Ajouter à une planche » d'un graphe fait la même chose.
3. Régler à droite :
   - l'**ordre** (↑ ↓) et le retrait (×) des graphes ;
   - le nombre de **graphes par ligne** (1 à 6) et l'**espacement** (mm) ;
   - les **étiquettes** : (a), (b)… / a), b)… / (A), (B)… / aucune ;
   - **« Même taille pour tous les graphes »** (largeur × hauteur en mm), sinon chacun garde la sienne.
     Les colonnes prennent alors la largeur de leur plus large graphe.
4. **« Enregistrer »** crée une figure de type « Planche » dans la Bibliothèque, rouvrable par « Ouvrir dans
   Planches ».
5. Exports : **pgfplots** (une seule `tikzpicture`, un `axis` par graphe placé au millimètre près comme dans
   l'aperçu, étiquettes en gras), **SVG**, **PNG 600 dpi**, ou copie dans le presse-papiers.

La planche **référence** les graphes, elle ne les copie pas. Pour corriger un graphe : **✎** (l'ouvre dans
Graphes), modifier, « Enregistrer », revenir dans Planches puis **« Relire les graphes »**. La planche est
alors à jour.

---

## 9. Recettes rapides

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

**Figure (a) carte + (b) profils pour le manuscrit**
Enregistrer les deux graphes → Planches → + carte, + profils → 2 par ligne, étiquettes (a) → « Même taille »
si on veut des boîtes alignées → Enregistrer → « Copier pgfplots » ou PNG 600 dpi.

---

## 10. En cas de souci

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

---

*Pour les détails techniques (format `graph.json`, champ `carte`, `planche.json`), voir `docs/SPEC.md`,
section Figures → Graphes.*
