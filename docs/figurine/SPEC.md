# Cahier des charges — Figurine

## 1. Objectif
Un logiciel Windows installable (.msi/.exe) pour produire vite des figures de thèse et
d'articles, principalement des **schémas de mécanique des chaussées**, exportables en
**TikZ** (retouchable, cohérent avec LaTeX) et en **SVG/PNG** (Word, slides, posters).

Hors périmètre : édition ou import de PDF, import de TikZ existant, lien dynamique avec
Excel, collaboration temps réel.

## 2. Modules
| # | Module | Résumé |
|---|--------|--------|
| M1 | Bibliothèque | Toutes les figures, recherche, tags, métadonnées, synchro OneDrive |
| M2 | Détourage | Ctrl+V d'une image → suppression du fond en local → Ctrl+C / enregistrer |
| M3 | Éditeur de schémas | Composants méca chaussées, repères, cotes, chargements, export TikZ/SVG |
| M4 | Recadrage | Recadrage libre, ratio fixe, marges en mm |
| M5 | Graphes | Import .xlsx/.csv ou collage de colonnes → graphe → pgfplots/SVG |

## 3. Métadonnées (tous types de figures) — `meta.json`
```json
{
  "id": "FIG-0007",
  "title": "Structure de chaussée souple sous bogie A340",
  "kind": "schema | image | graph | crop",
  "created": "2026-10-02T09:14:00+02:00",
  "modified": "2026-10-03T17:40:00+02:00",
  "tags": ["chaussée", "TFE", "MAIREINFRA"],
  "source": {
    "type": "own | web | article | other",
    "url": "https://…",
    "bib": "BIB-042",
    "author": "De Beer et al.",
    "year": 1997,
    "note": "Adapté de la fig. 3"
  },
  "license": "inconnue | CC-BY | domaine public | autorisation obtenue | …",
  "caption": "Adapté de De Beer et al. (1997).",
  "used_in": ["Article MAIREINFRA 2027", "Manuscrit ch. 2"],
  "last_host": "PC-TRAVAIL"
}
```
- **Préremplissage de la source** : au collage, lire aussi le format HTML du presse-papier
  Windows (`SourceURL:` et `src` de la balise `<img>`) pour proposer l'URL d'origine.
- `bib` suit la convention de nommage de la biblio de l'utilisateur : `BIB-XXX`.
- Légende proposée automatiquement depuis `source` (« Adapté de Auteur (Année). »).
- Filtre « figures sans source ou sans licence », pour préparer un manuscrit.

## 4. Stockage et synchronisation
Racine configurable (par défaut un dossier OneDrive), une figure = un dossier :
```
<racine>/
  figurine-library.json        # préférences partagées (thèmes, réglages) — petit
  FIG-0007_structure-a340/
    figure.json                # source éditable (format pivot §5) ; absent pour kind=image
    meta.json
    original.png               # image d'origine (images, détourages, recadrages)
    export.tex  export.svg  export.png
    .lock                      # {"host": "...", "since": "..."} pendant l'édition
```
- L'index est **reconstruit en scannant** les dossiers (pas de base de données).
- Écriture atomique : `fichier.tmp` puis renommage.
- `.lock` d'un autre poste datant de moins de 12 h → ouverture en lecture seule + avertissement
  (avec bouton « forcer »).
- Détecter les copies de conflit OneDrive (`figure-NOMPC.json`, etc.) et proposer
  de choisir une version.
- Attribution d'ID : `max(ID existants) + 1` au moment de la création, en scannant.
- **Chemins relatifs uniquement** dans les fichiers (le nom de session Windows diffère
  d'un PC à l'autre).
- Réglages propres à chaque poste (chemin de la racine, taille de fenêtre) : dans le
  dossier de configuration local de l'appli, **pas** dans OneDrive.

## 5. Format pivot d'un schéma — `figure.json`
```json
{
  "format": "figurine/1",
  "canvas": { "unit": "mm", "width": 140, "height": 90, "grid": 1 },
  "theme": "these",
  "items": [
    { "id": "pav", "type": "layer_stack", "at": [10, 20],
      "params": { "width": 110,
        "layers": [
          { "name": "BB",  "h": 8,  "hatch": "bitumineux" },
          { "name": "GB",  "h": 12, "hatch": "bitumineux-dense" },
          { "name": "GRH", "h": 20, "hatch": "granulaire" },
          { "name": "PF",  "h": 15, "hatch": "sol", "semi_infinite": true }
        ] } },
    { "id": "p", "type": "pressure_profile", "on": "pav.top",
      "params": { "model": "gaussians", "span": [-0.25, 0.25],
                  "centers": [-0.16, 0, 0.16], "amplitudes": [1.8, 1.67, 1.8],
                  "sigma": 0.0315, "height": 12, "label": "$p(y)$" } },
    { "id": "ax", "type": "axes2d", "at": [8, 18],
      "params": { "x": {"dir": "right", "label": "$x$"},
                  "z": {"dir": "down",  "label": "$z$"} } },
    { "id": "d1", "type": "dimension",
      "from": "pav.layer[0].top.right", "to": "pav.layer[0].bottom.right",
      "params": { "offset": 6, "label": "$h_1$" } }
  ]
}
```
Principes :
- Unités en **mm** sur la planche ; origine en haut à gauche, y vers le bas (comme SVG).
  L'exporteur TikZ fait la conversion (y vers le haut, unités en cm ou mm explicites).
