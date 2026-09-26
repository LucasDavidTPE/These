# Composants de schéma — API

Tout est dans `src/core/schema/` (TypeScript pur, testé sous Linux). Un composant est un
objet `ComponentDef` (voir `component.ts`), enregistré dans `components/index.ts`.

## Cycle de vie d'une figure

```
figure.json ──validateFigure()──▶ FigureDoc ──layoutFigure()──▶ PlacedItem[] ──▶ exportSvg() / exportTikz()
            (migration, schéma,                (ancres, placement,             (primitives → SVG / TikZ,
             valeurs par défaut)                géométrie globale)               figurine.sty)
```

1. **Validation** (`validate.ts`) : migration éventuelle (`MIGRATIONS`), contrôle de la
   planche, du thème, de chaque élément (`id` unique, `type` connu, placement cohérent)
   et des paramètres (schéma du composant + `check`). Erreurs avec chemin :
   `items[0].params.layers[1].h : doit être ≥ 0.5.`
2. **Mise en place** (`layout.ts`) : les éléments sont résolus dans l'ordre des
   dépendances (`on`, `from`, `to`), dessinés dans l'ordre du fichier. Une ancre
   introuvable ou un cycle donne une erreur claire, jamais un plantage.
3. **Export** (`export/`) : le SVG et le TikZ ne connaissent que les **primitives**
   (`geometry.ts`). Même figure → mêmes octets (nombres arrondis au centième).

## Interface `ComponentDef<P>`

