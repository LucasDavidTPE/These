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

## 4. Organisation des fichiers (dans l'espace, donc synchronisés sur les deux PC)

```
Espace/manuscrits/<these>/
  manuscrit.json                 plan, options de fusion, statut et objectifs de chaque partie
  modele/Modele_These.dotx
  parties/
    liminaires.docx              titre, remerciements, résumé, abstract, TDM, listes, nomenclature
    00_Introduction_generale.docx … 08_Conclusion_generale.docx
    bibliographie.docx           « Références bibliographiques » (porte le champ Zotero Add/Edit Bibliography)
    09_Annexes.docx
  sorties/                       fusionnés générés (jamais édités à la main)
    these-relecture.docx         avec consignes et références de chapitre
    these-propre.docx            sans consignes
  .versions/<partie>/AAAA-MM-JJ_HHMM_note.docx + .json   copies par partie
```

`manuscrit.json` (un fichier par thèse ; écriture atomique comme le reste) :

```json
{
  "titre": "Thèse L. David",
  "modele": "modele/Modele_These.dotx",
  "parties": [
    { "id": "liminaires", "fichier": "parties/liminaires.docx", "genre": "liminaire" },
    { "id": "ch1", "fichier": "parties/01_Chapitre1_Etat_de_l_art.docx", "genre": "chapitre",
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
- **Modes** : *relecture* (consignes et références de chapitre gardées) ou *propre* ; chaque mode produit son
  fichier. Option de saut de section « page impaire » pour l'impression recto-verso.
- **Déterministe** : mêmes parties, mêmes octets (tests golden), comme les autres exports de l'appli.

**Test de conformité immédiat** : les fichiers fournis servent de fixture. La fusion de `parties/` doit
redonner le contenu de `Trame_complete_fusionnee.docx` (mêmes 519 paragraphes, 12 sections, mêmes en-têtes).
On valide aussi la sortie avec `python-docx` (outil de développement seulement, jamais livré).

## 6. L'interface (remplace l'onglet « Word » ; Présentations et Sources LaTeX restent)

1. **Plan** (écran principal) : une carte par partie, dans l'ordre du plan — titre, statut (squelette, rédaction,
   relecture, figé), mots / objectif, consignes restantes, retours non traités, date, état par rapport à la dernière
   version. Glisser pour réordonner. Clic = ouvrir dans Word.
2. **Générer** : choix du mode (relecture / propre / chapitre seul), bouton, **rapport** d'avertissements
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

1. **Où vivent les `.docx`** : dans l'espace (`Espace/manuscrits/<these>/`), comme ici — ce qui change la SPEC
   actuelle (les Word restaient dans une racine locale `manuscrits`, l'espace ne gardait que des copies).
2. **Moteur de fusion** : natif dans l'appli (recommandé : sans Word, testable, reproductible) ou piloté
   par Word (COM : exactement « Texte d'un fichier », fidélité maximale mais Word obligatoire, non testable
   hors Windows). Dans les deux cas, **mise à jour des champs et Zotero > Refresh restent deux clics dans Word**
   (Zotero doit reconstruire la bibliographie sur le document entier).
3. **Numérotation des titres** : aujourd'hui tapée à la main (« 1.1 Les chaussées… ») avec des mini-sommaires
   tapés eux aussi. Une numérotation multiniveau liée aux styles de titre (dans le modèle) rend les renvois
   et les mini-sommaires automatiques ; sinon, l'appli doit lire les numéros tapés.
4. **Présentations et Sources LaTeX** : conservés tels quels ?
5. **PDF** : l'appli ne peut pas en produire sans Word (elle n'embarque pas de moteur de mise en page) ; l'export
   PDF reste « Enregistrer sous » dans Word, sauf si le pilotage par Word est retenu.

## 8. Phases proposées

- **M1** — modèle `manuscrit.json`, lecture OOXML, inventaire, écran Plan (lecture seule), migration des versions par partie.
- **M2** — moteur de fusion + nettoyage + rapport, test de conformité sur la fixture, bouton Générer.
- **M3** — Retours (commentaires, modifications suivies) et progression (consignes, mots).
- **M4** — Sources (Zotero ↔ Bibliothèque) et résolution des renvois `[→ §…]`.
- **M5** — (optionnel) pilotage de Word : mise à jour des champs et export PDF.
