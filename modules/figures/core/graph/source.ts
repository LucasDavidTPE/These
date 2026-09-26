/** Ouverture d'une source de données : classeur .xlsx, ou texte (CSV, collage tabulé). */
import { parseDelimited } from "./table";
import { readXlsx, type Sheet } from "./xlsx";

/** Décode un texte : UTF-8 si valide, sinon Windows-1252 (CSV enregistrés par Excel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function readDataFile(name: string, bytes: Uint8Array): Sheet[] {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip || /\.xls[xm]$/i.test(name)) return readXlsx(bytes);
  if (/\.xls$/i.test(name)) throw new Error("Les anciens fichiers .xls ne sont pas pris en charge : les enregistrer en .xlsx dans Excel.");
  return [{ name: name.replace(/\.[^.]+$/, "") || "Données", rows: parseDelimited(decodeText(bytes)) }];
}

export function readPasted(text: string): Sheet[] {
  return [{ name: "Collage", rows: parseDelimited(text) }];
}
