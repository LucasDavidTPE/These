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
