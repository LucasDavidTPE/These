# Questions ouvertes

À trancher avant ou pendant la phase indiquée. Une fois tranchée, la réponse est
reportée dans `SPEC.md` et la question est supprimée d'ici.

1. **iPad (P3).** Le classeur de bibliographie est aujourd'hui consultable sur trois
   appareils, dont un iPad. L'application est Windows uniquement. Faut-il un export en
   lecture seule dans OneDrive (`.xlsx` ou page HTML régénérée à chaque modification)
   pour garder une consultation sur iPad ?
2. **Obsidian (P3).** Le classeur génère des notes Obsidian et un point mensuel. Les
   notes de lecture vivront dans l'application : Obsidian est-il encore utilisé, ou
   l'export Markdown suffit-il ? *(0.2.5 : l'export Markdown existe, compatible
   Obsidian ; reste à savoir s'il faut le relancer automatiquement.)*
3. **Zotero (P3).** Zotero reste-t-il l'outil de citation (import RIS, plugin Word) ? Si
   la rédaction se fait en LaTeX, l'export BibTeX de l'application pourrait suffire.
   *(Réglé en 1.10 : oui, Zotero avec le plugin Word. « Mettre à jour Zotero » envoie la
   bibliothèque à sens unique, PDF en fichiers liés ; voir SPEC §9.3.)*
4. **Site 2S2P1D en ligne (P2).** Le laisser en ligne, figé, avec un lien vers
   l'installeur, ou le retirer ?
5. **Emplacement de l'espace (P0).** `OneDrive - entpe.fr\Thèse\Espace` convient-il ?
   Le OneDrive de l'école reste-t-il accessible après la thèse ? *(1.2 : l'espace se suffit
   à lui-même et s'exporte en un `.zip` depuis les réglages ; reste à choisir où archiver.)*
6. **Refonte de Manuscrits.** Analyse et architecture proposées dans `docs/MANUSCRITS_REFONTE.md`
   (parties `.docx` + `manuscrit.json`, fusion générée par l'appli, retours, sources Zotero). Tranché : sources
   `.docx` n'importe où (racines par poste), fusion native, Sources LaTeX retiré, Présentations gardé.
   Numérotation automatique de Word et corrections en `.docx` / PDF annotés : tranchés (1.14.0).
   Reste : export PDF depuis l'appli (nécessite Word).
7. **Article MAIRE INFRA27 : un module dédié dans Thèse, ou l'atelier COMSOL tel quel ?**
   `docs/COMSOL_ARTICLE_MAIREINFRA27_2026-10-18.md` propose (§8) un modèle Étude / Cas / Export / Grandeur / Valeur
   propre à cet article (études `std_*`, paramètres `lc`/`VE`/`mlev`/`mod_f`, 922 valeurs dérivées, pipeline Python
   externe qui écrirait un `valeurs.json`) et des vues de comparaison dédiées (matrice empreinte × loi, convergence,
   module équivalent, signal de jauge). C'est un travail propre à un article, pas à la thèse entière : avant de le
   coder, trancher si Thèse doit savoir lire ce `valeurs.json` (un module d'import générique, cohérent avec « pas de
   Python dans l'appli » puisque `build_article.py` resterait un script externe), ou si l'atelier COMSOL §1-§7
   suffit pour ses coupes/courbes (le pipeline Python gardant pour lui les grandeurs dérivées et les contrôles).
   Les fichiers réels (~1,5 Go) sont sur OneDrive, hors du dépôt : rien n'a pu être ingéré ni testé pour l'instant.
8. **Projets de figures : Python lancé par l'application (SPEC §6.1).** CLAUDE.md dit « pas de Python ». J'ai
   compris que cela vise l'application elle-même : pas de Python embarqué, aucun module qui en dépend, rien qui
   tourne en tâche de fond. Lancer *le* Python installé sur le poste, sur un script du projet et sur un clic, ne
   contredirait pas cette règle. C'est facultatif : sans Python, le bloc Scripts est grisé et tout le reste
   fonctionne. À confirmer avant PJ4.
