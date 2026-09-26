# Questions et décisions à valider

Points où la SPEC ou la feuille de route paraissent discutables, ou qui demandent un
choix de l'utilisateur. On ne change rien silencieusement : on écrit ici.

**Bilan S10 (v1.0)** — réglées : Q9 (résolution guidée étendue), Q14 (MathJax en S7),
Q1 (l'`.exe` est l'installeur recommandé dans le README ; le `.msi` reste produit).
Choix par défaut conservés en attendant un retour : Q2, Q3, Q10, Q13, Q15, Q16, Q17.
Simples informations : Q4–Q8, Q11, Q12, Q18–Q24. Nouvelle : Q25.

## Q1 — Installation par utilisateur et `.msi` (S0)
L'installeur **NSIS (`.exe`)** est configuré en `installMode: "currentUser"` : pas de
droits admin, installation dans le profil. Le **`.msi`** généré par Tauri (WiX) installe
en revanche **par machine** et demande les droits administrateur ; Tauri n'expose pas
d'option « par utilisateur » pour WiX.
**Proposition** : considérer l'`.exe` comme l'installeur recommandé (README de S10) et
garder le `.msi` pour un éventuel déploiement géré. Alternative : ne plus produire de
`.msi`. À trancher.
**S10** : le README recommande l'`.exe` ; le `.msi` reste produit.

## Q2 — WebView2 à l'installation (S0)
Par défaut, l'installeur télécharge WebView2 **si et seulement s'il est absent**
(`downloadBootstrapper`). Windows 10/11 à jour l'ont déjà, donc pas de requête réseau en
pratique, et jamais à l'exécution. Si un PC hors ligne doit être couvert, passer à
`offlineInstaller` (+ ~130 Mo) ou `embedBootstrapper`. Par défaut : inchangé.

## Q3 — Artefacts sur chaque push (S0)
La feuille de route demande des installeurs « en artefact sur chaque push » : le workflow
tourne désormais sur **toutes les branches** (pas seulement `main`). Chaque build Windows
coûte ~10–15 min de runner. Si c'est trop, restreindre à `main` + `workflow_dispatch`.

## Q4 — Nom et identifiant provisoires (S0)
« Figurine » / `fr.lucasdavid.figurine`. L'identifiant détermine le dossier de
configuration locale (`%APPDATA%\fr.lucasdavid.figurine`) : le changer après S2 ferait
perdre les réglages par poste. À figer avant S2 si le nom doit changer.

## Q5 — Deux figures avec le même ID (S1)
Si les deux PC créent une figure hors ligne, ils prennent tous deux `max + 1` et OneDrive
finit avec `FIG-0008_a` et `FIG-0008_b`. Le scan le signale (`duplicate-id`) sans rien
modifier. **Proposition pour S2** : bouton « renuméroter » qui renomme le plus récent en
`nextId` et réécrit son `meta.json`. Les `\input{…/export.tex}` déjà écrits vers l'ancien
dossier seraient à corriger à la main : à signaler dans l'interface.

## Q6 — Nom des copies de conflit OneDrive (S1)
La détection suppose la forme documentée par Microsoft : `nom-NOMPC.ext`, puis
`nom-NOMPC-1.ext`, etc. Les copies de l'Explorateur (`nom - Copie.ext`, `nom (2).ext`) sont
aussi reconnues. À confirmer par le test manuel S1 ; si OneDrive utilise une autre forme
sur ces PC, il suffit d'ajouter un motif dans `src/core/library/conflicts.ts`.

## Q7 — Heure des verrous en UTC (S1)
Le `since` des `.lock` est écrit en UTC (`2026-09-25T17:00:00Z`), alors que `meta.json`
utilise l'heure locale avec décalage (SPEC §3). Les deux sont des dates ISO valides et
comparables ; l'interface affichera l'heure locale. Pas de changement proposé.

## Q8 — Lien entre la règle des 12 h en Rust et en TypeScript (S1)
La règle « verrou périmé après 12 h » existe à deux endroits : Rust l'applique à la pose
(`src-tauri/src/library/lock.rs`), TypeScript l'utilise pour l'affichage
(`src/core/library/lock.ts`). Les deux ont leurs tests ; les modifier ensemble.

## Q9 — Conflit sur `figurine-library.json` (S2)
La résolution guidée (« Garder cette version ») ne couvre que les fichiers des figures.
Le fichier de préférences partagées n'a pas encore de contenu utilisé : le conflit est
signalé, à résoudre à la main. À reprendre quand ce fichier servira (thèmes, S4+).
**Réglé en S10** : « À régler » propose aussi « Garder cette version » pour les fichiers à
la racine de la bibliothèque ; l'autre version est rangée dans `.conflits\`.

## Q10 — Taille de l'installeur avec le modèle de détourage (S3)
IS-Net « general use » pèse 178 Mo (+ 16 Mo pour ONNX Runtime) : l'installeur dépassera
probablement 150 Mo (les poids se compressent mal). Mesuré ici : 800×600 détouré en
**1,1 s** (Linux, 4 cœurs, version release), premier chargement du modèle ≈ 1 s en plus.
Alternatives si la taille gêne : `u2netp` (4,6 Mo, nettement moins précis) ou `silueta`
(43 Mo, qualité intermédiaire, même pipeline : une ligne à changer dans
`src-tauri/src/cutout/pipeline.rs` + le script). **Proposition : garder IS-Net.**

