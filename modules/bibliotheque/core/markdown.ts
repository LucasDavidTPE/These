/**
 * Export Markdown (SPEC §9.3, macros GenererNotesObsidian et GenererPointMensuel) : une note
 * par référence (en-tête YAML, fiche de lecture, notes) et un point mensuel. Lisible tel
 * quel, et dans Obsidian (propriétés, liens [[clé]] entre notes). Déterministe.
 */
import { citation, libelleMois, type Calcule } from "./calculs";
import type { Demande, Parametres, Reference } from "./modele";

const yaml = (v: string | number | boolean | null) => (v === null ? "" : typeof v === "string" ? JSON.stringify(v) : String(v));

/** Nom de fichier de la note : la clé BibTeX (ou l'ID), sans caractère interdit sous Windows. */
export function nomNote(id: string, r: Reference): string {
  return `${(r.cle || id).replace(/[\\/:*?"<>|#^[\]]/g, "_")}.md`;
}

function section(titre: string, lignes: [string, string][]): string[] {
  const pleines = lignes.filter(([, v]) => v.trim());
  if (!pleines.length) return [];
  return [`## ${titre}`, "", ...pleines.flatMap(([k, v]) => (k ? [`**${k}.** ${v.trim()}`, ""] : [v.trim(), ""]))];
}

/** « Tseng; Voiculescu » dans « Voir aussi » → liens [[tseng2019...]] quand ce sont des clés connues. */
function lierCles(texte: string, cles: ReadonlySet<string>): string {
  return texte.replace(/[A-Za-z][A-Za-z0-9_-]*\d{4}[A-Za-z0-9_-]*/g, (m) => (cles.has(m) ? `[[${m}]]` : m));
}

export function noteReference(c: Calcule, p: Parametres, cles: ReadonlySet<string> = new Set()): string {
  const r = c.ref;
  const axe = p.axes.find((a) => a.numero === r.axe);
  const f = r.fiche;
  const n = r.notes;
  const lignes = [
    "---",
    `id: ${c.id}`,
    `cle: ${yaml(r.cle)}`,
    `titre: ${yaml(r.titre)}`,
    `auteurs: ${yaml(r.auteurs)}`,
    `annee: ${yaml(r.annee)}`,
    ...(r.doi ? [`doi: ${yaml(r.doi)}`] : []),
    ...(axe ? [`axe: ${yaml(`${axe.numero} - ${axe.intitule}`)}`] : []),
    `priorite: ${yaml(r.priorite)}`,
    ...(r.mois ? [`mois: ${yaml(libelleMois(r.mois, p))}`] : []),
    `statut: ${yaml(r.statut)}`,
    ...(r.dateLecture ? [`lu_le: ${r.dateLecture}`] : []),
    `tags: [bibliographie${r.tfe ? ", tfe" : ""}${r.categories.length ? ", " + r.categories.map((k) => JSON.stringify(k)).join(", ") : ""}]`,
    "---",
    "",
    `# ${c.citation || citation(r)} — ${r.titre}`,
    "",
    [r.support, r.volume && `vol. ${r.volume}`, r.numero && `n° ${r.numero}`, r.pages && `p. ${r.pages}`, r.editeur].filter(Boolean).join(", "),
    "",
    ...(r.url ? [`[Lien](${r.url})${r.doi ? ` · [doi.org](https://doi.org/${r.doi})` : ""}`, ""] : r.doi ? [`[doi.org](https://doi.org/${r.doi})`, ""] : []),
    ...section("Apport", [["", r.contribution], ["Voir aussi", lierCles(r.voirAussi, cles)]]),
    ...section("Fiche de lecture", [
      ["Texte lu", [f.texteLu, f.sourceTexte && `(${f.sourceTexte})`].filter(Boolean).join(" ")],
      ["Objectif", f.objectif],
      ["Méthode", f.methode],
      ["Résultats annoncés", f.resultats],
      ["Limites", f.limites],
      ["Pour la thèse", f.pourThese],
      ["À vérifier", f.aVerifier],
    ]),
    ...section("Dimensions", [
      ["Pneu", f.pneu],
      ["Contact", f.contact],
      ["Loi", f.loi],
      ["Méthode", f.methodeCategorie],
      ["Chargement", f.chargement],
      ["Cible", f.cible],
      ["Validation", f.validation],
    ]),
    ...section("Mes notes", [
      ["Apport central", n.apport],
      ["Lien avec mes travaux", n.lien],
      ["Équations, valeurs, figures", n.equations],
      ["Chapitre visé", n.chapitre],
      ["À citer", n.aCiter],
    ]),
    ...(r.commentaire.trim() ? section("Commentaire", [["", r.commentaire]]) : []),
  ];
  return lignes.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Point mensuel : l'objectif du mois, ce qui a été lu, ce qui reste, les demandes. */
export function pointMensuel(mois: number, calc: readonly Calcule[], demandes: readonly Demande[], p: Parametres, aujourdhui: string): string {
  const duMois = calc.filter((c) => c.ref.mois === mois);
  const lues = duMois.filter((c) => c.ref.statut === "Lu");
  const reste = duMois.filter((c) => c.ref.statut !== "Lu" && c.ref.statut !== "Écarté").sort((a, b) => b.scoreTri - a.scoreTri);
  const obj = p.objectifs[String(mois)];
  const ligne = (c: Calcule) => `- [[${c.ref.cle || c.id}]] ${c.citation} — ${c.ref.titre}${c.ref.priorite ? ` *(${c.ref.priorite})*` : ""}`;
  const heuresRestantes = reste.reduce((s, c) => s + c.temps, 0);
  const aDemander = demandes.filter((d) => d.moisUsage === mois && d.statut !== "Reçue" && d.statut !== "Abandonnée");
  return (
    [
      "---",
      `mois: ${mois}`,
      `periode: ${JSON.stringify(libelleMois(mois, p))}`,
      `genere_le: ${aujourdhui}`,
      "tags: [bibliographie, point-mensuel]",
      "---",
      "",
      `# Point mensuel — mois ${mois} (${libelleMois(mois, p)})`,
      "",
      ...(obj?.titre ? [`**Objectif :** ${obj.titre}`, ""] : []),
      ...(obj?.finDeMois ? [`**En fin de mois :** ${obj.finDeMois}`, ""] : []),
      `${lues.length} lue(s) sur ${duMois.length} · ${reste.length} restante(s), environ ${Math.round(heuresRestantes)} h de lecture.`,
      "",
      "## Lu",
      "",
      ...(lues.length ? lues.map(ligne) : ["*Rien encore.*"]),
      "",
      "## À lire (par score)",
      "",
      ...(reste.length ? reste.map(ligne) : ["*Tout est lu.*"]),
      "",
      ...(aDemander.length ? ["## Demandes en cours", "", ...aDemander.map((d) => `- ${d.document} — ${d.interlocuteur} : ${d.statut}${d.dateEnvoi ? ` (envoyée le ${d.dateEnvoi})` : ""}`), ""] : []),
    ].join("\n").trimEnd() + "\n"
  );
}
