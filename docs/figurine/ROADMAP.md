# Feuille de route — Figurine

Une session cloud = **une ligne de ce tableau**, pas plus. Cocher la case à la fin.
Après chaque session : tirer (`git pull`), lancer `npm run tauri dev` sur Windows,
dérouler `docs/A_TESTER_MANUELLEMENT.md`, noter les retours dans une issue ou dans
le prompt de la session suivante.

| ✔ | Session | Contenu | Modèle conseillé |
|---|---------|---------|------------------|
| [x] | S0 | Squelette Tauri + React + tests + CI Windows | Opus |
| [x] | S1 | Stockage fichiers, verrous, conflits OneDrive (core + Rust) | Opus |
| [x] | S2 | Interface bibliothèque + métadonnées + réglages | Sonnet |
| [x] | S3 | Détourage local + presse-papier Windows PNG + source HTML | Opus |
| [x] | S4 | Cœur des schémas : modèle, ancres, thème, export SVG/TikZ, golden tests | Opus |
| [x] | S5 | Composants rhéologie + structure + chargements | Opus (ou Sonnet) |
| [x] | S6 | Éditeur interactif (sélection, poignées, grille, undo, panneau de propriétés) | Opus |
| [x] | S7 | Annotations (repères, cotes, flèches, texte MathJax) + export PNG | Sonnet |
| [x] | S8 | Recadrage | Sonnet |
| [x] | S9 | Graphes depuis Excel → pgfplots/SVG | Sonnet |
| [x] | S10 | Finitions, bugs remontés, release v1.0 | Opus |

Budget : regarder la consommation réelle après S0 et S1, puis ajuster (fusionner des
sessions Sonnet, ou reporter S9). Les sessions S4 et S6 sont les plus coûteuses.

---

## Prompts de session (à copier tels quels)

### S0 — Squelette
> Lis CLAUDE.md et docs/SPEC.md. Session S0 uniquement : crée le squelette Tauri 2 +
> React + TypeScript + Vite + Zustand, l'arborescence de CLAUDE.md (`src/core`, `src/ui`,
> `src-tauri`, `tex/`, `tests/golden/`), Vitest et ESLint configurés avec un test
> d'exemple dans `src/core`, `cargo test` qui passe. Configure `tauri.conf.json`
> (nom provisoire « Figurine », identifiant `fr.lucasdavid.figurine`, cibles msi + nsis,
> installation par utilisateur). Complète `.github/workflows/build-windows.yml` si besoin
> pour qu'il construise les installeurs sur tag `v*` et en artefact sur chaque push.
> Une fenêtre avec une barre latérale : Bibliothèque / Détourage / Schéma / Recadrage /
> Graphes (pages vides). Crée docs/A_TESTER_MANUELLEMENT.md, docs/QUESTIONS.md,
> docs/LICENCES.md. Fini quand : `npm run test`, `npm run lint`, `cargo test` passent.

### S1 — Stockage
> Session S1 : implémente SPEC §4 et le type `meta.json` de §3. Logique pure (scan,
> index, attribution d'ID, détection des copies de conflit OneDrive, validation de
> meta.json) dans `src/core/library/` avec tests Vitest sur un faux système de fichiers.
> Côté Rust : commandes Tauri pour lister, lire, écrire atomiquement, poser/lever/lire
> un `.lock` (nom de poste + date), avec tests `cargo test` dans un dossier temporaire.
> Couvre : lock périmé, lock d'un autre poste, écriture interrompue, chemins avec
> espaces et accents, noms de session différents. Pas d'UI dans cette session.

### S2 — Interface bibliothèque
> Session S2 : page Bibliothèque. Premier lancement : choix de la racine (proposer le
> dossier OneDrive détecté). Grille de vignettes (export.png ou original.png), recherche
> plein texte sur titre/tags/source, filtres par type et « sans source / sans licence ».
> Panneau de métadonnées éditable (SPEC §3) avec légende générée. Bandeau lecture seule
> si figure verrouillée ailleurs ; résolution des conflits OneDrive. Réglages par poste
> hors OneDrive. Mets à jour A_TESTER_MANUELLEMENT.md.