## Q11 — Image DIB copiée « aplatie sur blanc » (S3)
À la copie, le format « PNG » garde la transparence (Word, PowerPoint, Paint.NET…). Le
format DIB posé à côté est aplati sur fond blanc, car beaucoup d'applications ignorent
l'alpha du DIB et afficheraient un fond noir. Si une application utilisée lit le DIB et
devrait voir la transparence, le signaler.

## Q12 — Le détourage n'est pas disponible dans le navigateur (S3)
En mode démonstration (`npm run dev` dans un navigateur), le « détourage » est un simple
seuil sur la couleur du coin de l'image, pour tester l'interface. Le vrai modèle ne tourne
que dans l'appli (ONNX Runtime natif).

## Q13 — Coordonnées TikZ : y vers le haut (S4)
Conformément à la SPEC, l'export TikZ met l'origine en bas à gauche avec y vers le haut
(`x=1mm, y=1mm`). Conséquence : les nombres du `.tex` ne sont pas ceux de `figure.json`
(y' = hauteur − y). Alternative plus « retouchable » : `y=-1mm` et les mêmes nombres que
l'éditeur. **Choix actuel : SPEC.** À rediscuter si la retouche à la main le demande.

## Q14 — Maths dans le SVG avant S7 (S4)
Jusqu'à l'intégration de MathJax (S7), les `$…$` apparaissent en texte brut dans le SVG
(le TikZ est correct). Normal à ce stade. **Réglé en S7.**

## Q15 — Compilation LaTeX en CI (S4)
Le test qui compile les `.tex` générés tourne ici (cloud, TeX Live installé) mais est
**ignoré** en CI (pas de LaTeX sur le runner Linux, avertissement affiché). L'ajouter à la
CI coûterait ~2 min par build (`apt install texlive-pictures…`). À décider.

## Q16 — Symbole de l'élément parabolique (S5)
Dessiné comme un amortisseur dont le piston est un arc de parabole (convexe vers la tige).
Les publications 2S2P1D utilisent parfois un autre symbole (losange, rectangle annoté).
À valider sur la figure `tests/golden/s5-2s2p1d` ; changer le symbole = une fonction
(`elementPrims`, `src/core/schema/components/rheology.ts`).

## Q17 — « 5 gaussiennes, centres ±0,16 m » (S5)
Interprété comme 5 centres régulièrement espacés : −0,16, −0,08, 0, 0,08, 0,16 m, amplitudes
1,8 / 1,7 / 1,67 / 1,7 / 1,8, σ = 0,0315 m (figure `s5-structure-gaussiennes`). Si les
centres ou amplitudes réels diffèrent (rainures du pneu), les donner : seul le `.json`
change.

## Q18 — KVG : ce que contient la chaîne (S5)
Le composant `kvg` = ressort instantané $E_0$ (désactivable) + n éléments de
Kelvin-Voigt en série + amortisseur facultatif. La figure de validation utilise n = 9.

## Q19 — MathJax 3 plutôt que 4 (S7)
MathJax 3.2.2 (`mathjax-full`) est utilisé car il fonctionne de façon synchrone, sans DOM,
avec ses polices TeX incluses : export SVG déterministe et testable. MathJax 4
(`@mathjax/src`) charge ses polices à la demande (asynchrone) ; migration possible plus
tard sans changer le format des figures.

## Q20 — Noms des modèles de profil de pression (S7)
L'exemple de la SPEC §5 écrit `"model": "gaussians"`. Pour que cet exemple soit valide
tel quel, les modèles s'appellent `uniform`, `inverse_parabolic`, `gaussians`, `function`
dans `figure.json` (libellés français dans l'interface). Les autres paramètres
énumérés (hachures, `fill`…) gardent des valeurs françaises, non fixées par la SPEC.

## Q21 — Recadrage d'une figure vectorielle (S8)
Recadrer un schéma (export SVG) le convertit en image (à la taille naturelle du SVG,
96 dpi). Pour un schéma, mieux vaut réduire la planche dans l'éditeur. Le recadrage est
surtout pensé pour les images (photos, détourages, captures d'articles).

## Q22 — Fichiers .xls (S9)
Seuls les classeurs `.xlsx` / `.xlsm` (et CSV / texte) sont lus. Un ancien `.xls` donne un
message invitant à l'enregistrer en `.xlsx` dans Excel. Les formules sont lues par leur
dernière valeur calculée (celle enregistrée par Excel).

## Q23 — pgfplots : compatibilité et fichiers .dat (S9)
`figurine.sty` charge pgfplots sans fixer `compat` (pour ne pas changer vos autres
graphes) ; bornes, graduations et libellés sont imposés par l'export, donc le rendu ne
dépend pas de `compat`. L'export autonome fixe `compat=1.16`. Avec l'option « fichiers
.dat », le `.tex` lit `\figurinedatadir export-1.dat` : définir
`\renewcommand{\figurinedatadir}{chemin/vers/FIG-xxxx_.../}` avant `\input`.

## Q24 — Accents dans les étiquettes avec maths (S9)
Une étiquette contenant `$…$` est entièrement rendue par MathJax ; les lettres accentuées
du texte sont composées avec les accents TeX (é → `\'{e}`), comme LaTeX. Le résultat est
très proche du PDF, avec parfois un accent légèrement décalé (è dans « Modèle »).

## Q25 — Raccourci global « coller → détourer → copier » (S10)
La SPEC §8 évoque une petite fenêtre compacte appelée par un raccourci clavier global.
Non réalisé en v1.0 : le module Détourage fait la même chose en trois gestes (`Ctrl+V`,
attendre, « Copier »). Un raccourci global demande le plugin `global-shortcut` et une
seconde fenêtre ; à ajouter si le besoin se confirme à l'usage.
