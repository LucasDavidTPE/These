/**
 * Point d'entrée de la lecture de fichiers (portage de io/lecture.js). L'analyse est
 * asynchrone et découpée en morceaux au rythme de la décompression, si bien que l'interface
 * reste réactive et que la progression s'affiche.
 */
import { devinerUniteAxiale, type Correspondance, type TableBrute } from "../donnees";
import { attribuerVoies, reperer } from "./entetes";
import { lireTexte, type Progres } from "./texte";
import { lireXlsx } from "./xlsx-lecture";

/** Ce qu'il faut d'un fichier : son nom et son contenu (File du navigateur, ou octets lus par la plateforme). */
export interface FichierMesure {
  name: string;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
}

export interface Lu {
  table: TableBrute;
  entetes: string[];
  correspondance: Correspondance;
  uniteAxiale: string;
  nom: string;
}

/** Un fichier depuis ses octets (lecture par la plateforme). */
export function fichierDepuisOctets(nom: string, octets: Uint8Array): FichierMesure {
  return {
    name: nom,
    text: async () => new TextDecoder().decode(octets),
    arrayBuffer: async () => octets.slice().buffer,
  };
}

export async function lireFichier(fichier: FichierMesure, progres: Progres = () => {}): Promise<Lu> {
  const ext = (fichier.name.split(".").pop() || "").toLowerCase();
  let table: TableBrute;

  if (ext === "xlsx" || ext === "xlsm") {
    progres("ouverture", 0);
    if (!fichier.arrayBuffer) throw new Error("Contenu binaire indisponible pour ce fichier.");
    table = await lireXlsx(await fichier.arrayBuffer(), progres);
  } else if (ext === "xls") {
    throw new Error("Les classeurs .xls (ancien format binaire) ne sont pas lus ici. Enregistre-le en .xlsx, ou mieux : exporte le .csv de la machine, bien plus rapide.");
  } else {
    progres("ouverture", 0);
    table = lireTexte(await fichier.text(), progres);
  }

  const { entetes, premiereLigne } = reperer(table);
  const correspondance = attribuerVoies(entetes);

  // on écarte les lignes d'en-tête : les colonnes deviennent des vues, sans recopie
  const utile = premiereLigne > 0 ? table.tranche(premiereLigne, table.n - 1) : table;
  utile.entetes = entetes;
  utile.lignesTexte = table.lignesTexte;

  // lignes sans numéro de cycle : équivalent du Clean_Data de la macro
  const cCyc = utile.colonne(correspondance.cycle);
  let dernier = utile.n;
  if (cCyc) {
    while (dernier > 0 && !Number.isFinite(cCyc[dernier - 1])) dernier--;
  }
  const table2 = dernier < utile.n ? utile.tranche(0, dernier - 1) : utile;
  table2.entetes = entetes;

  return { table: table2, entetes, correspondance, uniteAxiale: devinerUniteAxiale(table2, correspondance.defA), nom: fichier.name };
}
