/**
 * Import du classeur `Biblio_These_Lucas_MAITRE.xlsx` (SPEC §9.4). Relançable : tant que
 * la bascule n'est pas faite, on continue dans Excel et on réimporte. Seules les saisies
 * sont reprises ; ce que le classeur calculait est recalculé par calculs.ts.
 */
import { dateExcel, readXlsx, type Cell, type Sheet } from "@noyau/formats/xlsx";
import {
  FICHE_VIDE,
  lireCorrection,
  lireDemande,
  lireParametres,
  lirePiste,
  lireReference,
  NOTES_VIDES,
  type Correction,
  type Demande,
  type Parametres,
  type Piste,
  type Reference,
} from "./modele";

export interface ImportClasseur {
  references: { id: string; valeur: Reference }[];
  demandes: { id: string; valeur: Demande }[];
  corrections: { id: string; valeur: Correction }[];
  pistes: { id: string; valeur: Piste }[];
  parametres: Parametres;
  /** Analyse croisée rédigée (feuille « Analyse croisée »), en Markdown. */
  analyse: string;
  /** Valeurs calculées par Excel, pour contrôler l'import (voir conformite.test.ts). */
  excel: { aujourdhui: string; references: Record<string, { citation: string; etat: string; alerte: string; score: number; temps: number; pdf: boolean }> };
}

const texte = (c: Cell | undefined): string => (c === null || c === undefined ? "" : typeof c === "number" ? String(c) : String(c).trim());
const nombre = (c: Cell | undefined): number | null => (typeof c === "number" ? c : typeof c === "string" && c.trim() !== "" && !Number.isNaN(Number(c)) ? Number(c) : null);
const ouiNon = (c: Cell | undefined) => texte(c).toLowerCase() === "oui";
/** Date saisie : numéro de série Excel, ou texte « 22/09/2026 », ou déjà ISO. */
function date(c: Cell | undefined): string {
  if (typeof c === "number") return dateExcel(c);
  const t = texte(c);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : t;
}
const id3 = (prefixe: string, n: number) => `${prefixe}${String(n).padStart(3, "0")}`;

function feuille(classeur: Sheet[], nom: string): Sheet {
  const f = classeur.find((s) => s.name === nom);
  if (!f) throw new Error(`Feuille « ${nom} » introuvable : est-ce bien le classeur de bibliographie ?`);
  return f;
}

/** Lignes de données sous la ligne d'en-têtes `ligneEntetes` (1 = première ligne), par nom de colonne. */
function lignes(f: Sheet, ligneEntetes: number): { get(nom: string): Cell | undefined; ligne: number }[] {
  const entetes = (f.rows[ligneEntetes - 1] ?? []).map(texte);
  const col = (nom: string) => entetes.indexOf(nom);
  return f.rows.slice(ligneEntetes).map((r, i) => ({
    get: (nom: string) => {
      const c = col(nom);
      return c < 0 ? undefined : r[c];
    },
    ligne: ligneEntetes + 1 + i,
  }));
}

