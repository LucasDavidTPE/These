/**
 * Écriture d'un .pptx (Office Open XML) : un zip de fichiers XML, sans bibliothèque de
 * présentation. Une seule mise en page « vide » ; chaque élément (titre, puces, images,
 * pied de page) est placé explicitement, et le titre est un vrai titre (plan, lecteurs
 * d'écran). Le texte reste modifiable dans PowerPoint ; les images sont des images.
 */
import { zipSync, strToU8 } from "fflate";
import type { Bloc, Diapo, Presentation } from "./presentation";
import type { ModelePresentation } from "./modele";

export interface ImageChargee {
  octets: Uint8Array;
  type: "png" | "jpeg";
  largeur: number;
  hauteur: number;
}

const EMU = 914400;
const LARGEUR = 13.333;
const HAUTEUR = 7.5;
const emu = (pouces: number) => Math.round(pouces * EMU);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Dimensions d'un PNG ou d'un JPEG, lues dans leur en-tête ; null si le format n'est pas reconnu. */
export function dimensionsImage(b: Uint8Array): { type: "png" | "jpeg"; largeur: number; hauteur: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { type: "png", largeur: v.getUint32(16), hauteur: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marqueur = b[i + 1]!;
      if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
        return { type: "jpeg", hauteur: (b[i + 5]! << 8) | b[i + 6]!, largeur: (b[i + 7]! << 8) | b[i + 8]! };
      }
      i += 2 + ((b[i + 2]! << 8) | b[i + 3]!);
    }
  }
  return null;
}

/** « **gras** » et « *italique* » en morceaux de texte. */
function morceaux(texte: string): { t: string; b: boolean; i: boolean }[] {
  const out: { t: string; b: boolean; i: boolean }[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let dernier = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texte))) {
    if (m.index > dernier) out.push({ t: texte.slice(dernier, m.index), b: false, i: false });
    out.push({ t: (m[1] ?? m[2])!, b: m[1] !== undefined, i: m[2] !== undefined });
    dernier = m.index + m[0].length;
  }
  if (dernier < texte.length) out.push({ t: texte.slice(dernier), b: false, i: false });
  return out.length ? out : [{ t: "", b: false, i: false }];
}

interface Style {
  taille: number;
  couleur: string;
  police: string;
  gras?: boolean;
  italique?: boolean;
}

const rpr = (s: Style, b = false, i = false) =>
  `<a:rPr lang="fr-FR" sz="${Math.round(s.taille * 100)}" b="${s.gras || b ? 1 : 0}" i="${s.italique || i ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${s.couleur}"/></a:solidFill><a:latin typeface="${esc(s.police)}"/><a:cs typeface="${esc(s.police)}"/></a:rPr>`;

const run = (t: string, s: Style, b = false, i = false) => `<a:r>${rpr(s, b, i)}<a:t>${esc(t)}</a:t></a:r>`;

function paragraphe(texte: string, s: Style, opts: { puce?: number; align?: "l" | "ctr" | "r"; espace?: number; couleurPuce?: string } = {}): string {
  const niv = opts.puce ?? -1;
  const marge = niv >= 0 ? emu(0.35 + niv * 0.4) : 0;
  const ppr =
    niv >= 0
      ? `<a:pPr marL="${marge}" indent="${-emu(0.3)}" algn="l"><a:spcBef><a:spcPts val="${Math.round((opts.espace ?? 8) * 100)}"/></a:spcBef><a:buClr><a:srgbClr val="${opts.couleurPuce ?? s.couleur}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${niv === 0 ? "•" : "–"}"/></a:pPr>`
      : `<a:pPr algn="${opts.align ?? "l"}"><a:spcBef><a:spcPts val="${Math.round((opts.espace ?? 6) * 100)}"/></a:spcBef><a:buNone/></a:pPr>`;
  return `<a:p>${ppr}${morceaux(texte).map((m) => run(m.t, s, m.b, m.i)).join("")}</a:p>`;
}

let idForme = 0;
const prochainId = () => ++idForme;

interface Boite {
  x: number;
  y: number;
  w: number;
  h: number;
}

const xfrm = (b: Boite) => `<a:xfrm><a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${emu(b.w)}" cy="${emu(b.h)}"/></a:xfrm>`;

