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
import { zipSync } from "fflate";

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

  // `?scenario=complet&contenu=1` : un espace déjà garni (pour essayer la recherche globale).
  if (scenario === "complet" && new URLSearchParams(globalThis.location?.search).get("contenu")) {
    const espace = dossier(ESPACE);
    const ref = (n: number, titre: string, auteurs: string, annee: number) => espace.poser(`bibliotheque/references/BIB-${String(n).padStart(3, "0")}.json`, JSON.stringify({ titre, auteurs, annee, cle: `ref${n}` }));
    ref(1, "Viscoelastic response of asphalt pavements under moving loads", "Lee, S.; Kim, J.", 2019);
    ref(2, "Spectral method for layered media", "David, L.", 2024);
    espace.poser("planning/PH-0001.json", JSON.stringify({ titre: "Rédiger le chapitre ChaussSpec", categorie: "", debut: "2026-10-05", fin: "2026-10-30" }));
    espace.poser(
      "chausspec/structure-a340.json",
      JSON.stringify({
        structure: { bottom: "rigid_smooth", layers: [{ name: "BB", h: 0.3, material: { type: "elastic", E: 5000, nu: 0.35 } }, { name: "Sol", h: 2, material: { type: "elastic", E: 100, nu: 0.35 } }] },
        loading: { wheels: [{ x0: 0, y0: 0, footprint: { type: "rect", lx: 0.5, ly: 0.4, force: 100000 } }] },
        regime: { type: "static" },
        grid: { L: [16, 16], N: [256, 256], window: [-2, 2, -2, 2] },
        outputs: { depths: [0], components: ["uz"] },
      }),
    );
    espace.poser("numeriseur/courbe-tsrst.json", "{}");
    const figures = dossier(`${ESPACE}\\figures`);
    figures.poser("FIG-0001_courbe/meta.json", JSON.stringify({ id: "FIG-0001", title: "Courbe maîtresse", kind: "graph", created: "2026-09-20T10:00:00Z", modified: "2026-09-20T10:00:00Z", tags: ["2s2p1d"], used_in: [] }));
    const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
    void figures.writeBytesAtomic("FIG-0001_courbe/export.png", png);
    figures.poser("FIG-0002_long/meta.json", JSON.stringify({ id: "FIG-0002", title: "Comparaison_des_modules_complexes_2S2P1D_COMSOL_Viscoroute_vitesse_0.66_ms_essai_TSRST_final", kind: "graph", created: "2026-09-21T10:00:00Z", modified: "2026-09-21T10:00:00Z", tags: [], used_in: [] }));
    figures.poser("FIG-0003_long/meta.json", JSON.stringify({ id: "FIG-0003", title: "Schéma du modèle de Huet-Sayegh généralisé avec amortisseurs paraboliques", kind: "schema", created: "2026-09-22T10:00:00Z", modified: "2026-09-22T10:00:00Z", tags: [], used_in: [] }));
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
    copierDossier: async function (source, destination, options) {
      const src = this.fichiers(source);
      const dst = this.fichiers(destination);
      const r = { copies: 0, aJour: 0, octets: 0 };
      const copier = async (chemin: string) => {
        await dst.ensureDir(chemin);
        for (const e of await src.listDir(chemin)) {
          const c = chemin ? `${chemin}/${e.name}` : e.name;
          if (e.kind === "dir") await copier(c);
          else if (options?.sansEcraser && (await dst.exists(c))) r.aJour++;
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
    archiverDossier: async function (source, nom) {
      const src = this.fichiers(source);
      const contenu: Record<string, Uint8Array> = {};
      let octets = 0;
      const parcourir = async (chemin: string) => {
        for (const e of await src.listDir(chemin)) {
          const c = chemin ? `${chemin}/${e.name}` : e.name;
          if (e.kind === "dir") await parcourir(c);
          else if (!/\.(tmp|lock)$/i.test(e.name)) {
            contenu[c] = await src.readBytes(c);
            octets += contenu[c].length;
          }
        }
      };
      await parcourir("");
      const ok = await this.enregistrerSous(nom, zipSync(contenu, { level: 6 }));
      return ok ? { fichiers: Object.keys(contenu).length, octets } : null;
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
    verifierLien: async (url) => {
      // Démonstration : aucune requête ; une réponse plausible, stable pour une adresse.
      await new Promise((ok) => setTimeout(ok, 60));
      const h = [...url].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
      const code = h % 11 === 0 ? 404 : h % 7 === 0 ? 403 : 200;
      return { code, urlFinale: url, erreur: "" };
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
