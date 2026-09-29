/**
 * Petit Markdown pour les cartes : titres (##), paragraphes, listes (- ou 1.), **gras**, *italique*,
 * `code`, [lien](https://…) et citations [@BIB-020]. Donne une structure, pas du HTML : l'interface
 * la rend en éléments, sans jamais injecter de balises venues du texte.
 */

export type EnLigne =
  | { type: "texte"; texte: string; gras?: boolean; italique?: boolean }
  | { type: "code"; texte: string }
  | { type: "lien"; texte: string; url: string }
  | { type: "cite"; brut: string };

export type BlocMd =
  | { type: "titre"; niveau: 2 | 3; contenu: EnLigne[] }
  | { type: "paragraphe"; contenu: EnLigne[] }
  | { type: "liste"; ordonnee: boolean; elements: EnLigne[][] };

const JETON = /(`[^`\n]+`)|(\[@[^\]\n]+\])|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)/g;

export function enLigne(texte: string): EnLigne[] {
  const out: EnLigne[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(JETON)) {
    if (m.index > dernier) out.push({ type: "texte", texte: texte.slice(dernier, m.index) });
    const j = m[0];
    if (m[1]) out.push({ type: "code", texte: j.slice(1, -1) });
    else if (m[2]) out.push({ type: "cite", brut: j });
    else if (m[3]) {
      const i = j.indexOf("](");
      out.push({ type: "lien", texte: j.slice(1, i), url: j.slice(i + 2, -1) });
    } else if (m[4]) out.push({ type: "texte", texte: j.slice(2, -2), gras: true });
    else out.push({ type: "texte", texte: j.slice(1, -1), italique: true });
    dernier = m.index + j.length;
  }
  if (dernier < texte.length) out.push({ type: "texte", texte: texte.slice(dernier) });
  return out;
}

export function analyserMarkdown(texte: string): BlocMd[] {
  const blocs: BlocMd[] = [];
  let para: string[] = [];
  let liste: { ordonnee: boolean; elements: string[] } | null = null;
  const fermer = () => {
    if (para.length) blocs.push({ type: "paragraphe", contenu: enLigne(para.join(" ")) });
    if (liste) blocs.push({ type: "liste", ordonnee: liste.ordonnee, elements: liste.elements.map(enLigne) });
    para = [];
    liste = null;
  };
  for (const brute of texte.replace(/\r\n?/g, "\n").split("\n")) {
    const l = brute.trim();
    const titre = /^(#{1,3})\s+(.*)$/.exec(l);
    const puce = /^[-*]\s+(.*)$/.exec(l);
    const num = /^\d+[.)]\s+(.*)$/.exec(l);
    if (!l) fermer();
    else if (titre) {
      fermer();
      blocs.push({ type: "titre", niveau: titre[1]!.length >= 3 ? 3 : 2, contenu: enLigne(titre[2]!) });
    } else if (puce || num) {
      const ordonnee = !puce;
      if (para.length || (liste && liste.ordonnee !== ordonnee)) fermer();
      liste ??= { ordonnee, elements: [] };
      liste.elements.push((puce ?? num)![1]!);
    } else if (liste && /^\s{2,}/.test(brute)) liste.elements[liste.elements.length - 1] += ` ${l}`;
    else {
      if (liste) fermer();
      para.push(l);
    }
  }
  fermer();
  return blocs;
}
