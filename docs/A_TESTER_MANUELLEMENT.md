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
