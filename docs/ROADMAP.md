# Feuille de route — Thèse

Une phase par session (ou par petite série de sessions). Une phase est **terminée** quand
les tests sont verts, le lint est propre, `A_TESTER_MANUELLEMENT.md` est à jour et
l'installeur de la phase est produit par GitHub Actions.

## P0 — Socle
- [ ] Monorepo npm (`packages/`, `modules/`, `app/`), Tauri 2, Vite, Vitest, ESLint
      avec la règle « un module n'importe jamais un autre module »
- [ ] Coquille : fenêtre, barre des modules, registre (manifestes, actions nommées)
- [ ] Sélection des modules à la compilation (`THESE_MODULES` + *features* Cargo)
- [ ] `noyau/stockage` : espace, écriture atomique, verrous, scan, copies de conflit
      OneDrive, surveillance du dossier (extrait et généralisé depuis Figurine)
- [ ] Réglages du poste, racines de données, premier lancement (choix de l'espace)
- [ ] Accueil minimal + « À régler » + Diagnostic
- [ ] GitHub Actions : tests Linux, installeur Windows `Thèse`

## P1 — Figures (Figurine intégrée)
- [ ] Import du code de `LucasDavidTPE/Trace` avec son historique (`git subtree`)
- [ ] `src/core` → `modules/figures`, stockage branché sur `noyau/stockage`
- [ ] Tous les tests Figurine verts (dont golden TikZ / SVG et `cargo test`)
- [ ] Installeur `Figurine` seul, compatible avec la bibliothèque et les réglages 1.0

## P2 — Traitement 2S2P1D
- [ ] Portage JS → TypeScript de `src/coeur` et `src/io` dans `packages/noyau`
      (lecture des essais, régression, modèles, optimiseur, WLF)
- [ ] Tests de conformité `test/reference/` portés, **à l'identique**
- [ ] Interface React (reprise de l'interface du site), tri des cycles, exports `.xlsx`
- [ ] Installeur `Traitement 2S2P1D` seul (ouvrir / enregistrer des fichiers)

## P3 — Bibliothèque
- [ ] Modèle de données, `parametres.json`, calculs (citation, état, alerte, score, temps)
- [ ] Import du classeur `.xlsx` relançable + test de conformité aux valeurs d'Excel
- [ ] Tableau de bord, Références, Fiche, Plan de lecture
- [ ] Demandes, Corrections TFE, Pistes, Analyse croisée
- [ ] Actions : ouvrir (proxy), marquer lu, doublons, vérifier les liens, ajout par DOI
- [ ] Exports RIS, BibTeX, Markdown

## P4 — Planning
- [ ] Éléments, catégories, activer / désactiver, sous-éléments
- [ ] Gantt (zoom, glisser, aujourd'hui), vue liste, widget « Cette semaine »
- [ ] Fournisseurs : mois de lecture et demandes (Bibliothèque)
- [ ] Exports PNG / SVG / pgfgantt

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
