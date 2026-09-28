/** Chargement de fichiers de mesure dans la page (dépôt, « Ouvrir ») : lecture, détection, traitement. */
import { detecter, essaiDepuisLecture, traiter } from "../core/essai";
import { entier } from "../core/format";
import { lireFichier, type FichierMesure } from "../core/io/lecture";
import { souffler, useTraitement } from "./etat";

/** Lit des fichiers et en fait des essais traités (dépôt, « Ouvrir », ou essai d'une campagne). */
export async function chargerFichiers(fichiers: FichierMesure[], remplacer = false): Promise<boolean> {
  const st = useTraitement.getState();
  let ok = true;
  await st.tache("Lecture…", async (progres) => {
    if (remplacer) st.maj((s) => ((s.essais = []), (s.actif = 0)));
    for (const f of fichiers) {
      let r;
      try {
        r = await lireFichier(f, (etape, part) => {
          useTraitement.setState({ occupe: { texte: `${f.name} — ${etape}`, part } });
        });
      } catch (e) {
        ok = false;
        st.maj((s) => (s.infoFichier = `Lecture impossible. ${e instanceof Error ? e.message : String(e)} — vérifie qu'il s'agit bien d'un export de la machine.`));
        return;
      }
      const s0 = useTraitement.getState();
      const e = essaiDepuisLecture(r, s0.essais.filter((x) => !x.demo).length);
      const info = detecter(e);
      useTraitement.setState({ occupe: { texte: "Traitement de la campagne…", part: 0 } });
      await souffler();
      await traiter(e, progres, souffler);
      st.maj((s) => {
        s.essais = [...s.essais.filter((x) => !x.demo), e];
        s.actif = s.essais.length - 1;
        s.palier = 0;
        s.cycle = 0;
        s.infoFichier = `${f.name} — ${entier(r.table.n)} lignes, ${r.table.colonnes.length} colonnes, extensomètres lus en ${r.uniteAxiale}.`;
        s.infoDetection = info ?? "";
      });
    }
  });
  return ok;
}

