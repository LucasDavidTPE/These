/**
 * Citations d'une présentation : \`[@BIB-020]\` devient « (Olard & Di Benedetto, 2003) » et les
 * références citées forment des diapos « Références » à la fin, par ordre alphabétique.
 * Une clé inconnue reste telle qu'écrite et est signalée.
 */
import { citationAuteurAnnee, clesCitees, remplacerCitations, type ReferenceCitee } from "@noyau/citations";
import type { Bloc, Diapo, Presentation } from "./presentation";

/** Au-delà, une diapo « Références » de plus (14 pt, 16:9). */
export const REFERENCES_PAR_DIAPO = 7;

function textes(p: Presentation): string[] {
  const out: string[] = [];
  for (const d of p.diapos) {
    out.push(d.titre, d.sousTitre, d.source);
    for (const b of [...d.gauche, ...d.droite]) out.push(b.type === "image" ? b.legende : b.texte);
  }
  return out;
}

export function clesDePresentation(p: Presentation): string[] {
  return clesCitees(textes(p).join("\n"));
}

export function citerPresentation(p: Presentation, refs: ReadonlyMap<string, ReferenceCitee>): { presentation: Presentation; citees: ReferenceCitee[]; inconnues: string[] } {
  const cles = clesDePresentation(p);
  const inconnues = cles.filter((c) => !refs.has(c));
  const t = (s: string) => remplacerCitations(s, (c) => citationAuteurAnnee(c, refs));
  const bloc = (b: Bloc): Bloc => (b.type === "image" ? { ...b, legende: t(b.legende) } : b.type === "equation" ? b : { ...b, texte: t(b.texte) });
  const diapos: Diapo[] = p.diapos.map((d) => ({ ...d, titre: t(d.titre), sousTitre: t(d.sousTitre), source: t(d.source), gauche: d.gauche.map(bloc), droite: d.droite.map(bloc) }));
  const parId = new Map<string, ReferenceCitee>();
  for (const c of cles) {
    const r = refs.get(c);
    if (r) parId.set(r.id, r);
  }
  const citees = [...parId.values()].sort((a, b) => a.complete.localeCompare(b.complete, "fr"));
  if (p.references && citees.length) {
    const n = Math.ceil(citees.length / REFERENCES_PAR_DIAPO);
    for (let i = 0; i < n; i++)
      diapos.push({
        mise: "references",
        titre: n > 1 ? `Références (${i + 1}/${n})` : "Références",
        sousTitre: "",
        gauche: citees.slice(i * REFERENCES_PAR_DIAPO, (i + 1) * REFERENCES_PAR_DIAPO).map((r) => ({ type: "texte", texte: r.complete })),
        droite: [],
        source: "",
      });
  }
  return { presentation: { ...p, diapos }, citees, inconnues };
}
