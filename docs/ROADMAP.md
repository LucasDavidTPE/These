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
- [ ] Plus tard : vérifier les liens, ajout par DOI (OpenAlex / Crossref), export Markdown
      (selon la réponse aux questions Obsidian / iPad), contrôle des doublons

## P4 — Planning ✔
- [x] Éléments (phases, tâches, jalons), catégories, activer / désactiver (partagé
      entre les deux PC), sous-éléments ; suppression = rangement dans `.supprimes/`
- [x] Gantt SVG (zoom semaines / mois / trimestres / thèse, ligne « aujourd'hui »),
      vue liste, widget « Cette semaine » sur l'Accueil (action `planning.cette-semaine`)
- [x] Fournisseurs : mois de lecture et dates limites des demandes (Bibliothèque,
      action `bibliotheque.planning`)
- [x] Export pgfgantt
- [ ] Plus tard : glisser pour déplacer ou étirer une barre (les dates se modifient pour
      l'instant dans le panneau), exports PNG / SVG vers Figures

## P5 — Campagnes
- [ ] Fiches de campagne et d'essai, import des `projects/*.toml` de these-lgcb
- [ ] Découverte des essais (journaux Instron, WaveMatrix), lecture rapide en Rust
- [ ] Aperçus, galerie, page de campagne
- [ ] Viewer d'essai, export Excel, copie des données brutes
- [ ] Carnet : notes Markdown et images (coller, glisser)
- [ ] Liens : ouvrir dans le traitement 2S2P1D, enregistrer dans Figures,
      période des campagnes dans le Planning

## P6 — Liaisons et finitions
- [ ] Accueil complet (Cette semaine, derniers essais, dernières figures)
- [ ] Graphes régénérables depuis les données d'un essai
- [ ] Archivage des anciens dépôts (hub, these-lgcb) une fois la bascule faite

## P7 — Plus tard (à décider)
- [ ] Lancer un script d'étude Python si Python est présent
- [ ] Index des figures LaTeX des manuscrits
- [ ] Module ViscoCompare (comparaison COMSOL / Viscoroute)
