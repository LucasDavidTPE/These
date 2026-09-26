# Thèse — application de bureau de la thèse

Logiciel Windows qui réunit les outils de la thèse de Lucas David : Figures (ex-Figurine),
Traitement 2S2P1D, Campagnes d'essais, Bibliothèque, Planning (Gantt), Accueil.

Lire `docs/SPEC.md` avant toute modification. Suivre `docs/ROADMAP.md` : ne travailler que
sur la phase demandée dans la session. Une décision de SPEC qui paraît mauvaise va dans
`docs/QUESTIONS.md`, elle n'est pas changée en silence.

## Utilisateur
- Doctorant en génie civil (chaussées aéronautiques, ENTPE), deux PC Windows presque
  jamais allumés en même temps, données partagées par OneDrive.
- Interface et messages **en français**. Code, identifiants et commits en anglais.

## Pile (décidée)
Tauri 2 (Rust) + TypeScript / React / Vite, Zustand, Vitest, `cargo test`.
**Pas de Python, pas de serveur local, pas de page web** : un installeur et c'est tout.

## Règles d'architecture
- `packages/noyau` : TypeScript pur, sans DOM ni Tauri, 100 % testable sous Linux.
  Toute logique métier y va (ou dans le `core/` d'un module), jamais dans React.
- Un module n'importe **jamais** un autre module : il passe par le registre de la
  coquille (actions nommées). C'est ce qui permet les installeurs d'un seul module.
- Données de l'utilisateur : fichiers JSON / Markdown dans l'espace OneDrive, un
  fichier par objet, écriture atomique, chemins relatifs, racines pour les données
  brutes. Jamais de base de données dans OneDrive.
- Aucune requête réseau sans geste explicite de l'utilisateur.
- Ce qui reproduit un calcul existant (Excel 2S2P1D, classeur de bibliographie) est
  couvert par un test de conformité ; ces tests ne sont jamais assouplis pour passer.

## Commandes
```
npm install
npm run test && npm run lint && npm run typecheck
cd src-tauri && cargo test && cargo clippy --all-targets
npm run dev                      # démo navigateur ; ?scenario=complet pour « À régler »
npm run construire -- <produit>  # these | figurine | traitement
```
Sous Linux, `cargo test` demande les bibliothèques WebKitGTK (`libwebkit2gtk-4.1-dev`).

## Définition de « terminé »
Tests verts, lint propre, `docs/A_TESTER_MANUELLEMENT.md` à jour, case cochée dans
`docs/ROADMAP.md`.
