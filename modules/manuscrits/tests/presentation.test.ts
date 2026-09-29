import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { lireModele, MODELES_DE_BASE, trouverModele } from "../core/modele";
import { construirePptx, dimensionsImage, ajuster, type ImageChargee } from "../core/pptx";
import { analyserPresentation, avecModele, EXEMPLE_PRESENTATION, imagesDe } from "../core/presentation";

// PNG 1×1 rouge, 70 octets.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

describe("analyse du Markdown", () => {
  const p = analyserPresentation(EXEMPLE_PRESENTATION);

  it("lit l'en-tête et crée la diapo de titre", () => {
    expect(p.titre).toBe("Comité de suivi de thèse");
    expect(p.auteur).toBe("Prénom Nom");
    expect(p.modele).toBe("sobre-clair");
    expect(p.diapos[0]).toMatchObject({ mise: "titre", titre: "Comité de suivi de thèse", sousTitre: "Prénom Nom · 2026-10-12" });
  });

  it("déduit la mise en page", () => {
    expect(p.diapos.map((d) => d.mise)).toEqual(["titre", "contenu", "deux-colonnes", "figure", "section"]);
  });

  it("puces à niveaux, source, colonnes, image", () => {
    const [, contenu, deux, figure, section] = p.diapos;
    expect(contenu!.gauche.filter((b) => b.type === "puce").map((b) => (b.type === "puce" ? b.niveau : -1))).toEqual([0, 1, 1, 0]);
    expect(contenu!.source).toBe("Huang 2004");
    expect(deux!.gauche).toHaveLength(2);
    expect(deux!.droite).toHaveLength(2);
    expect(figure!.gauche[0]).toEqual({ type: "image", legende: "Module complexe, courbes maîtresses", src: "figure:FIG-0001" });
    expect(section).toMatchObject({ titre: "Suite du travail", sousTitre: "Prochaines étapes" });
    expect(imagesDe(p)).toEqual(["figure:FIG-0001"]);
  });

  it("sans en-tête : pas de diapo de titre ; la mise en page peut être imposée", () => {
    const q = analyserPresentation("# A\nmise-en-page: section\n- x\n---\n# B\n- y");
    expect(q.diapos.map((d) => [d.mise, d.titre])).toEqual([["section", "A"], ["contenu", "B"]]);
  });
});

describe("modèle dans l'en-tête", () => {
  it("remplace, ajoute ou crée la ligne « modèle: »", () => {
    expect(analyserPresentation(avecModele(EXEMPLE_PRESENTATION, "sombre")).modele).toBe("sombre");
    expect(avecModele("titre: T\n\n---\n# A", "sombre")).toBe("titre: T\nmodèle: sombre\n\n---\n# A");
    const sans = avecModele("# A\n- x", "sombre");
    expect(analyserPresentation(sans).modele).toBe("sombre");
    expect(analyserPresentation(sans).diapos.map((d) => d.titre)).toEqual(["A"]);
  });
});

describe("modèles", () => {
  it("lit un modèle partiel en complétant par les valeurs de base", () => {
    const m = lireModele({ nom: "Perso", couleurs: { accent: "#ff0000", titre: "pas une couleur" }, tailles: { texte: 500 } });
    expect(m.couleurs.accent).toBe("FF0000");
    expect(m.couleurs.titre).toBe(MODELES_DE_BASE[0]!.couleurs.titre);
    expect(m.tailles.texte).toBe(MODELES_DE_BASE[0]!.tailles.texte);
    expect(m.numeros).toBe(true);
  });

  it("retrouve un modèle par son nom ou son slug, sinon le premier", () => {
    expect(trouverModele(MODELES_DE_BASE, "sombre").nom).toBe("Sombre");
    expect(trouverModele(MODELES_DE_BASE, "Bleu institutionnel").nom).toBe("Bleu institutionnel");
    expect(trouverModele(MODELES_DE_BASE, "inconnu").nom).toBe("Sobre clair");
  });
});

describe("pptx", () => {
  const images = new Map<string, ImageChargee>([["figure:FIG-0001", { octets: PNG, type: "png", largeur: 1, hauteur: 1 }]]);
  const zip = unzipSync(construirePptx(analyserPresentation(EXEMPLE_PRESENTATION), MODELES_DE_BASE[0]!, images));
  const texte = (k: string) => strFromU8(zip[k]!);

  it("contient les parties obligatoires et une diapo par section", () => {
    for (const k of ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/slideMasters/slideMaster1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml", "ppt/media/image1.png"]) expect(zip[k], k).toBeDefined();
    expect(Object.keys(zip).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toHaveLength(5);
    expect(Object.keys(zip)[0]).toBe("[Content_Types].xml");
    expect(texte("ppt/presentation.xml").match(/<p:sldId /g)).toHaveLength(5);
  });

  it("chaque partie XML est bien formée et échappée", () => {
    const q = analyserPresentation("# R&D <test> \"a\"\n- **gras** et *italique*");
    const z = unzipSync(construirePptx(q, MODELES_DE_BASE[1]!, new Map()));
    for (const [k, v] of Object.entries(z)) if (/\.(xml|rels)$/.test(k)) expect(strFromU8(v), k).toMatch(/^<\?xml/);
    const s = strFromU8(z["ppt/slides/slide1.xml"]!);
    expect(s).toContain("R&amp;D &lt;test&gt; &quot;a&quot;");
    expect(s).toMatch(/b="1"[^>]*>.*<a:t>gras<\/a:t>/);
  });

  it("le numéro de diapo est un champ valide (rPr puis t, sans run imbriqué)", () => {
    expect(texte("ppt/slides/slide2.xml")).toMatch(/<a:fld [^>]*type="slidenum"><a:rPr [^>]*>.*<\/a:rPr><a:t>2<\/a:t><\/a:fld>/);
  });

  it("image manquante : texte de remplacement, pas d'échec", () => {
    const z = unzipSync(construirePptx(analyserPresentation(EXEMPLE_PRESENTATION), MODELES_DE_BASE[0]!, new Map()));
    expect(strFromU8(z["ppt/slides/slide4.xml"]!)).toContain("Image introuvable : figure:FIG-0001");
  });

  it("dimensions PNG et JPEG, ajustement dans une boîte", () => {
    expect(dimensionsImage(PNG)).toEqual({ type: "png", largeur: 1, hauteur: 1 });
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x00, 0xc8, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(dimensionsImage(jpeg)).toEqual({ type: "jpeg", largeur: 200, hauteur: 100 });
    expect(dimensionsImage(Uint8Array.from([1, 2, 3]))).toBeNull();
    const b = ajuster(200, 100, { x: 0, y: 0, w: 10, h: 10 });
    expect(b).toEqual({ x: 0, y: 2.5, w: 10, h: 5 });
  });
});
