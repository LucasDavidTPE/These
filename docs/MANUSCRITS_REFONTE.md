# Refonte de Manuscrits — analyse et architecture

Analyse faite sur le dossier `Manuscrit/` fourni (zip du 5 octobre 2026) : `00_Document_maitre.docx`,
`Trame_complete_fusionnee.docx`, `Chapitres/00…09_*.docx`, `Modele/Modele_These.dotx`.
Rien n'est implémenté : ce document propose, les décisions ouvertes sont en §7.

## 1. Ce que contient le dossier

- **Dix parties** : Introduction, chapitres 1 à 7, Conclusion, Annexes (`00_…` à `09_…`). Chacune est un
  `.docx` autonome : un `Heading1` (titre du chapitre, signet `CHAP_n`), des `Heading2/3` (signets `C1_1_2`…),
  un pied de page avec `PAGE`, un en-tête propre (« Chapitre 1 – État de l'art ») et **un saut de section
  final** (page suivante) qui porte cet en-tête.
- **Un modèle unique** : `Modele_These.dotx`. Les `styles.xml` de tous les fichiers sont **identiques**
  (Heading1-6, `Consigne`, `TitreHorsTDM`, `SommaireChapitre`, `PageTitre`…). C'est ce qui rend la fusion
  simple aujourd'hui.
- **Un document maître** : pages liminaires (titre, remerciements, résumé, abstract, table des matières,
  listes des figures et tableaux, nomenclature), puis un bloc « Procédure de fusion » et un repère
  `◆ Insérer ici : <fichier>` par chapitre, le titre « Références bibliographiques » (Zotero) et le repère des annexes.
- **Un aperçu fusionné** (`Trame_complete_fusionnee.docx`) : les 10 parties mises bout à bout (519 paragraphes,
  12 sections), sans le bloc « Procédure », sans « Références du chapitre » ni « Instructions d'assemblage »,
  avec les consignes bleues conservées.
- **Du contenu à rédiger** : 110 consignes « À rédiger » et 96 lignes « Sources Zotero : … » ; aucune figure,
  aucun tableau, aucune note, aucun champ Zotero pour l'instant (les fichiers sont des trames).

## 2. La procédure actuelle, et ce qui ne va pas

Pour fusionner, la procédure écrite dans le maître demande, **à la main, pour chaque chapitre** :
1. supprimer dans le chapitre le bloc « Références du chapitre » et les consignes bleues (version propre) ;
2. dans le maître : sélectionner le repère, *Insertion > Objet > Texte d'un fichier…* ;
3. puis, une fois tout inséré : `Ctrl+A`, `F9` (tables), *Zotero > Refresh*, vérifier « Lier au précédent »
   dans chaque en-tête.

Problèmes :
- 10 étapes manuelles répétées à chaque fusion, et **le résultat n'est pas reproductible** (un oubli et le
  maître diverge des chapitres) ;
- le maître **mélange trois choses** : le contenu (pages liminaires), la procédure (texte jetable) et le plan
  (l'ordre des repères) ;
- **les renvois croisés entre chapitres sont impossibles avant la fusion** ; la procédure demande d'écrire
  `[→ §3.2.2]` « en texte provisoire » puis de les refaire à la main ;
- les mini-sommaires de chapitre (`SommaireChapitre`) et les numéros de titres sont **tapés à la main** ;
- l'appli actuelle (versions datées de fichiers entiers) ne sait rien de tout cela : elle copie des blocs.

## 3. Principe

> **Word reste l'outil d'écriture ; l'appli devient le chef d'orchestre de la thèse.**
> Les parties `.docx` sont les seules sources. Le document fusionné est **toujours généré**, jamais édité.
> Le plan, les règles de nettoyage et l'état de chaque partie sont des données (JSON), pas du texte dans Word.

## 4. Organisation : sources n'importe où, versions et retours au même endroit

Les `.docx` de travail **peuvent être n'importe où** (un dossier par PC, une partie sur OneDrive, une autre
dans le dossier de recherche…). Ce qui est rangé **au même endroit, dans l'espace** (donc synchronisé sur les
deux PC), c'est tout ce qui a une histoire : les versions, les corrections reçues, les sorties.

```
Espace/manuscrits/<these>/
  manuscrit.json                 plan, options de fusion, statut et objectifs de chaque partie
  versions/<partie>/AAAA-MM-JJ_HHMM_<note>.docx + .json       copies datées d'une partie
  retours/<AAAA-MM-JJ>_<auteur>_<partie>.docx + .json         corrections reçues, copiées ici
  sorties/these-relecture.docx, these-propre.docx            fusionnés générés, jamais édités
```

**Où est la source d'une partie** : une référence `{ racine, chemin }` dans `manuscrit.json`, comme pour les
données brutes (SPEC §4) — la racine est un nom (« recherche », « manuscrits », « redaction »…) dont le
dossier est réglé **sur chaque PC** dans les réglages du poste. Une partie peut donc vivre sous une racine
différente d'une autre, et le même plan marche sur les deux PC même si les chemins diffèrent. Une racine
absente sur ce PC s'affiche « absente ici », comme aujourd'hui.

