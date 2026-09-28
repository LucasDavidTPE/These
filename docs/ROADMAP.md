# Feuille de route — Thèse

Une phase par session (ou par petite série de sessions). Une phase est **terminée** quand
les tests sont verts, le lint est propre, `A_TESTER_MANUELLEMENT.md` est à jour et
l'installeur de la phase est produit par GitHub Actions.

Outillage : bouton **tests-windows** (Actions → Run workflow) et `tester-windows.cmd`
lancent tous les tests automatiques sous Windows.

## P0 — Socle ✔
- [x] Dépôt unique (`packages/`, `modules/`, `app/`), Tauri 2, Vite, Vitest, ESLint
      avec la règle « un module n'importe jamais un autre module »
- [x] Coquille : fenêtre, barre des modules, registre (manifestes, actions nommées)
- [x] Sélection des modules à la compilation (`THESE_PRODUIT`, surcharges Tauri par
      produit) ; *features* Cargo à ajouter avec le premier code natif de module (P1)
- [x] `noyau/stockage` : espace, collections (un fichier par objet), écriture atomique et
      exclusive, verrous, copies de conflit OneDrive (dont « garder les deux »),
      comparaison de versions, surveillance du dossier (repris et généralisé de Figurine)
- [x] Réglages du poste, racines de données, premier lancement (choix de l'espace)
- [x] Accueil minimal + « À régler » + Diagnostic
- [x] GitHub Actions : tests Linux, installeur Windows `Thèse`

## P1 — Figures (Figurine intégrée) ✔
- [x] Code de `LucasDavidTPE/Trace` (Figurine 1.0.0, commit 1b85dc9) repris dans
      `modules/figures` (`core/`, `ui/`, `tests/`, `tex/`) ; documentation dans
      `docs/figurine/`. L'historique reste dans le dépôt Trace (pas de `git subtree`).
- [x] Les cinq pages de Figurine en onglets ; le dossier de la bibliothèque est le champ
      `figures` des réglages du poste ; commandes Rust communes (`fichiers_*`, `verrou_*`)
- [x] Tous les tests Figurine verts (golden TikZ / SVG / pgfplots, `cargo test` avec le
      modèle de détourage réel)
- [x] Installeur `Figurine` seul (1.1.0) : reprend le dossier de bibliothèque des réglages
      de Figurine 1.0 ; détourage derrière la *feature* Cargo `figures`
- [x] Action `figures.enregistrer-image` offerte aux autres modules ; utilisée par les
      courbes d'un essai (Campagnes) : PNG + source dans la bibliothèque de figures

## P2 — Traitement 2S2P1D (étapes 1 et 2 ✔)
- [x] Page de dépouillement reprise telle quelle (`modules/traitement/statique/`, commit
      260bb55 de 2S2P1D-traitement), sans réseau (polices Google retirées), servie par
      l'application ; seuls les modules du produit sont embarqués
- [x] Tests de conformité `test/reference/` portés **à l'identique** (`node --test`,
      lancés par `npm test`)
- [x] Exports (`.xlsx`, projet `.json`) par la boîte « Enregistrer sous » de Windows
- [x] Ouverture d'un essai depuis Campagnes (action `traitement.ouvrir-essai`) : l'export
      `.steps.tracking.csv` est chargé directement, le projet est enregistré avec l'essai
      (`campagnes/<campagne>/essais/<essai>/traitement.json`) ; lecture des exports WaveMatrix
      corrigée (séparateur, guillemets), boucle infinie sans colonne de cycles corrigée