export function importerClasseur(octets: Uint8Array): ImportClasseur {
  const cl = readXlsx(octets);

  // ---- Références + Lecture détaillée + Notes de lecture + Matrice croisée, liées par l'ID ----
  const fiches = new Map<string, Record<string, Cell | undefined>>();
  for (const l of lignes(feuille(cl, "Lecture détaillée"), 4)) {
    const id = texte(l.get("ID"));
    if (!id) continue;
    fiches.set(id, {
      texteLu: l.get("Texte lu"),
      sourceTexte: l.get("Source du texte lu"),
      objectif: l.get("Objectif"),
      methode: l.get("Méthode"),
      resultats: l.get("Résultats annoncés"),
      limites: l.get("Limites"),
      pourThese: l.get("Pour ta thèse"),
      aVerifier: l.get("À vérifier en lisant"),
      pneu: l.get("Pneu"),
      contact: l.get("Contact"),
      loi: l.get("Loi de comportement"),
      methodeCategorie: l.get("Méthode (catégorie)"),
      chargement: l.get("Chargement"),
      cible: l.get("Cible"),
      validation: l.get("Validation"),
    });
  }
  const notes = new Map<string, Record<string, Cell | undefined>>();
  for (const l of lignes(feuille(cl, "Notes de lecture"), 3)) {
    const id = texte(l.get("ID"));
    if (id)
      notes.set(id, {
        apport: l.get("Apport central (reformulé)"),
        lien: l.get("Lien avec mes travaux"),
        equations: l.get("Équations, valeurs, figures à retenir"),
        chapitre: l.get("Chapitre de thèse visé"),
        aCiter: l.get("À citer"),
        date: l.get("Date"),
      });
  }
  const matrice = feuille(cl, "Matrice croisée");
  const groupes = (matrice.rows[3] ?? []).map(texte);
  const categories = (matrice.rows[4] ?? []).map(texte);
  const nomCategorie: string[] = [];
  let groupe = "";
  categories.forEach((c, i) => {
    if (groupes[i]) groupe = groupes[i]!;
    nomCategorie[i] = i >= 4 && c ? `${groupe} / ${c}` : "";
  });
  const categoriesDe = new Map<string, string[]>();
  for (const r of matrice.rows.slice(6)) {
    const id = texte(r[0]);
    if (id) categoriesDe.set(id, r.flatMap((c, i) => (texte(c) === "●" && nomCategorie[i] ? [nomCategorie[i]!] : [])));
  }

  const chaines = (o: Record<string, Cell | undefined> | undefined, modele: object) =>
    Object.fromEntries(Object.keys(modele).map((k) => [k, k === "date" ? date(o?.[k]) : texte(o?.[k])]));

  const references: ImportClasseur["references"] = [];
  const excelRefs: ImportClasseur["excel"]["references"] = {};
  for (const l of lignes(feuille(cl, "Références"), 1)) {
    const id = texte(l.get("ID"));
    if (!id || !texte(l.get("Clé"))) continue;
    const r = lireReference({
      cle: texte(l.get("Clé")),
      titre: texte(l.get("Titre")),
      auteurs: texte(l.get("Auteurs")),
      annee: nombre(l.get("Année")),
      typeRis: texte(l.get("Type RIS")),
      support: texte(l.get("Support (revue, actes)")),
      volume: texte(l.get("Vol.")),
      numero: texte(l.get("N°")),
      pages: texte(l.get("Pages")),
      editeur: texte(l.get("Éditeur / institution")),
      doi: texte(l.get("DOI")),
      identifiant: texte(l.get("Identifiant (rapport, norme, ISBN, NNT, HAL)")),
      tfe: ouiNon(l.get("TFE")),
      axe: nombre(l.get("Axe")),
      priorite: texte(l.get("Priorité")),
      mois: nombre(l.get("Mois")),
      litteratureGrise: ouiNon(l.get("Littérature grise")),
      pertinence: nombre(l.get("Pertinence (1-5)")),
      categories: categoriesDe.get(id) ?? [],
      statut: texte(l.get("Statut lecture")),
      dateLecture: date(l.get("Date lecture")),
      commentaire: texte(l.get("Commentaire")),
      typeLien: texte(l.get("Type de lien")),
      url: texte(l.get("Lien (URL)")),
      urlRecherche: texte(l.get("URL de recherche")),
      acces: texte(l.get("Accès")),
      accesDocument: texte(l.get("Accès document")),
      commentObtenir: texte(l.get("Comment l'obtenir")),
      fichierPdf: texte(l.get("Fichier PDF")),
      dansZotero: ouiNon(l.get("Dans Zotero")),
      noteObsidian: texte(l.get("Note Obsidian")),
      etatLien: texte(l.get("État du lien (macro)")),
      lienControleLe: date(l.get("Lien contrôlé le")),
      verification: texte(l.get("Vérification")),
      sourceVerification: texte(l.get("Source de vérification")),
      verifieLe: date(l.get("Vérifié le")),
      contribution: texte(l.get("Contribution et lien avec tes travaux")),
      voirAussi: texte(l.get("Voir aussi")),
      fiche: chaines(fiches.get(id), FICHE_VIDE),
      notes: chaines(notes.get(id), NOTES_VIDES),
    });
    references.push({ id, valeur: r });
    excelRefs[id] = {
      citation: texte(l.get("Citation")),
      etat: texte(l.get("État")),
      alerte: texte(l.get("Alerte")),
      score: nombre(l.get("Score")) ?? 0,
      temps: nombre(l.get("Temps estimé (h)")) ?? 0,
      pdf: ouiNon(l.get("PDF récupéré")),
    };
  }

  // ---- Demandes, corrections, pistes ----
  const demandes = lignes(feuille(cl, "Demandes"), 3)
    .filter((l) => texte(l.get("Document")))
    .map((l, i) => ({
      id: id3("DEM-", nombre(l.get("N°")) ?? i + 1),
      valeur: lireDemande({
        cles: texte(l.get("Clé(s)")),
        references: texte(l.get("Références")),
        interlocuteur: texte(l.get("Interlocuteur")),
        document: texte(l.get("Document")),
        pourquoi: texte(l.get("Pourquoi")),
        delaiIndicatif: texte(l.get("Délai indicatif")),
        delaiMaxSemaines: nombre(l.get("Délai max (semaines)")),
        moisUsage: nombre(l.get("Mois d'usage")),
        dateEnvoi: date(l.get("Date d'envoi")),
        statut: texte(l.get("Statut")),
        commentaire: texte(l.get("Commentaire")),
      }),
    }));
  const corrections = lignes(feuille(cl, "Corrections TFE"), 3)
    .filter((l) => texte(l.get("Clé")))
    .map((l, i) => ({
      id: id3("COR-", nombre(l.get("N°")) ?? i + 1),
      valeur: lireCorrection({
        cle: texte(l.get("Clé")),
        champ: texte(l.get("Champ")),
        tfe: texte(l.get("Ce que dit le TFE")),
        correction: texte(l.get("Correction")),
        justification: texte(l.get("Justification et source")),
        corrige: ouiNon(l.get("Corrigé")),
      }),
    }));
  const pistes = lignes(feuille(cl, "Pistes non couvertes"), 3)
    .filter((l) => texte(l.get("Sujet")))
    .map((l, i) => ({
      id: id3("PIS-", nombre(l.get("N°")) ?? i + 1),
      valeur: lirePiste({
        sujet: texte(l.get("Sujet")),
        axe: nombre(l.get("Axe")),
        constat: texte(l.get("Constat")),
        suite: texte(l.get("Suite à donner")),
        statut: texte(l.get("Statut")),
        referenceTrouvee: texte(l.get("Référence trouvée")),
      }),
    }));

  // ---- Paramètres (valeurs en colonne C, listes à droite) et objectifs mensuels ----
  const P = feuille(cl, "Paramètres").rows;
  const cellule = (ligne: number, col: number) => P[ligne - 1]?.[col - 1];
  const axes: Parametres["axes"] = [];
  const typesRis: Record<string, string> = {};
  for (let l = 6; l <= 13; l++) {
    const n = nombre(cellule(l, 16));
    if (n !== null) axes.push({ numero: n, intitule: texte(cellule(l, 17)) });
    if (texte(cellule(l, 13))) typesRis[texte(cellule(l, 13))] = texte(cellule(l, 14));
  }
  const nbMois = [6, 7, 8, 9, 10, 11].filter((l) => nombre(cellule(l, 19)) !== null).length;
  const objectifs: Parametres["objectifs"] = {};
  let courant: string | null = null;
  for (const r of feuille(cl, "Planning").rows) {
    const b = texte(r[1]);
    const m = /^Mois (\d+) — [^:]*: (.*)$/.exec(b);
    if (m) {
      courant = m[1]!;
      objectifs[courant] = { titre: m[2]!, finDeMois: "", aDemander: "" };
    } else if (courant && b === "À la fin du mois") objectifs[courant]!.finDeMois = texte(r[2]);
    else if (courant && b === "À demander en amont") objectifs[courant]!.aDemander = texte(r[2]);
  }
  const parametres = lireParametres({
    debutPlan: date(cellule(7, 3)),
    nbMois: nbMois || 6,
    capaciteHeures: nombre(cellule(10, 3)),
    delaiRelanceJours: nombre(cellule(9, 3)),
    proxy: texte(cellule(13, 3)),
    bareme: {
      priorites: { [texte(cellule(17, 2))]: nombre(cellule(17, 3)), [texte(cellule(18, 2))]: nombre(cellule(18, 3)), [texte(cellule(19, 2))]: nombre(cellule(19, 3)) },
      parMoisDAvance: nombre(cellule(20, 3)),
      retard: nombre(cellule(21, 3)),
      tfe: nombre(cellule(22, 3)),
      verification: nombre(cellule(23, 3)),
      pdfLibre: nombre(cellule(24, 3)),
    },
    tempsHeures: { [texte(cellule(27, 2))]: nombre(cellule(27, 3)), [texte(cellule(28, 2))]: nombre(cellule(28, 3)), [texte(cellule(29, 2))]: nombre(cellule(29, 3)) },
    axes,
    objectifs,
    typesRis,
  });

  // ---- Analyse croisée : les textes rédigés (les tableaux chiffrés sont recalculés) ----
  const md: string[] = ["# Analyse croisée", ""];
  for (const r of feuille(cl, "Analyse croisée").rows) {
    const cellules = r.map(texte).filter(Boolean);
    if (cellules.length === 0 || cellules.length > 2 || cellules.some((c) => /^[\d.,]+$/.test(c))) continue;
    if (/^\d+\. /.test(cellules[0]!) && cellules.length === 1) md.push("", `## ${cellules[0]}`, "");
    else if (cellules.length === 2) md.push(`**${cellules[0]}** — ${cellules[1]}`, "");
    else md.push(cellules[0]!, "");
  }

  return {
    references,
    demandes,
    corrections,
    pistes,
    parametres,
    analyse: md.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    excel: { aujourdhui: date(cellule(6, 3)), references: excelRefs },
  };
}
