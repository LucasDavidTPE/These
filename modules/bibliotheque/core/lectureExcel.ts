/**
 * Le classeur Excel de la lecture croisée et sa synchronisation dans les deux sens (SPEC §9.5).
 *
 * `bibliotheque/Lecture croisee.xlsx` (dans l'espace) a cinq feuilles : Grille (une ligne par article, une
 * colonne par critère, plus le commentaire), Liens (un lien par ligne), Vocabulaire (définitions des
 * étiquettes), Croisement (calculé) et Mode d'emploi. Les lignes sont repérées par l'identifiant BIB, les
 * colonnes par leur titre : on peut trier, filtrer, déplacer des colonnes dans Excel.
 *
 * Synchronisation « à trois voies » : l'état au moment de la dernière synchronisation est gardé
 * (`lecture-croisee.synchro.json`). Pour chaque case, chaque lien, chaque définition :
 *   modifié seulement dans Excel → repris dans l'appli ; seulement dans l'appli → écrit dans Excel ;
 *   des deux côtés différemment → conflit, tranché par l'utilisateur. Rien n'est écrasé en silence.
 * Une ligne retirée du classeur ne supprime pas l'article ; une ligne retirée de la feuille Liens supprime le lien.
 * Pur : octets en entrée et en sortie.
 */
import { jsonStable } from "@noyau/stockage";
import { readXlsx, type Cell, type Sheet } from "@noyau/formats/xlsx";
import { ecrireClasseur, type Feuille } from "@noyau/formats/xlsx-ecriture";
import { citation } from "./calculs";
import { DOSSIER, type Reference } from "./modele";
import {
  cleCellule,
  cleEtiquette,
  croiser,
  lireCellule,
  avecCellule,
  nettoyerEtiquette,
  texteCellule,
  triIds,
  vocabulaire,
  definir,
  type ObjetRef,
  type ReglagesLecture,
} from "./lecture";

export const FICHIER_CLASSEUR = `${DOSSIER}/Lecture croisee.xlsx`;
export const FICHIER_SYNCHRO = `${DOSSIER}/lecture-croisee.synchro.json`;

/** Colonne « Commentaire » de la grille (le commentaire général de la référence). */
export const COMMENTAIRE = "_commentaire";

const FEUILLE_GRILLE = "Grille";
const FEUILLE_LIENS = "Liens";
const FEUILLE_VOCABULAIRE = "Vocabulaire";
const FEUILLE_CROISEMENT = "Croisement";
const FEUILLE_AIDE = "Mode d'emploi";

const FIXES = ["ID", "Référence", "Titre", "Année", "Statut"] as const;
const LIENS = ["De (ID)", "De", "Type", "Vers (ID)", "Vers", "Note"] as const;
const VOCABULAIRE = ["Critère", "Étiquette", "Articles", "Définition"] as const;

// ---- État comparable ----

/** Tout ce qui se synchronise, sous forme de textes (comme dans les cellules Excel). */
export interface Etat {
  /** Identifiant d'article → critère (ou `_commentaire`) → texte « a; b | note ». */
  cases: Record<string, Record<string, string>>;
  /** « de|type|vers » → note. */
  liens: Record<string, string>;
  /** « critère|clé d'étiquette » → [étiquette, définition]. */
  definitions: Record<string, [string, string]>;
}

const espaces = (s: string) => s.replace(/\s+/g, " ").trim();

/** Comparaison : une case selon ses étiquettes (ordre, casse, accents ignorés) et sa note ; le reste espaces réduits. */
function egal(critere: string, a: string | undefined, b: string | undefined): boolean {
  if (critere === COMMENTAIRE || critere === "") return espaces(a ?? "") === espaces(b ?? "");
  return cleCellule(lireCellule(a ?? "")) === cleCellule(lireCellule(b ?? ""));
}

