/**
 * Briques de la fusion de `.docx` : découpe du corps en blocs, relations (`.rels`), types de
 * contenu, chemins dans le paquet. Manipulation de texte XML (pas de DOM), pur et testé.
 */

export const NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// ---- Découpe du corps ----

const BALISE = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s[^>]*?)?)(\/?)>/g;

export interface CorpsDecoupe {
  /** Tout ce qui précède le contenu du corps, balise `<w:body>` comprise (dont la racine et ses espaces de noms). */
  avant: string;
  /** Éléments de premier niveau du corps (paragraphes, tableaux, `w:sdt`…), sans le `w:sectPr` final. */
  blocs: string[];
  /** `w:sectPr` final (propriétés de la dernière section), null s'il n'y en a pas. */
  sectFinal: string | null;
  /** Ce qui suit le corps : `</w:body></w:document>`. */
  apres: string;
}

/** Éléments de premier niveau d'un fragment XML (chaque entrée = l'élément complet, balises comprises). */
export function elementsDePremierNiveau(xml: string): string[] {
  const out: string[] = [];
  let profondeur = 0;
  let debut = 0;
  BALISE.lastIndex = 0;
  for (let m = BALISE.exec(xml); m; m = BALISE.exec(xml)) {
    if (m[2] === undefined) continue;
    if (m[1]) {
      profondeur--;
      if (profondeur === 0) out.push(xml.slice(debut, m.index + m[0].length));
    } else if (m[4]) {
      if (profondeur === 0) out.push(m[0]);
    } else {
      if (profondeur === 0) debut = m.index;
      profondeur++;
    }
  }
  return out;
}

export function decouperCorps(xml: string): CorpsDecoupe {
  const ouvre = /<w:body\b[^>]*>/.exec(xml);
  const fin = xml.lastIndexOf("</w:body>");
  if (!ouvre || fin < 0) throw new Error("word/document.xml : corps du document introuvable (<w:body>).");
  const debutCorps = ouvre.index + ouvre[0].length;
  const elements = elementsDePremierNiveau(xml.slice(debutCorps, fin));
  let sectFinal: string | null = null;
  const blocs: string[] = [];
  for (const [i, e] of elements.entries()) {
    if (i === elements.length - 1 && /^<w:sectPr\b/.test(e)) sectFinal = e;
    else blocs.push(e);
  }
  return { avant: xml.slice(0, debutCorps), blocs, sectFinal, apres: xml.slice(fin) };
}

// ---- Espaces de noms de la racine ----

export interface Racine {
  balise: string;
  espaces: Map<string, string>;
  ignorable: string[];
}

export function lireRacine(avant: string): Racine {
  const m = /<w:document\b[^>]*>/.exec(avant);
  if (!m) throw new Error("word/document.xml : racine <w:document> introuvable.");
  const espaces = new Map<string, string>();
  for (const x of m[0].matchAll(/\sxmlns:([\w.-]+)="([^"]*)"/g)) espaces.set(x[1]!, x[2]!);
  const ign = /\smc:Ignorable="([^"]*)"/.exec(m[0]);
  return { balise: m[0], espaces, ignorable: ign ? ign[1]!.split(/\s+/).filter(Boolean) : [] };
}

/** Ajoute à la racine de `base` les espaces de noms (et `mc:Ignorable`) que `autre` déclare en plus. Renvoie les conflits. */
export function unirRacines(base: string, autre: string): { avant: string; conflits: string[] } {
  const b = lireRacine(base);
  const a = lireRacine(autre);
  const conflits: string[] = [];
  let balise = b.balise;
  for (const [p, uri] of a.espaces) {
    const existant = b.espaces.get(p);
    if (existant === undefined) {
      balise = balise.replace(/<w:document\b/, () => `<w:document xmlns:${p}="${uri}"`);
      b.espaces.set(p, uri);
    } else if (existant !== uri) conflits.push(p);
  }
  const ignorables = [...new Set([...b.ignorable, ...a.ignorable.filter((p) => b.espaces.has(p))])];
  if (ignorables.length && ignorables.join(" ") !== b.ignorable.join(" ")) {
    balise = /\smc:Ignorable="/.test(balise) ? balise.replace(/(\smc:Ignorable=")[^"]*"/, (_, a: string) => `${a}${ignorables.join(" ")}"`) : balise.replace(/<w:document\b/, () => `<w:document mc:Ignorable="${ignorables.join(" ")}"`);
  }
  return { avant: base.replace(b.balise, () => balise), conflits };
}

