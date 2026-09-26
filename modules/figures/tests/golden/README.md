# Figures de référence (golden)

Chaque cas de test est un triplet de même nom :

- `<cas>.json` : la figure au format pivot (`figurine/1`, SPEC §5) ;
- `<cas>.svg`  : l'export SVG attendu, octet pour octet ;
- `<cas>.tex`  : l'export TikZ attendu, octet pour octet.

Les tests golden arrivent en session S4. Une différence de sortie doit être relue à la
main avant de mettre à jour le fichier attendu.