export function etatAppli(refs: readonly ObjetRef[], reglages: ReglagesLecture): Etat {
  const types = new Set(reglages.typesLiens.map((t) => t.id));
  const criteres = reglages.criteres.map((c) => c.id);
  const cases: Etat["cases"] = {};
  const liens: Etat["liens"] = {};
  for (const r of refs) {
    const ligne: Record<string, string> = {};
    for (const c of criteres) {
      const t = texteCellule(r.valeur.lecture[c]);
      if (t) ligne[c] = t;
    }
    if (r.valeur.commentaire.trim()) ligne[COMMENTAIRE] = r.valeur.commentaire;
    cases[r.id] = ligne;
    for (const l of r.valeur.liens) if (types.has(l.type)) liens[`${r.id}|${l.type}|${l.vers}`] = l.note;
  }
  const definitions: Etat["definitions"] = {};
  for (const [c, defs] of Object.entries(reglages.definitions)) for (const [e, d] of Object.entries(defs)) definitions[`${c}|${cleEtiquette(e)}`] = [e, d];
  return { cases, liens, definitions };
}

// ---- Écriture du classeur ----

const MODE_EMPLOI = [
  "Ce classeur est synchronisé avec l'application Thèse (Bibliothèque → Lecture croisée → Excel).",
  "",
  "Feuille Grille : une ligne par article, une colonne par critère de lecture.",
  "  Dans une case, les étiquettes sont séparées par « ; » ; une note facultative suit « | ».",
  "  Exemple : MEF 3D; Burmister | maillage grossier sous la roue",
  "  Réutilisez les mêmes étiquettes d'un article à l'autre (voir la feuille Vocabulaire) : c'est ce qui permet de croiser.",
  "  Les colonnes grises (ID, référence, titre, année, statut) viennent de l'application : leurs modifications sont ignorées.",
  "  Vous pouvez trier, filtrer, déplacer les colonnes, ajuster les largeurs. Ne modifiez pas les titres des colonnes.",
  "  Cases en italique sur fond jaune : « à valider » (reprises automatiquement des fiches, pas encore confirmées).",
  "  Une case que vous modifiez ici devient validée ; pour valider sans rien changer, utilisez l'application.",
  "",
  "Feuille Liens : un lien par ligne. Ajoutez une ligne pour créer un lien, supprimez-la pour le retirer.",
  "  « De (ID) » et « Vers (ID) » : identifiants BIB-… ; Type : choisi dans la liste.",
  "",
  "Feuille Vocabulaire : écrivez la définition d'une étiquette dans la colonne Définition ; une ligne ajoutée définit une étiquette.",
  "Feuille Croisement : calculée à chaque synchronisation (les cases orangées sont les combinaisons qu'aucun article ne traite).",
  "",
  "Synchroniser : enregistrez et fermez le classeur, puis « Synchroniser avec Excel » dans l'application.",
  "Une case modifiée des deux côtés depuis la dernière synchronisation vous est présentée : vous choisissez quelle version garder.",
];

