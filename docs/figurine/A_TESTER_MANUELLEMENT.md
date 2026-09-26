# À tester manuellement (Windows)

L'environnement cloud est sous Linux : ce qui suit ne peut pas être vérifié
automatiquement. À dérouler après chaque `git pull`, cocher ce qui marche, noter les
problèmes (issue GitHub ou prompt de la session suivante).

Prérequis sur le PC : Node 22, Rust stable (`rustup`), outils de compilation C++ de
Visual Studio (« Desktop development with C++ »), WebView2 (déjà présent sous
Windows 10/11 à jour).

## S0 — Squelette

### Lancement en développement
- [ ] `npm install` puis `npm run tauri dev` ouvre une fenêtre intitulée « Figurine ».
- [ ] La fenêtre fait environ 1280 × 800 et ne descend pas sous 800 × 500 au redimensionnement.
- [ ] Barre latérale à gauche : Bibliothèque, Détourage, Schéma, Recadrage, Graphes
      (dans cet ordre), « Bibliothèque » sélectionnée au démarrage.
- [ ] Un clic sur chaque entrée affiche la page correspondante (titre + « Module pas
      encore disponible. »), l'entrée active est en gras.
- [ ] Les accents s'affichent correctement (« Détourage », « Bibliothèque »).
- [ ] Mode sombre de Windows : l'interface passe en couleurs sombres et reste lisible.
- [ ] Aucune fenêtre de console noire n'apparaît à côté de l'appli dans l'installeur
      (en `tauri dev`, la console du terminal est normale).

### Installeurs (GitHub Actions)
- [ ] Après un push, l'onglet Actions montre le workflow `build-windows` vert et un
      artefact `figurine-installeurs` contenant un `.msi` et un `.exe`.
- [ ] L'`.exe` (NSIS) s'installe **sans demande de droits administrateur**, en français,
      dans `%LOCALAPPDATA%\Figurine`.
- [ ] Le `.msi` s'installe (il demandera probablement les droits admin : voir
      `docs/QUESTIONS.md`, Q1).
- [ ] Raccourci « Figurine » dans le menu Démarrer, avec l'icône provisoire (couches
      grises sous une flèche).
- [ ] L'appli installée se lance et se désinstalle proprement (Paramètres → Applications).
- [ ] Windows SmartScreen avertit (installeur non signé) : « Informations
      complémentaires » → « Exécuter quand même » fonctionne.

## S1 — Stockage (pas encore d'interface)

La bibliothèque n'a pas encore d'écran (S2). Ces tests se font depuis la console de
développement de `npm run tauri dev` : clic droit dans la fenêtre → « Inspecter » →
onglet « Console ». Préparer d'abord une variable avec le chemin d'un dossier de test
**dans OneDrive**, par exemple :

```js
const inv = window.__TAURI_INTERNALS__.invoke;
const root = "C:\\Users\\<vous>\\OneDrive\\Figurine-test";   // à créer avant
```

### Écritures et lecture
- [ ] `await inv("host_name")` renvoie le nom du PC (celui de Paramètres → Système → Informations).
- [ ] `await inv("library_create_dir", {root, path: "FIG-0001_chaussée à l'étude"})` crée le dossier.
- [ ] `await inv("library_write_text", {root, path: "FIG-0001_chaussée à l'étude/meta.json", content: '{"id":"FIG-0001"}'})`
      crée le fichier ; aucun `meta.json.tmp` ne reste dans le dossier.
- [ ] Répéter l'écriture 20 fois de suite rapidement (boucle `for`) pendant que OneDrive
      synchronise : aucune erreur « accès refusé ».
- [ ] `await inv("library_list_dir", {root, path: ""})` liste le dossier, accents corrects.
- [ ] `await inv("library_read_text", {root, path: "FIG-0001_chaussée à l'étude/meta.json"})`.
- [ ] `await inv("library_read_text", {root, path: "..\\secret.txt"})` est refusé
      (`invalid-path`).
- [ ] Un fichier « disponible en ligne uniquement » (icône nuage) se lit correctement
      (OneDrive le télécharge à la demande).

