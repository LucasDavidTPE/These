/**
 * Plateforme de démonstration, en mémoire : l'interface tourne dans un navigateur
 * (`npm run dev`) sans Tauri, pour la développer et la vérifier. Rien n'est écrit sur disque.
 *
 * `?scenario=complet` prépare un poste déjà installé, avec de quoi remplir « À régler » :
 * une copie de conflit OneDrive, une écriture interrompue et une racine absente.
 */
import { ecrireReglages } from "@noyau/poste/reglages";
import { FichiersMemoire, type Fichiers } from "@noyau/stockage";
import type { Plateforme } from "@interface/plateforme";
import { strToU8, zipSync } from "fflate";
import { ZoteroFactice } from "@interface/zoteroFactice";

const ONEDRIVE = "C:\\Users\\DAVID\\OneDrive - entpe.fr";
const ESPACE = `${ONEDRIVE}\\Thèse\\Espace`;
const BIBLIO = `${ONEDRIVE}\\Thèse\\BIBLIO`;
const RECHERCHE = "C:\\Users\\DAVID\\Desktop\\Recherche";

/** Essai de démonstration au format WaveMatrix : paliers de température, force cyclique. */
/** Un petit PDF d'une page (titre, auteurs, un peu de texte), pour l'aperçu de la Bibliothèque. */
function pdfDemo(titre: string, auteurs: string): string {
  const lignes = [`BT /F1 22 Tf 60 740 Td (${titre}) Tj ET`, `BT /F1 13 Tf 60 712 Td (${auteurs}) Tj ET`, ...Array.from({ length: 30 }, (_, i) => `BT /F1 10 Tf 60 ${660 - i * 16} Td (Lorem ipsum dolor sit amet, consectetur adipiscing elit, ligne ${i + 1}.) Tj ET`)];
  const flux = lignes.join("\n");
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const pos: number[] = [];
  objets.forEach((o, i) => {
    pos.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  return pdf + `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

/** Un petit .docx (titres, texte, consignes « À rédiger », un commentaire, une modification suivie) pour le plan des manuscrits. */
function docxDemo(titre: string, sections: string[], consignes: number, avecRetours = false): Uint8Array {
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
  const p = (t: string, style = "") => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.";
  const corps =
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:bookmarkStart w:id="1" w:name="CHAP"/><w:r><w:t>${titre}</w:t></w:r></w:p>` +
    sections.map((t, i) => p(t, "Heading2") + p(lorem.repeat(1 + (i % 3))) + (i < consignes ? p("À rédiger : développer ce point avec les références de la Bibliothèque.", "Consigne") : "")).join("") +
    (avecRetours
      ? '<w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Passage relu par Sergio.</w:t></w:r><w:commentRangeEnd w:id="0"/></w:p>' +
        '<w:p><w:r><w:t xml:space="preserve">Une </w:t></w:r><w:ins w:id="7" w:author="Sergio" w:date="2026-09-30T10:00:00Z"><w:r><w:t>nouvelle formulation</w:t></w:r></w:ins><w:del w:id="8" w:author="Sergio" w:date="2026-09-30T10:00:00Z"><w:r><w:delText>ancienne formule</w:delText></w:r></w:del><w:r><w:t>.</w:t></w:r></w:p>'
      : "") +
    "<w:sectPr/>";
  const f: Record<string, Uint8Array> = {
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document ${ns}><w:body>${corps}</w:body></w:document>`),
    "word/styles.xml": strToU8(`<w:styles ${ns}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style><w:style w:styleId="Consigne"><w:name w:val="Consigne"/></w:style></w:styles>`),
    "docProps/core.xml": strToU8(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${titre}</dc:title><dcterms:modified>2026-10-01T09:30:00Z</dcterms:modified></cp:coreProperties>`),
  };
  const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const rels = [`<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>`];
  let ct =
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>';
  if (avecRetours) {
    f["word/comments.xml"] = strToU8(`<w:comments ${ns}><w:comment w:id="0" w:author="Sergio" w:date="2026-09-30T09:00:00Z"><w:p w14:paraId="A1"><w:r><w:t>Préciser la source de cette valeur.</w:t></w:r></w:p></w:comment></w:comments>`);
    rels.push(`<Relationship Id="rId2" Type="${REL}/comments" Target="comments.xml"/>`);
    ct += '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>';
  }
  f["word/_rels/document.xml.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  f["_rels/.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`);
  f["[Content_Types].xml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct}</Types>`);
  return zipSync(f);
}

function essaiDemo(): Record<string, string> {
  const l = ['"Nombre total de cycles";"Temps total (s)";"Force(8800 (0,1):Charge) (kN)";"Personnalisée(103 (0,3):Lion171144) (µm)";"Personnalisée(103 (0,5):Défini par utilisateur) (°C)";'];
  for (let i = 0; i < 6000; i++) {
    const t = i * 30;
    const palier = [-10, 0, 10, 20, 30][Math.min(4, Math.floor(i / 1200))]!;
    const f = Math.sin(t / 7) * (2.5 - palier / 20);
    l.push([Math.floor(i / 20) + 1, t, f.toFixed(3), (f * 12).toFixed(2), (palier + Math.sin(i / 40) * 0.2).toFixed(2), ""].join(";").replace(/\./g, ","));
  }
  const log = [
    "01/06/2026;09:00:00;Demo;Essai1;60101;Création;",
    "01/06/2026;09:00:00;Demo;Essai1;60107;Utilisateur;ltds",
    "03/06/2026;11:00:00;Demo;Essai1;60121;Forme d'onde;1200",
    "03/06/2026;11:00:00;Demo;Essai1;60120;Durée;180000",
    "03/06/2026;11:00:00;Demo;Essai1;60202;État;Essai terminé",
  ].join("\n");
  return { "Demo CM/Essai1/Essai1.steps.tracking.csv": l.join("\n"), "Demo CM/Essai1/Essai1.log": log };
}

function normaliser(chemin: string): string {
  return chemin.replace(/[\\/]+$/, "").toLowerCase();
}

/** Enveloppe qui prévient les abonnés après chaque écriture, comme le ferait la surveillance. */
function observe(fs: FichiersMemoire, prevenir: (chemin: string) => void): Fichiers {
  const apres =
    <A extends unknown[]>(f: (...a: A) => Promise<void>) =>
    async (...a: A) => {
      await f(...a);
      prevenir(String(a[0]));
    };
  return {
    listDir: (p) => fs.listDir(p),
    exists: (p) => fs.exists(p),
    readText: (p) => fs.readText(p),
    readBytes: (p) => fs.readBytes(p),
    writeTextAtomic: apres((p: string, c: string) => fs.writeTextAtomic(p, c)),
    writeBytesAtomic: apres((p: string, c: Uint8Array) => fs.writeBytesAtomic(p, c)),
    writeTextNew: apres((p: string, c: string) => fs.writeTextNew(p, c)),
    createDir: apres((p: string) => fs.createDir(p)),
    ensureDir: apres((p: string) => fs.ensureDir(p)),
    rename: apres((de: string, vers: string) => fs.rename(de, vers)),
  };
}

export function plateformeDemo(scenario: string | null): Plateforme {
  const dossiers = new Map<string, FichiersMemoire>();
  const abonnes = new Map<string, Set<(chemins: string[]) => void>>();
  let reglages: string | null = null;

  /** Dossier démo qui contient `chemin`, et le chemin relatif à l'intérieur. */
  const parent = (chemin: string): [FichiersMemoire, string] | null => {
    const cle = normaliser(chemin);
    for (const [k, fs] of dossiers) {
      if (cle.startsWith(k + "\\")) return [fs, chemin.replace(/[\\/]+$/, "").slice(k.length + 1).split("\\").join("/")];
    }
    return null;
  };

  const dossier = (chemin: string) => {
    const cle = normaliser(chemin);
    let fs = dossiers.get(cle);
    if (!fs) {
      fs = new FichiersMemoire();
      dossiers.set(cle, fs);
    }
    return fs;
  };

  if (scenario === "complet") {
    reglages = ecrireReglages({
      version: 1,
      espace: ESPACE,
      figures: `${ONEDRIVE}\\Figurine`,
      racines: { essais: "E:\\", "biblio-pdf": BIBLIO, recherche: RECHERCHE, manuscrits: `${ONEDRIVE}\\Thèse\\Rédaction` },
      zotero: null,
    });
    const espace = dossier(ESPACE);
    espace.poser("espace.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:00:00+02:00",\n  "creePar": "LGCB-AA03956"\n}\n');
    espace.poser("espace-PC-MAISON.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:05:00+02:00",\n  "creePar": "PC-MAISON"\n}\n');
    espace.poser("espace.json.tmp", "{");
    dossier(BIBLIO);
    dossier(`${ONEDRIVE}\\Thèse\\Rédaction`).poser("Manuscrit thèse.docx", "PK démonstration");
    const recherche = dossier(RECHERCHE);
    for (const [chemin, contenu] of Object.entries(essaiDemo())) recherche.poser(chemin, contenu);
  }

  // `?scenario=complet&contenu=1` : un espace déjà garni (pour essayer la recherche globale).
  if (scenario === "complet" && new URLSearchParams(globalThis.location?.search).get("contenu")) {
    const espace = dossier(ESPACE);
    const ref = (n: number, titre: string, auteurs: string, annee: number) => espace.poser(`bibliotheque/references/BIB-${String(n).padStart(3, "0")}.json`, JSON.stringify({ titre, auteurs, annee, cle: `ref${n}` }));
    ref(1, "Viscoelastic response of asphalt pavements under moving loads", "Lee, S.; Kim, J.", 2019);
    ref(2, "Spectral method for layered media", "David, L.", 2024);
    ref(20, "General 2S2P1D model and relation between the linear viscoelastic behaviours of bituminous binders and mixes", "Olard, F.; Di Benedetto, H.", 2003);
    espace.poser("bibliotheque/references/BIB-020.json", JSON.stringify({ titre: "General 2S2P1D model and relation between the linear viscoelastic behaviours of bituminous binders and mixes", auteurs: "Olard, F.; Di Benedetto, H.", annee: 2003, cle: "ref20", fichierPdf: "BIB-020_Olard-DiBenedetto_2003_General-2S2P1D-model.pdf" }));
    dossier(`${ESPACE}\\bibliotheque\\pdf`).poser("BIB-020_Olard-DiBenedetto_2003_General-2S2P1D-model.pdf", pdfDemo("General 2S2P1D model", "F. Olard, H. Di Benedetto (2003)"));
    ref(65, "The general theory of stresses and displacements in layered systems", "Burmister, D. M.", 1945);
    espace.poser(
      "manuscrits/these/manuscrit.json",
      JSON.stringify({
        version: 1,
        titre: "Thèse",
        parties: [
          { id: "introduction-generale", nom: "Introduction générale", source: "espace:manuscrits/these/parties/00_Introduction_generale.docx", genre: "chapitre", statut: "redaction", objectifMots: 3000 },
          { id: "chapitre1-etat-de-l-art", nom: "Chapitre1 Etat de l art", source: "espace:manuscrits/these/parties/01_Chapitre1_Etat_de_l_art.docx", genre: "chapitre", statut: "relecture", objectifMots: 12000 },
          { id: "chapitre2-cadre-theorique", nom: "Chapitre2 Cadre theorique", source: "ailleurs:Thèse/02_Chapitre2_Cadre_theorique.docx", genre: "chapitre", statut: "squelette", objectifMots: null },
        ],
      }),
    );
    espace.poser(
      "manuscrits/article-prony/manuscrit.json",
      JSON.stringify({
        version: 1,
        type: "article",
        titre: "Article Prony",
        parties: [
          { id: "article", nom: "Article", source: "espace:manuscrits/article-prony/parties/Article_Prony.docx", genre: "chapitre", statut: "redaction", objectifMots: 6000 },
          // le dossier « manuscrits » de ce PC ne le contient pas : l'appli le retrouve à côté de l'espace
          { id: "annexes", nom: "Annexes Prony", source: "manuscrits:Annexes_Prony.docx", genre: "annexe", statut: "squelette", objectifMots: null },
        ],
      }),
    );
    void (async () => {
      const parentEspace = dossier(`${ONEDRIVE}\\Thèse`);
      await parentEspace.ensureDir("Documents");
      await parentEspace.writeBytesAtomic("Documents/Annexes_Prony.docx", docxDemo("Annexes", ["A. Données brutes"], 1));
      await espace.ensureDir("manuscrits/article-prony/parties");
      await espace.writeBytesAtomic("manuscrits/article-prony/parties/Article_Prony.docx", docxDemo("Calage de séries de Prony", ["Introduction", "Méthode", "Résultats"], 2));
      await espace.ensureDir("manuscrits/these/parties");
      await espace.writeBytesAtomic("manuscrits/these/parties/00_Introduction_generale.docx", docxDemo("Introduction générale", ["Contexte", "Problématique", "Plan du manuscrit"], 2));
      await espace.writeBytesAtomic("manuscrits/these/parties/01_Chapitre1_Etat_de_l_art.docx", docxDemo("Chapitre 1 – État de l'art", ["1.1 Chaussées aéronautiques", "1.2 Matériaux bitumineux", "1.3 Contact pneumatique-chaussée", "1.4 Modélisation multicouche"], 3, true));
    })();
    espace.poser(
      "manuscrits/these/retours/2026-09-30_sergio_chapitre1-etat-de-l-art/retour.json",
      JSON.stringify({
        id: "2026-09-30_sergio_chapitre1-etat-de-l-art",
        partie: "chapitre1-etat-de-l-art",
        de: "Sergio",
        recu: "2026-09-30",
        note: "Relecture avant le comité",
        fichier: "Chapitre 1 relu.docx",
        type: "docx",
        taille: 0,
        empreinte: "00000000",
        base: "",
        ajoute: "2026-09-30T18:00:00+02:00",
        poste: "PC-DEMO",
        remarques: [
          { id: "c0", genre: "commentaire", auteur: "Sergio", date: "2026-09-30T09:00:00Z", texte: "Préciser la source de cette valeur.", ancre: "Passage relu par Sergio.", titre: "1.4 Modélisation multicouche", page: null, etat: "a-traiter", note: "" },
          { id: "m0", genre: "modification", auteur: "Sergio", date: "2026-09-30T10:00:00Z", texte: "« ancienne formule » → « nouvelle formulation »", ancre: "Une nouvelle formulation.", titre: "1.4 Modélisation multicouche", page: null, etat: "traitee", note: "repris" },
        ],
      }),
    );
    espace.poser("planning/PH-0001.json", JSON.stringify({ titre: "Rédiger le chapitre ChaussSpec", categorie: "", debut: "2026-10-05", fin: "2026-10-30" }));
    espace.poser(
      "chausspec/structure-a340.json",
      JSON.stringify({
        structure: { bottom: "rigid_smooth", layers: [{ name: "BB", h: 0.3, material: { type: "elastic", E: 5000, nu: 0.35 } }, { name: "Sol", h: 2, material: { type: "elastic", E: 100, nu: 0.35 } }] },
        loading: { wheels: [{ x0: 0, y0: 0, footprint: { type: "rect", lx: 0.5, ly: 0.4, force: 100000 } }] },
        regime: { type: "static" },
        grid: { L: [16, 16], N: [256, 256], window: [-2, 2, -2, 2] },
        outputs: { depths: [0], components: ["uz"] },
      }),
    );
    espace.poser("numeriseur/courbe-tsrst.json", "{}");
    const hier = new Date(Date.now() - 86_400_000);
    const j = `${hier.getFullYear()}-${String(hier.getMonth() + 1).padStart(2, "0")}-${String(hier.getDate()).padStart(2, "0")}`;
    espace.poser(`journal/${j}.md`, "# Hier\n\n## À faire\n- [x] Caler 2S2P1D sur Essai1\n- [ ] Relire le chapitre 2\n- [ ] Répondre au mail de Sergio\n\n## Notes\nRéunion : **valider la structure PEP** avant vendredi.\n");
    espace.poser("campagnes/demo-cm/campagne.json", JSON.stringify({ titre: "Module complexe démo", type: "module-complexe", statut: "en cours", donnees: "recherche:Demo CM" }));
    espace.poser("campagnes/demo-cm/essais/Essai1/essai.json", "{}");
    espace.poser("campagnes/autre/campagne.json", JSON.stringify({ titre: "Autre campagne", type: "module-complexe", statut: "en cours", donnees: "" }));
    const figures = dossier(`${ESPACE}\\figures`);
    figures.poser("FIG-0001_courbe/meta.json", JSON.stringify({ id: "FIG-0001", title: "Courbe maîtresse", kind: "graph", created: "2026-09-20T10:00:00Z", modified: "2026-09-20T10:00:00Z", tags: ["2s2p1d"], used_in: [] }));
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    void figures.writeBytesAtomic("FIG-0001_courbe/export.png", png);
    figures.poser("FIG-0002_long/meta.json", JSON.stringify({ id: "FIG-0002", title: "Comparaison_des_modules_complexes_2S2P1D_COMSOL_Viscoroute_vitesse_0.66_ms_essai_TSRST_final", kind: "graph", created: "2026-09-21T10:00:00Z", modified: "2026-09-21T10:00:00Z", tags: [], used_in: [] }));
    figures.poser("FIG-0003_long/meta.json", JSON.stringify({ id: "FIG-0003", title: "Schéma du modèle de Huet-Sayegh généralisé avec amortisseurs paraboliques", kind: "schema", created: "2026-09-22T10:00:00Z", modified: "2026-09-22T10:00:00Z", tags: [], used_in: [] }));
  }

  // Zotero de démonstration : toute clé est acceptée ; Burmister (1945) y est déjà.
  const zotero = new ZoteroFactice("*");
  const burmister = zotero.ajouter({ itemType: "journalArticle", title: "The general theory of stresses and displacements in layered systems", date: "1945", creators: [{ creatorType: "author", lastName: "Burmister", firstName: "D. M." }], tags: [{ tag: "multicouche" }] });
  zotero.ajouterPdf(burmister, "burmister1945.pdf", pdfDemo("The general theory of stresses", "D. M. Burmister (1945)"));

  return {
    genre: "demo",
    nomDuPoste: async () => "PC-DEMO",
    lireReglages: async () => reglages,
    ecrireReglages: async (c) => {
      reglages = c;
    },
    dossiersOneDrive: async () => [ONEDRIVE],
    choisirDossier: async (titre, depart) => window.prompt(`${titre} (démonstration : saisissez un chemin)`, depart ?? "") || null,
    dossierExiste: async (chemin) => {
      if (dossiers.has(normaliser(chemin))) return true;
      const p = parent(chemin);
      return p ? p[0].exists(p[1]) : false;
    },
    creerDossier: async (chemin) => {
      dossier(chemin);
    },
    copierDossier: async function (source, destination, options) {
      const src = this.fichiers(source);
      const dst = this.fichiers(destination);
      const r = { copies: 0, aJour: 0, octets: 0 };
      const copier = async (chemin: string) => {
        await dst.ensureDir(chemin);
        for (const e of await src.listDir(chemin)) {
          const c = chemin ? `${chemin}/${e.name}` : e.name;
          if (e.kind === "dir") await copier(c);
          else if (options?.sansEcraser && (await dst.exists(c))) r.aJour++;
          else {
            const octets = await src.readBytes(c);
            await dst.writeBytesAtomic(c, octets);
            r.copies++;
            r.octets += octets.length;
          }
        }
      };
      await copier("");
      return r;
    },
    archiverDossier: async function (source, nom) {
      const src = this.fichiers(source);
      const contenu: Record<string, Uint8Array> = {};
      let octets = 0;
      const parcourir = async (chemin: string) => {
        for (const e of await src.listDir(chemin)) {
          const c = chemin ? `${chemin}/${e.name}` : e.name;
          if (e.kind === "dir") await parcourir(c);
          else if (!/\.(tmp|lock)$/i.test(e.name)) {
            contenu[c] = await src.readBytes(c);
            octets += contenu[c].length;
          }
        }
      };
      await parcourir("");
      const ok = await this.enregistrerSous(nom, zipSync(contenu, { level: 6 }));
      return ok ? { fichiers: Object.keys(contenu).length, octets } : null;
    },
    fichiers: (racine) => {
      const sous = !dossiers.has(normaliser(racine)) ? parent(racine) : null;
      if (sous) {
        // Sous-dossier d'un dossier démo (données d'un essai) : lecture seule suffit.
        const [fs, prefixe] = sous;
        const p = (c: string) => (c ? `${prefixe}/${c}` : prefixe);
        return { ...observe(fs, () => undefined), listDir: (c) => fs.listDir(p(c)), exists: (c) => fs.exists(p(c)), readText: (c) => fs.readText(p(c)), readBytes: (c) => fs.readBytes(p(c)) };
      }
      const cle = normaliser(racine);
      return observe(dossier(racine), (chemin) => {
        for (const rappel of abonnes.get(cle) ?? []) rappel([chemin]);
      });
    },
    supprimerTemporaire: async (racine, chemin) => {
      if (!chemin.endsWith(".tmp")) throw new Error("Seuls les fichiers .tmp peuvent être supprimés.");
      dossier(racine).supprimer(chemin);
      for (const rappel of abonnes.get(normaliser(racine)) ?? []) rappel([chemin]);
    },
    enregistrerSous: async (nom, octets) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([octets as BlobPart]));
      a.download = nom;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return true;
    },
    ouvrirFichier: (_titre, extensions) =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = extensions.map((e) => `.${e}`).join(",");
        input.onchange = async () => {
          const f = input.files?.[0];
          resolve(f ? { nom: f.name, octets: new Uint8Array(await f.arrayBuffer()) } : null);
        };
        input.click();
      }),
    verifierMiseAJour: async () =>
      scenario === "maj"
        ? { version: "9.9.9", notes: "Démonstration.", installer: async () => window.alert("Démonstration : l'application se mettrait à jour puis redémarrerait.") }
        : null,
    ouvrirVSCode: async (chemin) => {
      window.alert(`Démonstration : VS Code s'ouvrirait sur\n${chemin}`);
    },
    ouvrirDossier: async (chemin) => {
      window.alert(`Démonstration : l'Explorateur s'ouvrirait sur\n${chemin}`);
    },
    ouvrirLien: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    verifierLien: async (url) => {
      // Démonstration : aucune requête ; une réponse plausible, stable pour une adresse.
      await new Promise((ok) => setTimeout(ok, 60));
      const h = [...url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const code = h % 11 === 0 ? 404 : h % 7 === 0 ? 403 : 200;
      return { code, urlFinale: url, erreur: "" };
    },
    zotero: async (requete) => {
      await new Promise((ok) => setTimeout(ok, 40));
      return zotero.traiter(requete);
    },
    zoteroFichier: async (chemin, cle) => {
      await new Promise((ok) => setTimeout(ok, 40));
      return zotero.fichier(chemin, cle);
    },
    surveiller: async (racine, rappel) => {
      const cle = normaliser(racine);
      const set = abonnes.get(cle) ?? new Set();
      set.add(rappel);
      abonnes.set(cle, set);
      return () => set.delete(rappel);
    },
  };
}
