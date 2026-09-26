/**
 * Plateforme de démonstration, en mémoire : l'interface tourne dans un navigateur
 * (`npm run dev`) sans Tauri, pour la développer et la vérifier. Rien n'est écrit sur disque.
 *
 * `?scenario=complet` prépare un poste déjà installé, avec de quoi remplir « À régler » :
 * une copie de conflit OneDrive, une écriture interrompue et une racine absente.
 */
import { ecrireReglages } from "@noyau/poste/reglages";
import { FichiersMemoire, type Fichiers } from "@noyau/stockage";
import type { Plateforme } from "@interface/plateforme";

const ONEDRIVE = "C:\\Users\\DAVID\\OneDrive - entpe.fr";
const ESPACE = `${ONEDRIVE}\\Thèse\\Espace`;
const BIBLIO = `${ONEDRIVE}\\Thèse\\BIBLIO`;

function normaliser(chemin: string): string {
  return chemin.replace(/[\\/]+$/, "").toLowerCase();
}

/** Enveloppe qui prévient les abonnés après chaque écriture, comme le ferait la surveillance. */
function observe(fs: FichiersMemoire, prevenir: (chemin: string) => void): Fichiers {
  const apres =
    <A extends unknown[]>(f: (...a: A) => Promise<void>) =>
    async (...a: A) => {
      await f(...a);
      prevenir(String(a[0]));
    };
  return {
    listDir: (p) => fs.listDir(p),
    exists: (p) => fs.exists(p),
    readText: (p) => fs.readText(p),
    readBytes: (p) => fs.readBytes(p),
    writeTextAtomic: apres((p: string, c: string) => fs.writeTextAtomic(p, c)),
    writeBytesAtomic: apres((p: string, c: Uint8Array) => fs.writeBytesAtomic(p, c)),
    writeTextNew: apres((p: string, c: string) => fs.writeTextNew(p, c)),
    createDir: apres((p: string) => fs.createDir(p)),
    ensureDir: apres((p: string) => fs.ensureDir(p)),
    rename: apres((de: string, vers: string) => fs.rename(de, vers)),
  };
}

export function plateformeDemo(scenario: string | null): Plateforme {
  const dossiers = new Map<string, FichiersMemoire>();
  const abonnes = new Map<string, Set<(chemins: string[]) => void>>();
  let reglages: string | null = null;

  const dossier = (chemin: string) => {
    const cle = normaliser(chemin);
    let fs = dossiers.get(cle);
    if (!fs) {
      fs = new FichiersMemoire();
      dossiers.set(cle, fs);
    }
    return fs;
  };

  if (scenario === "complet") {
    reglages = ecrireReglages({
      version: 1,
      espace: ESPACE,
      figures: `${ONEDRIVE}\\Figurine`,
      racines: { essais: "E:\\", "biblio-pdf": BIBLIO },
    });
    const espace = dossier(ESPACE);
    espace.poser("espace.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:00:00+02:00",\n  "creePar": "LGCB-AA03956"\n}\n');
    espace.poser("espace-PC-MAISON.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:05:00+02:00",\n  "creePar": "PC-MAISON"\n}\n');
    espace.poser("espace.json.tmp", "{");
    dossier(BIBLIO);
  }

  return {
    genre: "demo",
    nomDuPoste: async () => "PC-DEMO",
    lireReglages: async () => reglages,
    ecrireReglages: async (c) => {
      reglages = c;
    },
    dossiersOneDrive: async () => [ONEDRIVE],
    choisirDossier: async (titre, depart) => window.prompt(`${titre} (démonstration : saisissez un chemin)`, depart ?? "") || null,
    dossierExiste: async (chemin) => dossiers.has(normaliser(chemin)),
    creerDossier: async (chemin) => {
      dossier(chemin);
    },
    fichiers: (racine) => {
      const cle = normaliser(racine);
      return observe(dossier(racine), (chemin) => {
        for (const rappel of abonnes.get(cle) ?? []) rappel([chemin]);
      });
    },
    supprimerTemporaire: async (racine, chemin) => {
      if (!chemin.endsWith(".tmp")) throw new Error("Seuls les fichiers .tmp peuvent être supprimés.");
      dossier(racine).supprimer(chemin);
      for (const rappel of abonnes.get(normaliser(racine)) ?? []) rappel([chemin]);
    },
    enregistrerSous: async (nom, octets) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([octets as BlobPart]));
      a.download = nom;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return true;
    },
    ouvrirDossier: async (chemin) => {
      window.alert(`Démonstration : l'Explorateur s'ouvrirait sur\n${chemin}`);
    },
    ouvrirLien: async (url) => {
      window.open(url, "_blank", "noopener");
    },
    surveiller: async (racine, rappel) => {
      const cle = normaliser(racine);
      const set = abonnes.get(cle) ?? new Set();
      set.add(rappel);
      abonnes.set(cle, set);
      return () => set.delete(rappel);
    },
  };
}
