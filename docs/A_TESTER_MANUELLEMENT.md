# À tester manuellement (sous Windows)

Ce que les tests automatiques ne peuvent pas vérifier dans l'environnement Linux. Tenu à jour
à chaque phase ; cocher au fur et à mesure, décocher si une phase suivante y touche.

## P0 — Socle

Installeur : artefact `these-installeurs` de la dernière exécution de *Actions*.

- [ ] L'installeur `.exe` s'installe **sans droits administrateur** ; SmartScreen prévient
      (installeur non signé) : « Informations complémentaires » → « Exécuter quand même ».
- [ ] Premier lancement sur le **PC de travail** : le dossier proposé est
      `…\OneDrive - entpe.fr\Thèse\Espace` ; « Créer l'espace ici » crée le dossier et
      `espace.json`, puis l'Accueil s'ouvre.
- [ ] Premier lancement sur le **PC perso**, après synchronisation OneDrive : le même dossier
      est proposé et reconnu (« Un espace existe déjà ici, créé sur … ») ; « Ouvrir cet
      espace » ne recrée rien.
- [ ] « Choisir un autre dossier… » ouvre la boîte de dialogue Windows.
- [ ] Réglages du poste : ajouter la racine `essais` (E:\) sur le PC de travail → « Présent » ;
      la même sur le PC perso → « Absent ici », et l'Accueil la liste dans « À régler ».
