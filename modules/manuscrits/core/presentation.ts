/**
 * Présentation en Markdown : une diapo par section séparée par « --- ». La première section,
 * si elle ne contient que des lignes « clé: valeur », décrit la présentation (titre, auteur,
 * date, modèle) et donne la diapo de titre.
 *
 *   # Titre de la diapo          ## Sous-titre (diapo de titre ou de section)
 *   - puce         (deux espaces de plus par niveau)     texte simple, **gras**, *italique*
 *   ![Légende](figure:FIG-0001)  ou  ![Légende](chemin/dans/l-espace.png)
 *   |||             sépare deux colonnes
 *   Source: Huang 2004     petite ligne de source en bas de diapo
 *   mise-en-page: titre | section | contenu | figure | deux-colonnes   (sinon : déduite)
 */

export type MiseEnPage = "titre" | "section" | "contenu" | "figure" | "deux-colonnes" | "references";

export type Bloc =
  | { type: "puce"; niveau: number; texte: string }
  | { type: "texte"; texte: string }
  | { type: "equation"; texte: string }
  | { type: "image"; src: string; legende: string };

export interface Diapo {
  mise: MiseEnPage;
  titre: string;
  sousTitre: string;
  /** Contenu ; pour « deux-colonnes », la colonne de gauche. */
  gauche: Bloc[];
  droite: Bloc[];
  source: string;
}

export interface Presentation {
  titre: string;
  auteur: string;
  date: string;
  /** Nom (slug) du modèle demandé, « » pour celui par défaut. */
  modele: string;
  /** Diapos « Références » à la fin quand le texte cite la Bibliothèque (`références: non` pour s'en passer). */
  references: boolean;
  diapos: Diapo[];
}

const CLE = /^([a-zà-ÿ][a-zà-ÿ -]*):\s*(.*)$/i;
const MISES: MiseEnPage[] = ["titre", "section", "contenu", "figure", "deux-colonnes"];
const IMAGE = /^!\[(.*)\]\(([^)\s]+)\)\s*$/;

function sectionsDe(md: string): string[][] {
  const out: string[][] = [[]];
  for (const l of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^---+\s*$/.test(l)) out.push([]);
    else out[out.length - 1]!.push(l);
  }
  return out.map((s) => {
    while (s.length && !s[0]!.trim()) s.shift();
    while (s.length && !s[s.length - 1]!.trim()) s.pop();
    return s;
  });
}

function blocsDe(lignes: string[]): Bloc[] {
  const out: Bloc[] = [];
  for (const brut of lignes) {
    const l = brut.replace(/\s+$/, "");
    if (!l.trim()) continue;
    const puce = /^(\s*)[-*]\s+(.*)$/.exec(l);
    const img = IMAGE.exec(l.trim());
    const eq = /^\$\$(.+)\$\$$/.exec(l.trim());
    if (img) out.push({ type: "image", legende: img[1]!.trim(), src: img[2]!.trim() });
    else if (eq) out.push({ type: "equation", texte: eq[1]!.trim() });
    else if (puce) out.push({ type: "puce", niveau: Math.min(3, Math.floor(puce[1]!.replace(/\t/g, "  ").length / 2)), texte: puce[2]!.trim() });
    else out.push({ type: "texte", texte: l.trim() });
  }
  return out;
}

