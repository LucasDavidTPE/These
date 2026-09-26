/**
 * Export pgfgantt (SPEC §10.3) : le Gantt en LaTeX, pour un comité de suivi ou le
 * manuscrit. Une barre par élément, un jalon pour une date seule, groupé par catégorie.
 */
import { iso, jour, type Groupe } from "./gantt";

const tex = (s: string) => s.replace(/\\/g, "\\textbackslash{}").replace(/([&%$#_{}])/g, "\\$1");

export function versPgfgantt(groupes: Groupe[], debut: string, fin: string): string {
  const lignes: string[] = [
    "% Généré par Thèse (module Planning). Nécessite \\usepackage{pgfgantt}.",
    `\\begin{ganttchart}[`,
    "    time slot format=isodate, time slot unit=month,",
    "    x unit=6mm, y unit chart=6mm, vgrid, hgrid,",
    "    bar/.append style={draw=none}, milestone/.append style={draw=none},",
    `  ]{${debut.slice(0, 7)}-01}{${fin.slice(0, 7)}-01}`,
    "  \\gantttitlecalendar{year, month=shortname} \\\\",
  ];
  for (const g of groupes) {
    const couleur = g.categorie.couleur.slice(1).toUpperCase();
    lignes.push(`  \\ganttgroup{${tex(g.categorie.nom)}}{${g.barres[0]!.debut.slice(0, 7)}-01}{${g.barres.at(-1)!.debut.slice(0, 7)}-01} \\\\`);
    for (const b of g.barres) {
      const d = b.debut.slice(0, 7) + "-01";
      if (b.fin === "") {
        lignes.push(`  \\ganttmilestone[milestone/.append style={fill={[HTML]${couleur}}}]{${tex(b.titre)}}{${d}} \\\\`);
      } else {
        const f = iso(Math.max(jour(b.fin), jour(b.debut))).slice(0, 7) + "-01";
        lignes.push(`  \\ganttbar[bar/.append style={fill={[HTML]${couleur}}}]{${tex(b.titre)}}{${d}}{${f}} \\\\`);
      }
    }
  }
  // pgfgantt refuse une ligne vide finale : on retire le dernier « \\ ».
  lignes[lignes.length - 1] = lignes.at(-1)!.replace(/ \\\\$/, "");
  lignes.push("\\end{ganttchart}", "");
  return lignes.join("\n");
}
