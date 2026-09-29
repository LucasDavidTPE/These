/** Lecture et écriture des cartes d'une zone dans l'espace (format dans noyau/cartes). */
import { assembler, dossierCartes, ecrireCarteMd, estIdCarte, INDEX_CARTES, lireCarteMd, lireIndex, type Carte, type CarteFournie, type IndexCartes } from "@noyau/cartes";
import { joindre, type Fichiers } from "@noyau/stockage";

export interface CartesChargees {
  visibles: Carte[];
  masquees: Carte[];
  index: IndexCartes;
}

export async function chargerCartes(fs: Fichiers, zone: string, fournies: readonly CarteFournie[]): Promise<CartesChargees> {
  const dossier = dossierCartes(zone);
  const fichiers = new Map<string, { titre: string; texte: string }>();
  let index: IndexCartes = { ordre: [], masquees: [] };
  if (await fs.exists(dossier)) {
    for (const e of await fs.listDir(dossier)) {
      if (e.kind !== "file") continue;
      if (e.name === INDEX_CARTES) {
        try {
          index = lireIndex(JSON.parse(await fs.readText(joindre(dossier, e.name))));
        } catch {
          // index abîmé : ordre par défaut
        }
      } else if (e.name.endsWith(".md") && estIdCarte(e.name.slice(0, -3))) fichiers.set(e.name.slice(0, -3), lireCarteMd(await fs.readText(joindre(dossier, e.name))));
    }
  }
  return { ...assembler(fournies, fichiers, index), index };
}

export async function ecrireCarte(fs: Fichiers, zone: string, id: string, titre: string, texte: string): Promise<void> {
  if (!estIdCarte(id)) throw new Error(`Identifiant de carte invalide : ${id}`);
  await fs.ensureDir(dossierCartes(zone));
  await fs.writeTextAtomic(joindre(dossierCartes(zone), `${id}.md`), ecrireCarteMd(titre, texte));
}

export async function ecrireIndex(fs: Fichiers, zone: string, index: IndexCartes): Promise<void> {
  await fs.ensureDir(dossierCartes(zone));
  await fs.writeTextAtomic(joindre(dossierCartes(zone), INDEX_CARTES), JSON.stringify(index, null, 2) + "\n");
}

/** Range le fichier d'une carte dans `.anciennes/` (retour au texte d'origine, ou carte retirée) : rien n'est effacé. */
export async function rangerCarte(fs: Fichiers, zone: string, id: string): Promise<void> {
  const dossier = dossierCartes(zone);
  const chemin = joindre(dossier, `${id}.md`);
  if (!(await fs.exists(chemin))) return;
  await fs.ensureDir(joindre(dossier, ".anciennes"));
  await fs.rename(chemin, joindre(dossier, ".anciennes", `${Date.now()}-${id}.md`));
}
