/** Chargement de fichiers de mesure dans la page (dépôt, « Ouvrir ») : lecture, détection, traitement. */
import { appliquerProjet, detecter, essaiDepuisLecture, traiter, type Essai } from "../core/essai";
import { lireDepouillement, localiserSource } from "../core/depouillement";
import { entier } from "../core/format";
import { fichierDepuisOctets, lireFichier, type FichierMesure } from "../core/io/lecture";
import type { Contexte } from "@interface/contexte";
import { marquerEnregistre } from "./sauvegarde";
import { souffler, useTraitement } from "./etat";

/** Lit des fichiers et en fait des essais traités (dépôt, « Ouvrir », ou essai d'une campagne). */
export async function chargerFichiers(fichiers: FichierMesure[], remplacer = false, preparer?: (e: Essai, i: number) => void): Promise<boolean> {
  const st = useTraitement.getState();
  let ok = true;
  await st.tache("Lecture…", async (progres) => {
    if (remplacer) st.maj((s) => ((s.essais = []), (s.actif = 0)));
    for (const [k, f] of fichiers.entries()) {
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
      preparer?.(e, k);
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


/** Rouvre un dépouillement enregistré dans l'espace : relit le fichier de mesure, rejoue le projet. */
export async function rouvrirDepouillement(ctx: Pick<Contexte, "espace" | "plateforme" | "reglages">, chemin: string): Promise<void> {
  const st = useTraitement.getState();
  await st.tache("Réouverture du dépouillement…", async (progres) => {
    if (!ctx.espace) throw new Error("Aucun espace Thèse ouvert.");
    const d = lireDepouillement(JSON.parse(await ctx.espace.fichiers.readText(chemin)));
    const lieu = localiserSource(d.source, ctx.reglages.racines);
    if (!lieu.ok) throw new Error(lieu.message);
    if (!(await ctx.plateforme.dossierExiste(lieu.dossier))) throw new Error(`Le fichier de mesure n'est pas sur ce poste (${lieu.dossier}).`);
    const octets = await ctx.plateforme.fichiers(lieu.dossier).readBytes(lieu.fichier);
    const e = essaiDepuisLecture(await lireFichier(fichierDepuisOctets(lieu.fichier, octets)), useTraitement.getState().essais.filter((x) => !x.demo).length);
    progres(0.5);
    await appliquerProjet([e], d.projet as Parameters<typeof appliquerProjet>[1]);
    e.source = d.source;
    e.enregistrement = { chemin, format: "depouillement" };
    marquerEnregistre(e);
    st.maj((s) => {
      s.essais = [...s.essais.filter((x) => !x.demo && x.enregistrement?.chemin !== chemin), e];
      s.actif = s.essais.length - 1;
      s.palier = 0;
      s.cycle = 0;
      s.etape = 3;
      s.infoFichier = `${lieu.fichier} — dépouillement rouvert (enregistré le ${d.modifie.slice(0, 16).replace("T", " à ")} sur ${d.poste || "?"}).`;
    });
  });
}