### Verrous entre les deux PC
- [ ] PC 1 : `await inv("library_lock_acquire", {root, folder: "FIG-0001_chaussée à l'étude", force: false})`
      → `{outcome: "new"}` ; le fichier `.lock` apparaît avec le nom du PC 1.
- [ ] Attendre la synchro, puis PC 2 : même commande → erreur `locked` citant le PC 1.
- [ ] PC 2 avec `force: true` → `{outcome: "forced", …}`.
- [ ] PC 1 : `library_lock_release` sans `force` → erreur `locked` (le verrou est au PC 2).
- [ ] Modifier `since` du `.lock` à la main (date d'il y a 13 h) → l'autre PC le reprend
      avec `{outcome: "took-over-stale"}`.

### Copies de conflit OneDrive (à vérifier une fois, important)
L'appli suppose que OneDrive nomme les copies de conflit `meta-NOMPC.json` (voir
`docs/QUESTIONS.md`, Q6). Pour le vérifier :
- [ ] Mettre un PC hors ligne (mode avion), modifier `FIG-0001_…/meta.json` sur les deux PC,
      puis rebrancher. Noter **le nom exact** de la copie créée par OneDrive, et le
      reporter dans la session suivante s'il ne suit pas la forme `meta-NOMPC.json`.

## S2 — Bibliothèque

Astuce : `npm run dev` puis ouvrir http://localhost:1420 dans un navigateur affiche
l'interface en **mode démonstration** (bibliothèque d'exemple en mémoire, rien n'est
enregistré). Ce qui suit se teste dans la vraie appli (`npm run tauri dev` ou installée).

### Premier lancement
- [ ] Au tout premier lancement, l'écran « Bienvenue » propose `…\OneDrive\Figurine`
      (ou `…\OneDrive - <organisation>\Figurine` pour un compte pro/école).
- [ ] « Parcourir… » ouvre le sélecteur de dossier Windows.
- [ ] « Utiliser ce dossier » crée le dossier s'il n'existe pas et affiche la grille (vide).
- [ ] Relancer l'appli : l'écran d'accueil ne réapparaît pas.
- [ ] Le choix est dans `%APPDATA%\fr.lucasdavid.figurine\settings.json` (pas dans OneDrive).
- [ ] La taille et la position de la fenêtre sont retrouvées au lancement suivant.
- [ ] Sur le 2ᵉ PC (autre nom de session), choisir le même dossier OneDrive : mêmes figures.

### Grille, recherche, filtres
Copier à la main un dossier de figure d'exemple, par ex. `FIG-0001_test\meta.json` :
`{"id":"FIG-0001","title":"Chaussée test","kind":"image","created":"2026-09-25T10:00:00+02:00","modified":"2026-09-25T10:00:00+02:00"}`
et une image `original.png` à côté.
- [ ] « Actualiser » fait apparaître la figure, avec la vignette de `original.png`.
- [ ] Une image PNG transparente s'affiche sur un damier.
- [ ] La recherche « chaussee » (sans accent) trouve « Chaussée test ».
- [ ] Les cases Schéma / Image / Graphe / Recadrage filtrent ; « Sans source ou sans
      licence » ne garde que les figures à compléter.