// ---- Relations ----

export interface Relation {
  id: string;
  type: string;
  cible: string;
  /** « External » pour une adresse web ou un fichier externe. */
  mode: string;
}

const attrXml = (balise: string, nom: string) => {
  const m = new RegExp(`\\s${nom}="([^"]*)"`).exec(balise);
  return m ? m[1]! : "";
};

export function lireRelations(xml: string | undefined): Relation[] {
  if (!xml) return [];
  return [...xml.matchAll(/<Relationship\b[^>]*\/?>/g)].map((m) => ({ id: attrXml(m[0], "Id"), type: attrXml(m[0], "Type"), cible: attrXml(m[0], "Target"), mode: attrXml(m[0], "TargetMode") }));
}

export function ecrireRelations(rels: readonly Relation[]): string {
  const corps = rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.cible}"${r.mode ? ` TargetMode="${r.mode}"` : ""}/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${corps}</Relationships>`;
}

export const REL_TYPE = (nom: string) => `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${nom}`;

/** Prochain « rIdN » libre. */
export function idRelationLibre(rels: readonly Relation[]): string {
  let max = 0;
  for (const r of rels) max = Math.max(max, Number(/^rId(\d+)$/.exec(r.id)?.[1] ?? 0));
  return `rId${max + 1}`;
}

// ---- Chemins dans le paquet ----

/** Chemin absolu dans le paquet d'une cible relative à `dossier` (« word », « ../media/a.png »). */
export function resoudreChemin(dossier: string, cible: string): string {
  if (cible.startsWith("/")) return cible.slice(1);
  const parts = dossier ? dossier.split("/") : [];
  for (const s of cible.split("/")) {
    if (s === "..") parts.pop();
    else if (s !== "." && s !== "") parts.push(s);
  }
  return parts.join("/");
}

/** Cible relative à `dossier` pour un chemin du paquet. */
export function cheminRelatif(dossier: string, chemin: string): string {
  const d = dossier ? dossier.split("/") : [];
  const c = chemin.split("/");
  let i = 0;
  while (i < d.length && i < c.length - 1 && d[i] === c[i]) i++;
  return [...Array(d.length - i).fill(".."), ...c.slice(i)].join("/");
}

export const dossierDe = (chemin: string) => (chemin.includes("/") ? chemin.slice(0, chemin.lastIndexOf("/")) : "");
export const nomDeChemin = (chemin: string) => chemin.slice(chemin.lastIndexOf("/") + 1);
export const cheminRels = (partie: string) => `${dossierDe(partie)}/_rels/${nomDeChemin(partie)}.rels`.replace(/^\//, "");

// ---- Types de contenu ----

export interface TypesContenu {
  defauts: Map<string, string>;
  surcharges: Map<string, string>;
}

export function lireTypesContenu(xml: string): TypesContenu {
  const defauts = new Map<string, string>();
  const surcharges = new Map<string, string>();
  for (const m of xml.matchAll(/<Default\b[^>]*\/?>/g)) defauts.set(attrXml(m[0], "Extension").toLowerCase(), attrXml(m[0], "ContentType"));
  for (const m of xml.matchAll(/<Override\b[^>]*\/?>/g)) surcharges.set(attrXml(m[0], "PartName"), attrXml(m[0], "ContentType"));
  return { defauts, surcharges };
}

/** Ajoute (si besoin) ce qu'il faut pour que `chemin` ait le type de contenu `type`. */
export function declarerType(xml: string, chemin: string, type: string, surcharge: boolean): string {
  const t = lireTypesContenu(xml);
  const ext = chemin.slice(chemin.lastIndexOf(".") + 1).toLowerCase();
  if (!surcharge && t.defauts.get(ext) === type) return xml;
  if (!surcharge && !t.defauts.has(ext)) return xml.replace("</Types>", () => `<Default Extension="${ext}" ContentType="${type}"/></Types>`);
  if (t.surcharges.get(`/${chemin}`) === type) return xml;
  return xml.replace("</Types>", () => `<Override PartName="/${chemin}" ContentType="${type}"/></Types>`);
}
