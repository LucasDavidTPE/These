/**
 * Inventaire d'une partie de manuscrit, lu dans son `.docx` : plan des titres, mots, consignes
 * restantes, figures, notes, commentaires, modifications suivies, citations Zotero.
 * Pur : prend les octets du fichier, rend des nombres et des listes.
 */
import { compterNotes, lireCommentaires, lireDocument, lireProprietes, lireStyles, niveauTitre, ouvrirDocx, type Commentaire, type Modification } from "./ooxml";

export interface ReglagesLecture {
  /** Identifiants de style des consignes (texte bleu à supprimer avant le dépôt). */
  consignes: string[];
  /** Style des mini-sommaires de chapitre (tapés à la main). */
  miniSommaires: string[];
  /** Les consignes qui commencent par ce texte sont des passages « à rédiger ». */
  debutARediger: string;
}

export const LECTURE_PAR_DEFAUT: ReglagesLecture = { consignes: ["Consigne"], miniSommaires: ["SommaireChapitre"], debutARediger: "À rédiger" };

export interface Titre {
  niveau: number;
  texte: string;
  /** Premier signet du titre (« C1_1_2 »), cible des renvois. */
  signet: string;
}

export interface Inventaire {
  /** Premier titre de niveau 1, sinon le titre du document, sinon « ». */
  titre: string;
  plan: Titre[];
  /** Mots du texte (consignes et mini-sommaires exclus). */
  mots: number;
  paragraphes: number;
  consignes: number;
  /** Consignes « À rédiger » : ce qui reste à écrire. */
  aRediger: number;
  figures: number;
  tableaux: number;
  notes: number;
  sections: number;
  commentaires: Commentaire[];
  modifications: Modification[];
  /** Citations Zotero (champs `ZOTERO_ITEM`). */
  citations: number;
  /** Bibliographie Zotero déjà insérée (`ZOTERO_BIBL`). */
  bibliographie: boolean;
  modifie: string;
  taille: number;
}

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function inventorier(octets: Uint8Array, lecture: ReglagesLecture = LECTURE_PAR_DEFAUT): Inventaire {
  const paquet = ouvrirDocx(octets);
  const styles = lireStyles(paquet.fichiers["word/styles.xml"]);
  const doc = lireDocument(paquet.fichiers["word/document.xml"]!, styles);
  const props = lireProprietes(paquet);
  const consignes = new Set(lecture.consignes);
  const mini = new Set(lecture.miniSommaires);
  const debut = sansAccent(lecture.debutARediger);

  const plan: Titre[] = [];
  let mots = 0;
  let nbConsignes = 0;
  let aRediger = 0;
  let citations = 0;
  let bibliographie = false;
  for (const p of doc.paragraphes) {
    const niveau = niveauTitre(p.style, styles);
    if (niveau > 0 && p.texte.trim()) plan.push({ niveau, texte: p.texte.trim(), signet: p.signets[0] ?? "" });
    if (consignes.has(p.style)) {
      nbConsignes++;
      if (sansAccent(p.texte.trim()).startsWith(debut)) aRediger++;
    } else if (!mini.has(p.style)) mots += p.texte.split(/\s+/).filter(Boolean).length;
    for (const c of p.champs) {
      if (/^\s*ADDIN ZOTERO_ITEM\b|^\s*ZOTERO_ITEM\b/.test(c)) citations++;
      else if (/ZOTERO_BIBL\b/.test(c)) bibliographie = true;
    }
  }
  return {
    titre: plan.find((t) => t.niveau === 1)?.texte ?? props.titre,
    plan,
    mots,
    paragraphes: doc.paragraphes.length,
    consignes: nbConsignes,
    aRediger,
    figures: doc.dessins,
    tableaux: doc.tableaux,
    notes: compterNotes(paquet),
    sections: doc.sections,
    commentaires: lireCommentaires(paquet, doc, styles),
    modifications: doc.modifications,
    citations,
    bibliographie,
    modifie: props.modifie,
    taille: octets.length,
  };
}
