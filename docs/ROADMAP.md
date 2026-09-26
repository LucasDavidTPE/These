# Feuille de route — Thèse

Une phase par session (ou par petite série de sessions). Une phase est **terminée** quand
les tests sont verts, le lint est propre, `A_TESTER_MANUELLEMENT.md` est à jour et
l'installeur de la phase est produit par GitHub Actions.

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
- [ ] Action « Enregistrer dans Figures » offerte aux autres modules : à faire avec son
      premier utilisateur (Traitement, P2)

## P2 — Traitement 2S2P1D (étape 1 ✔)
- [x] Page de dépouillement reprise telle quelle (`modules/traitement/statique/`, commit
      260bb55 de 2S2P1D-traitement), sans réseau (polices Google retirées), servie par
      l'application ; seuls les modules du produit sont embarqués
- [x] Tests de conformité `test/reference/` portés **à l'identique** (`node --test`,
      lancés par `npm test`)
- [x] Exports (`.xlsx`, projet `.json`) par la boîte « Enregistrer sous » de Windows
- [ ] Étape 2 : cœur en TypeScript dans `modules/traitement/core`, interface React,
      « Enregistrer dans Figures » ; à faire avec Campagnes (P5), qui ouvrira les essais
      directement
- [ ] Installeur `Traitement 2S2P1D` seul : la configuration existe
      (`npm run construire -- traitement`), à produire par la CI

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
- [ ] Plus tard : vérifier les liens (demande des requêtes côté Rust), export Markdown
      (selon la réponse aux questions Obsidian / iPad), contrôle des doublons

## P4 — Planning ✔
- [x] Éléments (phases, tâches, jalons), catégories, activer / désactiver (partagé
      entre les deux PC), sous-éléments ; suppression = rangement dans `.supprimes/`
- [x] Gantt SVG (zoom semaines / mois / trimestres / thèse, ligne « aujourd'hui »),
      vue liste, widget « Cette semaine » sur l'Accueil (action `planning.cette-semaine`)
- [x] Fournisseurs : mois de lecture et dates limites des demandes (Bibliothèque,
      action `bibliotheque.planning`)
- [x] Export pgfgantt
- [x] Glisser une barre pour la déplacer, son bord droit pour l'étirer (au jour près)
- [ ] Plus tard : exports PNG / SVG vers Figures

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
- [ ] Plus tard : zoom dans les courbes, export Excel d'un essai, copie des données brutes

## P6 — Liaisons et finitions
- [ ] Accueil complet (Cette semaine, derniers essais, dernières figures)
- [ ] Graphes régénérables depuis les données d'un essai
- [ ] Archivage des anciens dépôts (hub, these-lgcb) une fois la bascule faite

## P7 — Plus tard (à décider)
- [x] Module Études : une étude = un dossier dans l'espace (fiche, `run.py`, outil
      `these_etude.py` sans dépendance), arborescence, ouverture dans VS Code, chaque
      exécution tracée (`sorties/<horodatage>/execution.json` : poste, Python, données lues,
      fichiers produits, erreur), sorties avec vignettes ; études these-lgcb lues telles
      quelles (`study.toml`, `outputs/`, `*.prov.json`)
- [ ] Index des figures LaTeX des manuscrits
- [ ] Module ViscoCompare (comparaison COMSOL / Viscoroute)