/** Classeur complet à partir de l'état synchronisé (qui peut différer de l'appli tant que les conflits ne sont pas tranchés). */
export function construireClasseur(refs: readonly ObjetRef[], reglages: ReglagesLecture, etat: Etat = etatAppli(refs, reglages)): Uint8Array {
  const tries = [...refs].sort((a, b) => triIds(a.id, b.id));
  const parId = new Map(tries.map((r) => [r.id, r.valeur]));
  const ref = (id: string) => {
    const r = parId.get(id);
    return r ? citation(r) || r.titre.slice(0, 60) : "";
  };
  const typeNom = new Map(reglages.typesLiens.map((t) => [t.id, t.nom]));

  // cases encore « à valider » dans l'appli (et inchangées dans l'état synchronisé) : en italique sur fond jaune
  const aRevoir = new Set<string>();
  tries.forEach((r, i) =>
    reglages.criteres.forEach((c, k) => {
      const x = r.valeur.lecture[c.id];
      if (x && !x.valide && egal(c.id, texteCellule(x), etat.cases[r.id]?.[c.id])) aRevoir.add(`${i},${FIXES.length + k}`);
    }),
  );
  const grille: Feuille = {
    nom: FEUILLE_GRILLE,
    entetes: [...FIXES, ...reglages.criteres.map((c) => c.nom), "Commentaire"],
    lignes: tries.map((r) => [
      r.id,
      ref(r.id),
      r.valeur.titre,
      r.valeur.annee,
      r.valeur.statut,
      ...reglages.criteres.map((c) => etat.cases[r.id]?.[c.id] ?? ""),
      etat.cases[r.id]?.[COMMENTAIRE] ?? "",
    ]),
    mise: {
      aRevoir,
      largeurs: [10, 24, 46, 7, 10, ...reglages.criteres.map(() => 26), 40],
      figerColonnes: 2,
      filtre: true,
      retour: true,
      grisees: [0, 1, 2, 3, 4],
    },
  };

  const liens: Feuille = {
    nom: FEUILLE_LIENS,
    entetes: [...LIENS],
    lignes: Object.entries(etat.liens)
      .map(([cle, note]) => {
        const [de, type, vers] = cle.split("|") as [string, string, string];
        return [de, ref(de), typeNom.get(type) ?? type, vers, ref(vers), note] as const;
      })
      .sort((a, b) => triIds(a[0], b[0]) || triIds(a[3], b[3]) || a[2].localeCompare(b[2])),
    mise: { largeurs: [10, 26, 22, 10, 26, 60], filtre: true, retour: true, grisees: [1, 4], listes: [{ colonne: 2, valeurs: reglages.typesLiens.map((t) => t.nom) }] },
  };

  // vocabulaire calculé sur l'état synchronisé (et non sur les fiches) : ce que montre la grille
  const refsEtat: ObjetRef[] = tries.map((r) => {
    let v: Reference = { ...r.valeur, lecture: {} };
    for (const c of reglages.criteres) v = avecCellule(v, c.id, lireCellule(etat.cases[r.id]?.[c.id] ?? ""));
    return { id: r.id, valeur: v };
  });
  let regEtat: ReglagesLecture = { ...reglages, definitions: {} };
  for (const [cle, [e, d]] of Object.entries(etat.definitions)) regEtat = definir(regEtat, cle.slice(0, cle.indexOf("|")), e, d);
  const vocab: Feuille = {
    nom: FEUILLE_VOCABULAIRE,
    entetes: [...VOCABULAIRE],
    lignes: reglages.criteres.flatMap((c) => vocabulaire(refsEtat, c.id, regEtat).map((e) => [c.nom, e.etiquette, e.ids.length, e.definition])),
    mise: { largeurs: [22, 28, 9, 70], filtre: true, retour: true, grisees: [2], listes: [{ colonne: 0, valeurs: reglages.criteres.map((c) => c.nom) }] },
  };

  const nom = new Map(reglages.criteres.map((c) => [c.id, c.nom]));
  const lignesCroisement: (string | number | null)[][] = [];
  const titres: number[] = [];
  let largeur = 2;
  for (const [a, b] of reglages.croisements) {
    if (!nom.has(a) || !nom.has(b)) continue;
    const x = croiser(refsEtat, a, b, regEtat);
    titres.push(lignesCroisement.length);
    lignesCroisement.push([`${nom.get(a)} (lignes) × ${nom.get(b)} (colonnes) — ${x.renseignes} article(s) renseigné(s) pour les deux`]);
    titres.push(lignesCroisement.length);
    lignesCroisement.push(["", ...x.colonnes.map((c) => c.etiquette)]);
    for (const l of x.lignes) lignesCroisement.push([l.etiquette, ...x.colonnes.map((c) => x.cases.get(`${l.cle}|${c.cle}`)?.length ?? 0)]);
    lignesCroisement.push([]);
    largeur = Math.max(largeur, x.colonnes.length + 1);
  }
  if (!lignesCroisement.length) lignesCroisement.push(["Aucun croisement enregistré : choisissez-en dans l'application (Lecture croisée → Croisement)."]);
  const croisement: Feuille = {
    nom: FEUILLE_CROISEMENT,
    entetes: ["Croisements (calculés, non synchronisés)"],
    lignes: lignesCroisement,
    mise: { largeurs: [30, ...Array.from({ length: largeur - 1 }, () => 14)], zerosEnEvidence: true, lignesTitres: titres },
  };

  const aide: Feuille = { nom: FEUILLE_AIDE, entetes: ["Mode d'emploi"], lignes: MODE_EMPLOI.map((l) => [l]), mise: { largeurs: [130] } };
  return ecrireClasseur([grille, liens, vocab, croisement, aide]);
}

// ---- Lecture du classeur ----

/** Ce qu'on a lu dans Excel. `presentes` : ce qui y figure (une case absente n'est pas une suppression). */
export interface EtatExcel extends Etat {
  presentes: { cases: Set<string>; liens: boolean; definitions: boolean };
  avertissements: string[];
}

