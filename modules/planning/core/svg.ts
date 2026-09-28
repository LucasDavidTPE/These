/**
 * Le Gantt en SVG autonome (SPEC §10.3), pour un comité de suivi ou le manuscrit : toute
 * la thèse sur une largeur fixe, libellés à gauche, styles en ligne (le fichier s'ouvre
 * tel quel dans un navigateur ou Inkscape). Déterministe : mêmes éléments et même date du
 * jour → mêmes octets (SPEC §11).
 */
import { echapperXml } from "@noyau/texte";
import { echelle, graduations, largeur, x, type Groupe } from "./gantt";

const H_LIGNE = 22;
const H_GROUPE = 22;
const H_ENTETE = 34;
const L_LIBELLES = 280;
const MARGE = 16;
const POLICE = "font-family=\"'Segoe UI', Arial, sans-serif\"";

const n = (v: number) => String(Math.round(v * 10) / 10);

export interface OptionsSvg {
  /** Largeur de la frise des dates, en pixels (hors libellés). */
  largeurFrise?: number;
  titre?: string;
}

export function ganttSvg(groupes: Groupe[], aujourdhui: string, o: OptionsSvg = {}): string {
  const toutes = groupes.flatMap((g) => g.barres);
  const e = echelle(toutes, aujourdhui, "these", o.largeurFrise ?? 900);
  const W = largeur(e);
  const hTitre = o.titre ? 28 : 0;
  const lignes = groupes.flatMap((g) => [{ g, b: null }, ...g.barres.map((b) => ({ g, b }))]);
  const hauteurCorps = lignes.reduce((h, l) => h + (l.b ? H_LIGNE : H_GROUPE), 0);
  const largeurTotale = MARGE * 2 + L_LIBELLES + W;
  const hauteurTotale = MARGE * 2 + hTitre + H_ENTETE + hauteurCorps;
  const x0 = MARGE + L_LIBELLES;
  const y0 = MARGE + hTitre;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(largeurTotale)}" height="${n(hauteurTotale)}" viewBox="0 0 ${n(largeurTotale)} ${n(hauteurTotale)}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
  ];
  if (o.titre) out.push(`<text x="${MARGE}" y="${MARGE + 18}" ${POLICE} font-size="16" font-weight="600" fill="#1d1d1b">${echapperXml(o.titre)}</text>`);

  // Frise : graduations et libellés des mois (ou des trimestres).
  for (const t of graduations(e, "these")) {
    out.push(`<line x1="${n(x0 + t.x)}" x2="${n(x0 + t.x)}" y1="${n(y0 + H_ENTETE - 8)}" y2="${n(y0 + H_ENTETE + hauteurCorps)}" stroke="${t.majeure ? "#9a9a9a" : "#dddddd"}" stroke-width="1"/>`);
    out.push(`<text x="${n(x0 + t.x + 3)}" y="${n(y0 + 18)}" ${POLICE} font-size="11" fill="${t.majeure ? "#1d1d1b" : "#666666"}"${t.majeure ? ` font-weight="600"` : ""}>${echapperXml(t.libelle)}</text>`);
  }

  let y = y0 + H_ENTETE;
  for (const l of lignes) {
    if (!l.b) {
      out.push(`<rect x="${MARGE}" y="${n(y)}" width="${n(L_LIBELLES + W)}" height="${H_GROUPE}" fill="#f2f1ee"/>`);
      out.push(`<text x="${MARGE + 6}" y="${n(y + 15)}" ${POLICE} font-size="12" font-weight="600" fill="#1d1d1b">${echapperXml(l.g.categorie.nom)}</text>`);
      y += H_GROUPE;
      continue;
    }
    const b = l.b;
    const couleur = l.g.categorie.couleur;
    const libelle = b.titre.length > 44 ? `${b.titre.slice(0, 43)}…` : b.titre;
    out.push(`<text x="${MARGE + 16}" y="${n(y + 15)}" ${POLICE} font-size="11" fill="${b.source ? "#666666" : "#1d1d1b"}">${echapperXml(libelle)}</text>`);
    const xa = x0 + x(e, b.debut);
    if (!b.fin) {
      const c = 6;
      const cy = y + H_LIGNE / 2;
      out.push(`<path d="M${n(xa)} ${n(cy - c)} L${n(xa + c)} ${n(cy)} L${n(xa)} ${n(cy + c)} L${n(xa - c)} ${n(cy)} Z" fill="${couleur}"/>`);
    } else {
      const w = Math.max(3, x(e, b.fin) - x(e, b.debut) + e.pxParJour);
      out.push(`<rect x="${n(xa)}" y="${n(y + 5)}" width="${n(w)}" height="${H_LIGNE - 10}" rx="3" fill="${couleur}" fill-opacity="${b.source ? "0.55" : "0.9"}"/>`);
      if (b.avancement > 0) out.push(`<rect x="${n(xa)}" y="${n(y + H_LIGNE - 7)}" width="${n((w * Math.min(100, b.avancement)) / 100)}" height="2.5" fill="#1d1d1b" fill-opacity="0.6"/>`);
    }
    y += H_LIGNE;
  }

  const xAuj = x0 + x(e, aujourdhui);
  out.push(`<line x1="${n(xAuj)}" x2="${n(xAuj)}" y1="${n(y0 + H_ENTETE - 8)}" y2="${n(y)}" stroke="#c0392b" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  out.push(`<text x="${n(xAuj + 3)}" y="${n(y0 + H_ENTETE - 10)}" ${POLICE} font-size="10" fill="#c0392b">aujourd'hui</text>`);
  out.push("</svg>");
  return out.join("\n") + "\n";
}
