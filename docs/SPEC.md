# Cahier des charges — Thèse

Version 0.2 — 26/09/2026. Validé ; P0 (socle) réalisé.

## 1. Objectif

**Thèse** est l'application de bureau (Windows) qui réunit en un seul logiciel les outils
de la thèse de Lucas David (chaussées aéronautiques, ENTPE / LTDS / LGCB) :

| Module | Remplace | Dépôt d'origine |
|---|---|---|
| **Figures** | Figurine | `LucasDavidTPE/Trace` |
| **Traitement 2S2P1D** | le site de dépouillement de module complexe | `lucasdavid47/2S2P1D-traitement` |
| **Campagnes** | le tableau de bord, les pages de campagne et le viewer d'essai | `lucasdavid47/these-lgcb` |
| **Bibliothèque** | le classeur `Biblio_These_Lucas_MAITRE.xlsx` et ses macros | — |
| **Planning** | *(nouveau)* un Gantt de la thèse, partagé entre les deux PC | — |
| **Accueil** | le panneau Java du hub | `lucasdavid47/lgcb-hub` |
| **ViscoCompare** | le script de comparaison COMSOL / Viscoroute | `LucasDavidTPE/ViscoCompare` |
| **ChaussSpec** | le code Python chausspec v0.4 (calcul spectral de chaussées) | archive `chausspec_v0.4.zip` |

Principes, par ordre d'importance :

1. **Ça marche, sans rien installer d'autre.** Un installeur `.exe`, et c'est tout : ni
   Python, ni Node, ni Java, ni serveur local, ni navigateur à ouvrir.
