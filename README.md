# Thèse

L'application de bureau de ma thèse : un seul logiciel Windows pour les figures,
le dépouillement 2S2P1D, les campagnes d'essais, la bibliographie et le planning,
partagé entre deux PC par OneDrive.

- [Cahier des charges](docs/SPEC.md)
- [Feuille de route](docs/ROADMAP.md) — phase P0 (socle) terminée
- [Questions ouvertes](docs/QUESTIONS.md)
- [À tester manuellement](docs/A_TESTER_MANUELLEMENT.md)
- [Mises à jour](docs/MISES_A_JOUR.md) : publier une version, mise à jour automatique

## Installer

Télécharger l'installeur depuis l'artefact `these-installeurs` de la dernière exécution
de *Actions* (ou depuis *Releases* une fois une version publiée), puis lancer
`Thèse_x.y.z_x64-setup.exe` : installation dans le profil, sans droits administrateur.

## Développer

```
npm install
npm run dev              # l'interface dans un navigateur, en démonstration (rien n'est écrit)
                         #   ?scenario=complet : poste déjà installé, avec des points à régler
npm run test             # Vitest : noyau, frontières entre modules, produits
npm run lint
npm run typecheck
cd src-tauri && cargo test
npm run tauri dev        # l'application (Windows)
npm run construire -- these        # installeur Thèse
npm run construire -- figurine     # installeur d'un seul module
```

Arborescence : `packages/noyau` (TypeScript pur), `packages/interface` (React commun),
`modules/<module>` (un dossier par module, avec son `manifeste.tsx`), `app` (la coquille),
`src-tauri` (Rust). Un module n'importe jamais un autre module : voir `docs/SPEC.md` §3.
