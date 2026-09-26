/**
 * Exports (SPEC §9.3) : RIS pour Zotero (macro ExporterRIS) et BibTeX pour LaTeX, avec les
 * mêmes clés. Déterministes : mêmes références → mêmes octets.
 */
import type { Parametres, Reference } from "./modele";

function auteurs(r: Reference): string[] {
  return r.auteurs
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean);
}

function pages(r: Reference): [string, string] {
  const [debut = "", fin = ""] = r.pages.split(/\s*[-–]\s*/);
  return [debut, fin];
}

export function versRis(refs: Reference[], p: Parametres): string {
  const out: string[] = [];
  for (const r of refs) {
    const l = (tag: string, v: string | number | null | undefined) => {
      if (v !== null && v !== undefined && String(v).trim() !== "") out.push(`${tag}  - ${String(v).trim()}`);
    };
    l("TY", r.typeRis || "GEN");
    l("ID", r.cle);
    for (const a of auteurs(r)) l("AU", a);
    l("TI", r.titre);
    l("T2", r.support);
    l("PY", r.annee);
    l("VL", r.volume);
    l("IS", r.numero);
    const [sp, ep] = pages(r);
    l("SP", sp);
    l("EP", ep);
    l("PB", r.editeur);
    l("SN", r.identifiant);
    l("DO", r.doi);
    l("UR", r.url);
    const axe = p.axes.find((a) => a.numero === r.axe);
    if (axe) l("KW", `Axe ${axe.numero} - ${axe.intitule}`);
    l("KW", r.priorite ? `Priorite: ${r.priorite}` : "");
    l("KW", r.mois ? `Mois ${r.mois}` : "");
    l("N1", r.contribution);
    out.push("ER  - ", "");
  }
  return out.join("\r\n");
}

const TYPES_BIBTEX: Record<string, [type: string, support: string, editeur: string]> = {
  JOUR: ["article", "journal", "publisher"],
  CONF: ["inproceedings", "booktitle", "publisher"],
  CHAP: ["incollection", "booktitle", "publisher"],
  BOOK: ["book", "series", "publisher"],
  THES: ["phdthesis", "note", "school"],
  RPRT: ["techreport", "note", "institution"],
  STAND: ["misc", "howpublished", "organization"],
  COMP: ["manual", "note", "organization"],
};

/** Échappe les caractères spéciaux de LaTeX ; les accents restent (biblatex / UTF-8). */
function tex(s: string): string {
  return s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}");
}

export function versBibtex(refs: Reference[]): string {
  return refs
    .filter((r) => r.cle)
    .map((r) => {
      const [type, champSupport, champEditeur] = TYPES_BIBTEX[r.typeRis] ?? ["misc", "howpublished", "publisher"];
      const champs: [string, string][] = [
        ["author", auteurs(r).join(" and ")],
        ["title", r.titre ? `{${tex(r.titre)}}` : ""],
        [champSupport, r.support],
        ["year", r.annee === null ? "" : String(r.annee)],
        ["volume", r.volume],
        ["number", r.numero],
        ["pages", r.pages.replace(/\s*[-–]\s*/, "--")],
        [champEditeur, r.editeur],
        ["doi", r.doi],
        ["url", r.doi ? "" : r.url],
        ["note", r.identifiant && type !== "phdthesis" && champSupport !== "note" ? r.identifiant : ""],
      ];
      const lignes = champs.filter(([, v]) => v.trim() !== "").map(([k, v]) => `  ${k} = {${k === "title" || k === "doi" || k === "url" ? v : tex(v)}}`);
      return `@${type}{${r.cle},\n${lignes.join(",\n")}\n}\n`;
    })
    .join("\n");
}
