# Code Python d'origine de chausspec v0.4 (référence, non livré)

Copie du paquet Python dont `modules/chausspec/core/` est le portage TypeScript : le solveur
(`chausspec/`), la notice (`notice/notice_chausspec.pdf` et ses sources), la validation, les
exemples, et le **module texture non encore porté** (`chausspec/texture.py`, `contact.py`,
`fe2d.py`, rapport dans `rapport/`).

Rien ici n'est dans l'application (pas de Python dans le produit) : c'est la référence pour
lire les formules, régénérer les fixtures de conformité (`../tests/reference/generer/`) et porter
la phase texture plus tard. Les figures et les résultats volumineux (`*.png`, `*.npz`) ont été
retirés ; les scripts `figures_*.py` et `validation/` les régénèrent avec numpy, scipy et
matplotlib.
