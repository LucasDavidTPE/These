# Licences des dépendances

Les dépendances embarquées dans l'installeur sont sous licence permissive, sauf le décodeur
HEIC (LGPL-3.0, voir plus bas).

| Dépendance | Rôle | Licence |
|---|---|---|
| Tauri 2 (`tauri`, `@tauri-apps/api`, `@tauri-apps/cli`) | application de bureau | MIT / Apache-2.0 |
| `tauri-plugin-dialog`, `tauri-plugin-opener`, `tauri-plugin-window-state` | boîtes de dialogue, ouvrir un dossier ou un lien, fenêtre | MIT / Apache-2.0 |
| React, React DOM | interface | MIT |
| Zustand | état de l'interface | MIT |
| `notify` | surveillance des dossiers | CC0-1.0 / Artistic-2.0 |
| `mathjax-full` (Figures) | maths `$…$` → SVG | Apache-2.0 (polices OFL/Apache) |
| `fflate` (Figures) | lecture des `.xlsx` | MIT |
| `ort`, ONNX Runtime (Figures) | détourage local | MIT / Apache-2.0 ; MIT |
| `image`, `clipboard-win` (Figures) | images, presse-papiers Windows | MIT / Apache-2.0 ; BSL-1.0 |
| Modèle IS-Net « general use » (Figures) | détourage | Apache-2.0 |
| `serde`, `serde_json`, `chrono` | sérialisation, dates | MIT / Apache-2.0 |
| `ureq` | vérification des liens de la bibliothèque (sur demande) | MIT / Apache-2.0 |
| `heic-to` (libheif compilé en JavaScript) (Figures) | ouvrir les photos HEIC / HEIF | LGPL-3.0 |
| Vite, Vitest, ESLint, TypeScript | outils de développement (non embarqués) | MIT / Apache-2.0 |

Le code repris de Figurine est du même auteur. Le détail de ses dépendances, avec versions
et usages, est dans `docs/figurine/LICENCES.md`.

**LGPL-3.0 (`heic-to`, libheif).** Le décodeur est livré tel quel dans un fichier séparé de
l'application (`assets/heic-to-*.js`), chargé seulement quand une photo HEIC est ouverte :
il peut être remplacé par une autre version sans toucher au reste, ce que demande la LGPL.
Sources : <https://github.com/hoppergee/heic-to> et <https://github.com/strukturag/libheif>.