**Une partie introuvable ne bloque pas la fusion** : on peut fusionner avec sa **dernière version
enregistrée** (signalé dans le rapport). Chaque PC peut donc générer le fusionné complet, même s'il ne
possède pas tous les fichiers sources.

**Les retours reçus** (corrections de directeurs, relecteurs) sont un objet à part, pas une « version » :
1. « Ajouter un retour reçu… » : on choisit le fichier (où qu'il soit), l'appli le **copie** dans
   `retours/`, note qui l'a envoyé, la date, la partie concernée et la version sur laquelle il porte ;
2. elle en **extrait** commentaires et modifications suivies (auteur, date, texte, emplacement) dans le `.json` ;
3. chaque remarque a un état (à traiter, traitée, refusée, + note), partagé entre les deux PC ;
4. la boîte « Retours » regroupe tout, par partie, par auteur, par état.

Ainsi, quel que soit l'endroit où vit un `.docx`, **toutes les versions et toutes les corrections reçues se
retrouvent au même endroit**, sous `Espace/manuscrits/<these>/`.

`manuscrit.json` (un fichier par thèse ; écriture atomique comme le reste) :

```json
{
  "titre": "Thèse L. David",
  "modele": { "racine": "manuscrits", "chemin": "Modele/Modele_These.dotx" },
  "parties": [
    { "id": "liminaires", "source": { "racine": "manuscrits", "chemin": "00_Document_maitre.docx" }, "genre": "liminaire" },
    { "id": "ch1", "source": { "racine": "recherche", "chemin": "These/ch1.docx" }, "genre": "chapitre",
      "statut": "redaction", "objectif_mots": 12000 }
  ],
  "fusion": { "saut": "nextPage", "nettoyage": { "consignes": "Consigne", "blocs": ["Références du chapitre", "Instructions d'assemblage"], "minisommaire": "SommaireChapitre" } }
}
```

Le bloc « Procédure de fusion » **disparaît** du Word : c'est l'appli. Le maître devient `liminaires.docx`
(le contenu qui n'est pas un chapitre) ; la bibliographie devient une partie à part pour que le champ
Zotero survive aux fusions.

## 5. Les composants (tous dans `modules/manuscrits/core/`, TypeScript pur, testés sous Linux)

| Composant | Rôle |
|---|---|
| `ooxml.ts` | ouverture / écriture d'un `.docx` (fflate, déjà utilisé pour les `.pptx`), lecture de `document.xml`, `styles.xml`, `numbering.xml`, rels, notes, commentaires |
| `inventaire.ts` | par partie : plan (Heading1-3 + signets), mots hors consignes, consignes « À rédiger » restantes, figures, tableaux, notes, commentaires, modifications suivies, champs Zotero, date de modification |
| `fusion.ts` | le moteur de fusion (ci-dessous) |
| `nettoyage.ts` | règles de nettoyage par **style et intitulé** (consignes, blocs « Références du chapitre » / « Instructions d'assemblage », mini-sommaires) |
| `renvois.ts` | transforme `[→ §3.2.2]` en champ `REF` vers le signet du titre correspondant, dans le fusionné seulement |
| `retours.ts` | extrait commentaires et modifications suivies (auteur, date, partie, texte) |
| `citations.ts` | lit les champs Zotero (`ZOTERO_ITEM CSL_CITATION`) et les rapproche de la Bibliothèque |
| `versions.ts` | versions **par partie** (existe déjà, à adapter) |

### Le moteur de fusion
Entrée : `manuscrit.json` + les `.docx`. Sortie : un `.docx` + un **rapport** (avertissements).
- **Corps** : concaténation des `w:body` dans l'ordre du plan, chaque partie gardant son `w:sectPr` final
  (en-tête, pied, pagination continue) ; `sectPr` du dernier chapitre repris pour le document.
- **Remappage** (indispensable dès qu'un fichier a été enregistré par Word) : identifiants de relations
  (`r:id` des en-têtes, pieds, images, liens), signets (`w:id` uniques, noms uniques), commentaires,
  notes de bas de page et de fin (renumérotation), `docPr` des dessins, instances de numérotation
  (`numId` / `abstractNumId`).
- **Styles** : ceux du modèle l'emportent ; une partie dont un style diffère du modèle est **signalée** (pas
  corrigée en silence).
- **Champs** : TDM / listes / renvois sont marqués « à mettre à jour » (`updateFields`), Word le propose à
  l'ouverture ; les champs Zotero passent tels quels.
- **Une seule sortie** (1.16.0) : plus de mode « propre » ; les consignes sont gardées, seuls les blocs
  d'assemblage partent. Option de saut de section « page impaire » pour l'impression recto-verso.
- **Déterministe** : mêmes parties, mêmes octets (tests golden), comme les autres exports de l'appli.

**Test de conformité immédiat** : les fichiers fournis servent de fixture. La fusion de `parties/` doit
redonner le contenu de `Trame_complete_fusionnee.docx` (mêmes 519 paragraphes, 12 sections, mêmes en-têtes).
On valide aussi la sortie avec `python-docx` (outil de développement seulement, jamais livré).

## 6. L'interface (remplace l'onglet « Word » ; Présentations et Sources LaTeX restent)

1. **Plan** (écran principal) : une carte par partie, dans l'ordre du plan — titre, statut (squelette, rédaction,
   relecture, figé), mots / objectif, consignes restantes, retours non traités, date, état par rapport à la dernière
   version. Glisser pour réordonner. Clic = ouvrir dans Word.
2. **Générer** : bouton, **rapport** d'avertissements
   (style divergent, en-tête lié au précédent, signet dupliqué, renvoi provisoire non résolu, citation absente
   de la Bibliothèque), ouvrir le résultat dans Word.
3. **Retours** : boîte de réception des commentaires et modifications suivies de toutes les parties, filtrables
   par auteur et par chapitre.
4. **Versions** : par partie, avec « ce qui a changé » (diff du texte) ; on ne recopie plus que les parties modifiées.
5. **Sources** : pour une partie, les références citées (champs Zotero) et, côté Bibliothèque, celles dont le champ
   « Chapitre visé » est ce chapitre mais qui ne sont **pas encore citées** ; les lignes « Sources Zotero : … »
   des consignes sont rapprochées de la Bibliothèque.

Liens avec le reste : Bibliothèque (action `bibliotheque.citations`, correspondance Zotero déjà notée dans
`bibliotheque/zotero.json`), Figures (action `figures.image`), Journal. Un module n'importe jamais un autre
module : tout passe par le registre.

## 7. Décisions ouvertes (voir aussi `QUESTIONS.md`)

1. **Où vivent les `.docx`** — *tranché* : où l'on veut (références `{racine, chemin}`, réglées par PC) ;
   versions, retours reçus et sorties au même endroit, dans l'espace. Compatible avec la SPEC actuelle
   (racines par poste, copies dans l'espace) ; un seul module, plusieurs racines.
2. **Moteur de fusion** — *tranché : natif dans l'appli* (le pilotage par Word reste possible plus tard, M5). Natif (sans Word, testable, reproductible) ou piloté
   par Word (COM : exactement « Texte d'un fichier », fidélité maximale mais Word obligatoire, non testable
   hors Windows). Dans les deux cas, **mise à jour des champs et Zotero > Refresh restent deux clics dans Word**
   (Zotero doit reconstruire la bibliographie sur le document entier).
3. **Numérotation des titres** — *tranché : numérotation automatique de Word (1.14.0)*. Avant : tapée à la main (« 1.1 Les chaussées… ») avec des mini-sommaires
   tapés eux aussi. Une numérotation multiniveau liée aux styles de titre (dans le modèle) rend les renvois
   et les mini-sommaires automatiques ; sinon, l'appli doit lire les numéros tapés.
4. **Présentations et Sources LaTeX** — *tranché : Présentations conservées, Sources LaTeX retiré (1.13.0)*.
5. **Corrections reçues** — *tranché : `.docx` (suivi des modifications, commentaires) et, plus rarement, PDF annotés ; les deux sont lus (1.14.0).*
6. **PDF** : l'appli ne peut pas en produire sans Word (elle n'embarque pas de moteur de mise en page) ; l'export
   PDF reste « Enregistrer sous » dans Word, sauf si le pilotage par Word est retenu.

## 8. Phases proposées (M1 faite en 1.13.0)

- **M1** — modèle `manuscrit.json` (sources par racine), lecture OOXML, inventaire, écran Plan (lecture seule),
  versions par partie dans `versions/` (reprise des versions existantes).
- **M1 bis** — *faite en 1.14.0* : « Ajouter un retour reçu » (`.docx` ou PDF annoté) : copie dans `retours/`,
  extraction des commentaires, modifications suivies et annotations, boîte Retours avec états (partagés entre PC) ;
  numérotation automatique des titres lue dans le plan.
- **M2** — *faite en 1.15.0* : moteur de fusion + nettoyage + rapport, test de conformité sur la fixture, bouton Générer. Le moteur sait
  insérer les parties aux repères « ◆ Insérer ici » du document maître actuel (pas besoin de le découper) ou à la suite.
- **M3** — progression (consignes, mots), diff du texte entre versions, rapprochement d'un retour avec la version sur laquelle il porte.
- **M4** — Sources (Zotero ↔ Bibliothèque) et résolution des renvois `[→ §…]`.
- **M5** — (optionnel) pilotage de Word : mise à jour des champs et export PDF.

## 8. Plusieurs documents (1.16.0)

Le même schéma sert la thèse, les articles et les rapports ou comptes rendus : un dossier
`manuscrits/<document>/` par document, `type` dans `manuscrit.json` (libellés des parties seulement).
Rien n'est partagé entre documents : un article réutilisant un chapitre le déclare comme sa propre partie
(le même `.docx`), et ses versions et retours restent avec lui.