- [x] Étape 2 : cœur en TypeScript dans `modules/traitement/core` (tests de conformité
      portés à l'identique, plus un test « mêmes nombres, bit à bit, que le JavaScript
      d'origine »), interface React en sept étapes, graphiques par le traceur commun
      (`noyau/graphe`), « → Figures » sur chaque graphique (régénérable pour un essai de
      campagne : action `traitement.regenerer-figure`)
- [ ] Retirer l'ancienne page (`statique/`, bouton « Ancienne page ») une fois la nouvelle
      validée sous Windows
- [x] Installeur `Traitement 2S2P1D` seul, produit par la CI (job `build-traitement`,
      artefact `traitement-2s2p1d-installeurs`), compilé sans la *feature* `figures`

## P3 — Bibliothèque ✔
- [x] Modèle de données, `parametres.json`, calculs (citation, état, alerte, score, temps,
      tableau de bord, demandes)
- [x] Import du classeur `.xlsx` relançable + test de conformité aux valeurs d'Excel
      (`modules/bibliotheque/tests/conformite.test.ts`)
- [x] Tableau de bord, Références (filtres, tri par score), Fiche, Plan de lecture
- [x] Demandes, Corrections TFE, Pistes, Analyse croisée (matrice recalculée + textes)
- [x] Actions : ouvrir le lien (proxy), doi.org, Scholar, ouvrir le PDF, marquer lu,
      nouvelle référence ; exports RIS et BibTeX
- [x] Remplir une référence depuis son DOI (Crossref, sur demande) ; contrôle des doublons
      (clé, DOI, titre + premier auteur) sur le tableau de bord
- [x] Vérifier les liens (commande Rust `lien_verifier`, sur demande, interruptible) :
      état et date notés dans chaque référence, liens morts sur le tableau de bord
- [x] Export Markdown : une note par référence (compatible Obsidian) et le point mensuel

## P4 — Planning ✔
- [x] Éléments (phases, tâches, jalons), catégories, activer / désactiver (partagé
      entre les deux PC), sous-éléments ; suppression = rangement dans `.supprimes/`
- [x] Gantt SVG (zoom semaines / mois / trimestres / thèse, ligne « aujourd'hui »),
      vue liste, widget « Cette semaine » sur l'Accueil (action `planning.cette-semaine`)
- [x] Fournisseurs : mois de lecture et dates limites des demandes (Bibliothèque,
      action `bibliotheque.planning`)
- [x] Export pgfgantt
- [x] Glisser une barre pour la déplacer, son bord droit pour l'étirer (au jour près)
- [x] Exports SVG / PNG de toute la thèse, et « Enregistrer dans Figures » (régénérable)

## P5 — Campagnes (étape 1 ✔)
- [x] Fiches de campagne et d'essai (un dossier par campagne), import des
      `projects/*.toml` de these-lgcb
- [x] Découverte des essais dans le dossier de données (sous-dossiers avec un
      `*.steps.tracking.csv`, journaux Instron `.log` : dates, durée, cycles, état, machine)
- [x] Galerie (couleur par type, période réelle, chiffres), page de campagne
- [x] Carnet : notes datées (Markdown) et images (Ctrl+V ou fichier), dans l'espace
- [x] Période des campagnes dans le Planning (action `campagnes.planning`) ; lien vers le
      traitement 2S2P1D
- [x] Lecture des exports WaveMatrix dans le noyau (`packages/noyau/src/formats/wavematrix.ts`,
      portage de these-lgcb), courbes d'un essai (un panneau par famille d'unités, légende
      cliquable, réticule), aperçu température / force enregistré dans l'espace et affiché
      dans la galerie (visible aussi sur le PC sans données brutes)
- [x] Zoom dans les courbes (glisser une plage, double-clic pour revenir), export d'un essai
      en CSV pour Excel (« ; », virgule décimale)
- [x] Copie des données brutes d'un essai (ou de la campagne) vers un dossier choisi,
      incrémentale, sans rien supprimer

## P6 — Liaisons et finitions
- [x] Accueil complet : Cette semaine, derniers essais (action `campagnes.recents`, clic →
      la campagne via `campagnes.ouvrir`), dernières figures avec vignette
      (`figures.recentes`, clic → la figure sélectionnée via `figures.ouvrir`)
- [x] Graphes régénérables : une figure garde son `origine` ; « Régénérer depuis les
      données » demande l'action `<module>.regenerer-figure` (courbes d'un essai avec voies
      et plage, Gantt, ViscoCompare). Traceur SVG commun dans `noyau/courbes`
- [ ] Archivage des anciens dépôts une fois la bascule faite : liste de contrôle dépôt par
      dépôt dans `docs/BASCULE.md` ; l'archivage lui-même se fait à la main sur GitHub

## P7 — Plus tard (à décider)
- [x] Module Études : une étude = un dossier dans l'espace (fiche, `run.py`, outil
      `these_etude.py` sans dépendance), arborescence, ouverture dans VS Code, chaque
      exécution tracée (`sorties/<horodatage>/execution.json` : poste, Python, données lues,
      fichiers produits, erreur), sorties avec vignettes ; études these-lgcb lues telles
      quelles (`study.toml`, `outputs/`, `*.prov.json`)
- [x] Module Manuscrits : versions datées des `.docx` (racine `manuscrits`), avec une note,
      copiées dans l'espace (`manuscrits/<fichier>/`), état « modifié depuis la dernière
      version », ouvrir une version, en faire une copie ailleurs
- [x] Index des sources LaTeX (Manuscrits → Sources LaTeX, racine `latex`) : classement de
      `lgcb/tex.py` (figure autonome, document, fragment), inclusions, « utilisé par »,
      inclusions introuvables ; ouverture dans VS Code, PDF compilé s'il existe. Pas de
      compilation par l'application
- [x] Module ViscoCompare : portage de `LucasDavidTPE/ViscoCompare/main.py` (lecture COMSOL
      et Viscoroute, profil en x = 0, conversions, interpolation), courbes superposées,
      écart sur l'extremum, classeurs `EXCEL_OUTPUT`, figures régénérables

## 0.2.7 — Retours de test (demandes du 28/09)
- [x] Régressions linéaires sur les courbes d'un essai (pente par heure, R²), gardées avec
      l'essai
- [x] Traitement : enregistrement automatique, dépouillements enregistrés à rouvrir
- [x] Figures rattachées aux campagnes et aux études
- [x] Graphiques du traitement envoyés à Figures comme graphes modifiables ; axes FR / EN
- [x] Calage : correctif des graphes vides (a_T bornés), modèles Maxwell, Kelvin-Voigt,
      Zener, Burgers ; séries de Prony (Maxwell / Kelvin-Voigt généralisé) et exports
      Abaqus, COMSOL, CSV
- [x] « Ce que l'on modélise » : schéma rhéologique interactif, essai animé (sinusoïdal
      avec ν, fluage, relaxation), export du schéma TikZ vers Figures
- [x] Figures → Graphes : styles, palettes (import coolors.co), couleurs par série, styles
      enregistrés, modèles de graphes, zoom de l'aperçu et zoom sur une zone
- [x] Figures : photos HEIC / HEIF
- [x] Retouche des courbes dans Figures → Graphes (précisé : dans l'éditeur de graphes) :
      gomme sur l'aperçu, tableau x/y modifiable, unités / signe / zéro, plage de x, lissage,
      allègement, tri, échange des axes, duplication ; Annuler / Rétablir (Ctrl+Z / Ctrl+Y)
