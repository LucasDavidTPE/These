# À tester manuellement (sous Windows)

Ce que les tests automatiques ne peuvent pas vérifier dans l'environnement Linux. Tenu à jour
à chaque phase ; cocher au fur et à mesure, décocher si une phase suivante y touche.

## P0 — Socle

Installeur : artefact `these-installeurs` de la dernière exécution de *Actions*.

- [ ] L'installeur `.exe` s'installe **sans droits administrateur** ; SmartScreen prévient
      (installeur non signé) : « Informations complémentaires » → « Exécuter quand même ».
- [ ] Premier lancement sur le **PC de travail** : le dossier proposé est
      `…\OneDrive - entpe.fr\Thèse\Espace` ; « Créer l'espace ici » crée le dossier et
      `espace.json`, puis l'Accueil s'ouvre.
- [ ] Premier lancement sur le **PC perso**, après synchronisation OneDrive : le même dossier
      est proposé et reconnu (« Un espace existe déjà ici, créé sur … ») ; « Ouvrir cet
      espace » ne recrée rien.
- [ ] « Choisir un autre dossier… » ouvre la boîte de dialogue Windows.
- [ ] Réglages du poste : ajouter la racine `essais` (E:\) sur le PC de travail → « Présent » ;
      la même sur le PC perso → « Absent ici », et l'Accueil la liste dans « À régler ».