const texteCellXlsx = (c: Cell | undefined): string => (c === null || c === undefined ? "" : typeof c === "number" ? String(c) : typeof c === "boolean" ? (c ? "VRAI" : "FAUX") : c);
const norm = (s: string) => cleEtiquette(s);
const feuille = (cl: Sheet[], nom: string) => cl.find((f) => norm(f.name) === norm(nom));

export function lireClasseur(octets: Uint8Array, refs: readonly ObjetRef[], reglages: ReglagesLecture): EtatExcel {
  const cl = readXlsx(octets);
  const connus = new Set(refs.map((r) => r.id));
  const out: EtatExcel = { cases: {}, liens: {}, definitions: {}, presentes: { cases: new Set(), liens: false, definitions: false }, avertissements: [] };

  const g = feuille(cl, FEUILLE_GRILLE);
  if (!g) out.avertissements.push("Feuille « Grille » absente : les cases ne sont pas synchronisées.");
  else {
    const bruts = (g.rows[0] ?? []).map((c) => texteCellXlsx(c).trim());
    const entetes = bruts.map(norm);
    const colId = entetes.indexOf(norm("ID"));
    const colonnes = new Map<number, string>();
    for (const c of reglages.criteres) {
      const j = entetes.indexOf(norm(c.nom));
      if (j >= 0) colonnes.set(j, c.id);
    }
    const jc = entetes.indexOf(norm("Commentaire"));
    if (jc >= 0) colonnes.set(jc, COMMENTAIRE);
    const manquants = reglages.criteres.filter((c) => !entetes.includes(norm(c.nom))).map((c) => c.nom);
    if (manquants.length) out.avertissements.push(`Colonne(s) absente(s) de la grille, non synchronisée(s) : ${manquants.join(", ")}.`);
    const inconnues = bruts.filter((e, j) => e && j !== colId && !colonnes.has(j) && !FIXES.some((f) => norm(f) === entetes[j]));
    if (inconnues.length) out.avertissements.push(`Colonne(s) inconnue(s) ignorée(s) : ${inconnues.join(", ")} (un critère renommé dans Excel ? renommez-le dans l'application).`);
    if (colId < 0) out.avertissements.push("Colonne « ID » absente de la grille : les cases ne sont pas synchronisées.");
    else
      for (const ligne of g.rows.slice(1)) {
        const id = texteCellXlsx(ligne[colId]).trim();
        if (!id) continue;
        if (!connus.has(id)) {
          out.avertissements.push(`Grille : « ${id} » n'est pas une référence de la bibliothèque (ligne ignorée ; créez la référence dans l'application).`);
          continue;
        }
        const cases: Record<string, string> = {};
        for (const [j, critere] of colonnes) {
          const v = texteCellXlsx(ligne[j]).trim();
          out.presentes.cases.add(`${id}|${critere}`);
          if (v) cases[critere] = v;
        }
        out.cases[id] = cases;
      }
  }

  const l = feuille(cl, FEUILLE_LIENS);
  if (!l) out.avertissements.push("Feuille « Liens » absente : les liens ne sont pas synchronisés.");
  else {
    const entetes = (l.rows[0] ?? []).map((c) => norm(texteCellXlsx(c)));
    const [jde, jtype, jvers, jnote] = [LIENS[0], LIENS[2], LIENS[3], LIENS[5]].map((n) => entetes.indexOf(norm(n)));
    if (jde! < 0 || jtype! < 0 || jvers! < 0) out.avertissements.push("Feuille « Liens » : colonnes « De (ID) », « Type » ou « Vers (ID) » introuvables ; liens non synchronisés.");
    else {
      out.presentes.liens = true;
      const types = new Map(reglages.typesLiens.flatMap((t) => [[norm(t.nom), t.id] as const, [norm(t.id), t.id] as const]));
      l.rows.slice(1).forEach((ligne, i) => {
        const de = texteCellXlsx(ligne[jde!]).trim();
        const vers = texteCellXlsx(ligne[jvers!]).trim();
        const typeTexte = texteCellXlsx(ligne[jtype!]).trim();
        if (!de && !vers && !typeTexte) return;
        const type = types.get(norm(typeTexte));
        const n = i + 2;
        if (!type) return void out.avertissements.push(`Liens, ligne ${n} : type « ${typeTexte} » inconnu (ligne ignorée).`);
        if (!connus.has(de) || !connus.has(vers)) return void out.avertissements.push(`Liens, ligne ${n} : « ${!connus.has(de) ? de : vers} » n'est pas une référence de la bibliothèque (ligne ignorée).`);
        if (de === vers) return void out.avertissements.push(`Liens, ligne ${n} : un article ne se lie pas à lui-même (ligne ignorée).`);
        out.liens[`${de}|${type}|${vers}`] = jnote! >= 0 ? texteCellXlsx(ligne[jnote!]).trim() : "";
      });
    }
  }

  const v = feuille(cl, FEUILLE_VOCABULAIRE);
  if (v) {
    const entetes = (v.rows[0] ?? []).map((c) => norm(texteCellXlsx(c)));
    const [jc, je, jd] = [VOCABULAIRE[0], VOCABULAIRE[1], VOCABULAIRE[3]].map((n) => entetes.indexOf(norm(n)));
    if (jc! >= 0 && je! >= 0 && jd! >= 0) {
      out.presentes.definitions = true;
      const criteres = new Map(reglages.criteres.flatMap((c) => [[norm(c.nom), c.id] as const, [norm(c.id), c.id] as const]));
      v.rows.slice(1).forEach((ligne, i) => {
        const e = nettoyerEtiquette(texteCellXlsx(ligne[je!]));
        const d = texteCellXlsx(ligne[jd!]).trim();
        const cTexte = texteCellXlsx(ligne[jc!]).trim();
        if (!e || !d) return;
        const c = criteres.get(norm(cTexte));
        if (!c) return void out.avertissements.push(`Vocabulaire, ligne ${i + 2} : critère « ${cTexte} » inconnu (ligne ignorée).`);
        out.definitions[`${c}|${cleEtiquette(e)}`] = [e, d];
      });
    }
  }
  return out;
}