- **Ancres nommées** (`pav.top`, `pav.layer[0].bottom.right`, `k1.left`…) : les cotes,
  flèches et chargements se rattachent aux composants et **suivent** leurs déplacements.
  Une ancre introuvable = erreur claire, pas de crash.
- Les composants sont **paramétriques** : changer `layers` ou `n_branches` redessine tout.
- `theme` renvoie à un jeu de styles (épaisseurs, couleurs, police, hachures) commun au
  SVG et au TikZ. Un thème « these » par défaut, sobre, noir et gris.
- `format` versionné : toute évolution du schéma JSON fournit une migration.
- Chaque type de composant = un module de `src/core/components/` exposant :
  schéma des paramètres (validation), géométrie (primitives), ancres, rendu SVG,
  rendu TikZ. L'UI génère son panneau de propriétés à partir du schéma des paramètres.

## 6. Bibliothèque de composants (V1)
**Rhéologie** : ressort, amortisseur, élément parabolique (2S2P1D), patin, liaisons ;
assemblages paramétriques : Maxwell, Kelvin-Voigt, Maxwell généralisé (n branches),
KVG (n éléments), 2S2P1D complet (E0, E∞, deux paraboliques, amortisseur).
**Structure** : empilement de couches (hachures par matériau, épaisseurs, demi-espace
indéfini avec bord ondulé), encastrement, appui simple, sol hachuré.
**Chargement** : force ponctuelle, charge répartie uniforme, profil de pression
(uniforme, parabolique inverse, gaussiennes, fonction saisie `f(y)`), empreinte vue en
plan (rectangle, cercle, ellipse), roue/pneu en coupe, bogie vu en plan (nombre de roues
et entraxes paramétrables).
**Annotations** : repère 2D, repère 3D (projection réglable), cote linéaire, cote
angulaire, flèche, accolade, texte avec maths `$…$`, point de mesure (croix/capteur).
**Libres** : ligne, polyligne, rectangle, cercle, courbe de Bézier.

Édition : sélection, déplacement, poignées, alignement/distribution, grille aimantée,
annuler/rétablir (Ctrl+Z/Ctrl+Y), copier/coller d'éléments, zoom, calques simples
(avant/arrière).

## 7. Exports
- **TikZ** : `\begin{tikzpicture}` qui s'appuie sur `\usepackage{figurine}`
  (`tex/figurine.sty`, livré, copiable en un clic depuis l'appli). Un commentaire par
  élément. Option « standalone » (document compilable seul, sty inclus).
- **SVG** : maths converties en chemins (MathJax), fond transparent, taille en mm.
- **PNG** : 300/600 dpi, fond transparent optionnel.
- Copier dans le presse-papier : TikZ (texte), SVG, PNG.
- L'export est réécrit dans le dossier de la figure à chaque enregistrement, pour qu'un
  `\input{…/export.tex}` dans un document LaTeX reste à jour.

## 8. Détourage (M2)
- Coller (Ctrl+V), glisser-déposer ou ouvrir une image → détourage **100 % local**
  (ONNX Runtime, modèle embarqué dans l'installeur, aucune requête réseau).
- Modèle par défaut : famille IS-Net / U²-Net. **Vérifier et consigner la licence**
  dans `docs/LICENCES.md` avant d'intégrer un modèle.
- Aperçu avant/après (damier de transparence), pinceau de retouche (garder/retirer),
  réglage du seuil, lissage des bords.
- Sortie : Ctrl+C — le presse-papier Windows doit recevoir le format enregistré **"PNG"**
  en plus du DIB pour conserver la transparence dans Word/PowerPoint — ou enregistrer
  dans la bibliothèque (source préremplie, §3) ou ailleurs.
- Raccourci global optionnel : une fenêtre compacte « coller → détourer → copier ».
- Objectif : < 3 s par image de 1 Mpx sur un CPU de portable.

## 9. Recadrage (M4)
Rectangle libre, ratios (1:1, 4:3, 16:9, libre), marges saisies en mm, rognage
automatique des bords transparents ou blancs, rotation par pas de 90°, redimensionnement
en mm à une résolution donnée. Fonctionne sur toute image de la bibliothèque et sur une
image collée.

## 10. Graphes (M5)
Import .xlsx/.csv (choix de la feuille, de la plage, des colonnes) ou collage depuis Excel
(texte tabulé). Séparateur décimal virgule accepté. Types : lignes, points, barres,
axes log. Légende, étiquettes d'axes avec maths. Export **pgfplots** (table inline ou
fichier .dat à côté) et SVG, avec le même thème que les schémas.

## 11. Installation
Installeurs .msi et .exe non signés produits par GitHub Actions sur tag `v*`.
Installation par utilisateur (sans droits admin si possible). Premier lancement :
choisir la racine de la bibliothèque (détection automatique d'un dossier OneDrive).