### S3 — Détourage
> Session S3 : SPEC §8. Choisis un modèle de détourage exécutable par ONNX Runtime en
> local (IS-Net ou U²-Net), vérifie sa licence et consigne-la dans docs/LICENCES.md
> AVANT de l'intégrer ; si la licence pose problème, écris-le dans QUESTIONS.md et
> propose une alternative. Pipeline pré/post-traitement testé sur des images de
> test synthétiques. Côté Rust (Windows) : lecture du presse-papier (image + format
> HTML pour récupérer SourceURL et src), écriture d'une image avec les formats "PNG"
> ET DIB. Page Détourage : coller/glisser/ouvrir, aperçu damier, seuil, pinceau
> garder/retirer, Copier, Enregistrer dans la bibliothèque (source préremplie),
> Enregistrer sous. Le modèle est embarqué dans l'installeur (vérifie la taille).
> Liste précisément dans A_TESTER_MANUELLEMENT.md les tests presse-papier à faire
> avec Chrome, Edge, Word et PowerPoint.

### S4 — Cœur des schémas
> Session S4 : SPEC §5 et §7, **uniquement dans `src/core/schema/`** (pas d'UI).
> Types du format pivot + validation + migration de version ; système d'ancres nommées
> et résolution (erreurs claires) ; interface de composant (paramètres, géométrie,
> ancres, rendu SVG, rendu TikZ) ; thème « these » ; exporteurs SVG et TikZ
> déterministes ; `tex/figurine.sty`. Implémente 4 composants pour valider l'API :
> rectangle, ressort, amortisseur, layer_stack. Tests golden dans `tests/golden/` :
> pour chaque figure de test, sortie .svg et .tex comparées octet pour octet ; et si
> `latexmk`/`pdflatex` est disponible dans l'environnement, un test qui compile les .tex
> générés (sinon le signaler). Documente l'API d'un composant dans docs/COMPOSANTS.md.

### S5 — Composants
> Session S5 : implémente les composants de SPEC §6 rubriques Rhéologie, Structure et
> Chargement avec l'API définie en S4 (docs/COMPOSANTS.md). Chaque composant : validation
> des paramètres, ancres documentées, figure golden. Figures de validation obligatoires :
> chaîne KVG à 9 éléments, modèle 2S2P1D complet, structure 4 couches sous profil
> 5-gaussiennes (centres ±0,16 m, σ = 0,0315 m), bogie vu en plan.

### S6 — Éditeur
> Session S6 : page Schéma. Planche en SVG, zoom/panoramique, grille aimantée, palette
> des composants, glisser-déposer, sélection simple et multiple, poignées de
> déplacement, alignement, copier/coller, annuler/rétablir (historique dans `src/core`,
> testé), panneau de propriétés généré depuis le schéma des paramètres, enregistrement
> dans la bibliothèque (figure.json + exports), boutons Copier TikZ / SVG / PNG.
> Tout ce qui est logique (hit-testing, snapping, historique) va dans `src/core` avec
> tests.

### S7 — Annotations
> Session S7 : composants Annotations de SPEC §6 (repère 2D/3D, cotes linéaire et
> angulaire qui suivent leurs ancres, flèche, accolade, texte avec `$…$` rendu par
> MathJax en SVG et brut en TikZ, point de mesure) + formes libres + export PNG
> 300/600 dpi. Figures golden pour chacun.

### S8 — Recadrage
> Session S8 : SPEC §9, logique géométrique dans `src/core/crop/` avec tests, page
> Recadrage, enregistrement comme nouvelle figure (kind=crop) liée à l'originale.

### S9 — Graphes
> Session S9 : SPEC §10. Lecture .xlsx/.csv (vérifie la licence de la librairie et la
> version réellement maintenue), collage de texte tabulé avec virgule décimale,
> modèle de graphe dans `src/core/graph/`, exports pgfplots et SVG déterministes avec
> tests golden, page Graphes.

### S10 — Finitions
> Session S10 : traite les points ouverts de QUESTIONS.md et les retours listés
> ci-dessous, puis prépare la release v1.0 (numéro de version, README utilisateur en
> français, tag). Retours : <coller ici>
