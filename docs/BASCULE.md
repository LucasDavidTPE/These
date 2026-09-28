# Bascule vers l'application et archivage des anciens dépôts

La P6 prévoit d'archiver les anciens dépôts **une fois la bascule faite**. Archiver un dépôt
GitHub le passe en lecture seule (rien n'est supprimé, c'est réversible depuis *Settings*),
mais c'est à faire à la main, quand chaque case ci-dessous est cochée. L'application ne le
fait pas et aucune session Claude ne le fait sans votre accord explicite.

## Ce que chaque dépôt apportait, et où c'est maintenant

### `lucasdavid47/these-lgcb` (tableau de bord Python, études, index LaTeX)

| Fonction de these-lgcb | Dans Thèse | Vérifié sous Windows |
|---|---|---|
| Galerie des campagnes, aperçus température / force | Campagnes (galerie) | [ ] |
| Page de campagne, `projects/*.toml` | Campagnes (fiche ; import des `.toml`) | [ ] |
| Découverte des essais dans les journaux Instron | Campagnes → « Découvrir les essais » | [ ] |
| Viewer d'un essai, export Excel | Campagnes → « Courbes », `.xlsx`, CSV | [ ] |
| Études `studies/*/run.py`, traçabilité `.prov.json` | Études (exécutions tracées) | [ ] |
| Index LaTeX (`lgcb.tex`) | Manuscrits → Sources LaTeX (sans compilation) | [ ] |
| Bibliographie (`lgcb biblio`) | Bibliothèque | [ ] |
| Lanceur Java, boutons git | *hors périmètre* : les dépôts sont gérés par ailleurs | — |
| Compilation LaTeX + vignettes | **pas repris** : compiler dans l'éditeur LaTeX ; l'index montre le PDF | décider |
| `lgcb.plotting` (figures homogènes Python) | Figures (graphes) et figures régénérables | décider |

Avant d'archiver : importer les dernières fiches `projects/*.toml` et les notes, vérifier
que les études utiles sont lisibles dans Études, et garder une copie locale du dépôt.

### `lucasdavid47/lgcb-hub` (panneau Java)

| Fonction | Dans Thèse | Vérifié |
|---|---|---|
| Panneau d'accueil, raccourcis | Accueil | [ ] |
| Diagnostic global | Diagnostic | [ ] |

### `lucasdavid47/2S2P1D-traitement` (site de dépouillement)

| Fonction | Dans Thèse | Vérifié |
|---|---|---|
| Toute la page (lecture, cycles, synthèse, calage, exports) | Traitement 2S2P1D (nouvelle interface, 0.2.6) | [ ] |
| Projets `.json` du site | se rouvrent dans l'application (format version 2) | [ ] |
| Diffusion à un collègue | installeur « Traitement 2S2P1D » seul | [ ] |
| Site GitHub Pages | question 6 de `QUESTIONS.md` : laisser en ligne figé, ou retirer | décider |

Avant d'archiver : retirer l'« Ancienne page » de l'application (P2) une fois la nouvelle
validée, et décider du sort du site en ligne.

### `LucasDavidTPE/Trace` (Figurine 1.0)

Le code est dans `modules/figures` depuis la P1 ; l'installeur Figurine 1.1.0 remplace 1.0.
À archiver quand Figurine 1.1.0 a remplacé 1.0 sur les deux PC.

### `LucasDavidTPE/ViscoCompare` (script de comparaison COMSOL / Viscoroute)

Porté dans le module ViscoCompare (0.2.5) : mêmes lectures et conversions, plus les écarts
sur l'extremum. À archiver quand les classeurs de l'application ont été comparés à ceux du
script sur un vrai dossier.

## Archiver un dépôt (quand ses cases sont cochées)

GitHub → le dépôt → *Settings* → tout en bas, *Danger Zone* → **Archive this repository**.
Pour revenir en arrière : même endroit, *Unarchive*.