- [ ] « Ouvrir le dossier » ouvre l'Explorateur sur l'espace.
- [ ] Surveillance : copier à la main un fichier `espace-TEST.json` dans l'espace → il
      apparaît dans « À régler » en moins d'une seconde, sans relancer l'application.
      « Garder la version actuelle » le range dans `.conflits\`.
- [ ] Idem avec un `espace.json.tmp` : « Supprimer le fichier temporaire » l'efface.
- [ ] Diagnostic : bilan cohérent avec ce qui précède.
- [ ] Fermer et rouvrir : la taille et la position de la fenêtre sont conservées ; les
      réglages sont dans `%APPDATA%\fr.lucasdavid.these\poste.json`, pas dans OneDrive.
- [ ] Déplacer (ou renommer) le dossier de l'espace puis relancer : l'écran de premier
      lancement revient avec le message « L'espace … est introuvable sur ce poste ».

## P1 — Figures

La liste détaillée de Figurine 1.0 reste valable : `docs/figurine/A_TESTER_MANUELLEMENT.md`.
Ce qui change avec l'intégration :

- [ ] Thèse : Réglages du poste → « Bibliothèque de figures » → choisir le dossier de
      Figurine 1.0 ; l'onglet Bibliothèque de Figures montre les figures existantes.
- [ ] Les vignettes s'affichent (protocole `asset:` autorisé sur le dossier).
- [ ] Détourage : `Ctrl+V` d'une image copiée depuis le navigateur, fond retiré, « Copier »
      puis collage dans Word avec la transparence.
- [ ] Schéma : créer, enregistrer, rouvrir ; « Copier TikZ ».
- [ ] Verrou : ouvrir la même figure sur les deux PC → le second est en lecture seule.
- [ ] Installeur **Figurine 1.1.0** sur un poste qui a Figurine 1.0 : il remplace 1.0
      (même identifiant), s'ouvre directement sur la bibliothèque déjà choisie, sans
      barre latérale ni écran d'espace.
- [ ] Figurine 1.1.0 et Thèse installés ensemble : chacun a ses propres réglages
      (`%APPDATA%\fr.lucasdavid.figurine` et `%APPDATA%\fr.lucasdavid.these`).

## P2 — Traitement 2S2P1D (étape 1)

- [ ] Le module s'ouvre sur l'essai de démonstration entièrement calculé, sans connexion
      Internet (polices système à la place d'IBM Plex : c'est voulu).
- [ ] « Déposer un fichier » ouvre la boîte Windows ; un export MTS `.csv` réel se charge.
- [ ] Export `.xlsx` et fichier projet : la boîte « Enregistrer sous » s'ouvre, le fichier
      est écrit à l'endroit choisi et s'ouvre dans Excel.
- [ ] Rouvrir un fichier projet `.json` enregistré par le site en ligne : même résultat.

## P3 — Bibliothèque

- [ ] « Importer le classeur… » : la boîte Windows s'ouvre ; l'import de
      `Biblio_These_Lucas_MAITRE.xlsx` annonce 179 références, 11 demandes, 20 corrections,
      7 pistes ; les fichiers apparaissent dans `Espace\bibliotheque\`.
- [ ] Sur l'autre PC, après synchronisation OneDrive : la bibliothèque est là, sans import.
- [ ] « Marquer lu » sur un PC → sur l'autre PC, la référence passe à « Lu » sans relancer.
- [ ] Modifier la même référence sur les deux PC hors ligne → la copie de conflit apparaît
      dans « À régler » (Accueil), avec la comparaison champ par champ.
- [ ] « Ouvrir le PDF » avec la racine `biblio-pdf` déclarée : le PDF s'ouvre dans le
      lecteur par défaut ; sans la racine, le message renvoie vers les réglages.
- [ ] « Ouvrir le lien » d'une référence « Éditeur (abonnement) » passe par le proxy de
      l'ENTPE s'il est renseigné dans les paramètres.
- [ ] Export RIS importé dans Zotero ; export BibTeX compilé avec biblatex (`biber`).

## P4 — Planning

- [ ] Créer une phase, une tâche dans cette phase, un jalon ; les retrouver sur l'autre PC.
- [ ] Masquer une catégorie sur un PC → masquée aussi sur l'autre.
- [ ] Désactiver une phase : ses tâches disparaissent ; « ↺ » la réactive.
- [ ] Les mois du plan de lecture et les dates limites des demandes apparaissent dans
      « Bibliographie » dès que la bibliothèque est importée.
- [ ] Export pgfgantt : le `.tex` compile dans un document avec `\usepackage{pgfgantt}`
      (et `xcolor` avec l'option `table` ou `HTML`).

## Mises à jour

- [ ] Après la mise en place de `docs/MISES_A_JOUR.md`, publier `v0.2.0` : la release
      apparaît dans `These-versions` avec `latest.json` et l'installeur `.exe` + `.sig`.
- [ ] Installer `v0.2.0` à la main, publier `v0.2.1` : au démarrage suivant, le bandeau
      propose la mise à jour ; « Installer et redémarrer » l'installe sans droits
      administrateur et relance l'application ; les réglages et l'espace sont conservés.
- [ ] Hors ligne : aucun bandeau, aucune erreur.

## P5 — Campagnes (étape 1)

- [ ] Importer `projects/sergio-cm-b2c4-bio.toml` et `tsrst-lucas.toml` de these-lgcb.
- [ ] Déclarer la racine `recherche` (Bureau\Recherche) ; « Découvrir les essais » sur la
      campagne B2C4 bio retrouve Essai1 (60,02 h, 1480 cycles) depuis le journal `.log`.
- [ ] Sur le PC perso (sans les données) : la fiche, les essais, les notes et les images
      sont là ; « Découvrir » dit que le dossier est introuvable, sans erreur.
- [ ] Coller une capture (Ctrl+V) dans le carnet ; cliquer l'image l'ouvre dans la
      visionneuse de Windows.
- [ ] « Courbes » sur Essai1 de la campagne B2C4 bio : panneaux température, force,
      capteurs ; temps de lecture acceptable pour le fichier `.steps.tracking.csv` réel.
- [ ] Après « Courbes », la carte de la campagne montre l'aperçu, y compris sur le PC perso.

## Études

- [ ] « Nouvelle étude » puis « Ouvrir dans VS Code » : VS Code s'ouvre sur le dossier
      (sinon, le message demande d'installer VS Code avec « Ajouter à PATH »).
- [ ] Exécuter `run.py` dans VS Code (Python du poste) : l'exécution apparaît dans
      l'application avec ses sorties, sans relancer ; une erreur Python apparaît en rouge.
- [ ] Une référence `recherche:…` dans `etude.donnees(...)` est résolue avec la racine du
      poste ; sur l'autre PC, avec la sienne.
- [ ] Copier `studies/2026-09-07_lecture-essai-module-complexe-b2c4-bio` de these-lgcb dans
      `Espace\etudes\` : l'étude apparaît avec sa fiche et ses sorties.

## Bibliothèque : DOI et doublons

- [ ] Nouvelle référence → saisir `10.2346/tire.12.400403` → « Remplir depuis le DOI » :
      titre, auteurs, revue, volume, pages et clé `debeer2012toward` sont remplis.
- [ ] Hors ligne : message clair, rien n'est modifié.
- [ ] La nouvelle référence (même DOI que BIB-001) est signalée comme doublon sur le
      tableau de bord.

## Enregistrer dans Figures

- [ ] Courbes d'un essai → « Enregistrer dans Figures » : la figure apparaît dans l'onglet
      Bibliothèque de Figures, avec la source « Campagnes : … » ; le PNG est lisible (textes
      et couleurs conservés).

## Traitement 2S2P1D depuis Campagnes

- [ ] Campagne de type « Module complexe » avec son dossier de données : chaque essai a un
      bouton « 2S2P1D » ; il ouvre le traitement sur l'export `.steps.tracking.csv` de
      l'essai (titre de l'essai dans la barre du haut), sans passer par « Déposer un fichier ».
- [ ] Un vrai export WaveMatrix est lu (nombre de lignes et voies Force, Lion, °C
      reconnues) : la lecture du séparateur « ; » et des en-têtes entre guillemets a été
      corrigée.
- [ ] Régler la matrice ou les paramètres → « Enregistrer avec l'essai » → « ← Campagne » :
      le bouton devient « 2S2P1D ✓ » ; le rouvrir (sur l'autre PC aussi) retrouve les réglages.
- [ ] Un fichier sans colonne de cycles ne fige plus la page (« 0 lignes » au pire).

## Accueil complet

- [ ] L'Accueil montre « Derniers essais » (5 au plus, du plus récent au plus ancien, avec
      état, durée, cycles) ; un clic ouvre la campagne de l'essai.
- [ ] « Dernières figures » montre les 6 dernières figures modifiées avec leur vignette ; un
      clic ouvre Figures, onglet Bibliothèque, la figure sélectionnée.
- [ ] Une figure enregistrée depuis les courbes d'un essai apparaît en tête au retour sur
      l'Accueil.

## Campagnes : filtres, copie, .xlsx, résultats 2S2P1D (non vérifié sous Windows)

- [ ] Galerie : filtres type / statut / matériau et recherche sans accents (fiche, essais, carnet).
- [ ] « Copier… » (essai) et « Copier les données… » (campagne) : copie incrémentale vers le
      dossier choisi, rien n'est supprimé ; relancer ne recopie que ce qui a changé.
- [ ] Courbes → « Exporter en Excel (.xlsx) » s'ouvre dans Excel.
- [ ] Après « Enregistrer avec l'essai » dans le traitement : la page de campagne montre
      « Résultats du traitement 2S2P1D » ; « ← Campagne » revient sur la campagne
      (vu blanc en démonstration : à vérifier en priorité).

## Deux PC allumés en même temps

- [ ] Ouvrir la même fiche (campagne, référence, élément du planning) sur les deux PC ;
      la modifier et l'enregistrer sur B ; attendre la synchronisation OneDrive ; la
      modifier sur A sans recharger : A refuse (« modifié ailleurs… rechargez »), la
      version de B est intacte.

## Manuscrits (versions Word)

- [ ] Manuscrits → « Choisir le dossier des manuscrits… » : les `.docx` du dossier (et de
      ses sous-dossiers directs) apparaissent, sans les fichiers `~$…` de Word.
- [ ] « Enregistrer une version » avec une note, **document ouvert dans Word** : la copie
      est faite (sinon, message clair) ; l'état passe à « à jour ».
- [ ] Modifier et enregistrer le document dans Word : l'état passe à « modifié depuis la
      dernière version ».
- [ ] « Ouvrir » ouvre la version dans Word ; « Copie sous… » l'enregistre ailleurs.
- [ ] Sur l'autre PC (même dossier via OneDrive, racine réglée) : les mêmes versions.

## Version 0.2.5 : tests sous Windows, installeur Traitement

- [ ] GitHub → Actions → **tests-windows** → « Run workflow » : toutes les étapes vertes
      (cocher « latex » une fois pour vérifier aussi la compilation des figures).
- [ ] Ou, sur un PC avec Node et Rust : double-clic sur `tester-windows.cmd` à la racine
      du dépôt ; le résumé final dit « Tous les tests sont verts ». Sans Node ni Rust, il
      propose d'ouvrir la page du bouton GitHub.
- [ ] Artefact `traitement-2s2p1d-installeurs` : il s'installe à côté de Thèse, s'ouvre
      directement sur le traitement, sans écran d'espace ; l'installeur est bien plus léger
      que celui de Thèse (pas de modèle de détourage).

## Figures régénérables (Gantt, courbes d'un essai, ViscoCompare)

- [ ] Planning → « SVG » et « PNG » : toute la thèse, lisible (titres, catégories, ligne
      « aujourd'hui ») ; le SVG s'ouvre dans le navigateur et dans Inkscape.
- [ ] Planning → « Enregistrer dans Figures » : figure « Planning de la thèse ». Déplacer
      un élément du planning, puis, dans Figures, sélectionner la figure → « Régénérer
      depuis les données » : l'image suit, la vignette se met à jour, titre et tags restent.
- [ ] Courbes d'un essai : masquer une voie et zoomer sur une plage → « Enregistrer dans
      Figures » : la figure a les mêmes voies et la même plage. « Régénérer » la refait à
      l'identique sur le PC qui a les données ; sur l'autre, message « Données brutes
      absentes de ce poste ».
- [ ] Figurine seul (installeur Figurine) : sur une figure venue de Thèse, le panneau dit
      que le module d'origine est absent, sans bouton.

## Bibliothèque : liens et Markdown

- [ ] « Vérifier les liens » : confirmation, barre de progression, « Arrêter » fonctionne ;
      à la fin, « État du lien » et « Lien contrôlé le » sont remplis dans les fiches, les
      liens morts listés en haut du tableau de bord (un clic ouvre la fiche).
- [ ] Derrière le proxy de l'école : les liens répondent (sinon noter ce qui s'affiche :
      l'application n'utilise pas encore le proxy système de Windows).
- [ ] Fiche → « Vérifier le lien » sur une seule référence.
- [ ] « Exporter Markdown… » vers un dossier (ou un coffre Obsidian) : une note par
      référence (propriétés en tête, fiche de lecture, notes, liens [[clé]]) et
      « Point mensuel - mois N.md ».

## ViscoCompare

- [ ] ViscoCompare → « Choisir le dossier… » : le dossier du script (avec `COMSOL` et
      `VISCOROUTE`) ou un dossier qui en contient plusieurs (liste « Étude »).
- [ ] Mêmes vitesses que le script ; les courbes COMSOL et Viscoroute se superposent
      comme dans les graphiques Excel du script (UX, UZ, EPS_…).
- [ ] Les fichiers que le script ignorait en silence (ex. `…0P0….json`) sont listés
      « Écartés » avec la raison.
- [ ] « Tout exporter (EXCEL_OUTPUT) » : un `comparaison_<v>.xlsx` par vitesse, mêmes
      valeurs que ceux du script (feuilles COMSOL, VISCOROUTE, une par grandeur) plus une
      feuille « Ecarts » ; les graphiques Excel du script ne sont pas refaits (ils sont
      dans l'application et dans Figures).
- [ ] « Enregistrer dans Figures » puis « Régénérer » après avoir remplacé un `.csv`.

## Manuscrits : sources LaTeX

- [ ] Manuscrits → « Sources LaTeX » → choisir le dossier du manuscrit : figures TikZ
      (`standalone`), documents et chapitres classés comme dans le tableau de bord de
      these-lgcb ; les dossiers `build`, `out`, `.git` sont ignorés.
- [ ] Une figure incluse par un chapitre (`\input` ou `\includegraphics` de son PDF)
      affiche ce chapitre dans « Utilisé par ».
- [ ] Renommer une image utilisée : elle apparaît dans « Inclusions introuvables ».
- [ ] « VS Code », « PDF » (si compilé à côté) et « Dossier » ouvrent ce qu'il faut.

## Traitement 2S2P1D : nouvelle interface (0.2.6)

À comparer avec « Ancienne page » (bouton en haut à droite) sur les mêmes fichiers : les
nombres doivent être identiques, dans les deux modes.

- [ ] À l'ouverture : l'essai de démonstration, calé (écart |E*| < 1 %), en quelques secondes.
- [ ] 01 Essai : « Choisir un fichier… » (boîte « Ouvrir » de Windows ; le glisser-déposer
      n'est pas pris en charge dans la fenêtre de l'application) : un export MTS `.csv` réel, puis un export
      WaveMatrix `.steps.tracking.csv` et un `.xlsx` : voies reconnues, matrice T × f
      détectée, « Traiter la campagne » ; un second fichier s'ajoute pour la comparaison.
- [ ] 02 Cycles : case « Retenu », touche X sur une ligne, « Proposer » avec les seuils,
      « Tout remettre » ; le signal et la sinusoïde suivent le cycle et la voie choisis.
- [ ] 03 Synthèse : moyenne / maximum / minimum / écart-type ; isothermes.
- [ ] 04 Calage : « Caler tout », « Constantes seules », « Ajuster ν* », « Recaler les
      isothermes », « Ajuster WLF », curseurs et champs ; changer de Tref ; modèle
      Huet-Sayegh puis Kelvin-Voigt généralisé ; survol d'un point (palier affiché).
- [ ] 05 Comparaison et 06 Fidélité Excel : mêmes tableaux que l'ancienne page.
- [ ] 07 Export : `.xlsx` (Data avec la colonne Retenu, Calcul, Modele), trois CSV qui
      s'ouvrent dans Excel, projet `.json` enregistré puis rouvert (tri et calages
      retrouvés) ; un projet enregistré par l'ancienne page ou le site se rouvre aussi.
- [ ] Depuis une campagne : « 2S2P1D » ouvre l'essai, « Enregistrer avec l'essai »,
      « ← Campagne » (bouton « 2S2P1D ✓ »), rouvrir : le dépouillement revient sur Calage.
- [ ] « → Figures » sur la courbe maîtresse d'un essai de campagne, puis dans Figures
      « Régénérer depuis les données » après avoir modifié le calage et réenregistré.
- [ ] Installeur Traitement seul : pas de bouton « → Figures », tout le reste fonctionne.

## Régressions sur les courbes d'un essai (0.2.7)

- [ ] Campagnes → « Courbes » d'un TSRST → « Régression » → glisser sur la phase de
      refroidissement : droite en tirets, pente en °C/h et R² ; plusieurs domaines possibles,
      « retirer » en enlève une.
- [ ] Fermer et rouvrir les courbes (et sur l'autre PC) : les régressions reviennent.
- [ ] « Enregistrer dans Figures » : les droites et leurs pentes sont dans l'image ; « Régénérer »
      les refait.

## Traitement : enregistrement automatique (0.2.7)

- [ ] Essai de campagne : l'ouvrir puis revenir sans rien toucher → bouton « 2S2P1D » (pas
      de ✓) ; écarter un cycle ou caler → « Enregistré à hh:mm » dans la barre, puis « 2S2P1D ✓ ».
- [ ] Fichier ouvert à la main (« Choisir un fichier… ») sous une racine du poste (ex.
      Recherche) : il apparaît dans « Dépouillements enregistrés » (étape 01) avec sa
      référence `recherche:…` ; chaque modification s'enregistre seule.
- [ ] Fermer l'application, la rouvrir (ou passer sur l'autre PC, même racine déclarée) →
      « Rouvrir » : même tri des cycles, mêmes calages, ouverture sur l'étape Calage.
- [ ] Fichier hors de toute racine : rouvrable sur ce PC seulement (chemin absolu) ; message
      clair sur l'autre PC. « Retirer » range l'entrée dans `traitement/.supprimes/`.

## Figures d'une campagne ou d'une étude (0.2.7)

- [ ] Page de campagne → section « Figures » : les courbes d'essais et les graphiques du
      traitement 2S2P1D enregistrés depuis cette campagne y sont (« issue de la campagne ») ;
      un clic ouvre la figure dans Figures.
- [ ] « Rattacher une figure… » → rechercher → la figure (ex. une photo, un schéma) apparaît,
      « détacher » la retire ; même chose sur la page d'une étude.
- [ ] Dans Figures, la fiche indique « Rattachée à : … » ; sur l'autre PC, mêmes rattachements.

## Graphes du traitement modifiables dans Figures, axes FR/EN (0.2.7)

- [ ] Traitement → Calage → « → Figures » sur la courbe maîtresse : dans Figures, la figure est
      un **Graphe** (onglet Graphes) : changer un titre d'axe, la taille, la position de la
      légende, exporter en pgfplots (`export.tex`) → compile dans le manuscrit.
- [ ] Bouton « Axes EN » en haut du traitement : titres d'axes et légendes en anglais à
      l'écran (« centred signal », « deviation (%) », « measured », « model ») ; « → Figures »
      garde l'anglais.
- [ ] Essai ouvert depuis une campagne, graphe envoyé dans Figures, titre d'axe retouché dans
      Figures, puis « Régénérer » après un nouveau calage : les données changent, le titre
      retouché et la taille restent.
- [ ] Une figure « image » envoyée avant la 0.2.7 se régénère toujours en image.

## Calage : correctif des graphes vides, modèles élémentaires, séries de Prony (0.2.7)

- [ ] **Correctif** : sur un vrai essai (plusieurs températures), Calage → « Caler tout » :
      toutes les isothermes restent sur la courbe maîtresse (le compteur « Points » ne baisse
      pas), la courbe du modèle s'affiche. Avant, une isotherme mal décrite pouvait partir à
      a_T = 0 ou ∞ et disparaître des graphes.
- [ ] Loi de comportement → Maxwell, Kelvin-Voigt, Zener, Burgers : « Caler tout » cale leurs
      constantes sans toucher aux a_T ; revenir au 2S2P1D retrouve son calage intact.
- [ ] Kelvin-Voigt généralisé (dérivé du 2S2P1D) : la courbe s'affiche (elle était vide).
- [ ] « Ajouter une série de Prony » : Maxwell généralisé sur les mesures → tirets orange
      sur Cole-Cole, Black et courbes maîtresses ; écart |E*| de l'ordre du pourcent ;
      graphe E(t). Kelvin-Voigt généralisé → J(t).
- [ ] Exports : « Abaqus .inp » s'inclut dans un modèle Abaqus (*ELASTIC instantané,
      *VISCOELASTIC Prony, *TRS WLF) ; « COMSOL .txt » se charge dans le tableau des branches
      du matériau viscoélastique (G en Pa) ; « Tableau .csv » s'ouvre dans Excel.
- [ ] Les réglages Prony se retrouvent en rouvrant le dépouillement enregistré.

## Figures → Graphes : apparence, palettes, modèles, zoom (0.2.7)

- [ ] « ▸ Modèles de graphes » (en haut à gauche) : vignettes ; « Courbe maîtresse » donne un
      graphe complet avec valeurs d'exemple ; le bandeau le rappelle.
- [ ] Apparence → Style : Couleur, Article (axes seuls), Présentation (traits épais, texte
      plus grand), Minimal, Séquentiel, Noir et blanc ; l'aperçu change aussitôt.
- [ ] Palette : choisir Okabe-Ito, Viridis… ; coller l'adresse d'une palette coolors.co
      (ex. `https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51`) → « Importer » ;
      retoucher une couleur, en ajouter, en retirer.
- [ ] « Enregistrer ce style… » → nom → il apparaît sous « Mes styles », aussi sur l'autre PC
      (dossier `_styles-graphes` de la bibliothèque) ; « Retirer » le range dans
      `_styles-graphes/.supprimes`.
- [ ] Sous chaque série : couleur (et « auto »), marque, trait ; « Copier pgfplots » →
      compile dans le manuscrit avec les mêmes couleurs.
- [ ] Zoom : l'aperçu remplit la place (« Ajuster ») ; + / − et Ctrl + molette ; 100 % ;
      « ⬚ Zoom sur une zone » puis tirer un rectangle → bornes des axes fixées ; « Axes
      auto » ou double-clic pour revenir. Coordonnées sous le curseur en bas.
- [ ] Un graphe du Traitement envoyé dans Figures garde les couleurs de l'écran ; après
      « Régénérer », couleurs et style retouchés dans Figures restent.

## Figures : photos HEIC (0.2.7)

- [ ] Recadrage → « Ouvrir… » : les fichiers `.heic` / `.heif` (photos d'iPhone) sont
      proposés ; une photo s'ouvre (quelques secondes la première fois, le temps de charger
      le décodeur), dans le bon sens.
- [ ] Même chose dans Détourage (« Ouvrir… » et glisser-déposer d'un `.heic`).
- [ ] Une photo HEIC abîmée donne un message clair, sans bloquer la page.

## Traitement : « Ce que l'on modélise » (0.2.7)

- [ ] Calage → bloc « Ce que l'on modélise » : schéma du modèle choisi (2S2P1D, Huet-Sayegh,
      Maxwell, Kelvin-Voigt, Zener, Burgers, Kelvin-Voigt généralisé), valeurs sous chaque
      élément ; survol → rôle de l'élément ; clic → son curseur ; les valeurs suivent les
      curseurs.
- [ ] « ▶ Animer » (Sinusoïdal) : l'éprouvette s'allonge et s'amincit (ν), la contrainte est
      en avance de φ, la boucle σ–ε tourne ; changer T et f : |E*|, φ, |ν*| et l'énergie
      dissipée suivent (plus froid → plus raide, boucle plus fine).
- [ ] Fluage et Relaxation : courbes J(t) et E(t) du modèle calé, point qui parcourt le temps,
      éprouvette qui s'allonge (fluage) ou effort qui baisse (relaxation).
- [ ] « → Figures (schéma TikZ) » avec et sans les valeurs : le schéma s'ouvre dans l'éditeur
      de schémas de Figures ; l'export TikZ compile dans le manuscrit.

## Figures → Graphes : retouche des courbes (0.2.8)

- [ ] « ⌫ Gommer des points » puis tirer un rectangle sur l'aperçu : les points dedans
      disparaissent (toutes les séries, ou celle choisie) ; Ctrl+Z les remet, Ctrl+Y ou ↷
      les retire à nouveau.
- [ ] Sous une série, « ▸ Données… » : −y, ×1000, ÷1000, zéro, x ↔ y, trier, dupliquer ;
      garder / retirer une plage de x ; lisser ; alléger ; chaque opération s'annule par
      Ctrl+Z.
- [ ] Tableau x ↹ y : corriger une valeur ou coller des colonnes d'Excel, « Appliquer le
      tableau » ; « Copier » puis coller dans Excel.
- [ ] Un graphe du Traitement retouché puis enregistré : la figure garde les retouches ;
      « Régénérer » repart des données de l'essai (retouches de données perdues, mise en
      forme gardée).

## ChaussSpec (1.0)

- [ ] Menu ChaussSpec : l'exemple « Train A340 sur la structure PEP » s'ouvre ; « Calculer » :
      jauge, puis résultats en une dizaine de secondes ; εyy à la base du BB-GB ≈ 316 µdef en
      (−2,06 ; 0,69) (le Python donne 316,6 µdef au même point).
- [ ] Changer une couche (loi, épaisseur), ajouter une roue ou le « Bogie A340 », le régime
      (statique, roulant, harmonique), la grille ; « Calculer » ; le titre des résultats
      signale un résultat périmé quand le cas a changé.
- [ ] 2S2P1D : « Depuis le traitement… » reprend les constantes calées d'un essai ouvert.
- [ ] Carte de pression : « CSV… » (1re ligne x, 1re colonne y, « ; ») ; exemple « Carte de
      pression mesurée ».
- [ ] « Enregistrer » : `chausspec/<nom>.json` dans l'espace, visible sur l'autre PC ;
      `python -m chausspec` calcule le même fichier.
- [ ] « Enregistrer les résultats… » : dossier `resultats_<nom>` avec un CSV par champ,
      `synthese.json`, jauges, `cas.json` ; comparer à la sortie du Python.
- [ ] « Carte → Figures », coupes et jauges « → Figures ».
- [ ] Effort tangentiel (qx) avec une interface glissante : message clair, pas de calcul.

## Bibliothèque : PDF d'une référence (1.0)

- [ ] « Nouvelle référence » : la fiche s'ouvre avec le bloc PDF en évidence ; remplir auteurs,
      année, titre (ou par le DOI) : le nom proposé suit (`BIB-180_Auteur-etal_2025_Titre-court.pdf`).
- [ ] « Pointer le PDF… » sur un PDF des Téléchargements : il est copié dans le dossier des PDF
      (racine « biblio-pdf ») sous ce nom, l'original reste ; « Ouvrir le PDF » l'ouvre ; la
      référence passe en « PDF récupéré ».
- [ ] PDF déjà déposé dans le dossier des PDF sous un autre nom : « Pointer le PDF… » le renomme
      sur place (pas de doublon).
- [ ] Référence existante dont le PDF porte un autre nom : « Renommer selon la convention ».
- [ ] Nom retouché à la main avant de pointer : c'est ce nom qui est utilisé.

## Figures → Graphes : régression (1.0.2)

- [ ] Modèle « Fatigue » ou données collées, série en points : Régression → Linéaire. La droite
      en tirets (couleur de la série) apparaît, l'équation et le R² s'affichent sous le menu et
      dans un encadré sur la figure, en haut à gauche (légende en haut à droite).
- [ ] Deux séries avec régression : deux lignes dans l'encadré, chacune avec son trait.
- [ ] « Par l'origine » : pas d'ordonnée à l'origine dans l'équation. « Puissance » en échelle
      log-log : la courbe est une droite ; avec des x ≤ 0, message dans le panneau.
- [ ] Décocher « Équation sur la figure » : la droite reste, l'encadré disparaît. Changer le
      coin des équations ; même coin que la légende : l'encadré se met sous la légende.
- [ ] Gomme sur un point aberrant : l'équation et le R² se mettent à jour.
- [ ] « Copier pgfplots » et compilation : droite et encadré identiques à l'aperçu.

## ChaussSpec : cœur réécrit (1.0.3)

- [ ] Les trois exemples (Train A340, carte de pression, plaque HWD) se calculent comme avant,
      en un temps comparable (Train A340 : une dizaine de secondes) ; Train A340 : εyy ≈ 316 µdef
      en base de BB-GB, e1 affiché, signal de la jauge.
- [ ] Un cas enregistré avant la 1.0.3 se rouvre et se calcule à l'identique (même format JSON).
- [ ] Grande grille (N = 1024 × 1024) : la mémoire reste raisonnable (quelques centaines de Mo au
      plus) et le calcul va au bout.
- [ ] Ouvrir `modules/chausspec/core/kernel.ts` à côté de `kernel.py` : même découpage, mêmes noms.

## Numériseur (1.1)

- [ ] Capture d'un graphique d'article (Win+Maj+S) puis Ctrl+V dans le Numériseur : l'image
      s'affiche, l'outil X1 est actif, la loupe suit le curseur.
- [ ] Placer X1, X2, Y1, Y2 sur des graduations, saisir leurs valeurs : « Étalonnage prêt » ;
      la lecture sous le curseur donne des valeurs justes ailleurs sur le graphique.
- [ ] Graphique log-log (courbe maîtresse) : cocher « log » sur les deux axes, relever une
      courbe, la comparer aux valeurs de l'article.
- [ ] Relevé automatique d'une courbe qui en croise une autre : la courbe suivie ne saute pas
      sur l'autre ; corriger un point faux en le glissant, en supprimer un (Suppr).
- [ ] Nuage de points (symboles) : un point par symbole ; ajouter un point oublié à la main.
- [ ] « Copier pour Excel » puis coller dans Excel : colonnes x, y par série, virgule décimale.
- [ ] « → Figures » : le graphe arrive dans Figures, modifiable dans Graphes.
- [ ] Carte de pression (exemple « pneu », puis une vraie carte) : légende, zone, « Lire la
      carte » ≈ 100 % ; la valeur sous le curseur correspond à la légende.
- [ ] Coupe : graphe cohérent avec l'image ; CSV et → Figures.
- [ ] Maillage rectangulaire → « Matrice CSV… » ouverte dans ChaussSpec comme carte (import CSV).
- [ ] Maillage en disques → « → ChaussSpec » : le chargement du cas ouvert est remplacé par
      les charges circulaires, charge totale égale à celle annoncée ; calcul lancé.
- [ ] « Enregistrer » : `numeriseur/<nom>.json` et l'image dans l'espace ; rouvrir le projet
      sur l'autre PC, tout est à sa place.


## Espace autonome (1.2)

- [ ] Accueil → « À régler » : « Les PDF de la bibliographie sont encore hors de l'espace »
      et « La bibliothèque de figures… » ; le bouton mène aux réglages.
- [ ] Réglages → « Rapatrier dans l'espace » pour les PDF : bilan (fichiers copiés, Mo), les
      PDF sont dans `Espace\bibliotheque\pdf`, « Ouvrir le PDF » d'une fiche marche ; le
      dossier `BIBLIO` est intact (le supprimer soi-même ensuite).
- [ ] Idem pour les figures : la bibliothèque s'affiche depuis `Espace\figures`, avec ses
      verrous et ses aperçus ; l'ancien dossier est intact.
- [ ] Sur l'autre PC (après synchronisation OneDrive) : « Rapatrier » ne recopie rien
      (tout « déjà présent ») et n'écrase aucune figure modifiée entre-temps.
- [ ] Campagne : « Courbes » puis « 2S2P1D » sur un essai : l'export apparaît dans
      `Espace\donnees\essais\…` ; sur le PC sans `E:\`, les courbes et le dépouillement
      s'ouvrent quand même (les essais jamais ouverts restent indisponibles).
- [ ] Traitement : ouvrir un fichier hors de toute racine (Bureau) : il est copié dans
      `donnees\importes` ; le dépouillement se rouvre sur l'autre PC.
- [ ] Un dépouillement enregistré avant la 1.2 (chemin absolu) se rouvre et son fichier
      part dans `donnees\importes`.
- [ ] ViscoCompare : « Tout exporter » écrit les classeurs dans `Espace\viscocompare\…` ; le
      dossier COMSOL / VISCOROUTE n'est pas modifié ; l'étude se rouvre sur l'autre PC.
- [ ] Réglages → « Exporter l'espace (.zip)… » : le zip s'ouvre dans l'Explorateur, contient
      tout l'espace (sans `.tmp` ni `.lock`) ; refus propre si on l'enregistre dans l'espace.
- [ ] Taille de l'espace dans OneDrive après quelques semaines : raisonnable (seuls les
      fichiers ouverts sont copiés).

## Figures → Graphes : autres régressions et plage (1.2.1)

- [ ] Régression → Polynôme, degré 2 puis 3 : courbe lisse, équation sans termes parasites
      (pas de « 10⁻¹⁶ ») ; comparer avec la courbe de tendance polynomiale d'Excel.
- [ ] Exponentielle sur une décroissance (y > 0), Logarithmique (x > 0) : mêmes coefficients
      que la courbe de tendance d'Excel ; avec des points hors domaine, ils sont écartés et le
      nombre de points retenus est affiché.
- [ ] « Choisir sur l'aperçu », tirer un rectangle sur une partie de la courbe : les bornes
      « de / à » se remplissent, la régression n'utilise que ces points, la courbe s'arrête aux
      bornes ; « Prolonger » l'étend à toute la série ; « Toute la série » annule la plage ;
      Échap annule la sélection en cours.
- [ ] Polynôme de degré 3 dans un graphe étroit : R² passe sous l'équation, en SVG comme en
      pgfplots compilé.
- [ ] Enregistrer, rouvrir le graphe : type, degré, plage et prolongement sont gardés.

## Figures → Graphes : lire sur la courbe (1.2.2)

- [ ] Avec une régression choisie, « Lire sur la courbe » : saisir un x donne le y de la
      courbe, saisir un y donne le x. Vérifier avec l'équation affichée (et Excel).
- [ ] Un x hors de la plage de la série : le y est une extrapolation (aucun blocage).
- [ ] Polynôme : un y atteint deux fois donne les deux x, séparés par « ; » ; un y jamais
      atteint dans la plage affiche « aucun dans la plage ».
- [ ] Exponentielle avec y négatif, logarithmique / puissance : « aucun » plutôt qu'une erreur.

## ChaussSpec : « Comment ça marche ? » (1.2.3)

- [ ] Bouton « Comment ça marche ? » en haut de ChaussSpec : le panneau s'ouvre et se referme ;
      schéma en quatre étapes lisible (même fenêtre étroite), cinq rubriques dépliables.
- [ ] Le texte est compréhensible sans lire le code ; noter ce qui reste obscur (à
      compléter). Notice complète : `docs/CHAUSSSPEC_EXPLIQUE.md`.

## Recherche globale Ctrl+K (1.3.0)

- [ ] Ctrl+K (et le champ « Rechercher » de la barre) ouvre la palette ; Échap la ferme ;
      ↑ ↓ Entrée naviguent. Vide : la liste des pages.
- [ ] Taper un bout de titre de référence, d'essai, de figure, de cas ChaussSpec, de tâche du
      planning : les résultats apparaissent, avec leur module. Sans accents, mots en désordre.
- [ ] Entrée sur un cas ChaussSpec : le cas s'ouvre directement ; sur les autres, la page du module.
- [ ] Sur un gros espace (plusieurs centaines de références), l'ouverture de la palette reste fluide.

## Manuscrits → Présentations (1.3.0)

- [ ] Nouvelle (exemple), Enregistrer : `presentations/<nom>.md` apparaît dans l'espace, l'autre PC le voit.
- [ ] Exporter en .pptx, ouvrir dans **PowerPoint** : 5 diapos, aucun message de réparation, textes
      modifiables, titre reconnu (mode Plan), numéros de diapo, pied de page.
- [ ] `![…](figure:FIG-xxxx)` avec une vraie figure de la bibliothèque : l'image est bien
      dans la diapo, proportions respectées, légende dessous ; un identifiant faux : message
      « image introuvable » à l'export, texte de remplacement dans la diapo.
- [ ] Nouveau modèle depuis celui-ci : changer l'accent, la police, le pied de page ; le
      modèle est gardé (`presentations/modeles/`), appliqué, et se retrouve sur l'autre PC.
- [ ] Les quatre modèles de base (clair, sombre, bleu, chaud) : lisibles en projection.
- [ ] Deux colonnes avec une image à droite et des puces à gauche ; une diapo de section.

## ChaussSpec : champs dérivés et combinaisons (1.4.0)

- [ ] Après un calcul, le menu « Champ » propose, en plus des composantes : ε1, ε2, ε3, εv (si les six
      déformations sont calculées) et σ1, σ2, σ3, τmax, σ von Mises (si les six contraintes le sont),
      pour chaque profondeur. Vérifier ε1 contre l'ancien affichage (identique) et τmax = (σ1 − σ3) / 2.
- [ ] « Combinaison linéaire… » : saisir `exx - eyy`, `0,5 exx + 0,5 eyy`, `sxx + syy + szz` ; la carte,
      les extrêmes et les coupes suivent. Une composante non calculée, ou une faute de frappe,
      affiche un message clair (pas d'écran blanc). L'unité est celle de la grandeur (µdef, MPa, mm).
- [ ] En régime harmonique (champs complexes), les champs dérivés ne sont pas proposés.

## Recherche globale : ouverture directe et Accueil (1.4.0)

- [ ] Ctrl+K sur une référence, une étude, une campagne, une figure : Entrée ouvre directement
      sa fiche / sa vue, pas seulement la page du module.
- [ ] Accueil → Dernières figures : un titre très long (par exemple avec des soulignés) tient sur
      deux lignes au plus, sans sortir de sa vignette ; l'infobulle donne le titre complet.

## Régression : qualité de l'ajustement (1.5.0)

- [ ] Sous l'équation : nombre de points, écart quadratique moyen, erreur type. « Voir les résidus » :
      une droite sur des points courbes donne une forme en U ; un bon modèle, un nuage sans forme.
- [ ] Erreur type = « trop peu de points » quand n ≤ nombre de paramètres.

## Numériseur : échelles connues et détection des axes (1.5.0)

- [ ] Ouvrir une image de graphique avec deux axes noirs : « Détecter les axes » pose X1, X2, Y1, Y2
      aux extrémités des axes ; saisir les valeurs (ou déplacer les points sur des graduations) suffit.
      Image sans axes nets : message, rien n'est posé.
- [ ] Carte de couleurs, « Échelle » : choisir celle du logiciel qui a tracé la carte (jet, viridis…),
      saisir les valeurs de début et de fin (case « inversée » si la barre va de haut en bas) :
      « Lire la carte » marche sans pointer la légende. Comparer avec la lecture de la barre de l'image.
- [ ] Sur une vraie carte COMSOL / Matlab : les valeurs lues collent à la barre (à la tolérance près).

## Traitement → campagne, et Ctrl+K (1.5.1)

- [ ] Ouvrir un fichier de mesure par « Ouvrir » dans Traitement, écarter des cycles, caler ; « Rattacher
      à une campagne… » : choisir la campagne, un essai existant ou « Nouvel essai… ». Message de confirmation.
- [ ] Dans la campagne : l'essai a « 2S2P1D ✓ », ses paramètres apparaissent dans « Résultats du
      traitement 2S2P1D » ; le bouton rouvre le dépouillement avec les mêmes cycles écartés, sur l'autre PC aussi.
- [ ] Rattacher sur un essai déjà dépouillé : demande de confirmation « Remplacer » ; l'ancien est dans
      `campagnes/<c>/essais/<e>/.anciens/`. Le dépouillement ne figure plus dans « Dépouillements enregistrés ».
- [ ] Fichier déposé par glisser-déposer (pas par « Ouvrir ») : bouton grisé, l'infobulle explique pourquoi.
- [ ] Ctrl+K depuis la page Bibliothèque elle-même : Entrée sur une référence ouvre bien sa fiche.

## Citations de la Bibliothèque (1.6.0)

- [ ] Présentation avec `[@BIB-020]` et `[@BIB-065, p. 12; @BIB-020]` : le panneau compte les références
      citées ; l'export .pptx montre « (Olard & Di Benedetto, 2003) » et une diapo Références à la fin
      (vérifier auteurs, année, revue, DOI contre ta fiche).
- [ ] Une clé fausse (`[@BIB-999]`) reste telle quelle et est signalée à l'export.
- [ ] `références: non` dans l'en-tête : citations rendues, pas de diapo Références.
- [ ] ChaussSpec → « Comment ça marche ? » : lignes « Sources : » sous les rubriques ; clic → la fiche.
- [ ] Bibliothèque : décocher « Citations [@…] dans l'application » → plus de « Sources », et `[@…]`
      reste tel qu'écrit dans les présentations ; l'autre PC voit le même réglage.

## Aperçu des PDF, menu en sections, ViscoCompare retiré (1.7.0)

- [ ] Fiche d'une référence avec PDF : la première page apparaît à droite du bloc PDF (quelques
      secondes la première fois), puis instantanément ; clic → le PDF s'ouvre dans ton lecteur.
- [ ] Un vrai article (PDF d'éditeur, scanné, protégé) : l'aperçu est correct ; sinon le message dit pourquoi.
- [ ] Remplacer le PDF d'une référence : l'aperçu se refait ; `bibliotheque/apercus/` sur l'autre PC.
- [ ] Barre de gauche : sections Essais et Outils dépliables, la section de la page ouverte reste
      dépliée, le repli est gardé au relancement.
- [ ] ViscoCompare n'apparaît plus (menu, Accueil, Ctrl+K, Réglages → racines suggérées).

## Cartes éditables (1.8.0 ; comprend aussi les points 1.7.0 ci-dessus, jamais publiée)

- [ ] ChaussSpec → « Comment ça marche ? » : les cinq rubriques sont des cartes ; « modifier » une
      carte, enregistrer : « (modifiée) », le texte est dans `cartes/chausspec/comment-ca-marche/` et se
      retrouve sur l'autre PC ; « texte d'origine » reprend le texte de l'application.
- [ ] Monter / descendre une carte, masquer une carte puis la réafficher (bas de la liste).
- [ ] Campagne et étude : section « Cartes », « + Nouvelle carte » ; Markdown (titre, listes, gras,
      `code`, lien web qui s'ouvre dans le navigateur) ; `[@BIB-020]` rendu en auteur-année si les citations
      sont actives, tel quel sinon ; « retirer » demande confirmation et range le fichier dans `.anciennes/`.

## Journal (1.9.0)

- [ ] Calendrier → Journal : la note du jour se crée avec les tâches non faites de la dernière note ;
      `journal/AAAA-MM-JJ.md` apparaît dans l'espace et sur l'autre PC.
- [ ] « Nouvelle tâche… » + Entrée ajoute à « À faire » ; cocher / décocher dans la note ; « Modifier la note »
      pour tout réécrire (Markdown, `- [ ]` pour une tâche).
- [ ] ← / → et la liste de gauche : les jours passés s'affichent, un jour sans note ne se crée qu'à la première modification.
- [ ] Accueil : encart « Aujourd'hui », cocher une tâche la barre aussi dans le journal.
- [ ] Le lendemain : les tâches restées ouvertes sont reprises, celles cochées non.

## Mettre à jour Zotero (1.10.0)

- [ ] Bibliothèque → « Mettre à jour Zotero… » → « Créer une clé sur zotero.org » ouvre le navigateur ; clé créée avec
      accès bibliothèque, notes et écriture ; « Vérifier et enregistrer » affiche le nom du compte. Une clé sans
      l'écriture ou sans les notes est refusée avec un message clair.
- [ ] Dans Zotero (PC de travail) : Paramètres → Avancé → Fichiers et dossiers → répertoire de base des pièces
      jointes liées = le chemin affiché (« Copier »).
- [ ] « Préparer » : les références déjà dans Zotero sont « reconnues » (pas « à créer ») ; les doublons possibles
      sont listés à part.
- [ ] « Envoyer vers Zotero » : collection « Thèse » créée ; entrées complètes (auteurs, revue, DOI, étiquettes
      « Thèse · … ») ; vos étiquettes Zotero d'avant toujours là ; note « Notes de lecture — BIB-xxx » ;
      **le PDF s'ouvre depuis Zotero** (double-clic) ; « Dans Zotero » coché sur les fiches.
- [ ] Plugin Word : une référence envoyée se cite normalement.
- [ ] Re-« Préparer » tout de suite : tout « inchangé », bouton d'envoi grisé. Modifier une fiche dans Thèse →
      « 1 entrée à mettre à jour », sans doublon dans Zotero.
- [ ] PC perso : régler aussi le répertoire de base dans Zotero (même chemin OneDrive) ; après la synchro Zotero,
      le PDF s'ouvre aussi ; enregistrer la clé sur ce PC puis « Préparer » : rien à recréer.
- [ ] Couper le réseau pendant un envoi : message d'erreur ; relancer, aucun doublon.
- [ ] Exporter RIS → importer dans Zotero avec « Lier les fichiers à leur emplacement d'origine » : les PDF sont attachés.

## PDF manquants dans Thèse (1.11.0)

- [ ] « Préparer » : la rubrique « PDF manquants dans Thèse » liste les fiches sans PDF dont l'entrée Zotero a un PDF ;
      « Détail » distingue les PDF stockés chez Zotero et les fichiers liés ailleurs.
- [ ] « Récupérer dans Thèse » : les PDF arrivent dans `Espace\bibliotheque\pdf` (nom BIB-xxx_Auteur_année_titre),
      la fiche affiche le PDF et son aperçu.
- [ ] Re-« Préparer » puis envoyer : pas de second PDF dans Zotero pour ces entrées.
- [ ] Si le stockage Zotero est en WebDAV : message « fichier absent du stockage Zotero », rien d'écrit.

## PDF manquants dans la liste des références (1.12.0)

- [ ] Bibliothèque → Références : colonne « PDF » ; ✓ pour les fiches dont le PDF est dans `Espace\bibliotheque\pdf`,
      « manque » (avec « PDF libre », « Éditeur (abonnement) »…) sinon, « introuvable » si le fichier noté a disparu.
- [ ] « N sans PDF » filtre la liste (écartées exclues) ; le filtre « PDF : tous » la rétablit.
- [ ] Après un PDF ajouté depuis la fiche ou récupéré depuis Zotero, la ligne passe à ✓ sans relancer.
