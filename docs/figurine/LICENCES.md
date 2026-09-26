# Licences des dépendances et modèles

Toute dépendance ou modèle ajouté est consigné ici **avant** intégration, avec sa licence
vérifiée (fichier LICENSE du dépôt ou métadonnées du registre).
Licences acceptées sans discussion : MIT, Apache-2.0, BSD, ISC, MPL-2.0, Zlib, Unicode.
Tout le reste (GPL, AGPL, non commercial, « research only », sans licence) → `QUESTIONS.md`.

## JavaScript / TypeScript (S0)
| Paquet | Version | Licence | Usage |
|--------|---------|---------|-------|
| react, react-dom | 19.3 | MIT | interface |
| zustand | 5.0 | MIT | état de l'interface |
| @tauri-apps/api | 2.11 | Apache-2.0 OR MIT | pont JS ↔ Rust |
| @tauri-apps/cli | 2.11 | Apache-2.0 OR MIT | build (dev) |
| fflate (S9) | 0.8 | MIT | décompression des classeurs .xlsx (lecteur OOXML maison, `src/core/graph/xlsx.ts`) |
| mathjax-full (S7) | 3.2.2 | Apache-2.0 | maths `$…$` → chemins SVG (polices TeX incluses, licence OFL/Apache des polices MathJax) |
| @tauri-apps/plugin-dialog (S2) | 2.7 | MIT OR Apache-2.0 | sélecteur de dossier |
| vite, @vitejs/plugin-react | 8.3 / 6.1 | MIT | build (dev) |
| typescript | 6.0 | Apache-2.0 | build (dev) |
| vitest | 5.0 | MIT | tests (dev) |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals | 10 / 8.70 / 7.1 / 0.5 / 17 | MIT | lint (dev) |

TypeScript est tenu en 6.0 (et non 7.x) car typescript-eslint 8.70 exige `< 6.1`.

## Rust (S0)
| Crate | Version | Licence | Usage |
|-------|---------|---------|-------|
| tauri, tauri-build | 2.11 / 2.6 | Apache-2.0 OR MIT | application |
| serde, serde_json | 1 | MIT OR Apache-2.0 | JSON |
| chrono (S1, sans fonctions par défaut : `clock`, `std`) | 0.4 | MIT OR Apache-2.0 | dates des verrous |
| tauri-plugin-dialog (S2) | 2 | MIT OR Apache-2.0 | sélecteur de dossier |
| tauri-plugin-window-state (S2) | 2 | MIT OR Apache-2.0 | mémoriser taille et position de la fenêtre |
| ort (S3, sans fonctions par défaut, `load-dynamic`) | 2.0.0-rc.13 | MIT OR Apache-2.0 | appel d'ONNX Runtime |
| image (S3) | 0.25 | MIT OR Apache-2.0 | décodage/encodage PNG, JPEG, BMP, GIF, WebP ; redimensionnement |
| clipboard-win (S3, Windows uniquement) | 5.4 | BSL-1.0 (Boost, permissive) | presse-papier Windows |
| tempfile (S1, tests uniquement) | 3 | MIT OR Apache-2.0 | dossiers temporaires des tests |

Les dépendances transitives de Tauri sont sous licences permissives (MIT / Apache-2.0 /
BSD / Zlib / Unicode) ; un audit exhaustif (`cargo deny` ou `cargo about`) est à faire
avant la release v1.0 (S10).

## Ressources embarquées
| Ressource | Licence | Note |
|-----------|---------|------|
| Icône provisoire (`src-tauri/app-icon.png`, `src-tauri/icons/`) | propre au projet | générée par script en S0 |

## Détourage (S3) — vérifié avant intégration

| Ressource | Version | Licence | Vérification |
|-----------|---------|---------|--------------|
| **Modèle IS-Net « general use »** (`isnet-general-use.onnx`, 178 Mo) | poids DIS (Qin et al., ECCV 2022), export ONNX de rembg | **Apache-2.0** (dépôt `xuebinqin/DIS`, fichier `LICENSE.md` lu le 25/09/2026) ; conversion ONNX distribuée par rembg sous **MIT** (`danielgatis/rembg`, `LICENSE.txt`) | SHA-256 `60920e99…0d964a`, épinglé dans `scripts/fetch-models.mjs` |
| **ONNX Runtime** (`onnxruntime.dll`, 15,8 Mo) | 1.28.0 (build officiel Microsoft, CPU) | **MIT** (`LICENSE` de l'archive) ; avis tiers dans `ThirdPartyNotices.txt` de l'archive | SHA-256 de l'archive épinglé |

- Aucune de ces licences n'interdit l'usage, la redistribution ni l'embarquement dans un
  installeur ; Apache-2.0 demande de conserver l'avis de licence : à ajouter dans l'écran
  « À propos » en S10.
- Écarté : **BRIA RMBG-1.4 / 2.0** (licence non commerciale, CC BY-NC 4.0) ; les poids
  U²-Net sont aussi Apache-2.0 mais de moins bonne qualité sur les bords.
- Ni le modèle ni la DLL ne sont versionnés dans git : `npm run fetch-models` les
  télécharge (CI et développement) et Tauri les embarque dans l'installeur.

## Remarque de sécurité (S7)
`mathjax-full` tire `speech-rule-engine` (lecture vocale, non utilisé) qui dépend de
`@xmldom/xmldom` ; les versions ≤ 0.9.11 ont des vulnérabilités connues. `package.json`
force `@xmldom/xmldom` ≥ 0.9.12 (`overrides`) : `npm audit` ne signale plus rien.

## Lecture Excel (S9) — choix de la bibliothèque
- `xlsx` (SheetJS) : la version publiée sur npm est figée en 0.18.5 et porte des
  vulnérabilités connues ; les versions corrigées ne sont distribuées que par le CDN de
  SheetJS (inaccessible depuis la CI, et hors du registre npm). **Écarté.**
- `exceljs` (MIT) : lourd, pensé pour Node (flux, fichiers temporaires). Écarté.
- `read-excel-file` (MIT, maintenu) : possible, mais ajoute plusieurs dépendances.
- **Retenu** : un lecteur OOXML minimal (valeurs seulement) sur `fflate` (MIT, maintenu,
  sans dépendance), entièrement testé sous Linux (fichier réel + format d'Excel).

## Outils de test (développement uniquement)
- `openpyxl` (MIT, Python) a servi une fois à produire `tests/fixtures/graph-essai.xlsx` ;
  il n'est pas une dépendance du projet.
