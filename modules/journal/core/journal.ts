/**
 * Journal : une note par jour (`journal/AAAA-MM-JJ.md`), en Markdown, avec des tâches
 * `- [ ] …` / `- [x] …`. À la création d'une note, les tâches non faites de la dernière note
 * y sont reportées (une seule fois : la note précédente garde son état).
 */

export const DOSSIER_JOURNAL = "journal";
const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const TACHE = /^(\s*[-*]\s+)\[( |x|X)\]\s+(.*)$/;

export const estJour = (s: string) => JOUR.test(s);
export const cheminJour = (jour: string) => `${DOSSIER_JOURNAL}/${jour}.md`;

export function jourDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function decaler(jour: string, n: number): string {
  const [a, m, j] = jour.split("-").map(Number) as [number, number, number];
  return jourDe(new Date(a, m - 1, j + n, 12));
}

/** « mardi 29 septembre 2026 ». */
export function titreJour(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number) as [number, number, number];
  return new Date(a, m - 1, j, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export interface Tache {
  /** Numéro de la ligne dans la note (0 = première). */
  ligne: number;
  fait: boolean;
  texte: string;
}

export function taches(md: string): Tache[] {
  const out: Tache[] = [];
  md.replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((l, ligne) => {
      const m = TACHE.exec(l);
      if (m) out.push({ ligne, fait: m[2] !== " ", texte: m[3]!.trim() });
    });
  return out;
}

/** Coche ou décoche la tâche de la ligne donnée ; le reste de la note est inchangé. */
export function basculer(md: string, ligne: number): string {
  const lignes = md.replace(/\r\n?/g, "\n").split("\n");
  const m = TACHE.exec(lignes[ligne] ?? "");
  if (!m) return md;
  lignes[ligne] = `${m[1]}[${m[2] === " " ? "x" : " "}] ${m[3]}`;
  return lignes.join("\n");
}

/** Ajoute une tâche à la fin de la section « À faire » (créée si besoin). */
export function ajouterTache(md: string, texte: string): string {
  const t = texte.trim();
  if (!t) return md;
  const lignes = md.replace(/\r\n?/g, "\n").split("\n");
  const debut = lignes.findIndex((l) => /^##\s+À faire\s*$/i.test(l.trim()));
  if (debut < 0) return `${md.trimEnd()}\n\n## À faire\n- [ ] ${t}\n`;
  let fin = debut + 1;
  while (fin < lignes.length && !/^#{1,2}\s/.test(lignes[fin]!.trim())) fin++;
  let pos = fin;
  while (pos > debut + 1 && !lignes[pos - 1]!.trim()) pos--;
  lignes.splice(pos, 0, `- [ ] ${t}`);
  return lignes.join("\n");
}

/** Note d'un nouveau jour, avec les tâches non faites de la note précédente. */
export function nouvelleNote(jour: string, precedente: string | null): string {
  const reportees = precedente ? taches(precedente).filter((t) => !t.fait) : [];
  return [`# ${titreJour(jour)}`, "", "## À faire", ...reportees.map((t) => `- [ ] ${t.texte}`), "", "## Notes", "", ""].join("\n");
}

/** Le jour le plus récent strictement avant `jour` parmi les notes existantes. */
export function precedent(jours: readonly string[], jour: string): string | null {
  return [...jours].filter((j) => j < jour).sort().pop() ?? null;
}