### Métadonnées
- [ ] Clic sur une figure → panneau de droite ; « Modifier » crée un `.lock` dans son dossier.
- [ ] Une année invalide (« 19x7 ») est signalée sous le champ, rien n'est enregistré.
- [ ] Avec auteur + année, le bouton « Proposer : Adapté de … (année). » remplit la légende.
- [ ] « Enregistrer » réécrit `meta.json` (clés dans l'ordre de la SPEC) et supprime le `.lock`.
- [ ] « Annuler » supprime le `.lock` sans rien modifier.

### Verrou d'un autre poste
- [ ] PC 1 : « Modifier » sur une figure et laisser ouvert. PC 2 (après synchro) :
      « Actualiser » → badge « Ouverte sur PC-1 », bandeau « Lecture seule » dans le panneau.
- [ ] PC 2 : « Forcer la modification » permet d'éditer.

### À régler
- [ ] Copier `meta.json` en `meta - Copie.json` dans un dossier : « À régler (1) »,
      « Comparer » montre les deux versions ; « Garder cette version » range l'autre dans
      `.conflits\`.
- [ ] Créer un fichier `meta.json.tmp` : « Supprimer le fichier temporaire » le supprime.
- [ ] Dupliquer un dossier de figure sous un autre nom avec le même `FIG-…` :
      « Renuméroter » renomme la copie la plus récente avec un nouvel ID.
- [ ] Limite connue : une vignette modifiée hors de l'appli peut rester en cache jusqu'au
      redémarrage.

## S3 — Détourage

Prérequis en développement : `npm run fetch-models` (une fois ; télécharge ≈ 250 Mo).
Dans l'installeur, le modèle est inclus : **vérifier que le détourage marche sans Internet**
(mode avion).

### Détourage
- [ ] Page Détourage, `Ctrl+V` après avoir copié une photo d'objet sur fond uni :
      le résultat s'affiche sur damier en moins de 3 s (hors premier lancement).
- [ ] Noter la durée affichée (« Détourage : x,x s ») pour une photo d'environ 1 Mpx : ______
- [ ] « Ouvrir… » accepte PNG, JPEG, BMP, GIF, WebP.
- [ ] Glisser un fichier image depuis l'Explorateur sur la fenêtre le charge.
- [ ] Seuil : vers la droite, le fond disparaît davantage ; « Douceur » adoucit la coupe ;
      « Lissage des bords » arrondit les contours.
- [ ] Pinceau « Garder » sur une zone retirée la fait réapparaître ; « Retirer » l'efface ;
      « Annuler les retouches » revient au masque du modèle.
- [ ] « Voir l'original » montre l'image d'origine.
- [ ] Une image PNG déjà transparente reste transparente là où elle l'était.

### Presse-papier : coller (source préremplie)
Copier une image (clic droit → « Copier l'image »), coller dans Figurine, puis
« Enregistrer dans la bibliothèque » et regarder la source dans la bibliothèque :
- [ ] **Chrome** (page web) : image collée ; source = adresse de la page, note = adresse de l'image.
- [ ] **Edge** : idem.
- [ ] **Firefox** (si utilisé) : image collée ; source éventuellement absente (Firefox ne
      fournit pas toujours `SourceURL`).
- [ ] **Word** : copier une image insérée → collée ; pas de source (normal).
- [ ] **PowerPoint** : copier une image avec transparence → collée **avec** sa transparence
      (format « PNG » du presse-papier).
- [ ] Capture d'écran (`Win+Maj+S`) → collée (format DIB).
- [ ] Rien d'image dans le presse-papier → message « Le presse-papier ne contient pas d'image ».

### Presse-papier : copier le résultat
« Copier », puis `Ctrl+V` dans :
- [ ] **Word** : image **transparente** (poser sur un fond de couleur pour vérifier).
- [ ] **PowerPoint** : image transparente.
- [ ] **Paint** (qui lit le DIB) : image sur fond **blanc** (normal, voir QUESTIONS Q11).
- [ ] **Chrome** (par ex. un champ de message qui accepte les images) : image collée.

### Enregistrer
- [ ] « Enregistrer sous… » écrit un PNG transparent à l'endroit choisi (chemin avec accents).
- [ ] « Enregistrer dans la bibliothèque » crée `FIG-xxxx_<titre>` avec `original.png`,
      `export.png` et `meta.json` (kind = image, légende « Adapté de <site>. » si source web).
- [ ] Taille de l'installeur `.exe` / `.msi` produit par la CI : ______ Mo.

## S4 — Cœur des schémas (pas d'interface)

Les exports sont testés automatiquement (golden + compilation `pdflatex` dans le cloud).
À vérifier avec **votre** installation LaTeX (MiKTeX ou TeX Live) :
- [ ] Copier `tex/figurine.sty` et `tests/golden/s4-structure.tex` dans un dossier, puis
      compiler un document minimal :
      `\documentclass{article}\usepackage{figurine}\begin{document}\input{s4-structure.tex}\end{document}`.
      Les hachures s'affichent (sinon : pgf trop ancien, `patterns.meta` manquant).
- [ ] Même test avec le préambule de la thèse (police, `babel` français…) : pas de conflit.
- [ ] Ouvrir `tests/golden/s4-structure.svg` dans Word (Insertion → Images) : la taille est
      de 14 × 9 cm, les hachures s'affichent. (Les `$…$` apparaissent en brut jusqu'à S7.)
- [ ] Ouvrir `tests/golden/s4-rheologie.svg` dans Inkscape : éléments groupés par `id`.

## S5 — Composants (pas encore d'interface d'édition : S6)

Les figures de validation sont dans `tests/golden/` (`.json` source, `.tex` et `.svg`
générés, compilés avec pdflatex dans le cloud). À relire avec un œil de spécialiste :
- [ ] `s5-kvg9` : chaîne KVG à 9 éléments (+ ressort $E_0$), étiquettes $E_i$, $\eta_i$.
- [ ] `s5-2s2p1d` : modèle 2S2P1D complet. **Le symbole de l'élément parabolique**
      (cylindre + piston courbe) correspond-il à celui de vos références ? (QUESTIONS Q16)
- [ ] `s5-structure-gaussiennes` : 4 couches sous le profil à 5 gaussiennes
      (centres −0,16 … 0,16 m, σ = 0,0315 m). Les centres intermédiaires (±0,08 m) sont
      une hypothèse (QUESTIONS Q17).
- [ ] `s5-bogie` : bogie A340 2 × 2 et bogie 3 × 2.
- [ ] `s5-rheologie-elements`, `s5-appuis-charges`, `s5-profils` : aspect des éléments,
      appuis, charges et profils (uniforme, parabolique inverse, fonction).
- [ ] Compiler un des `.tex` avec votre préambule de thèse (voir S4).

## S6 — Éditeur de schémas

Astuce : la même page est utilisable dans un navigateur (`npm run dev`, mode démo).
- [ ] Page Schéma : glisser « Ressort » de la palette sur la planche ; un clic sur un
      élément de la palette l'ajoute au centre de la vue.
- [ ] Molette = zoom autour du curseur ; Alt + glisser (ou bouton du milieu) = déplacer la
      vue ; le bouton « xx % » ajuste la planche à la fenêtre.
- [ ] Clic = sélection, Maj + clic = ajout à la sélection, glisser dans le vide = rectangle
      de sélection ; déplacement à la souris aimanté à la grille (case « Aimanter »).
- [ ] Glisser la poignée d'extrémité d'un ressort près d'un rectangle : un cercle orange
      montre l'ancre, la poignée devient pleine (liée) ; déplacer le rectangle : le ressort suit.
- [ ] Panneau de droite : chaque paramètre modifiable (nombres avec virgule décimale),
      liste des couches d'un empilement (ajouter, monter, descendre, supprimer).
- [ ] Renommer un élément (champ « Identifiant ») : les liaisons suivent.
- [ ] Ctrl+Z / Ctrl+Y, Ctrl+C / Ctrl+V / Ctrl+X, Ctrl+D (dupliquer), Suppr, flèches (Maj :
      pas de 10), Ctrl+A, Échap.
- [ ] « Disposition… » : aligner, répartir, premier plan / arrière-plan.
- [ ] « Copier TikZ » puis coller dans un `.tex` avec `\usepackage{figurine}` : compile.
- [ ] « Copier SVG » puis coller dans **Word** (Office 365) : image vectorielle ; dans
      **Inkscape** : dessin éditable.
- [ ] « Copier PNG » puis coller dans Word / PowerPoint : fond transparent, 300 dpi.
- [ ] « Enregistrer » (Ctrl+S) : crée `FIG-xxxx` avec `figure.json`, `export.tex`,
      `export.svg`, `export.png` ; la vignette apparaît dans la bibliothèque.
- [ ] Bibliothèque → figure « Schéma » → « Ouvrir dans l'éditeur », modifier, enregistrer :
      les exports sont réécrits (un `\input{…/export.tex}` dans la thèse suit).
- [ ] Ouvrir la même figure sur l'autre PC pendant l'édition : bandeau « lecture seule ».

## S7 — Annotations, maths, export PNG
- [ ] Palette « Annotations » : repère 2D/3D, cote, cote angulaire, flèche, accolade, texte,
      point de mesure ; « Formes libres » : ligne, polyligne, rectangle, cercle, Bézier.
- [ ] Cote : lier ses deux extrémités à des ancres (par ex. haut et bas d'une couche) puis
      changer l'épaisseur de la couche : la cote suit et affiche la nouvelle longueur si le
      texte est vide.
- [ ] Texte `$\sigma_{zz}(t)$` : formule dessinée dans l'éditeur ; « Copier SVG » dans Word :
      la formule s'affiche sans police particulière installée.
- [ ] « Exporter… » → PNG 300 dpi et 600 dpi : dans Word, Format de l'image → taille réelle
      = taille de la planche en mm (la résolution est inscrite dans le fichier).
- [ ] PNG 600 dpi fond blanc vs transparent (poser sur une forme colorée dans PowerPoint).
- [ ] « Exporter… » → TikZ (document autonome) : se compile seul (`pdflatex fichier.tex`).
- [ ] Le fichier `tests/golden/s7-spec-exemple.tex` (exemple de la SPEC) compile avec votre préambule.

## S8 — Recadrage
- [ ] Bibliothèque → figure image → « Recadrer » : l'image s'ouvre dans la page Recadrage.
- [ ] Coller (Ctrl+V) ou « Ouvrir… » une image.
- [ ] Glisser les 8 poignées et le cadre ; proportions 1:1, 4:3, 16:9 respectées.
- [ ] « Rogner transparent » sur un détourage, « Rogner blanc » sur une capture de figure
      d'article : le cadre colle au contenu.
- [ ] Marges en mm : la valeur dépend de la résolution de l'image source (lue dans le PNG,
      sinon 96 dpi) ; la modifier si besoin.
- [ ] Rotation ±90°.
- [ ] Largeur de sortie 80 mm à 300 dpi → « Enregistrer sous… » puis insérer dans Word :
      l'image mesure 8 cm de large.
- [ ] « Enregistrer dans la bibliothèque » : nouvelle figure « Recadrage », « D'après FIG-… »,
      même source, licence et légende que l'originale.

## S9 — Graphes
- [ ] « Ouvrir des données… » avec un vrai classeur Excel de la thèse (.xlsx) : feuilles
      listées, aperçu des premières lignes, noms de colonnes repris.
- [ ] Même chose avec un CSV exporté par Excel en français (point-virgule, virgule
      décimale) et avec un CSV « UTF-8 ».
- [ ] Copier une plage dans Excel → coller dans la zone « Coller depuis Excel » → « Lire le
      collage » : colonnes et virgules décimales reconnues.
- [ ] Choisir les colonnes x et y, « Ajouter les séries » ; changer le type (lignes, points,
      barres), l'ordre, la légende, les échelles log, les bornes.
- [ ] « Copier pgfplots » → coller dans la thèse avec `\usepackage{figurine}` : compile, et
      le graphe ressemble à l'aperçu (mêmes graduations, virgule décimale).
- [ ] « Enregistrer » : `graph.json`, `export.tex`, `export.svg`, `export.png` ; avec
      l'option .dat, fichiers `export-1.dat`… et `\figurinedatadir` (voir QUESTIONS Q23).
- [ ] Bibliothèque → figure « Graphe » → « Ouvrir dans Graphes » : séries retrouvées.
- [ ] Un ancien fichier `.xls` : message clair.

## S10 — Finitions et v1.0
- [ ] Installer `Figurine_1.0.0_x64-setup.exe` par-dessus une version précédente : la
      bibliothèque et le dossier choisi sont conservés ; le menu Démarrer indique 1.0.0.
- [ ] Page « À propos » : version 1.0.0, tableau des licences, raccourcis.
- [ ] « Copier figurine.sty » puis « Enregistrer figurine.sty… » : le fichier compile avec
      un `\input` d'`export.tex` d'un schéma et d'un graphe.
- [ ] Schéma → « Exporter… » → « figurine.sty (paquet LaTeX) » : même fichier.
- [ ] Provoquer un conflit OneDrive sur `figurine-library.json` (modifier sur les deux PC
      hors ligne) : « À régler » propose « Garder cette version », l'autre part dans
      `.conflits\`.
- [ ] Relire le README (installation, utilisation dans LaTeX) : tout correspond.
- [ ] Après fusion sur `main` : `git tag v1.0.0 && git push origin v1.0.0` → brouillon de
      release avec `.exe` et `.msi` ; le publier.