2. **L'espace se suffit à lui-même** (décidé en 1.2, remplace « les données restent à leur
   place »). Tout ce que l'application utilise ou produit vit dans l'espace : fiches, PDF
   de la bibliographie, figures, dépouillements, et une copie de chaque fichier de données
   ouvert pour une analyse. Les disques de données brutes (`E:\`, sorties machine) ne sont
   que des points d'entrée : lus, jamais modifiés. L'espace s'ouvre tel quel sur l'autre PC
   et s'exporte en un seul `.zip`.
3. **Deux PC, un seul état, via OneDrive.** Tout ce que l'on saisit (références, notes,
   phases du planning, fiches de campagne) vit dans un dossier OneDrive, en fichiers
   JSON lisibles. Aucune dépendance à Google, Microsoft ou un autre service en ligne.
4. **Un module = un installeur possible.** On peut livrer `Figurine` ou
   `Traitement 2S2P1D` seul à un collègue.
5. **Conformité vérifiée, pas affirmée.** Ce qui reproduit un calcul existant (chaîne
   Excel du 2S2P1D, formules du classeur de bibliographie) est comparé automatiquement
   à l'original par des tests.

Hors périmètre, décidé : synchronisation avec Google Agenda ou Outlook, boutons git
(les dépôts sont gérés par ailleurs), version web, macOS et Linux.

## 2. Pile technique (reprise de Figurine)

- **Tauri 2** (Rust) + **TypeScript / React / Vite**, état avec **Zustand**.
- Tests : **Vitest** (TypeScript), `cargo test` (Rust).
- Installeurs `.exe` (NSIS, sans droits administrateur) et `.msi`, construits par
  GitHub Actions sur `windows-latest`.
- Calculs numériques (régression sinusoïdale, calage 2S2P1D / Huet-Sayegh / KVG, WLF) en
  **TypeScript**, repris du code JavaScript existant et déjà validé contre Excel.
  Lecture des gros fichiers d'essai et calcul des aperçus en **Rust** quand la vitesse
  l'exige.
- **Python n'est pas nécessaire.** Il reste possible, plus tard, de lancer un script
  d'étude personnel (`run.py`) si un Python est trouvé sur le poste (phase P7) ; aucune
  fonction de l'application n'en dépend.

## 3. Architecture

Un seul dépôt et un seul `package.json`, organisé en dossiers dont les frontières sont
vérifiées par une règle ESLint locale (`outils/eslint-frontieres.js`) :

```
These/
├─ packages/
│  ├─ noyau/          TypeScript PUR (sans DOM ni Tauri), 100 % testable sous Linux :
│  │                  stockage de l'espace, racines de données, lecture des essais
│  │                  (MTS/Instron, WaveMatrix), modèles et optimiseur, WLF, formats
│  │                  (xlsx, csv, RIS, BibTeX), traceur de courbes commun
│  └─ interface/      composants React partagés : coquille, tableaux, graphiques,
│                     thème, boîtes de dialogue
├─ modules/
│  ├─ accueil/
│  ├─ figures/        l'actuel Figurine (src/core + src/ui)
│  ├─ traitement/     l'actuel 2S2P1D-traitement
│  ├─ campagnes/
│  ├─ bibliotheque/
│  └─ planning/
├─ app/               la coquille : fenêtre, barre des modules, premier lancement,
│                     réglages du poste, diagnostic, plateformes Tauri et démo
├─ src-tauri/         Rust : fichiers, verrous, surveillance du dossier OneDrive,
│                     presse-papiers Windows, détourage ONNX, lecture rapide des essais
├─ tests/golden/      références de conformité (Excel 2S2P1D, classeur biblio, TikZ)
└─ docs/
```

Alias d'import : `@noyau/…` et `@interface/…`. Chaque module a un `manifeste.tsx` à sa
racine (identité, page, état pour l'Accueil, problèmes, actions).

**Règles de dépendance** (vérifiées par le lint, et testées dans `tests/frontieres.test.ts`) :

- un module importe `packages/*`, **jamais un autre module** ;
- un module s'enregistre auprès de la coquille par un **manifeste** (identifiant, titre,
  icône, routes, widgets d'accueil, *fournisseurs* d'éléments de planning) ;
- les liens entre modules passent par des **actions nommées** du registre
  (« ouvrir l'essai X dans le traitement », « enregistrer ce graphe dans Figures »). Si
  le module cible n'est pas compilé dans l'installeur, l'action n'apparaît pas.

### 3.1 Installeurs

Le même code produit plusieurs installeurs. Le produit est choisi à la compilation par
`THESE_PRODUIT` (`npm run construire -- figurine`) : le module virtuel Vite
`virtual:these-produit` n'importe que les manifestes des modules du produit, Tauri reçoit
la surcharge `src-tauri/produits/<produit>.json`, et le code natif propre à un module
(détourage…) sera rangé derrière une *feature* Cargo. Un produit d'un seul module s'ouvre
directement sur ce module, sans barre latérale ni espace :

| Installeur | Modules | Identifiant Windows | Remarque |
|---|---|---|---|
| **Thèse** | tous | `fr.lucasdavid.these` | pour Lucas |
| **Figurine** | Figures | `fr.lucasdavid.figurine` | inclut le modèle de détourage (~100 Mo) |
| **Traitement 2S2P1D** | Traitement | `fr.lucasdavid.traitement2s2p1d` | léger : ni détourage, ni espace OneDrive obligatoire |

Les identifiants distincts permettent d'installer les trois sur un même poste sans
conflit. L'installeur Figurine reste compatible avec la bibliothèque et les réglages de
Figurine 1.0.

## 4. Stockage et synchronisation

### 4.1 L'espace Thèse (partagé, OneDrive)

Choisi au premier lancement (proposé : `…\OneDrive - entpe.fr\Thèse\Espace`). Tout ce
qui est saisi dans l'application y vit, **un fichier par objet** : deux PC qui modifient
deux objets différents ne se gênent jamais, et un conflit OneDrive ne touche qu'un objet.

```
<Espace>/
  espace.json                  version du format, réglages partagés
  bibliotheque/
    parametres.json            axes, mois du plan, capacité, barème, listes de choix
    references/BIB-001.json    une référence (métadonnées, lecture, fiche, notes)
    pdf/BIB-001_….pdf          les PDF (1.2 ; avant : dossier BIBLIO, racine « biblio-pdf »)
    demandes/DEM-001.json
    corrections/COR-001.json   corrections TFE
    pistes/PIS-001.json
    analyse/*.md               synthèses rédigées (analyse croisée §3 à §9)
  planning/
    categories.json
    PH-0001.json               une phase, une tâche ou un jalon
  campagnes/
    tsrst-lucas/
      campagne.json            la fiche (ex-projects/*.toml)
      notes/2026-06-22_incident-essai3.md
      images/…                 photos d'éprouvettes, de montage, captures
      apercus/*.png            aperçus générés (légers, versionnés avec l'espace)
      essais/Essai1/
        essai.json             métadonnées, notes courtes
        traitement.json        le projet 2S2P1D de cet essai (tri des cycles, calages)
  figures/                     la bibliothèque de Figures (1.2 ; format de Figurine 1.0)
  traitement/, chausspec/, numeriseur/, etudes/, viscocompare/, manuscrits/, planning/ …
  donnees/                     copies des données brutes ouvertes pour une analyse (1.2)
    essais/tsrst-lucas/Essai1/Essai1.steps.tracking.csv    ← essais:tsrst-lucas/Essai1/…
    importes/mesure.csv        fichier ouvert hors de toute racine
```

**Données brutes (1.2).** Un fichier ouvert pour une analyse (Traitement, courbes d'une
campagne, ViscoCompare) est copié dans `donnees/<racine>/<chemin>` ; la référence de
racine reste le nom du fichier (`essais:…`). À la lecture : la source si elle est là (la
copie est mise à jour si le fichier a changé, par exemple un essai en cours), sinon la
copie. Sur l'autre PC, sans le disque, tout ce qui a déjà été ouvert reste lisible. La
source n'est jamais écrite. Seuls les fichiers ouverts sont copiés, pas les dossiers
d'essai entiers (décision : OneDrive reste léger).

**Ce qui vivait ailleurs (1.2).** Les PDF (`bibliotheque/pdf`) et la bibliothèque de
figures (`figures`) sont toujours dans l'espace. Un poste qui déclare encore l'ancien
emplacement (racine « biblio-pdf », dossier de figures) le voit dans « À régler » et dans
les réglages : « Rapatrier dans l'espace » copie sans rien écraser (la version de l'espace
gagne toujours), vérifie que chaque fichier est arrivé, puis le poste oublie l'ancien
emplacement. L'ancien dossier n'est jamais supprimé par l'application.

**Export (1.2).** Réglages du poste → « Exporter l'espace (.zip) » : tout l'espace, chemins
conservés, sans les `.tmp` ni les verrous ; écrit à côté puis renommé. Pour archiver la
thèse ou la garder hors du OneDrive de l'école.

Règles, reprises de Figurine et généralisées à tous les modules :

- **Pas de base de données** dans OneDrive : des JSON (et du Markdown pour les textes
  longs), lisibles et réparables à la main. L'index en mémoire est reconstruit en
  scannant.
- **Écriture atomique** (fichier temporaire puis renommage).
- **Chemins relatifs uniquement** dans l'espace. Les données brutes sont désignées par
  **racine** : `essais:tsrst-lucas/Essai1` (comme dans le
  `config.toml` de these-lgcb).
- **Surveillance du dossier** : quand OneDrive apporte une modification faite sur l'autre
  PC, la vue se met à jour seule.
- **Copies de conflit OneDrive** (`BIB-001-NOMPC.json`) détectées et listées dans
  « À régler », avec comparaison des deux versions champ par champ.
- **Verrou** (`.lock`, 12 h) seulement pour les éditions longues (schéma Figurine,
  projet de traitement) ; une référence ou une phase s'enregistre à chaque modification.
- **Identifiants** : `max(existants) + 1` au moment de la création (`BIB-180`,
  `PH-0012`…). Un doublon créé hors ligne sur les deux PC est signalé dans « À régler ».

### 4.2 Réglages de chaque poste (local, jamais dans OneDrive)

`%APPDATA%\<identifiant du produit>\poste.json` : chemin de l'espace, **racines de
données** de ce poste (d'où viennent les données brutes), taille des fenêtres, filtres
mémorisés. Le dossier de figures n'y sert plus qu'au produit Figurine seul, sans espace.

```json
{ "espace": "C:/Users/DAVID/OneDrive - entpe.fr/Thèse/Espace",
  "racines": { "essais": "E:/", "recherche": "C:/Users/DAVID/Desktop/Recherche" } }
```

Une racine absente sur ce poste (les données brutes sur le PC perso) n'est **pas une
erreur** : l'application lit la copie de l'espace de tout ce qui a déjà été ouvert, et ne
grise que ce qui n'a jamais été copié (découvrir de nouveaux essais, par exemple).

## 5. Module Accueil

L'écran d'ouverture. Il remplace le panneau Java du hub et la page `dashboard.html`.

- Une **carte par module** (seulement ceux compilés), avec un état en une ligne.
- **Cette semaine** : phases et jalons en cours (Planning), lectures du mois et
  prochaines lectures conseillées (Bibliothèque), demandes à envoyer ou relancer,
  derniers essais et dernières figures.
- **À régler** : tout ce qui demande une décision (conflits OneDrive, doublons, racine
  introuvable sur ce poste, verrou ancien).
- **Diagnostic** : l'inventaire de ce poste (espace trouvé, racines présentes,
  bibliothèque de figures, modèle de détourage, place disque), remplaçant du
  *diagnostic global* du hub.

## 6. Module Figures (Figurine)

Repris **tel quel** de Figurine 1.0 (voir `docs/figurine/SPEC.md`), ses cinq pages en onglets :
bibliothèque, détourage, schéma, recadrage, graphes, exports TikZ / SVG / PNG /
pgfplots, `figurine.sty`. Les tests golden de Figurine restent verts.

Ajouts permis par l'intégration :

- action **« Enregistrer dans Figures »** offerte aux autres modules (courbe maîtresse,
  graphe d'essai, Gantt) : la figure arrive avec sa source (« Traitement 2S2P1D,
  campagne X, essai Y ») ;
- un graphe créé depuis un essai garde le lien vers ses données : il peut être régénéré
  (les données changent, la mise en forme choisie dans Figures reste) ;
- page Graphes (0.2.7) : **apparence** — `graph.json` accepte un champ facultatif `style`
  (palette #rrggbb, cadre complet ou axes seuls, épaisseur, marques, taille du texte) et,
  par série, `color`, `mark`, `dash`. Sans ces champs, le rendu du thème (noir et gris) est
  inchangé. Préréglages (Couleur, Article, Présentation, Minimal, Séquentiel, Noir et blanc),
  palettes éprouvées (Okabe-Ito, Paul Tol, Tableau 10, Dark2, Viridis…), import d'une
  palette coolors.co (adresse ou codes), **styles enregistrés** dans la bibliothèque
  (`_styles-graphes/<nom>.json`, un fichier par style, partagé entre les postes) ; exports
  SVG et pgfplots identiques (couleurs xcolor explicites) ;
- **modèles de graphes** (courbe maîtresse, Cole-Cole, orniérage, fatigue, TSRST, suivi
  temporel, barres) avec des valeurs d'exemple inventées ; **zoom** de l'aperçu (ajusté,
  Ctrl + molette, taille réelle) et zoom sur une zone des données (fixe les bornes des axes) ;
- **retouche des données** d'un graphe : gomme (rectangle sur l'aperçu, une série ou
  toutes), tableau x ↹ y modifiable ou collé d'Excel, ×/+ sur x ou y (unités, signe, zéro),
  plage de x gardée ou retirée, moyenne glissante, un point sur n, tri, échange des axes,
  duplication ; historique Annuler / Rétablir. « Régénérer » depuis l'essai repart des
  données : les retouches de données sont alors perdues (la mise en forme reste).
- **régression** par série (1.0.2) : champ facultatif `fit: {kind, label}` d'une série
  (`lineaire` y = a·x + b, `origine` y = a·x, `puissance` y = a·xᵇ par moindres carrés en
  log-log) ; courbe en tirets de la couleur de la série sur l'étendue de ses x, et, si
  `label`, équation et R² (4 chiffres significatifs, virgule décimale) dans un encadré au coin
  `fit_pos` du graphe (par défaut, en haut du côté opposé à la légende). Même rendu en SVG et
  en pgfplots (`\addplot coordinates` + `\node` à `rel axis cs`) ; ignorée pour les barres.
  **1.2.1** : types `polynome` (champ `degre`, 2 à 6 ; moindres carrés en x centré-réduit,
  réécrits en puissances de x, termes de bruit d'arrondi omis dans l'équation),
  `exponentielle` y = a·e^(b·x) (en semi-log) et `logarithmique` y = a·ln x + b ; plage
  `xmin` / `xmax` des points pris en compte (saisie, ou rectangle tiré sur l'aperçu), courbe
  sur cette plage ou, avec `prolonger`, sur toute la série ; R² passe à la ligne quand
  l'équation est trop large pour le graphe. R² de la puissance et de l'exponentielle dans
  les variables transformées, comme les courbes de tendance d'Excel.
  **1.2.2** : « Lire sur la courbe » (panneau, pas dans la figure) : y pour un x saisi, y compris
  hors plage (extrapolation), et le ou les x pour un y (`fitInverse` : formule directe pour les
  formes monotones, recherche de racines sur la plage pour le polynôme).

## 7. Module Traitement 2S2P1D

Toutes les fonctions actuelles du site (voir le README du dépôt d'origine) :

- lecture MTS / Instron et WaveMatrix *steps tracking* (`.csv`, `.txt`, `.xlsx`),
  reconnaissance des voies, de l'unité et de la matrice T × f ;
- régression sinusoïdale cycle par cycle, σ₀, ε₀, φ, ν, |E*|, E₁, E₂, indices de
  qualité ;
- tri des cycles réversible et motivé ;
- synthèse par palier, translation des isothermes, WLF, calage **2S2P1D**,
  **Huet-Sayegh**, **KVG** ; plusieurs éprouvettes comparées ;
- bascule **Excel à l'identique / Corrigé** (les cinq particularités du classeur) ;
- exports `.xlsx` (colonne `Retenu`) et fichier projet.

Exigence : les tests de conformité de `test/reference/` (valeurs recalculées par
LibreOffice depuis `Calcul.xlsx`) sont portés et **restent verts à l'identique**.

Mise en œuvre en deux étapes. **Étape 1 (faite)** : la page existante est reprise telle
quelle dans `modules/traitement/statique/` et affichée dans le module ; ses exports passent
par « Enregistrer sous ». **Étape 2 (faite, 0.2.6)** : cœur porté en TypeScript
(`modules/traitement/core/`, calculs inchangés, vérifiés bit à bit contre le JavaScript
d'origine) et interface React ; l'ancienne page reste accessible (« Ancienne page ») jusqu'à
validation sous Windows, puis sera retirée.

Ce qui change à l'étape 2 :

- ouverture directe d'un essai depuis **Campagnes** (plus de fichier à rechercher) ; le
  projet est enregistré dans `campagnes/<c>/essais/<e>/traitement.json`, et ses
  résultats (paramètres calés, courbes maîtresses) s'affichent sur la page de l'essai ;
- dans l'installeur *Traitement 2S2P1D* seul, on ouvre et on enregistre des fichiers
  comme aujourd'hui, sans espace.
- **Enregistrement automatique** (0.2.7) : un essai de campagne s'enregistre avec lui dès
  sa première modification ; un fichier ouvert à la main s'enregistre dans
  `traitement/<nom>-<id>.json` avec la référence de son fichier de mesure (racine du poste,
  sinon sa copie `donnees/importes/…`) et se rouvre depuis « Dépouillements enregistrés »,
  sur l'un ou l'autre PC (1.2 : le fichier de mesure est copié dans l'espace ; un ancien
  enregistrement à chemin absolu est rapatrié à sa réouverture).
- **Calage étendu** (0.2.7) : modèles élémentaires Maxwell, Kelvin-Voigt, Zener, Burgers
  (constantes propres, « Caler tout » ne touche pas aux a_T) ; **séries de Prony** (Maxwell
  ou Kelvin-Voigt généralisé, τ sur une grille, modules par moindres carrés positifs) calées
  sur les mesures translatées ou sur le modèle continu, exports Abaqus (`*VISCOELASTIC,
  TIME=PRONY`, `*TRS` WLF), COMSOL (branches Gᵢ, τᵢ) et CSV ; log a_T borné à ±30 décades
  dans le calage conjoint ; axes des graphiques en français ou en anglais ; graphiques
  envoyés à Figures comme graphes modifiables (pgfplots).
- **« Ce que l'on modélise »** (0.2.7) : schéma rhéologique du modèle calé (valeurs,
  rôle de chaque élément, lien vers son curseur), essai animé sur une éprouvette (sinusoïdal
  avec ν et déphasages, boucle σ–ε ; fluage et relaxation par la série de Prony du modèle),
  export du schéma vers Figures (composants rhéologiques, TikZ).

Le site GitHub Pages actuel n'est plus développé ; il reste en ligne tel quel tant
qu'on ne décide pas de le retirer (voir `QUESTIONS.md`).

## 8. Module Campagnes (ex-these-lgcb)

**Une campagne** = un lot d'éprouvettes passées ensemble ; **un essai** = une éprouvette.

### 8.1 Galerie
Une carte par campagne : aperçu des données (température et force en fonction du temps,
deux bandeaux, jamais de double axe), couleur et pictogramme du type d'essai
(module complexe, TSRST, fluage, fatigue, autre), période réelle
(« 22 → 25 juin 2026 »), chiffres clés (essais, heures d'essai, figures, notes).
Filtres par type, statut, matériau ; recherche sans accents.

### 8.2 Page de campagne
- **Fiche** : titre, type, statut, matériau, dossier de données (par racine), machine
  (opérateur, poste, bâti, logiciel), notes libres.
- **Découverte des essais** dans le dossier de données, d'après les journaux machine
  (dates de début et de fin, durée, nombre de cycles), comme `lgcb` aujourd'hui.
- **Une carte par essai** : ses courbes, sa date, sa durée, l'éprouvette, un bouton
  vers le dossier de données (ouvre l'explorateur), le traitement 2S2P1D s'il existe.
- **Carnet** : notes datées (Markdown) et **images** (collées avec `Ctrl+V`, glissées,
  ou importées) rattachées à la campagne ou à un essai : photos d'éprouvettes, incidents,
  réglages. Recherche plein texte dans les notes.

### 8.3 Viewer d'un essai
Un panneau par famille d'unités (température, force, déformations, position) ; zoom au
glisser, double-clic pour revenir, réticule, légende cliquable. Décimation pour les gros
fichiers (lecture en Rust). Actions : **exporter en Excel** (`.xlsx`), **copier ou
exporter les données brutes** d'un essai vers un dossier choisi, **enregistrer le
graphe dans Figures**, **ouvrir dans le traitement 2S2P1D**.

### 8.4 Reprise de l'existant
Import unique des fiches `projects/*.toml`, des aperçus et des notes de these-lgcb.
Les **études** sont reprises par le module Études (P7). L'**index LaTeX** est repris dans
Manuscrits (onglet Sources LaTeX, racine `latex`), sans la compilation ni les vignettes de
`lgcb/tex.py` : l'application ne lance pas LaTeX, elle montre le PDF déjà compilé.

## 9. Module Bibliothèque (ex-classeur Excel)

Reprend **toutes les fonctions** de `Biblio_These_Lucas_MAITRE.xlsx` (11 feuilles,
179 références, 15 macros), avec une interface faite pour ça.

### 9.1 Données
Une référence (`references/BIB-001.json`) regroupe ce qui est aujourd'hui éparpillé sur
quatre feuilles liées par l'ID :

| Bloc | Champs (colonnes du classeur) |
|---|---|
| Identité | ID, clé, titre, auteurs, année, type RIS, support, vol., n°, pages, éditeur, DOI, identifiant (rapport, norme, ISBN, NNT, HAL) |
| Classement | axe, priorité, mois du plan, TFE, littérature grise, pertinence (1-5), catégories de la matrice croisée (●) |
| Lecture | statut (À lire, En cours, Lu, Écarté), date de lecture, commentaire |
| Accès | type de lien, URL, accès, accès document, comment l'obtenir, fichier PDF, dans Zotero, état du lien et date de contrôle |
| Vérification | statut (Vérifié, Partiel, Non vérifié), source, date |
| Analyse | contribution et lien avec les travaux, voir aussi |
| Fiche de lecture | texte lu et sa source, objectif, méthode, résultats annoncés, limites, pour ta thèse, à vérifier ; dimensions (pneu, contact, loi, méthode, chargement, cible, validation) |
| Notes de lecture | apport central, lien avec mes travaux, équations/valeurs/figures, chapitre visé, à citer, date |

**Calculé, jamais stocké** (mêmes règles que les formules du classeur) : citation
« Auteur et al. (année) », état (EN RETARD, Ce mois-ci, Mois prochain, À venir, Lu,
Écarté), alerte (« Ne pas citer en l'état… », « PDF libre à télécharger »…), **score**
(barème de `Paramètres` : priorité + 5 × (7 − mois) + retard + TFE + vérification
incomplète + PDF libre), temps de lecture estimé, libellés d'axe et de mois.

`parametres.json` : date de début du plan, nombre de mois, capacité de lecture
(h/mois), délai de relance, barème du score, temps de lecture par priorité, axes et
intitulés, objectifs de fin de mois (feuille Planning), listes de choix, préfixe du proxy
ENTPE.

### 9.2 Vues
- **Tableau de bord** : vue d'ensemble (vérification, accès, lecture), avancement par
  axe et par mois (heures prévues, restantes, charge / capacité, état), prochaines
  lectures conseillées (meilleur score), prochaine action.
- **Références** : tableau triable et filtrable (colonnes au choix, filtres mémorisés
  par poste), couleurs d'état comme dans le classeur, recherche sans accents.
- **Fiche d'une référence** : tous les blocs sur une page, onglets Métadonnées /
  Fiche de lecture / Mes notes ; boutons Ouvrir le lien (avec proxy), Ouvrir le PDF,
  doi.org, Scholar, Marquer lu, PDF récupéré. **Bloc PDF** (1.0) : « Pointer le PDF… »
  le renomme selon la convention des PDF rangés (`ID_Auteur[-Auteur2|-etal]_Année_Titre-court.pdf`,
  titre court = six mots significatifs sans accents ; nom modifiable), le renomme sur place
  s'il est déjà dans `bibliotheque/pdf` de l'espace, sinon l'y copie (l'original reste), et note son
  nom dans la fiche ; « Renommer selon la convention » pour un PDF déjà rattaché.
- **Plan de lecture** : un bloc par mois (objectif de fin de mois, documents à demander
  en amont, avancement, liste des références) ; changer le mois d'une référence la
  déplace. Les mois alimentent le **Planning** (§10).
- **Demandes** (PEB, documentation ENTPE, STAC) : date limite d'envoi calculée (premier
  jour du mois d'usage − délai max), relance (envoi + délai), alertes ENVOYER MAINTENANT
  / RELANCER.
- **Corrections TFE**, **Pistes non couvertes** : listes simples avec statut.
- **Analyse croisée** : matrice (● modifiables), totaux et croisements **calculés** ;
  synthèses rédigées (thèmes, convergences, divergences, lacunes, positionnement) en
  Markdown éditable.

### 9.3 Actions (les macros)
| Macro Excel | Dans l'application |
|---|---|
| OuvrirLien, OuvrirPDFLibresDuMois | boutons sur la fiche et sur la sélection |
| MarquerLu, MarquerPDFRecupere | boutons, sur une ou plusieurs lignes |
| FiltrerMoisEnCours, AfficherTout, TrierParScore, TrierParID | filtres et tris enregistrés |
| AjouterReference | formulaire ; si un DOI est saisi, proposition de remplir les métadonnées (requête OpenAlex / Crossref **à la demande**, jamais automatique) |
| VerifierDoublons | contrôle permanent (clé, DOI, titre), signalé dans « À régler » |
| VerifierLiens | bouton : teste chaque lien et note l'état et la date |
| ExporterRIS | export RIS (toute la base ou la sélection) pour Zotero |
| *(nouveau)* | **export BibTeX** (`.bib`) pour LaTeX, clés identiques |
| GenererNotesObsidian, GenererPointMensuel | export Markdown (si Obsidian reste utilisé, voir `QUESTIONS.md`) |
| ExporterCalendrierICS | remplacé par le Planning |
| SuiviRelances, MajTableauDeBord | inutiles : tout est recalculé en direct |

### 9.4 Migration
**Import du classeur** (`.xlsx`) relançable : tant que la bascule n'est pas faite, on
continue à travailler dans Excel et on réimporte. Les PDF du dossier `BIBLIO` sont
rapatriés dans l'espace (`bibliotheque/pdf`, 1.2).

Exigence : un test lit le classeur, importe, recalcule citation / état / alerte / score
/ temps et tous les indicateurs du tableau de bord, et les compare aux **valeurs mises
en cache par Excel**. Même démarche que pour le 2S2P1D. Le classeur réel est versionné dans
`modules/bibliotheque/tests/fixtures/` (le dépôt est privé).

Deux défauts du classeur, constatés par ce test (26/09/2026), sont corrigés dans
l'application :

- `Références!O` (« PDF récupéré ») teste la clé (`$B`) au lieu du fichier (`$BB`) à
  partir de la ligne 124 : 43 références y sont « Oui » sans PDF ;
- sur 49 références, l'alerte et le score enregistrés par Excel traitent le PDF comme
  manquant alors que la colonne O dit « Oui ».

Règle retenue : **PDF récupéré ⇔ fichier PDF renseigné**. Conséquence visible : 20 PDF
libres à télécharger au lieu de 29 dans le classeur.

## 10. Module Planning (Gantt partagé)

Un calendrier de thèse **propre à l'application**, synchronisé par OneDrive, sans aucun
service extérieur.

### 10.1 Éléments
Un élément (`planning/PH-0001.json`) :

- titre, **catégorie**, début et fin (ou une seule date pour un **jalon**) ;
- **actif** (oui / non) : un élément désactivé est masqué partout (Gantt, Accueil) sans
  être supprimé. Le choix est partagé entre les deux PC ;
- avancement (%), notes, couleur (par défaut celle de la catégorie) ;
- sous-éléments (une phase contient des tâches), repliables ;
- lien facultatif vers un objet d'un autre module (une campagne, un axe de
  bibliographie, une figure…).

Catégories par défaut, modifiables et extensibles : **Bibliographie**, **Campagne
d'essais**, **Modélisation**, **Rédaction**, **Réunion / comité de suivi**, **Congrès**,
**Formation**, **Enseignement**, **Congés**. Chaque catégorie peut être activée ou
désactivée d'un clic.

### 10.2 Éléments fournis par les autres modules
Affichés dans des lignes à part, activables comme les autres, **non modifiables dans le
Gantt** (on les modifie à leur source, un clic y mène) :

- **Bibliothèque** : un bloc par mois du plan de lecture, avec charge / capacité et
  avancement ; les dates limites des demandes en jalons ;
- **Campagnes** : la période réelle de chaque campagne (dates des essais), ou la période
  prévue pour une campagne à venir.

### 10.3 Vues
- **Gantt** : zoom semaine / mois / trimestre / thèse entière, ligne « aujourd'hui »,
  glisser pour déplacer ou étirer, double-clic pour créer, regroupement par catégorie.
- **Liste** : les mêmes éléments en tableau, triables.
- **Cette semaine** : widget de l'Accueil.
- Export **PNG / SVG** et **pgfgantt** (TikZ) pour un comité de suivi ou le manuscrit,
  via Figures.

## 11. Module ViscoCompare

Remplace le script `main.py` de `LucasDavidTPE/ViscoCompare` (Python, pandas, xlsxwriter).
La racine de poste `viscocompare` désigne un dossier organisé comme celui du script
(`COMSOL/*.csv` avec « V=… » dans le nom, `VISCOROUTE/Vitesse_…/*.json`), ou un dossier
qui en contient plusieurs. Lecture et conversions **identiques** au script (colonnes
renommées, déplacements COMSOL en µm, `arc_length` − 5 m, profil Viscoroute en x = 0,
signe inversé pour UX et UZ, × 10⁶, interpolation sur le y de la première grandeur),
vérifiées par des tests ; les conventions restent modifiables à l'écran. Ajouts : les
fichiers écartés sont listés (le script les taisait), écart sur l'extremum de chaque
grandeur, figures régénérables. Les classeurs `comparaison_<v>.xlsx` reprennent les
feuilles du script, sans ses graphiques Excel ; ils vont dans l'espace
(`viscocompare/<étude>/`, 1.2) et non plus dans `EXCEL_OUTPUT` à côté des calculs, qui ne
sont jamais modifiés. Les fichiers lus sont copiés dans `donnees/viscocompare/`.

## 11 bis. Module ChaussSpec (1.0)

Portage TypeScript du code Python **chausspec v0.4** (calcul semi-analytique spectral de
chaussées multicouches élastiques / viscoélastiques sous chargements de surface quelconques),
sans Python : lois (élastique, 2S2P1D + WLF, KVG, Maxwell généralisé), interfaces collées ou
glissantes, fond semi-infini ou rigide (collé, glissant), empreintes (rectangle, disque,
séparable dont De Beer, carte de pression mesurée), atterrisseurs multi-roues, efforts
tangentiels ; régimes statique, harmonique (HWD, champs complexes) et charge roulante ; solveur
grille (FFT + partition de l'unité) et solveur axisymétrique. Conformité : références produites
par le Python d'origine (noyau à 1e-9, grilles à 1e-9, 1e-7 là où interviennent Bessel et le
régime harmonique). Un cas = `chausspec/<nom>.json` dans l'espace, au **format JSON du Python**
(`python -m chausspec cas.json` le calcule aussi) ; une carte de pression peut y être incluse.
Calcul dans un Worker, cartes des champs, extrêmes et ε1, coupes, jauges (charge roulante),
export du dossier de résultats au format du Python, cartes et courbes vers Figures, constantes
2S2P1D reprises du Traitement (action `traitement.calages`).

Organisation du code (1.0.3) : `core/` suit le paquet Python fichier par fichier
(`kernel.ts` ↔ `kernel.py`, `grid.ts` ↔ `grid.py`…), avec les mêmes noms de classes et de
fonctions, les mêmes étapes et les mêmes commentaires, et calcule comme numpy sur des paquets
de nombres d'onde (`core/carray.ts`) ; une modification du Python se reporte au même endroit.
La correspondance et les conventions d'écriture sont dans `modules/chausspec/README.md`.

Écart assumé : effort tangentiel + interface glissante est refusé (problème mal posé ; le
Python renvoie des NaN). Non porté : le module texture (contact, deux échelles, éléments finis
2D), prévu pour une version suivante.

## 11 ter. Module Numériseur (1.1)

Relever les valeurs d'un graphique à partir de son image (capture d'un article, d'un PDF,
photo d'un écran). Image ouverte (PNG, JPEG, WebP, BMP, GIF), collée (Ctrl+V) ou déposée.

- **Étalonnage** : deux points connus sur l'axe des x (X1, X2) et deux sur l'axe des y
  (Y1, Y2), placés à la loupe et déplaçables, avec leurs valeurs ; échelles linéaires ou
  logarithmiques ; image tournée ou axes non perpendiculaires admis (repère oblique défini
  par les deux axes).
- **Courbes XY** : séries de points ; relevé automatique par la couleur (pipette ou couleurs
  dominantes proposées, anticrénelage écarté ; tolérance ΔE CIELAB ; zone de recherche) :
  en « ligne », un point tous les n pixels le long de l'axe des x, en suivant la courbe à
  travers les croisements ; en « symboles », un point au centre de chaque symbole. Points
  modifiables (glisser, ajouter, Suppr, tableau). Exports : CSV, copie pour Excel,
  graphe modifiable dans Figures (`figures.enregistrer-graphe`).
- **Carte de couleurs** : légende étalonnée par deux points (début, fin) et leurs valeurs
  (lin ou log) ; chaque pixel de la zone de la carte prend la valeur de la couleur de légende
  la plus proche (interpolée entre deux couleurs voisines, CIELAB), rien au-delà de la
  tolérance (fond, texte, traits). Coupes le long de lignes (graphe, CSV, Figures). Moyennes
  sur un maillage : rectangulaire (matrice au format des cartes de pression de ChaussSpec),
  disques de rayon R sur une trame carrée ou hexagonale, polaire (anneaux × secteurs) ;
  résultante Σ valeur × aire.
- **Vers ChaussSpec** : les disques deviennent un ensemble de charges circulaires uniformes,
  le maillage rectangulaire une carte de pression, avec conversion des unités (axes en m, cm
  ou mm ; valeurs en Pa, kPa, MPa, bar) ; ils remplacent le chargement du cas ouvert
  (action `chausspec.importer-chargement`, la structure est gardée).
- Un projet = `numeriseur/<nom>.json` (format `numeriseur/1`) et son image à côté, dans
  l'espace. Calculs dans `modules/numeriseur/core/` (TypeScript pur, testés sur des images
  dessinées par les tests). Axes supposés linéaires pour les moyennes de maillage.

## 12. Exigences générales

- Interface et messages **en français** ; code, identifiants et commits en anglais
  (convention de Figurine).
- **Aucune requête réseau** sans geste explicite (vérifier les liens, remplir depuis un
  DOI, ouvrir une page).
- Démarrage en moins de 3 s ; la galerie et la bibliothèque (quelques centaines
  d'objets) s'affichent sans attente perceptible.
- Exports **déterministes** (même entrée → mêmes octets), pour les tests golden.
- Tout ce qui est testable l'est sous Linux par des tests automatiques ; le reste est
  listé dans `docs/A_TESTER_MANUELLEMENT.md`, tenu à jour à chaque phase.
- Licences des dépendances notées dans `docs/LICENCES.md`.