function zoneTexte(nom: string, b: Boite, paragraphes: string[], opts: { ancre?: "t" | "ctr" | "b"; titre?: boolean; sansMarge?: boolean } = {}): string {
  const id = prochainId();
  const ph = opts.titre ? `<p:nvPr><p:ph type="title"/></p:nvPr>` : `<p:nvPr/>`;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(nom)}"/><p:cNvSpPr${opts.titre ? ' txBox="0"' : ' txBox="1"'}/>${ph}</p:nvSpPr><p:spPr>${xfrm(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${opts.sansMarge ? 0 : 91440}" rIns="${opts.sansMarge ? 0 : 91440}" tIns="45720" bIns="45720" anchor="${opts.ancre ?? "t"}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paragraphes.join("")}</p:txBody></p:sp>`;
}

function rectangle(nom: string, b: Boite, couleur: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${prochainId()}" name="${esc(nom)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${couleur}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody></p:sp>`;
}

function image(nom: string, rid: string, b: Boite, alt: string): string {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${prochainId()}" name="${esc(nom)}" descr="${esc(alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

/** Plus grande image de mêmes proportions contenue dans la boîte, centrée. */
export function ajuster(largeur: number, hauteur: number, b: Boite): Boite {
  const k = Math.min(b.w / largeur, b.h / hauteur);
  const w = largeur * k;
  const h = hauteur * k;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
}

interface Contexte {
  m: ModelePresentation;
  images: ReadonlyMap<string, ImageChargee>;
  /** Relations de la diapo courante : image → identifiant. */
  rels: { id: string; cible: string }[];
  media: (src: string) => string | null;
}

function styleTexte(m: ModelePresentation): Style {
  return { taille: m.tailles.texte, couleur: m.couleurs.texte, police: m.polices.texte };
}

/** Le contenu d'une colonne : puces et textes empilés, images ajustées dans leur zone. */
function colonne(c: Contexte, blocs: Bloc[], b: Boite, formes: string[]): void {
  const s = styleTexte(c.m);
  const images = blocs.filter((x): x is Extract<Bloc, { type: "image" }> => x.type === "image");
  const texte = blocs.filter((x) => x.type !== "image");
  const hImages = images.length ? (texte.length ? b.h * 0.6 : b.h) : 0;
  if (texte.length) {
    const haut = images.length ? b.h - hImages : b.h;
    formes.push(
      zoneTexte(
        "Contenu",
        { ...b, h: haut },
        texte.map((x) =>
          x.type === "puce"
            ? paragraphe(x.texte, { ...s, taille: s.taille - x.niveau * 2 }, { puce: x.niveau, couleurPuce: c.m.couleurs.accent })
            : x.type === "equation"
              ? paragraphe(x.texte, { ...s, italique: true, police: "Cambria Math" }, { align: "ctr", espace: 14 })
              : paragraphe((x as { texte: string }).texte, s),
        ),
      ),
    );
  }
  if (images.length) {
    const zone = { x: b.x, y: b.y + (b.h - hImages), w: b.w, h: hImages };
    const hParImage = zone.h / images.length;
    images.forEach((im, i) => {
      const donnees = c.images.get(im.src);
      const cellule = { x: zone.x, y: zone.y + i * hParImage, w: zone.w, h: hParImage - (im.legende ? 0.4 : 0) };
      if (!donnees) {
        formes.push(zoneTexte("Image manquante", cellule, [paragraphe(`Image introuvable : ${im.src}`, { ...s, italique: true, couleur: c.m.couleurs.discret }, { align: "ctr" })], { ancre: "ctr" }));
        return;
      }
      const rid = c.media(im.src)!;
      formes.push(image(`Image ${i + 1}`, rid, ajuster(donnees.largeur, donnees.hauteur, cellule), im.legende || im.src));
      if (im.legende) formes.push(zoneTexte("Légende", { x: zone.x, y: cellule.y + cellule.h, w: zone.w, h: 0.4 }, [paragraphe(im.legende, { taille: 14, couleur: c.m.couleurs.discret, police: c.m.polices.texte, italique: true }, { align: "ctr", espace: 0 })], { ancre: "ctr" }));
    });
  }
}

const MARGE = 0.7;

function formesDiapo(c: Contexte, d: Diapo, numero: number): string[] {
  const { m } = c;
  const f: string[] = [];
  const titre: Style = { taille: m.tailles.titre, couleur: m.couleurs.titre, police: m.polices.titre, gras: true };
  const pleine = LARGEUR - 2 * MARGE;
  if (d.mise === "titre") {
    f.push(rectangle("Bandeau", { x: 0, y: 0, w: 0.35, h: HAUTEUR }, m.couleurs.accent));
    f.push(zoneTexte("Titre", { x: 1.2, y: 2.3, w: LARGEUR - 2.4, h: 1.8 }, [paragraphe(d.titre, { ...titre, taille: m.tailles.titre + 10 })], { ancre: "b", titre: true }));
    f.push(rectangle("Filet", { x: 1.3, y: 4.25, w: 2.4, h: 0.06 }, m.couleurs.accent));
    if (d.sousTitre) f.push(zoneTexte("Sous-titre", { x: 1.2, y: 4.45, w: LARGEUR - 2.4, h: 1.0 }, [paragraphe(d.sousTitre, { taille: m.tailles.texte, couleur: m.couleurs.discret, police: m.polices.texte })]));
    return f;
  }
  if (d.mise === "section") {
    f.push(rectangle("Fond de section", { x: 0, y: 2.4, w: LARGEUR, h: 2.7 }, m.couleurs.accent));
    f.push(zoneTexte("Titre", { x: 1.2, y: 2.55, w: LARGEUR - 2.4, h: 1.5 }, [paragraphe(d.titre, { ...titre, taille: m.tailles.titre + 6, couleur: "FFFFFF" })], { ancre: "b", titre: true }));
    if (d.sousTitre) f.push(zoneTexte("Sous-titre", { x: 1.2, y: 4.05, w: LARGEUR - 2.4, h: 0.9 }, [paragraphe(d.sousTitre, { taille: m.tailles.texte, couleur: "FFFFFF", police: m.polices.texte })]));
  } else {
    f.push(zoneTexte("Titre", { x: MARGE, y: 0.4, w: pleine, h: 1.0 }, [paragraphe(d.titre, titre)], { ancre: "ctr", titre: true }));
    f.push(rectangle("Filet", { x: MARGE + 0.1, y: 1.42, w: 1.6, h: 0.05 }, m.couleurs.accent));
    const haut = 1.7;
    const bas = HAUTEUR - 1.0 - (d.source ? 0.4 : 0);
    if (d.mise === "deux-colonnes") {
      const l = (pleine - 0.4) / 2;
      colonne(c, d.gauche, { x: MARGE, y: haut, w: l, h: bas - haut }, f);
      colonne(c, d.droite, { x: MARGE + l + 0.4, y: haut, w: l, h: bas - haut }, f);
    } else colonne(c, [...d.gauche, ...d.droite], { x: MARGE, y: haut, w: pleine, h: bas - haut }, f);
  }
  if (d.source) f.push(zoneTexte("Source", { x: MARGE, y: HAUTEUR - 1.4, w: pleine, h: 0.4 }, [paragraphe(d.source, { taille: 12, couleur: m.couleurs.discret, police: m.polices.texte, italique: true }, { espace: 0 })], { ancre: "b" }));
  const pied: Style = { taille: 11, couleur: m.couleurs.discret, police: m.polices.texte };
  if (m.pied) f.push(zoneTexte("Pied de page", { x: MARGE, y: HAUTEUR - 0.6, w: pleine - 1.5, h: 0.4 }, [paragraphe(m.pied, pied, { espace: 0 })], { ancre: "ctr" }));
  if (m.numeros) f.push(zoneTexte("Numéro", { x: LARGEUR - MARGE - 1.2, y: HAUTEUR - 0.6, w: 1.2, h: 0.4 }, [`<a:p><a:pPr algn="r"/><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rpr(pied)}<a:t>${numero}</a:t></a:fld></a:p>`], { ancre: "ctr" }));
  return f;
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const groupe = `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;

function theme(m: ModelePresentation): string {
  const c = m.couleurs;
  const ligne = (n: number) => `<a:ln w="${n}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  const plein = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  return `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(m.nom)}"><a:themeElements><a:clrScheme name="${esc(m.nom)}"><a:dk1><a:srgbClr val="${c.texte}"/></a:dk1><a:lt1><a:srgbClr val="${c.fond}"/></a:lt1><a:dk2><a:srgbClr val="${c.titre}"/></a:dk2><a:lt2><a:srgbClr val="${c.fond}"/></a:lt2><a:accent1><a:srgbClr val="${c.accent}"/></a:accent1><a:accent2><a:srgbClr val="${c.titre}"/></a:accent2><a:accent3><a:srgbClr val="${c.discret}"/></a:accent3><a:accent4><a:srgbClr val="${c.accent}"/></a:accent4><a:accent5><a:srgbClr val="${c.titre}"/></a:accent5><a:accent6><a:srgbClr val="${c.discret}"/></a:accent6><a:hlink><a:srgbClr val="${c.accent}"/></a:hlink><a:folHlink><a:srgbClr val="${c.discret}"/></a:folHlink></a:clrScheme><a:fontScheme name="${esc(m.nom)}"><a:majorFont><a:latin typeface="${esc(m.polices.titre)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(m.polices.texte)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${plein}${plein}${plein}</a:fillStyleLst><a:lnStyleLst>${ligne(6350)}${ligne(12700)}${ligne(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${plein}${plein}${plein}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

/** Le fichier .pptx d'une présentation ; `images` associe chaque référence d'image à ses octets. */
export function construirePptx(p: Presentation, m: ModelePresentation, images: ReadonlyMap<string, ImageChargee>): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {};
  const ajouter = (chemin: string, contenu: string) => (fichiers[chemin] = strToU8(contenu));
  const medias = new Map<string, string>();
  const nombre = p.diapos.length;

  p.diapos.forEach((d, i) => {
    idForme = 1;
    const rels: { id: string; cible: string }[] = [];
    const c: Contexte = {
      m,
      images,
      rels,
      media: (src) => {
        const im = images.get(src);
        if (!im) return null;
        let fichier = medias.get(src);
        if (!fichier) {
          fichier = `image${medias.size + 1}.${im.type === "jpeg" ? "jpg" : "png"}`;
          medias.set(src, fichier);
          fichiers[`ppt/media/${fichier}`] = im.octets;
        }
        const id = `rId${rels.length + 2}`;
        rels.push({ id, cible: `../media/${fichier}` });
        return id;
      },
    };
    const formes = formesDiapo(c, d, i + 1);
    ajouter(`ppt/slides/slide${i + 1}.xml`, `${XML}<p:sld ${NS}><p:cSld><p:spTree>${groupe}${formes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    ajouter(
      `ppt/slides/_rels/slide${i + 1}.xml.rels`,
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${rels.map((r) => `<Relationship Id="${r.id}" Type="${REL}/image" Target="${r.cible}"/>`).join("")}</Relationships>`,
    );
  });

  ajouter("ppt/theme/theme1.xml", theme(m));
  ajouter(
    "ppt/slideMasters/slideMaster1.xml",
    `${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${m.couleurs.fond}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>${groupe}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titre"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm({ x: MARGE, y: 0.4, w: LARGEUR - 2 * MARGE, h: 1.0 })}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>Titre</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="${m.tailles.titre * 100}" b="1"><a:solidFill><a:srgbClr val="${m.couleurs.titre}"/></a:solidFill><a:latin typeface="${esc(m.polices.titre)}"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr algn="l"><a:defRPr sz="${m.tailles.texte * 100}"><a:solidFill><a:srgbClr val="${m.couleurs.texte}"/></a:solidFill><a:latin typeface="${esc(m.polices.texte)}"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800"><a:solidFill><a:srgbClr val="${m.couleurs.texte}"/></a:solidFill><a:latin typeface="${esc(m.polices.texte)}"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
  );
  ajouter("ppt/slideMasters/_rels/slideMaster1.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`);
  ajouter(
    "ppt/slideLayouts/slideLayout1.xml",
    `${XML}<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Titre seul"><p:spTree>${groupe}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Titre"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm({ x: MARGE, y: 0.4, w: LARGEUR - 2 * MARGE, h: 1.0 })}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR"/><a:t>Titre</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  ajouter("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  ajouter(
    "ppt/presentation.xml",
    `${XML}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${p.diapos.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${emu(LARGEUR)}" cy="${emu(HAUTEUR)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  ajouter(
    "ppt/_rels/presentation.xml.rels",
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>${p.diapos.map((_, i) => `<Relationship Id="rId${i + 3}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  ajouter("_rels/.rels", `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  ajouter(
    "docProps/core.xml",
    `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(p.titre)}</dc:title><dc:creator>${esc(p.auteur)}</dc:creator></cp:coreProperties>`,
  );
  ajouter(
    "[Content_Types].xml",
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>${Array.from({ length: nombre }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
  );
  // [Content_Types].xml en premier : certains lecteurs l'attendent en tête d'archive.
  const ordre = ["[Content_Types].xml", ...Object.keys(fichiers).filter((k) => k !== "[Content_Types].xml")];
  return zipSync(Object.fromEntries(ordre.map((k) => [k, fichiers[k]!])), { level: 6 });
}
