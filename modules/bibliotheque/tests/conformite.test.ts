/**
 * Conformité au classeur (SPEC §9.4) : on importe `Biblio_These_Lucas_MAITRE.xlsx`, on
 * recalcule tout, et on compare aux valeurs que Excel a lui-même calculées et enregistrées
 * dans le fichier (feuilles Références, Tableau de bord, Demandes). Même démarche que pour
 * le traitement 2S2P1D : vérifié, pas affirmé.
 *
 * Deux défauts du classeur, constatés ici, expliquent les seuls écarts tolérés :
 * - Références!O (« PDF récupéré ») teste la clé ($B) au lieu du fichier ($BB) à partir de
 *   la ligne 124 : ces références sont « Oui » sans PDF. L'application applique la règle
 *   voulue (PDF récupéré ⇔ fichier renseigné) ; le test rejoue la colonne O d'Excel.
 * - Sur une vingtaine de lignes, l'alerte et le score enregistrés par Excel contredisent
 *   sa propre colonne O (calcul non rafraîchi) : ces lignes sont listées, pas masquées.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dateExcel, readXlsx, type Cell } from "@noyau/formats/xlsx";
import { alerteDemande, calculer, dateLimite, moisCourant, tableauDeBord } from "../core/calculs";
import { importerClasseur } from "../core/import";

const octets = new Uint8Array(readFileSync(new URL("./fixtures/Biblio_These_Lucas_MAITRE.xlsx", import.meta.url)));
const imp = importerClasseur(octets);
const classeur = readXlsx(octets);
const feuille = (nom: string) => classeur.find((s) => s.name === nom)!.rows;
/** Cellule « C27 » d'une feuille. */
function cellule(nom: string, ref: string): Cell {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  const col = [...m[1]!].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return feuille(nom)[Number(m[2]) - 1]?.[col] ?? null;
}

const p = imp.parametres;
const aujourdhui = imp.excel.aujourdhui;
const mc = moisCourant(aujourdhui, p);
/** Colonne O telle qu'Excel l'a calculée, rejouée en entrée. */
const calc = calculer(imp.references, p, mc, (id) => imp.excel.references[id]!.pdf);

/**
 * Lignes où le cache d'Excel se contredit : O = « Oui », mais l'alerte enregistrée est une
 * de celles qui n'existent que sans PDF (impossible d'après la formule de L).
 */
const ALERTES_SANS_PDF = [
  "PDF libre à télécharger",
  "À télécharger via l'accès ENTPE",
  "À consulter via l'abonnement de l'école",
  "Document à demander (feuille Demandes)",
  "Texte intégral à localiser",
];
const incoherentes = new Set(
  imp.references.filter((r) => imp.excel.references[r.id]!.pdf && ALERTES_SANS_PDF.includes(imp.excel.references[r.id]!.alerte)).map((r) => r.id),
);
const tb = tableauDeBord(
  calc,
  imp.demandes.map((d) => d.valeur),
  imp.corrections.filter((c) => !c.valeur.corrige).length,
  p,
  aujourdhui,
);