- [ ] « Ouvrir le dossier » ouvre l'Explorateur sur l'espace.
- [ ] Surveillance : copier à la main un fichier `espace-TEST.json` dans l'espace → il
      apparaît dans « À régler » en moins d'une seconde, sans relancer l'application.
      « Garder la version actuelle » le range dans `.conflits\`.
- [ ] Idem avec un `espace.json.tmp` : « Supprimer le fichier temporaire » l'efface.
- [ ] Diagnostic : bilan cohérent avec ce qui précède.
- [ ] Fermer et rouvrir : la taille et la position de la fenêtre sont conservées ; les
      réglages sont dans `%APPDATA%\fr.lucasdavid.these\poste.json`, pas dans OneDrive.
- [ ] Déplacer (ou renommer) le dossier de l'espace puis relancer : l'écran de premier
      lancement revient avec le message « L'espace … est introuvable sur ce poste ».

## P1 — Figures

La liste détaillée de Figurine 1.0 reste valable : `docs/figurine/A_TESTER_MANUELLEMENT.md`.
Ce qui change avec l'intégration :

- [ ] Thèse : Réglages du poste → « Bibliothèque de figures » → choisir le dossier de
      Figurine 1.0 ; l'onglet Bibliothèque de Figures montre les figures existantes.
- [ ] Les vignettes s'affichent (protocole `asset:` autorisé sur le dossier).
- [ ] Détourage : `Ctrl+V` d'une image copiée depuis le navigateur, fond retiré, « Copier »
      puis collage dans Word avec la transparence.
- [ ] Schéma : créer, enregistrer, rouvrir ; « Copier TikZ ».
- [ ] Verrou : ouvrir la même figure sur les deux PC → le second est en lecture seule.
- [ ] Installeur **Figurine 1.1.0** sur un poste qui a Figurine 1.0 : il remplace 1.0
      (même identifiant), s'ouvre directement sur la bibliothèque déjà choisie, sans
      barre latérale ni écran d'espace.
- [ ] Figurine 1.1.0 et Thèse installés ensemble : chacun a ses propres réglages
      (`%APPDATA%\fr.lucasdavid.figurine` et `%APPDATA%\fr.lucasdavid.these`).

## P2 — Traitement 2S2P1D (étape 1)

- [ ] Le module s'ouvre sur l'essai de démonstration entièrement calculé, sans connexion
      Internet (polices système à la place d'IBM Plex : c'est voulu).
- [ ] « Déposer un fichier » ouvre la boîte Windows ; un export MTS `.csv` réel se charge.
- [ ] Export `.xlsx` et fichier projet : la boîte « Enregistrer sous » s'ouvre, le fichier
      est écrit à l'endroit choisi et s'ouvre dans Excel.
- [ ] Rouvrir un fichier projet `.json` enregistré par le site en ligne : même résultat.

## P3 — Bibliothèque

- [ ] « Importer le classeur… » : la boîte Windows s'ouvre ; l'import de
      `Biblio_These_Lucas_MAITRE.xlsx` annonce 179 références, 11 demandes, 20 corrections,
      7 pistes ; les fichiers apparaissent dans `Espace\bibliotheque\`.
- [ ] Sur l'autre PC, après synchronisation OneDrive : la bibliothèque est là, sans import.
- [ ] « Marquer lu » sur un PC → sur l'autre PC, la référence passe à « Lu » sans relancer.
- [ ] Modifier la même référence sur les deux PC hors ligne → la copie de conflit apparaît
      dans « À régler » (Accueil), avec la comparaison champ par champ.
- [ ] « Ouvrir le PDF » avec la racine `biblio-pdf` déclarée : le PDF s'ouvre dans le
      lecteur par défaut ; sans la racine, le message renvoie vers les réglages.
- [ ] « Ouvrir le lien » d'une référence « Éditeur (abonnement) » passe par le proxy de
      l'ENTPE s'il est renseigné dans les paramètres.
- [ ] Export RIS importé dans Zotero ; export BibTeX compilé avec biblatex (`biber`).

## P4 — Planning

- [ ] Créer une phase, une tâche dans cette phase, un jalon ; les retrouver sur l'autre PC.
- [ ] Masquer une catégorie sur un PC → masquée aussi sur l'autre.
- [ ] Désactiver une phase : ses tâches disparaissent ; « ↺ » la réactive.
- [ ] Les mois du plan de lecture et les dates limites des demandes apparaissent dans
      « Bibliographie » dès que la bibliothèque est importée.
- [ ] Export pgfgantt : le `.tex` compile dans un document avec `\usepackage{pgfgantt}`
      (et `xcolor` avec l'option `table` ou `HTML`).

## Mises à jour

- [ ] Après la mise en place de `docs/MISES_A_JOUR.md`, publier `v0.2.0` : la release
      apparaît dans `These-versions` avec `latest.json` et l'installeur `.exe` + `.sig`.
- [ ] Installer `v0.2.0` à la main, publier `v0.2.1` : au démarrage suivant, le bandeau
      propose la mise à jour ; « Installer et redémarrer » l'installe sans droits
      administrateur et relance l'application ; les réglages et l'espace sont conservés.
- [ ] Hors ligne : aucun bandeau, aucune erreur.

## P5 — Campagnes (étape 1)

- [ ] Importer `projects/sergio-cm-b2c4-bio.toml` et `tsrst-lucas.toml` de these-lgcb.
- [ ] Déclarer la racine `recherche` (Bureau\Recherche) ; « Découvrir les essais » sur la
      campagne B2C4 bio retrouve Essai1 (60,02 h, 1480 cycles) depuis le journal `.log`.
- [ ] Sur le PC perso (sans les données) : la fiche, les essais, les notes et les images
      sont là ; « Découvrir » dit que le dossier est introuvable, sans erreur.
- [ ] Coller une capture (Ctrl+V) dans le carnet ; cliquer l'image l'ouvre dans la
      visionneuse de Windows.
- [ ] « Courbes » sur Essai1 de la campagne B2C4 bio : panneaux température, force,
      capteurs ; temps de lecture acceptable pour le fichier `.steps.tracking.csv` réel.
- [ ] Après « Courbes », la carte de la campagne montre l'aperçu, y compris sur le PC perso.

## Études

- [ ] « Nouvelle étude » puis « Ouvrir dans VS Code » : VS Code s'ouvre sur le dossier
      (sinon, le message demande d'installer VS Code avec « Ajouter à PATH »).
- [ ] Exécuter `run.py` dans VS Code (Python du poste) : l'exécution apparaît dans
      l'application avec ses sorties, sans relancer ; une erreur Python apparaît en rouge.
- [ ] Une référence `recherche:…` dans `etude.donnees(...)` est résolue avec la racine du
      poste ; sur l'autre PC, avec la sienne.
- [ ] Copier `studies/2026-09-07_lecture-essai-module-complexe-b2c4-bio` de these-lgcb dans
      `Espace\etudes\` : l'étude apparaît avec sa fiche et ses sorties.