// ---- Fusion à trois voies ----

export interface Conflit {
  /** « case|BIB-001|loi », « lien|BIB-001|etend|BIB-020 », « definition|loi|2s2p1d ». */
  cle: string;
  /** Ce qui est en conflit, lisible (« BIB-001 · Loi de comportement »). */
  libelle: string;
  appli: string;
  excel: string;
}

export interface Fusion {
  /** État retenu (les conflits y portent pour l'instant la valeur de l'appli). */
  etat: Etat;
  conflits: Conflit[];
  /** Changements venus d'Excel (à appliquer dans l'appli) et partis de l'appli (à écrire dans Excel). */
  depuisExcel: number;
  versExcel: number;
}

/**
 * Fusionne l'appli et Excel depuis l'état de la dernière synchronisation (`base`). Sans base (première fois
 * avec un classeur existant), une différence entre deux valeurs non vides est un conflit, et une valeur vide
 * d'un côté prend celle de l'autre.
 */
export function fusionner(base: Etat | null, appli: Etat, excel: EtatExcel, reglages: ReglagesLecture): Fusion {
  const etat: Etat = { cases: {}, liens: {}, definitions: {} };
  const conflits: Conflit[] = [];
  let depuisExcel = 0;
  let versExcel = 0;
  const nomCritere = new Map(reglages.criteres.map((c) => [c.id, c.nom]));
  nomCritere.set(COMMENTAIRE, "Commentaire");

  /** Une valeur : renvoie la valeur retenue (ou null = absente). */
  const trancher = (cle: string, libelle: string, critere: string, b: string | undefined, a: string | undefined, e: string | undefined, present: boolean): string | undefined => {
    if (!present) {
      if (!egal(critere, a, b)) versExcel++;
      return a;
    }
    const aChange = base ? !egal(critere, a, b) : false;
    const eChange = base ? !egal(critere, e, b) : false;
    if (egal(critere, a, e)) return a;
    if (base) {
      if (eChange && !aChange) {
        depuisExcel++;
        return e;
      }
      if (aChange && !eChange) {
        versExcel++;
        return a;
      }
    } else {
      if (!(a ?? "").trim()) {
        depuisExcel++;
        return e;
      }
      if (!(e ?? "").trim()) {
        versExcel++;
        return a;
      }
    }
    conflits.push({ cle, libelle, appli: a ?? "", excel: e ?? "" });
    return a;
  };

  // cases
  for (const id of Object.keys(appli.cases)) {
    const ligne: Record<string, string> = {};
    const criteres = new Set([...Object.keys(appli.cases[id] ?? {}), ...Object.keys(excel.cases[id] ?? {}), ...Object.keys(base?.cases[id] ?? {})]);
    for (const c of criteres) {
      if (c !== COMMENTAIRE && !nomCritere.has(c)) continue;
      const v = trancher(`case|${id}|${c}`, `${id} · ${nomCritere.get(c)}`, c, base?.cases[id]?.[c], appli.cases[id]?.[c], excel.cases[id]?.[c], excel.presentes.cases.has(`${id}|${c}`));
      if (v && v.trim()) ligne[c] = v;
    }
    etat.cases[id] = ligne;
  }

  // liens : présence + note
  const cles = new Set([...Object.keys(appli.liens), ...Object.keys(excel.liens), ...Object.keys(base?.liens ?? {})]);
  for (const cle of [...cles].sort()) {
    const [de, type, vers] = cle.split("|") as [string, string, string];
    const nomType = reglages.typesLiens.find((t) => t.id === type)?.nom ?? type;
    const libelle = `Lien ${de} ${nomType} ${vers}`;
    const dansA = cle in appli.liens;
    const dansE = cle in excel.liens;
    const dansB = base ? cle in base.liens : false;
    if (!excel.presentes.liens) {
      if (dansA) etat.liens[cle] = appli.liens[cle]!;
      continue;
    }
    if (dansA && dansE) {
      const v = trancher(`lien|${cle}`, libelle, "", base?.liens[cle], appli.liens[cle], excel.liens[cle], true);
      etat.liens[cle] = v ?? "";
      continue;
    }
    if (!dansA && !dansE) continue;
    const present = dansA ? appli.liens[cle]! : excel.liens[cle]!;
    if (!base) {
      // première fois : un lien d'un seul côté est ajouté de l'autre
      etat.liens[cle] = present;
      if (dansA) versExcel++;
      else depuisExcel++;
      continue;
    }
    if (!dansB) {
      // ajouté d'un côté depuis la dernière synchronisation
      etat.liens[cle] = present;
      if (dansA) versExcel++;
      else depuisExcel++;
      continue;
    }
    // supprimé d'un côté : suppression, sauf si l'autre côté a modifié la note entre-temps (conflit)
    const restant = dansA ? appli.liens[cle]! : excel.liens[cle]!;
    if (espaces(restant) !== espaces(base.liens[cle] ?? "")) {
      conflits.push({ cle: `lien|${cle}`, libelle, appli: dansA ? restant : "(supprimé)", excel: dansE ? restant : "(supprimé)" });
      if (dansA) etat.liens[cle] = restant;
      continue;
    }
    if (dansA) depuisExcel++;
    else versExcel++;
  }

  // définitions : une définition vide d'un côté n'est jamais une suppression venue d'Excel si la feuille manque
  const defs = new Set([...Object.keys(appli.definitions), ...Object.keys(excel.definitions), ...Object.keys(base?.definitions ?? {})]);
  for (const cle of [...defs].sort()) {
    const critere = cle.slice(0, cle.indexOf("|"));
    const a = appli.definitions[cle];
    const e = excel.definitions[cle];
    const b = base?.definitions[cle];
    const etiquette = (a ?? e ?? b)![0];
    const v = trancher(`definition|${cle}`, `Définition de « ${etiquette} » (${nomCritere.get(critere) ?? critere})`, "", b?.[1], a?.[1], e?.[1], excel.presentes.definitions);
    if (v && v.trim()) etat.definitions[cle] = [a?.[0] ?? e?.[0] ?? etiquette, v];
  }
  return { etat, conflits, depuisExcel, versExcel };
}