export function analyserPresentation(md: string): Presentation {
  const sections = sectionsDe(md).filter((s) => s.length > 0);
  const p: Presentation = { titre: "", auteur: "", date: "", modele: "", references: true, diapos: [] };
  if (sections[0]?.length && sections[0].every((l) => !l.trim() || CLE.test(l))) {
    for (const l of sections.shift()!) {
      const m = CLE.exec(l);
      if (!m) continue;
      const k = m[1]!.toLowerCase();
      if (k === "titre") p.titre = m[2]!.trim();
      else if (k === "auteur") p.auteur = m[2]!.trim();
      else if (k === "date") p.date = m[2]!.trim();
      else if (k === "modèle" || k === "modele") p.modele = m[2]!.trim();
      else if (k === "références" || k === "references") p.references = !/^(non|no|false|0)$/i.test(m[2]!.trim());
    }
    if (p.titre) p.diapos.push({ mise: "titre", titre: p.titre, sousTitre: [p.auteur, p.date].filter(Boolean).join(" · "), gauche: [], droite: [], source: "" });
  }
  for (const s of sections) {
    let titre = "";
    let sousTitre = "";
    let mise: MiseEnPage | null = null;
    let source = "";
    const gauche: string[] = [];
    const droite: string[] = [];
    let colonne = gauche;
    let deux = false;
    for (const l of s) {
      const t = l.trim();
      const k = /^mise[- ]en[- ]page:\s*(.+)$/i.exec(t);
      if (k) {
        const v = k[1]!.trim().toLowerCase().replace(/ /g, "-") as MiseEnPage;
        if (MISES.includes(v)) mise = v;
      } else if (/^#\s+/.test(t) && !titre) titre = t.replace(/^#\s+/, "");
      else if (/^##\s+/.test(t) && !sousTitre) sousTitre = t.replace(/^##\s+/, "");
      else if (/^source\s*:/i.test(t)) source = t.replace(/^source\s*:\s*/i, "");
      else if (t === "|||") {
        deux = true;
        colonne = droite;
      } else colonne.push(l);
    }
    const g = blocsDe(gauche);
    const d = blocsDe(droite);
    const images = [...g, ...d].filter((b) => b.type === "image").length;
    const resolue: MiseEnPage = mise ?? (deux ? "deux-colonnes" : g.length + d.length === 0 ? "section" : images === 1 && g.length <= 2 ? "figure" : "contenu");
    p.diapos.push({ mise: resolue, titre, sousTitre, gauche: g, droite: d, source });
  }
  if (!p.titre) p.titre = p.diapos[0]?.titre ?? "Présentation";
  return p;
}

/** Références d'images « figure:FIG-0001 » de la présentation (à résoudre avant l'export). */
export function imagesDe(p: Presentation): string[] {
  const s = new Set<string>();
  for (const d of p.diapos) for (const b of [...d.gauche, ...d.droite]) if (b.type === "image") s.add(b.src);
  return [...s];
}

/** Modèle de départ, avec un exemple de chaque mise en page. */
export const EXEMPLE_PRESENTATION = `titre: Comité de suivi de thèse
auteur: Prénom Nom
date: 2026-10-12
modèle: sobre-clair

---
# Contexte
- Chaussées aéronautiques : sollicitations et enjeux
  - charges roulantes lentes, fortes
  - viscoélasticité des enrobés
- Objectif : prédire la réponse en température et en vitesse
Source: Huang 2004

---
# Deux approches
- Essais de laboratoire
- Modèle 2S2P1D
|||
- Calcul spectral (ChaussSpec)
- Comparaison aux mesures

---
# Résultat principal
![Module complexe, courbes maîtresses](figure:FIG-0001)

---
# Suite du travail
## Prochaines étapes
`;

/** Le texte avec la ligne « modèle: nom » posée dans l'en-tête (créé s'il n'y en a pas). */
export function avecModele(md: string, nom: string): string {
  const lignes = md.replace(/\r\n?/g, "\n").split("\n");
  const fin = lignes.findIndex((l) => /^---+\s*$/.test(l));
  const entete = fin < 0 ? lignes : lignes.slice(0, fin);
  const estEntete = entete.some((l) => CLE.test(l)) && entete.every((l) => !l.trim() || CLE.test(l));
  if (!estEntete) return `modèle: ${nom}\n\n---\n${md}`;
  const i = entete.findIndex((l) => /^mod[èe]le\s*:/i.test(l));
  const sortie = [...lignes];
  if (i >= 0) sortie[i] = `modèle: ${nom}`;
  else {
    let dernier = entete.length;
    while (dernier > 0 && !entete[dernier - 1]!.trim()) dernier--;
    sortie.splice(dernier, 0, `modèle: ${nom}`);
  }
  return sortie.join("\n");
}