describe("import du classeur", () => {
  it("reprend toutes les saisies", () => {
    expect(aujourdhui).toBe("2026-09-25");
    expect(imp.references).toHaveLength(179);
    expect(imp.demandes).toHaveLength(11);
    expect(imp.corrections).toHaveLength(20);
    expect(imp.pistes).toHaveLength(7);
    expect(p.axes).toHaveLength(8);
    expect(p.debutPlan).toBe("2026-10-01");
    expect(Object.keys(p.objectifs)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(p.objectifs["1"]!.titre).toBe("Cadrer le problème : mesures de contact et contexte aéronautique");
    const bib1 = imp.references[0]!;
    expect(bib1.id).toBe("BIB-001");
    expect(bib1.valeur).toMatchObject({ cle: "debeer2012toward", tfe: true, axe: 1, priorite: "INCONTOURNABLE", mois: 1, verifieLe: "2026-09-22" });
    expect(bib1.valeur.fiche.texteLu).toBe("Partiel");
    expect(bib1.valeur.categories).toContain("Pneu / Camion / bus");
    expect(imp.analyse).toContain("## 7. Où se place ta thèse");
  });
});

describe("colonnes calculées de la feuille Références", () => {
  it.each(["citation", "etat", "temps"] as const)("%s : identique à Excel pour les 179 références", (champ) => {
    const ecarts = calc.filter((c) => c[champ] !== imp.excel.references[c.id]![champ]).map((c) => `${c.id} : ${c[champ]} ≠ ${imp.excel.references[c.id]![champ]}`);
    expect(ecarts).toEqual([]);
  });

  it.each(["alerte", "score"] as const)("%s : identique à Excel hors des lignes où son cache se contredit", (champ) => {
    const ecarts = calc.filter((c) => !incoherentes.has(c.id) && c[champ] !== imp.excel.references[c.id]![champ]).map((c) => `${c.id} : ${c[champ]} ≠ ${imp.excel.references[c.id]![champ]}`);
    expect(ecarts).toEqual([]);
    // Et sur ces lignes, Excel a bien compté le PDF comme manquant : c'est le seul écart.
    for (const id of incoherentes) {
      const c = calc.find((x) => x.id === id)!;
      const sansPdf = calculer([{ id, valeur: c.ref }], p, mc, () => false)[0]!;
      expect(champ === "alerte" ? sansPdf.alerte : sansPdf.score).toBe(imp.excel.references[id]![champ]);
    }
  });

  it("le défaut de la colonne O est bien celui décrit", () => {
    const fausses = imp.references.filter((r) => imp.excel.references[r.id]!.pdf && !r.valeur.fichierPdf).map((r) => Number(r.id.slice(4)));
    expect(fausses.length).toBeGreaterThan(0);
    // Toutes à partir de BIB-123 (ligne 124 du classeur).
    expect(Math.min(...fausses)).toBeGreaterThanOrEqual(123);
    expect(incoherentes.size).toBeLessThan(60);
  });
});

describe("Tableau de bord", () => {
  it("vue d'ensemble", () => {
    const attendu: [keyof typeof tb, string][] = [
      ["total", "C6"], ["tfe", "C7"], ["verifiees", "C8"], ["partielles", "C9"], ["nonVerifiees", "C10"], ["avecDoi", "C11"],
      ["pdfLibres", "C12"], ["viaAbonnement", "C13"], ["payantes", "C14"], ["aDemander", "C15"], ["lues", "C17"], ["enCours", "C18"],
      ["tauxLecture", "C19"], ["enRetard", "C20"], ["ceMois", "C21"], ["demandesAEnvoyer", "C23"],
      ["correctionsRestantes", "C24"], ["libelleMoisCourant", "C27"], ["heuresRestantesMois", "C28"], ["heuresEnRetard", "C29"], ["charge", "C31"],
    ];
    for (const [champ, ref] of attendu) expect([champ, tb[champ]]).toEqual([champ, cellule("Tableau de bord", ref)]);
    // C22 (PDF libres à télécharger) dépend de la colonne O : Excel compte aussi les lignes
    // incohérentes comme manquantes.
    expect(tb.pdfLibresATelecharger + calc.filter((c) => incoherentes.has(c.id) && c.ref.accesDocument.startsWith("PDF libre")).length).toBe(cellule("Tableau de bord", "C22"));
  });

  it("avancement par axe", () => {
    tb.parAxe.forEach((a, i) => {
      const l = 6 + i;
      expect([a.numero, a.intitule, a.total, a.incontournables, a.lues, a.reste, a.partLue, a.heuresRestantes]).toEqual(
        ["F", "G", "H", "I", "J", "K", "L", "M"].map((c) => cellule("Tableau de bord", `${c}${l}`)),
      );
    });
  });

  it("avancement par mois", () => {
    tb.parMois.forEach((m, i) => {
      const l = 17 + i;
      expect([m.numero, m.libelle, m.total, m.lues, m.reste, m.heuresPrevues, m.heuresRestantes, m.capacite, m.charge, m.etat]).toEqual(
        ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O"].map((c) => cellule("Tableau de bord", `${c}${l}`)),
      );
    });
  });

  it("prochaines lectures conseillées, dans le même ordre", () => {
    tb.prochaines.forEach((c, i) => {
      const l = 27 + i;
      expect([c.citation, c.ref.priorite, c.ref.mois, Number(c.scoreTri.toFixed(5))]).toEqual(["G", "H", "I", "J"].map((col) => cellule("Tableau de bord", `${col}${l}`)));
    });
  });

  it("accès aux documents", () => {
    tb.parAcces.forEach((a, i) => {
      expect([a.acces, a.nombre, a.part]).toEqual(["G", "H", "I"].map((c) => cellule("Tableau de bord", `${c}${38 + i}`)));
    });
  });
});

describe("Demandes", () => {
  it("date limite d'envoi et alerte identiques à Excel", () => {
    imp.demandes.forEach((d, i) => {
      const l = 4 + i;
      const j = cellule("Demandes", `J${l}`);
      expect([d.id, dateLimite(d.valeur, p), alerteDemande(d.valeur, p, aujourdhui)]).toEqual([d.id, typeof j === "number" ? dateExcel(j) : "", cellule("Demandes", `N${l}`) ?? ""]);
    });
  });
});

describe("exports", () => {
  it("RIS et BibTeX : toutes les références, clés conservées", async () => {
    const { versBibtex, versRis } = await import("../core/exports");
    const refs = imp.references.map((r) => r.valeur);
    const ris = versRis(refs, p);
    expect(ris.match(/^ER {2}- $/gm)).toHaveLength(179);
    expect(ris).toContain("ID  - debeer2012toward\r\nAU  - De Beer, M.\r\nAU  - Maina, J. W.");
    const bib = versBibtex(refs);
    expect(bib.match(/^@\w+\{/gm)).toHaveLength(179);
    expect(bib).toContain("@article{debeer2012toward,\n  author = {De Beer, M. and Maina, J. W. and van Rensburg, Y. and Greben, J. M.},");
    expect(bib).toContain("  pages = {246--271}");
    expect(versBibtex(refs)).toBe(bib);
  });
});

describe("doublons et DOI", () => {
  it("le classeur n'a pas de doublon ; une copie est détectée par clé, DOI et titre", async () => {
    const { doublons } = await import("../core/doublons");
    expect(doublons(imp.references)).toEqual([]);
    const r = imp.references[0]!;
    const copie = { id: "BIB-999", valeur: { ...r.valeur, titre: r.valeur.titre.toUpperCase() + " !" } };
    expect(doublons([...imp.references, copie]).map((d) => d.motif)).toEqual(["clé", "DOI", "titre"]);
  });

  it("convertit une réponse Crossref", async () => {
    const { cleProposee, depuisCrossref, urlCrossref } = await import("../core/doi");
    expect(urlCrossref("https://doi.org/10.2346/tire.12.400403")).toBe("https://api.crossref.org/works/10.2346%2Ftire.12.400403");
    const r = depuisCrossref({
      message: {
        DOI: "10.2346/tire.12.400403",
        title: ["Toward using tire-road contact stresses in pavement design and analysis"],
        author: [{ family: "De Beer", given: "Morris" }, { family: "Maina", given: "James W." }],
        issued: { "date-parts": [[2012, 12]] },
        "container-title": ["Tire Science and Technology"],
        volume: "40",
        issue: "4",
        page: "246-271",
        type: "journal-article",
      },
    });
    expect(r).toMatchObject({ auteurs: "De Beer, M.; Maina, J. W.", annee: 2012, typeRis: "JOUR", support: "Tire Science and Technology", url: "https://doi.org/10.2346/tire.12.400403" });
    expect(cleProposee({ auteurs: r.auteurs!, annee: r.annee!, titre: r.titre! })).toBe("debeer2012toward");
  });
});
