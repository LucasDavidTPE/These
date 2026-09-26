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
const RECHERCHE = "C:\\Users\\DAVID\\Desktop\\Recherche";

/** Essai de démonstration au format WaveMatrix : paliers de température, force cyclique. */
function essaiDemo(): Record<string, string> {
  const l = ['"Nombre total de cycles";"Temps total (s)";"Force(8800 (0,1):Charge) (kN)";"Personnalisée(103 (0,3):Lion171144) (µm)";"Personnalisée(103 (0,5):Défini par utilisateur) (°C)";'];
  for (let i = 0; i < 6000; i++) {
    const t = i * 30;
    const palier = [-10, 0, 10, 20, 30][Math.min(4, Math.floor(i / 1200))]!;
    const f = Math.sin(t / 7) * (2.5 - palier / 20);
    l.push([Math.floor(i / 20) + 1, t, f.toFixed(3), (f * 12).toFixed(2), (palier + Math.sin(i / 40) * 0.2).toFixed(2), ""].join(";").replace(/\./g, ","));
  }
  const log = [
    "01/06/2026;09:00:00;Demo;Essai1;60101;Création;",
    "01/06/2026;09:00:00;Demo;Essai1;60107;Utilisateur;ltds",
    "03/06/2026;11:00:00;Demo;Essai1;60121;Forme d'onde;1200",
    "03/06/2026;11:00:00;Demo;Essai1;60120;Durée;180000",
    "03/06/2026;11:00:00;Demo;Essai1;60202;État;Essai terminé",
  ].join("\n");
  return { "Demo CM/Essai1/Essai1.steps.tracking.csv": l.join("\n"), "Demo CM/Essai1/Essai1.log": log };
}

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

  /** Dossier démo qui contient `chemin`, et le chemin relatif à l'intérieur. */
  const parent = (chemin: string): [FichiersMemoire, string] | null => {
    const cle = normaliser(chemin);
    for (const [k, fs] of dossiers) {
      if (cle.startsWith(k + "\\")) return [fs, chemin.replace(/[\\/]+$/, "").slice(k.length + 1).split("\\").join("/")];
    }
    return null;
  };

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
      racines: { essais: "E:\\", "biblio-pdf": BIBLIO, recherche: RECHERCHE, manuscrits: `${ONEDRIVE}\\Thèse\\Rédaction` },
    });
    const espace = dossier(ESPACE);
    espace.poser("espace.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:00:00+02:00",\n  "creePar": "LGCB-AA03956"\n}\n');
    espace.poser("espace-PC-MAISON.json", '{\n  "format": 1,\n  "cree": "2026-09-26T10:05:00+02:00",\n  "creePar": "PC-MAISON"\n}\n');
    espace.poser("espace.json.tmp", "{");
    dossier(BIBLIO);
    dossier(`${ONEDRIVE}\\Thèse\\Rédaction`).poser("Manuscrit thèse.docx", "PK démonstration");
    const recherche = dossier(RECHERCHE);
    for (const [chemin, contenu] of Object.entries(essaiDemo())) recherche.poser(chemin, contenu);
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
    dossierExiste: async (chemin) => {
      if (dossiers.has(normaliser(chemin))) return true;
      const p = parent(chemin);
      return p ? p[0].exists(p[1]) : false;
    },
    creerDossier: async (chemin) => {
      dossier(chemin);
    },
    copierDossier: async function (source, destination) {
      const src = this.fichiers(source);
      const dst = this.fichiers(destination);
      const r = { copies: 0, aJour: 0, octets: 0 };
      const copier = async (chemin: string) => {
        await dst.ensureDir(chemin);
        for (const e of await src.listDir(chemin)) {
          const c = chemin ? `${chemin}/${e.name}` : e.name;
          if (e.kind === "dir") await copier(c);
          else {
            const octets = await src.readBytes(c);
            await dst.writeBytesAtomic(c, octets);
            r.copies++;
            r.octets += octets.length;
          }
        }
      };
      await copier("");
      return r;
    },
    fichiers: (racine) => {
      const sous = !dossiers.has(normaliser(racine)) ? parent(racine) : null;
      if (sous) {
        // Sous-dossier d'un dossier démo (données d'un essai) : lecture seule suffit.
        const [fs, prefixe] = sous;
        const p = (c: string) => (c ? `${prefixe}/${c}` : prefixe);
        return { ...observe(fs, () => undefined), listDir: (c) => fs.listDir(p(c)), exists: (c) => fs.exists(p(c)), readText: (c) => fs.readText(p(c)), readBytes: (c) => fs.readBytes(p(c)) };
      }
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
    ouvrirFichier: (_titre, extensions) =>
      new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = extensions.map((e) => `.${e}`).join(",");
        input.onchange = async () => {
          const f = input.files?.[0];
          resolve(f ? { nom: f.name, octets: new Uint8Array(await f.arrayBuffer()) } : null);
        };
        input.click();
      }),
    verifierMiseAJour: async () =>
      scenario === "maj"
        ? { version: "9.9.9", notes: "Démonstration.", installer: async () => window.alert("Démonstration : l'application se mettrait à jour puis redémarrerait.") }
        : null,
    ouvrirVSCode: async (chemin) => {
      window.alert(`Démonstration : VS Code s'ouvrirait sur\n${chemin}`);
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
