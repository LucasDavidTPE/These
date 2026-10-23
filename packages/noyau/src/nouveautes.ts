/**
 * « Quoi de neuf » : ce que chaque version a ajouté, dit en une phrase, avec de quoi l'essayer tout de suite.
 * Après une mise à jour, la coquille montre les nouveautés depuis la dernière version vue sur ce poste ;
 * le bouton « Nouveautés » de la barre les rouvre toutes.
 */

export interface Essai {
  libelle: string;
  /** Module à ouvrir (destination de la coquille)… */
  vers?: string;
  /** … ou action nommée du registre (« figures.aller »), appelée avec `{ ctx, ...charge }`. */
  action?: string;
  charge?: Record<string, unknown>;
}

export interface Nouveaute {
  version: string;
  /** Identifiant du module concerné ; sans module, c'est la coquille. */
  module?: string;
  titre: string;
  detail: string;
  essayer?: Essai;
}

const COMSOL = (page = "comsol", exemple = true): Essai => ({
  libelle: exemple ? "Essayer sur l'exemple" : "Ouvrir",
  action: "figures.aller",
  charge: { page, exemple },
});

/** Les plus récentes d'abord. */
export const NOUVEAUTES: readonly Nouveaute[] = [
  {
    version: "1.44.1",
    module: "figures",
    titre: "Projets de figures : dessins SVG",
    detail: "Un projet a aussi ses dessins SVG (dossier svg/, Inkscape…) : « Ajouter des SVG… » les range dans le projet, liés ; après une retouche, « Mettre à jour » reprend le dessin. « Importer un SVG… » range dans le projet ouvert.",
    essayer: { libelle: "Ouvrir Figures", vers: "figures" },
  },
  {
    version: "1.44.0",
    module: "figures",
    titre: "Figures : projets, classeurs Excel et scripts Python",
    detail:
      "Colonne « Projets » dans la Bibliothèque (un article, un chapitre… ; une figure dans plusieurs projets ou dans aucun, glisser pour ranger). Dans un projet : les graphiques de vos classeurs Excel deviennent des graphes modifiables, liés au classeur (« Mettre à jour » quand il change), avec en plus l'aspect Excel exact ; vos scripts Python s'exécutent depuis l'application et leurs graphes (these_figures, matplotlib) arrivent modifiables dans Figures.",
    essayer: { libelle: "Ouvrir Figures", vers: "figures" },
  },
  {
    version: "1.43.4",
    module: "figures",
    titre: "Figures : importer des SVG et les copier en SVG",
    detail: "« Importer un SVG… » (Bibliothèque) ajoute des .svg aux figures, retrouvables par la recherche ; « Copier en SVG » et « Enregistrer en SVG… » sur la fiche d'une figure qui a un SVG (schémas, graphes, planches, imports).",
    essayer: { libelle: "Ouvrir Figures", vers: "figures" },
  },
  {
    version: "1.43.3",
    module: "planning",
    titre: "Planning : chercher un article à lire",
    detail: "Dans la colonne « À lire » de la Semaine, une barre de recherche retrouve un article précis (titre, citation) au-delà des lectures en retard ou de ce mois-ci, pour l'ajouter au planning.",
    essayer: { libelle: "Ouvrir le planning", vers: "planning" },
  },
  {
    version: "1.43.2",
    titre: "Thème sombre et atelier COMSOL plus rapide",
    detail: "Plus de texte clair sur fond blanc en thème sombre (un test le vérifie désormais) ; atelier COMSOL 5 à 30 fois plus réactif sur de gros exports (changement de tuile, curseur des instants, sonde, saisie).",
    essayer: { libelle: "Essayer sur l'exemple", action: "figures.aller", charge: { page: "comsol", exemple: true } },
  },
  {
    version: "1.43.1",
    module: "figures",
    titre: "COMSOL : plus de place pour les tracés",
    detail: "Visite guidée en une bande (une étape à la fois), rapport à la place des tracés sur toute la hauteur, tuiles compactes une fois le tracé choisi (« Détails » pour les explications).",
    essayer: { libelle: "Essayer sur l'exemple", action: "figures.aller", charge: { page: "comsol", exemple: true } },
  },
  {
    version: "1.43.0",
    module: "figures",
    titre: "COMSOL : rapport en Word",
    detail: "Le rapport de l'étude aussi en .docx : titres, phrases chiffrées (ε, indices), tableaux, figures en images et légendes numérotées par Word, à coller dans la thèse.",
    essayer: { libelle: "Essayer sur l'exemple", action: "figures.aller", charge: { page: "comsol", exemple: true } },
  },
  {
    version: "1.42.0",
    titre: "Quoi de neuf",
    detail: "Ce panneau : après chaque mise à jour, ce qui a changé et un bouton pour l'essayer. Rouvrable par « Nouveautés » en bas de la barre, ou Ctrl+K « nouveautés ».",
  },
  {
    version: "1.41.0",
    module: "figures",
    titre: "COMSOL : jeu d'exemple et visite guidée",
    detail: "16 exports synthétiques au format COMSOL (coupes EL / VE, charge roulante, surface, balayage de E_GB, signal) et une visite en 9 étapes qui ouvre chaque tuile réglée.",
    essayer: { ...COMSOL(), libelle: "Lancer la visite" },
  },
  {
    version: "1.40.0",
    module: "figures",
    titre: "COMSOL : conversions d'unité en un clic",
    detail: "« Transformer (ƒ)… » → Grandeurs dérivées : εzz sans unité → µdef, Pa → MPa, m → mm, pour aligner des fichiers que « Vérifier » signale.",
    essayer: COMSOL(),
  },
  {
    version: "1.39.0",
    module: "figures",
    titre: "COMSOL : pistes pour les fichiers ouverts",
    detail: "Sous les tuiles, ce que l'atelier peut faire des fichiers ouverts (vue d'ensemble, convergence, bassin, sensibilité…), chaque piste menant à sa tuile.",
    essayer: COMSOL(),
  },
  {
    version: "1.38.0",
    module: "figures",
    titre: "COMSOL : vue d'ensemble et grandeurs dérivées",
    detail: "Tous les cas en petites cartes à la même échelle, rangés EL / VE × empreintes ; ε1, ε3, γmax, εvol, σVM proposés d'après les colonnes présentes.",
    essayer: COMSOL(),
  },
  {
    version: "1.37.0",
    module: "figures",
    titre: "COMSOL : mesures de jauges superposées, vérification des fichiers",
    detail: "Coller une mesure (Excel, CSV) sur le signal calculé, recaler les pics, écart RMS ; « Vérifier » liste unités, légendes et doublons douteux.",
    essayer: COMSOL(),
  },
  {
    version: "1.36.0",
    module: "figures",
    titre: "COMSOL : sensibilité à un paramètre, exports Excel",
    detail: "Le pic d'une grandeur en fonction d'un paramètre (d'un fichier à l'autre, ou balayage d'un même export) ; « Excel… » sous chaque aperçu.",
    essayer: COMSOL(),
  },
  {
    version: "1.35.0",
    module: "figures",
    titre: "COMSOL : profils sur un segment, lissage, animation",
    detail: "Deux clics sur la carte pour un profil le long d'un segment ; cartes lissées ; animation des instants en GIF ou en images Beamer.",
    essayer: COMSOL(),
  },
  {
    version: "1.34.0",
    module: "figures",
    titre: "COMSOL : bassin de déflexion, convergence du maillage",
    detail: "D0, SCI, BDI, BCI, AREA, rayon de courbure et écart à un essai HWD collé ; paire maillage grossier / fin : écart sur le pic, norme L2, verdict.",
    essayer: COMSOL(),
  },
  {
    version: "1.33.0",
    module: "figures",
    titre: "COMSOL : rapport LaTeX de l'étude",
    detail: "Premier jet de la partie résultats : cas, figures, extrema, critères, bassin, maillage, en tableaux et phrases chiffrées.",
    essayer: COMSOL(),
  },
  {
    version: "1.32.0",
    module: "figures",
    titre: "COMSOL : instants, sonde, épingles, signal en un point",
    detail: "Exports à plusieurs instants : curseur, ▶, enveloppe ; survol de la carte pour lire EL / VE, clic pour épingler, signal au cours du temps en ce point.",
    essayer: COMSOL(),
  },
  {
    version: "1.31.0",
    module: "figures",
    titre: "COMSOL : critères de dimensionnement",
    detail: "εt à la base des couches liées, εz au sommet du sol, lois de fatigue, cycles admissibles et dommage pour un trafic donné.",
    essayer: COMSOL(),
  },
  {
    version: "1.30.0",
    module: "figures",
    titre: "COMSOL : lot et matrice de figures",
    detail: "Une recette déclinée sur tous les cas d'un coup (une figure par cas, ou une planche), et tout régénéré quand les exports changent.",
    essayer: COMSOL("comsol", false),
  },
  {
    version: "1.29.0",
    module: "figures",
    titre: "COMSOL : études enregistrées",
    detail: "L'atelier garde ses recettes dans une étude : rouvrir, changer les fichiers, tout refaire en un clic.",
    essayer: COMSOL("comsol", false),
  },
  {
    version: "1.28.0",
    module: "figures",
    titre: "COMSOL : l'atelier",
    detail: "Une page guidée : fichiers à gauche, tuiles (profils, carte, comparer, synthèse…) et aperçu en direct.",
    essayer: COMSOL(),
  },
  {
    version: "1.27.0",
    module: "figures",
    titre: "COMSOL : séries temporelles, opérations, synthèse",
    detail: "Exports de tables au cours du temps, différences et rapports entre deux fichiers, tableau de synthèse, annotations des couches.",
    essayer: COMSOL("comsol", false),
  },
  {
    version: "1.26.0",
    module: "manuscrits",
    titre: "Manuscrits : anciens fichiers Word .doc",
    detail: "Les .doc sont convertis à l'ouverture et suivis comme les .docx.",
    essayer: { libelle: "Ouvrir", vers: "manuscrits" },
  },
  {
    version: "1.25.0",
    module: "figures",
    titre: "Figures : cartes modifiables et planches",
    detail: "Cartes en couleurs retouchables dans Graphes (échelle, isolignes, pgfplots) ; planches de plusieurs graphes avec étiquettes (a), (b)…",
    essayer: {
      libelle: "Ouvrir les planches",
      action: "figures.aller",
      charge: { page: "planches" },
    },
  },
];

/** Compare deux versions « a.b.c » (négatif si a < b). Un morceau illisible compte pour 0. */
export function comparerVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Les nouveautés à montrer : postérieures à la dernière version vue (toutes si aucune), pas au-delà de la
 * version installée, et seulement celles des modules présents dans l'installeur (sans module : la coquille).
 */
export function nouveautesDepuis(liste: readonly Nouveaute[], vue: string | null, actuelle: string, modules: readonly string[]): Nouveaute[] {
  return liste
    .filter((n) => (vue === null || comparerVersions(n.version, vue) > 0) && comparerVersions(n.version, actuelle) <= 0)
    .filter((n) => !n.module || modules.includes(n.module))
    .sort((a, b) => comparerVersions(b.version, a.version));
}

/** Les nouveautés groupées par version, dans l'ordre de la liste. */
export function parVersion(liste: readonly Nouveaute[]): { version: string; nouveautes: Nouveaute[] }[] {
  const out: { version: string; nouveautes: Nouveaute[] }[] = [];
  for (const n of liste) {
    const g = out.find((x) => x.version === n.version);
    if (g) g.nouveautes.push(n);
    else out.push({ version: n.version, nouveautes: [n] });
  }
  return out;
}