| Champ | Rôle |
|-------|------|
| `type` | identifiant dans `figure.json` (`"layer_stack"`, `"spring"`…) |
| `label` | nom affiché en français (palette, commentaires d'export) |
| `category` | `rheologie`, `structure`, `chargement`, `annotation`, `libre` |
| `placement` | `point` (placé par `at` ou `on`, + `rotate`) ou `segment` (placé par `from`/`to`, ou `at` + `params.length` + `rotate`) |
| `params` | schéma des paramètres (`params.ts`) : validation, valeurs par défaut, et génération du panneau de propriétés (S6) |
| `check(p)` | contrôles croisés facultatifs (ex. : seule la dernière couche est un demi-espace) |
| `geometry(p, ctx)` | primitives en **coordonnées locales** (mm, y vers le bas) ; pour un `segment`, de (0, 0) à (`ctx.length`, 0) |
| `anchors(p, ctx)` | ancres nommées, en coordonnées locales |
| `summary(p, ctx)` | résumé d'une ligne pour le commentaire de l'export |

Le placement (translation, rotation) et les deux rendus sont communs : un composant
n'écrit ni SVG ni TikZ.

### Schéma des paramètres

```ts
{ kind: "number", label, default, min?, max?, integer?, unit? }
{ kind: "string", label, default, math? }            // math : peut contenir $…$
{ kind: "boolean", label, default }
{ kind: "enum", label, default, options: [{ value, label }] }
{ kind: "list", label, default, item: { …schéma… }, minItems? }
// + optional: true → absent du résultat si non renseigné
```
Un paramètre inconnu est une erreur (une faute de frappe ne passe pas en silence).

### Primitives (`geometry.ts`)

| Primitive | SVG | TikZ |
|-----------|-----|------|
| `path` (M, L, C, Z) | `<path d=…>` | `\draw (a) -- (b) .. controls (c1) and (c2) .. (d) -- cycle;` |
| `rect` | `<rect>` | `(x1,y1) rectangle (x2,y2)` |
| `circle` | `<circle>` | `circle[radius=…]` |
| `zigzag` | `<polyline>` calculée comme TikZ | `decorate, decoration={zigzag, segment length, amplitude, pre length, post length}` |
| `text` | `<text>` (halo blanc si `halo`) | `\node[fig/texte ou fig/etiquette, anchor=…]` |

Traits : rôles `trait`, `trait fin`, `trait epais`, `interface`. Remplissages : `none`,
`blanc`, `gris`, `hachure <nom>`. Leurs valeurs viennent du **thème** (`theme.ts`) ; côté
TikZ, ce sont des styles nommés `fig/…` de `tex/figurine.sty`, **généré** depuis le thème
(un test vérifie que le fichier livré est à jour).

Un texte avec `away: [dx, dy]` choisit son ancre pour s'écarter de son point dans cette
direction, même quand le composant est tourné (étiquettes de ressorts verticaux…).

## Ancres

Référence : `<id>.<ancre>`, par exemple `pav.top`, `pav.layer[0].bottom.right`, `k1.end`.

- Boîtes (`boxAnchors`) : `center`, `top`, `bottom`, `left`, `right`, `top.left`,
  `top.right`, `bottom.left`, `bottom.right`.
- Composants linéaires (`segmentAnchors`) : `start`, `end`, `center`.

## Composants disponibles

### `rectangle` (libre, point)
Origine = coin haut gauche. `width`, `height` (mm), `fill` (`aucun`, `blanc`, `gris`,
hachures), `label` facultatif (centré). Ancres de boîte.

### `spring` — ressort (rhéologie, segment)
`length` (si placé par `at`), `coils` (spires), `amplitude` (demi-largeur), `lead` (fils de
liaison, réduits si le ressort est court), `label`, `label_side` (`dessus` / `dessous`).
Ancres : `start`, `end`, `center`.

### `dashpot` — amortisseur (rhéologie, segment)
`length`, `width` (cylindre), `depth`, `label`, `label_side`. Ancres : `start`, `end`, `center`.

### `layer_stack` — empilement de couches (structure, point)
Origine = coin haut gauche. `width`, `layers` (de haut en bas : `name`, `h` épaisseur
dessinée en mm, `hatch`, `semi_infinite` — dernière couche seulement, bord inférieur
ondulé —, `label` facultatif), `labels` (`dedans`, `droite`, `aucune`).
Ancres de boîte pour l'ensemble, et `layer[i].<ancre de boîte>` pour chaque couche.

## Composants de S5

Tous les paramètres ont une valeur par défaut ; `{i}` dans un modèle d'étiquette est
remplacé par le numéro de l'élément (`"$E_{i}$"` → `$E_{1}$`, `$E_{2}$`…).

### Rhéologie (segments : `from`/`to`, ou `at` + `length` + `rotate`)

| Type | Paramètres | Ancres |
|------|-----------|--------|
| `parabolic` — élément parabolique | `label` | `start`, `end`, `center`, `top`, `bottom` |
| `slider` — patin (frottement) | `label` | idem |
| `maxwell` — ressort + amortisseur en série | `spring_label`, `dashpot_label` | idem + `item[0].start`, `item[1].end`… |
| `kelvin_voigt` — en parallèle | `spring_label`, `dashpot_label` | idem + `branch[0].start`, `branch[1].end`… |
| `generalized_maxwell` | `n`, `spring_label`, `dashpot_label`, `with_equilibrium`, `equilibrium_label` | idem + `branch[i]…` |
| `kvg` — Kelvin-Voigt généralisé | `n`, `spring_label`, `dashpot_label`, `with_spring` (+`spring0_label`), `with_dashpot` (+`dashpot0_label`) | idem + `item[i]…` (bloc i en série) |
| `model_2s2p1d` | `e00_label`, `e0_label`, `k_label`, `h_label`, `eta_label` | idem + `branch[1].item[j]…` |
| `link` — liaison rigide | `thick` | `start`, `end`, `center` |
| `node` — nœud (point) | `radius` | `center` |

Paramètres de style communs aux réseaux : `amplitude` (ressorts), `width` (cylindres),
`coils`, `gap` (écart entre branches). Un élément seul dans une longue branche garde une
longueur de 22 mm au plus, centré et relié par des fils.

### Structure

| Type | Placement | Paramètres | Ancres |
|------|-----------|-----------|--------|
| `fixed_support` — encastrement | segment | `depth`, `spacing`, `side` (`droite`/`gauche` du sens de tracé) | `start`, `end`, `center` |
| `ground` — sol hachuré | segment | idem | idem |
| `simple_support` — appui simple | point (pointe du triangle) | `size`, `variant` (`fixe`/`glissant`) | `top`, `center`, `bottom` |

### Chargement

| Type | Placement | Paramètres | Ancres |
|------|-----------|-----------|--------|
| `force` — force ponctuelle | point (point d'application) | `length`, `angle` (270 = vers le bas), `label`, `applied_at` (`pointe` : pousse ; `queue` : tire) | `tip`, `tail` |
| `uniform_load` — charge répartie | segment (surface chargée) | `height`, `arrows`, `label` | `start`, `end`, `center`, `top` |
| `pressure_profile` — profil de pression | point (y = 0 m sur la surface) | `model` (`uniform`, `inverse_parabolic`, `gaussians`, `function`, noms de la SPEC), `span` [m], `width`, `height` (mm), `arrows`, `p`, `p_center`, `p_edge`, `centers`, `amplitudes`, `sigma`, `expression` (f(y), y en m), `label` | `center`, `left`, `right`, `top` |
| `footprint` — empreinte en plan | point (centre) | `shape` (`rectangle`, `cercle`, `ellipse`), `width`, `length`, `fill`, `label` | ancres de boîte |
| `wheel_section` — roue / pneu en coupe | point (contact) | `width`, `height`, `rim`, `fill`, `label` | ancres de boîte (`top` = haut de la jante), `contact`, `contact.left`, `contact.right` |
| `bogie` — bogie en plan | point (centre) | `axles`, `wheels`, `axle_spacing`, `wheel_spacing`, `tyre_width`, `tyre_length`, `fill`, `show_frame`, `label` | ancres de boîte, `axle[i]`, `wheel[k]` (k = essieu × roues + roue) |

### Annotations (S7)

| Type | Placement | Paramètres | Ancres |
|------|-----------|-----------|--------|
| `axes2d` — repère 2D | point (origine) | `length`, `x` {`dir`, `label`}, `z` {`dir`, `label`} (`dir` : `right`, `left`, `up`, `down`), `origin_label` | `origin`, `x.end`, `z.end` |
| `axes3d` — repère 3D | point | `length`, `oblique_angle`, `oblique_ratio`, `x_label`, `y_label`, `z_label`, `z_dir` | `origin` |
| `dimension` — cote linéaire | segment (entre deux ancres : elle les suit) | `offset` (> 0 : à gauche du sens de tracé), `label` (vide = longueur mesurée), `extension` | `start`, `end`, `center`, `line.center` |
| `angle_dimension` — cote angulaire | point (sommet) | `radius`, `from_angle`, `to_angle`, `label`, `arrows` | `center`, `start`, `end` |
| `arrow` — flèche | segment | `head` (`end`, `start`, `both`), `weight`, `label` | `start`, `end`, `center` |
| `brace` — accolade | segment (du côté gauche du tracé) | `depth`, `label` | `start`, `end`, `center`, `tip` |
| `text` — texte | point | `text` (`$…$` pour les maths), `anchor`, `size` (`petit`, `normal`, `grand`), `background` | `center` |
| `measure_point` — point de mesure | point | `marker` (`croix`, `capteur`, `point`), `size`, `label` | ancres de boîte |

### Formes libres (S7)

| Type | Placement | Paramètres | Ancres |
|------|-----------|-----------|--------|
| `line` — ligne | segment | `stroke`, `dashed` | `start`, `end`, `center` |
| `polyline` — polyligne | point (origine des points) | `points` [[x, y], …], `closed`, `fill`, `stroke`, `dashed`, `head` | `start`, `end`, `point[i]` |
| `circle` — cercle | point (centre) | `radius`, `fill`, `stroke`, `label` | ancres de boîte |
| `bezier` — courbe de Bézier | segment | `bend`, `asymmetry`, `stroke`, `dashed`, `head` | `start`, `end`, `center`, `top` |

**Maths.** Dans le TikZ, le LaTeX est écrit tel quel. Dans le SVG (et donc le PNG et
l'éditeur), toute étiquette contenant `$…$` est convertie en chemins par MathJax 3
(polices TeX, aucune police à installer) ; le texte hors maths passe par `\text{…}`.
Une formule invalide retombe sur le texte brut.

Expressions `f(y)` : `+ - * / ^`, parenthèses, virgule ou point décimal, `pi`, `e`,
`exp`, `ln`, `log`, `sqrt`, `abs`, `sin`, `cos`, `tan` (analyse sans `eval`, `expr.ts`).

Hachures du thème « these » : `bitumineux` (traits à 45°), `bitumineux-dense` (croisillons),
`granulaire` (points), `beton` (points serrés), `sol` (traits à 135°, plus espacés).

## Ajouter un composant

1. Créer `components/<nom>.ts` exportant un `ComponentDef` ; ajouter les paramètres,
   la géométrie locale, les ancres et le résumé.
2. L'enregistrer dans `components/index.ts`.
3. Ajouter une figure `tests/golden/<cas>.json`, générer les sorties
   (`UPDATE_GOLDEN=1 npx vitest run tests/golden`), **les relire** (SVG dans un
   navigateur, PDF compilé), puis les committer.
4. Documenter ici paramètres et ancres.

## Export TikZ

- `exportTikz(fig)` : un environnement `tikzpicture` à inclure avec
  `\usepackage{figurine}` (bibliothèques `patterns.meta` et `decorations.pathmorphing`,
  pgf ≥ 3.1.6, soit TeX Live 2020 ou plus récent).
- `exportTikz(fig, { standalone: true })` : document `standalone` compilable seul,
  `figurine.sty` embarqué par `filecontents`.
- Coordonnées en mm, **y vers le haut**, origine en bas à gauche de la planche.
- Texte : les parties `$…$` passent telles quelles ; ailleurs, `% & # _ ~ ^` sont protégés.
