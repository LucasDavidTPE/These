# Mises à jour

L'application se met à jour seule, **sans serveur** : au démarrage, elle lit
`latest.json` dans la dernière *release* du dépôt public
[`LucasDavidTPE/These-versions`](https://github.com/LucasDavidTPE/These-versions). Si
une version plus récente existe, un bandeau propose « Installer et redémarrer ». La
mise à jour est **signée** : l'application refuse un installeur qui ne vient pas de
vous (clé publique dans `src-tauri/tauri.conf.json`).

Pourquoi un second dépôt : le dépôt `These` est privé, et un fichier d'une release privée
ne se télécharge pas sans compte. `These-versions` ne contient **que** les installeurs,
ni le code ni les données.

## Mise en place (une fois)

1. Sur GitHub, créer le dépôt **public** `LucasDavidTPE/These-versions` (vide ; cocher
   « Add a README » pour qu'il ait une branche).
2. Créer un jeton : *Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token* ; *Repository access* : seulement
   `These-versions` ; *Permissions → Contents* : **Read and write**.
3. Dans le dépôt `These` : *Settings → Secrets and variables → Actions → New repository
   secret* :
   - `RELEASES_TOKEN` : le jeton de l'étape 2 ;
   - `TAURI_SIGNING_PRIVATE_KEY` : le contenu du fichier `these-maj.key` (clé privée de
     signature). **Gardez aussi ce fichier en lieu sûr** (gestionnaire de mots de passe) :
     sans lui, plus aucune mise à jour ne pourra être signée pour les installations
     existantes.

## Publier une version

```
npm run version -- 0.2.0
git commit -am "Version 0.2.0"
git tag v0.2.0
git push --follow-tags
```

La CI construit l'installeur signé et crée la release `v0.2.0` dans `These-versions`,
avec `latest.json`. Les deux PC proposent la mise à jour au démarrage suivant.

La **première** installation se fait à la main, depuis la release (`Thèse_x.y.z_x64-setup.exe`) ;
les suivantes passent par le bandeau.

Les installeurs d'un seul module (Figurine, Traitement 2S2P1D) ne vérifient pas les mises
à jour : ils sont faits pour être envoyés, pas suivis.
