# Module Numériseur

Relever les valeurs d'un graphique ou d'une carte de couleurs à partir de son image (SPEC §11 ter).

| Fichier | Rôle |
|---|---|
| `core/image.ts` | image RGBA, couleurs (CIELAB, ΔE), couleurs dominantes (anticrénelage écarté) |
| `core/etalonnage.ts` | pixel ↔ valeurs : deux points par axe, lin/log, repère oblique |
| `core/courbe.ts` | relevé automatique : `suivre` (ligne), `marqueurs` (symboles) |
| `core/carte.ts` | légende → gamme de couleurs, valeur de chaque pixel, coupes |
| `core/maillage.ts` | moyennes sur un maillage rectangulaire, en disques ou polaire ; résultante |
| `core/exports.ts` | CSV, texte pour Excel, graphe pour Figures, chargement ChaussSpec |
| `core/projet.ts` | format du projet enregistré (`numeriseur/1`) |
| `ui/Visionneuse.tsx` | image, zoom, loupe, points déplaçables, tracés |
| `ui/Panneau*.tsx` | étalonnage, courbes, carte de couleurs |

Tests : `tests/numeriseur.test.ts`, sur des images dessinées par le test (valeurs connues).

Liaisons (registre) : `figures.enregistrer-graphe` (courbes, coupes) et
`chausspec.importer-chargement` (disques ou carte de pression vers le cas ChaussSpec ouvert).