/** Applique les choix de l'utilisateur sur les conflits (par défaut : la version de l'appli). */
export function trancherConflits(f: Fusion, choix: Readonly<Record<string, "appli" | "excel">>): Etat {
  const etat: Etat = structuredClone(f.etat);
  for (const c of f.conflits) {
    if (choix[c.cle] !== "excel") continue;
    const [genre, ...reste] = c.cle.split("|");
    if (genre === "case") {
      const [id, critere] = reste as [string, string];
      const ligne = (etat.cases[id] ??= {});
      if (c.excel.trim()) ligne[critere] = c.excel;
      else delete ligne[critere];
    } else if (genre === "lien") {
      const cle = reste.join("|");
      if (c.excel === "(supprimé)") delete etat.liens[cle];
      else etat.liens[cle] = c.excel;
    } else if (genre === "definition") {
      const cle = reste.join("|");
      const e = etat.definitions[cle]?.[0] ?? reste[1]!;
      if (c.excel.trim()) etat.definitions[cle] = [e, c.excel];
      else delete etat.definitions[cle];
    }
  }
  return etat;
}

/** Ce que l'état retenu change dans l'appli : fiches modifiées et réglages (définitions). */
export function appliquer(refs: readonly ObjetRef[], reglages: ReglagesLecture, etat: Etat): { modifiees: ObjetRef[]; reglages: ReglagesLecture } {
  const modifiees: ObjetRef[] = [];
  const liensPar = new Map<string, { vers: string; type: string; note: string }[]>();
  for (const [cle, note] of Object.entries(etat.liens)) {
    const [de, type, vers] = cle.split("|") as [string, string, string];
    liensPar.set(de, [...(liensPar.get(de) ?? []), { vers, type, note }]);
  }
  const typesConnus = new Set(reglages.typesLiens.map((t) => t.id));
  for (const r of refs) {
    let v = r.valeur;
    const ligne = etat.cases[r.id];
    if (ligne) {
      for (const c of reglages.criteres) {
        const cible = lireCellule(ligne[c.id] ?? "");
        // une case changée dans Excel a été écrite à la main : validée ; sinon elle garde son état
        if (cleCellule(cible) !== cleCellule(v.lecture[c.id])) v = avecCellule(v, c.id, { ...cible, valide: true });
        else if (ligne[c.id] && texteCellule(v.lecture[c.id]) !== ligne[c.id]) v = avecCellule(v, c.id, { ...cible, valide: v.lecture[c.id]?.valide ?? true });
      }
      const com = ligne[COMMENTAIRE] ?? "";
      if (espaces(com) !== espaces(v.commentaire)) v = { ...v, commentaire: com };
    }
    // liens d'un type inconnu de la synchro : gardés tels quels
    const horsSynchro = v.liens.filter((l) => !typesConnus.has(l.type));
    const liens = [...horsSynchro, ...(liensPar.get(r.id) ?? [])].sort((a, b) => triIds(a.vers, b.vers) || a.type.localeCompare(b.type));
    if (JSON.stringify(liens) !== JSON.stringify(v.liens)) v = { ...v, liens };
    if (v !== r.valeur) modifiees.push({ id: r.id, valeur: v });
  }
  let nouveaux: ReglagesLecture = { ...reglages, definitions: {} };
  for (const [cle, [e, d]] of Object.entries(etat.definitions)) nouveaux = definir(nouveaux, cle.slice(0, cle.indexOf("|")), e, d);
  return { modifiees, reglages: JSON.stringify(nouveaux.definitions) === JSON.stringify(reglages.definitions) ? reglages : nouveaux };
}

// ---- État de la dernière synchronisation ----

export interface Synchro {
  /** Empreinte du classeur tel qu'écrit à la dernière synchronisation (pour savoir s'il a été modifié). */
  empreinte: string;
  date: string;
  etat: Etat;
}

/** Empreinte d'un fichier (FNV-1a 32 bits + taille). */
export function empreinte(octets: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < octets.length; i++) {
    h ^= octets[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16).padStart(8, "0")}-${octets.length}`;
}

export function lireSynchro(brut: unknown): Synchro | null {
  const b = (typeof brut === "object" && brut !== null ? brut : {}) as Record<string, unknown>;
  const e = (typeof b.etat === "object" && b.etat !== null ? b.etat : null) as Record<string, unknown> | null;
  if (typeof b.empreinte !== "string" || !e) return null;
  return {
    empreinte: b.empreinte,
    date: typeof b.date === "string" ? b.date : "",
    etat: {
      cases: (e.cases ?? {}) as Etat["cases"],
      liens: (e.liens ?? {}) as Etat["liens"],
      definitions: (e.definitions ?? {}) as Etat["definitions"],
    },
  };
}

export const ecrireSynchro = (s: Synchro) => jsonStable(s);
