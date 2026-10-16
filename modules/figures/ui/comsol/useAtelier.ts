/**
 * État de l'atelier COMSOL : fichiers ouverts (lus une fois, puis rejoués selon l'étude), recettes en cours par
 * mode, étude courante (enregistrée dans la bibliothèque, `_comsol/etudes/<id>.json`). Les fichiers sont suivis
 * par référence commune aux deux PC (onedrive:…, espace:…) : une étude se rouvre sur l'autre PC, et un fichier
 * réexporté par COMSOL se relit tout seul.
 */
import { create } from "zustand";
import { resoudreSource, versSource } from "@noyau/poste/partage";
import {
  ETUDE_FORMAT,
  DOSSIER_ETUDES,
  appliquerFichier,
  construireDerives,
  decodeText,
  estComsol,
  fichierEtude,
  identifiant,
  lireComsol,
  lireEtude,
  traceVide,
  type Cadre,
  sourcesDerive,
  type Derive,
  type EtudeComsol,
  type ExportComsol,
  type FichierEtude,
  type ModeTrace,
  type Recette,
  type Trace,
  type Transformation,
} from "../../core/graph";
import { joinPath } from "../../core/library";
import { useLibrary } from "../library/useLibrary";
import { getBackend } from "../platform/backend";

/** Ce que la coquille fournit pour retrouver les fichiers (racines du poste, espace). */
export interface EnvAtelier {
  espace: string | null;
  racines: Record<string, string>;
  /** Surveille un dossier (absolu) ; renvoie la fonction d'arrêt. */
  surveiller?: (dossier: string, rappel: (chemins: string[]) => void) => Promise<() => void>;
}

export interface Avis {
  niveau: "info" | "erreur";
  texte: string;
}

interface EtatAtelier {
  mode: ModeTrace | null;
  cadre: Cadre;
  /** Légendes saisies, par nom de fichier. */
  noms: Record<string, string>;
  /** Recette en cours de chaque mode. */
  traces: Partial<Record<ModeTrace, Trace>>;
  /** Fichiers suivis, dans l'ordre (comment les relire et les transformer). */
  fichiers: FichierEtude[];
  /** Fichiers lus tels quels (cache : une coupe de 7 Mo ne se relit pas à chaque réglage). */
  bruts: Record<string, ExportComsol>;
  derives: Derive[];
  /** Fichiers tels que l'étude les veut (transformés, dérivés compris) : ce que tracent les modes. */
  exports: ExportComsol[];
  etude: { id: string; titre: string } | null;
  /** Titre saisi dans la barre (pris à l'enregistrement, même déclenché par une recette). */
  titre: string;
  recettes: Recette[];
  /** Modifiée depuis le dernier enregistrement. */
  modifiee: boolean;
  avis: Avis | null;
  env: EnvAtelier;
  /** Panneaux de l'interface ouverts depuis les pistes (non enregistrés). */
  verifier: boolean;
  ensemble: boolean;
  rapport: boolean;

  set(p: Partial<Pick<EtatAtelier, "mode" | "noms" | "avis" | "titre" | "verifier" | "ensemble" | "rapport">>): void;
  setCadre(p: Partial<Cadre>): void;
  setEnv(env: EnvAtelier): void;
  majTrace(mode: ModeTrace, t: Trace): void;
  /** Ajoute (ou relit, s'il est déjà là) des fichiers ouverts ou déposés. */
  ajouter(fichiers: { name: string; bytes: Uint8Array; path?: string }[]): void;
  ouvrir(): Promise<void>;
  deposer(chemins: string[]): Promise<void>;
  /** Relit depuis le disque (tous, ou un seul). */
  relire(nom?: string): Promise<void>;
  retirer(nom: string): void;
  forcer(nom: string, forcer: number[] | null): void;
  transformer(nom: string, t: Transformation): void;
  /** Retire les changements de repère (revient aux coordonnées du fichier). */
  repereOrigine(nom: string): void;
  garderCalcule(d: Derive): void;
  // études
  listerEtudes(): Promise<{ id: string; titre: string; modifie: string }[]>;
  nouvelleEtude(): void;
  enregistrerEtude(titre?: string): Promise<string | null>;
  ouvrirEtude(id: string): Promise<void>;
  /** Garde la recette (identique : réutilisée) et renvoie son id ; crée l'étude au besoin. */
  sauverRecette(nom: string, trace: Trace): Promise<{ etude: string; recette: string } | null>;
  /** Garde plusieurs recettes d'un coup (déclinaison) et enregistre l'étude une fois ; renvoie l'étude et les ids. */
  sauverRecettes(liste: { nom: string; trace: Trace }[]): Promise<{ etude: string; recettes: string[] } | null>;
  chargerRecette(id: string): void;
  supprimerRecette(id: string): void;
}

const CADRE_DEFAUT: Cadre = { longueur: "mm", couches: true, source: "auto" };
const maintenant = () => new Date().toISOString();
const dossierDe = (chemin: string) => chemin.replace(/[\\/][^\\/]*$/, "");
const nomDe = (chemin: string) => chemin.split(/[\\/]/).pop() ?? chemin;

let arretsSurveillance: (() => void)[] = [];

/** Lecture d'un fichier suivi : sa référence d'abord (l'autre PC), puis le dernier chemin connu. */
export async function lireDuDisque(f: FichierEtude, env: EnvAtelier): Promise<{ texte: string; absolu: string }> {
  const backend = await getBackend();
  const essais: string[] = [];
  if (f.source) {
    const r = resoudreSource(f.source, env.espace, env.racines);
    if (r.ok) essais.push(r.absolu);
  }
  if (f.absolu && !essais.includes(f.absolu)) essais.push(f.absolu);
  let derniere: unknown = new Error(`${f.nom} : emplacement inconnu sur ce PC.`);
  for (const chemin of essais) {
    try {
      return { texte: decodeText(await backend.readDataPath(chemin)), absolu: chemin };
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
}

export const useAtelier = create<EtatAtelier>((set, get) => {
  /** Rejoue fichiers et dérivés après tout changement. */
  const reconstruire = (p: Partial<EtatAtelier> = {}, modifiee = true) => {
    const s = { ...get(), ...p };
    const base: ExportComsol[] = [];
    const erreurs: string[] = [];
    for (const f of s.fichiers) {
      const b = s.bruts[f.nom];
      if (!b) continue;
      try {
        base.push(appliquerFichier(b, f));
      } catch (e) {
        erreurs.push(`${f.nom} : ${e instanceof Error ? e.message : String(e)}`);
        base.push(b);
      }
    }
    const d = construireDerives(base, s.derives);
    set({ ...p, exports: d.exports, ...(modifiee ? { modifiee: true } : {}), ...(erreurs.length || d.erreurs.length ? { avis: { niveau: "erreur", texte: [...erreurs, ...d.erreurs].join("\n") } } : {}) });
  };

  /** Surveille les dossiers des fichiers suivis : un export refait par COMSOL est relu tout seul. */
  const surveiller = async () => {
    for (const a of arretsSurveillance) a();
    arretsSurveillance = [];
    const { env, fichiers } = get();
    if (!env.surveiller) return;
    const dossiers = new Map<string, string[]>();
    for (const f of fichiers) if (f.absolu) dossiers.set(dossierDe(f.absolu), [...(dossiers.get(dossierDe(f.absolu)) ?? []), f.nom]);
    for (const [dossier, noms] of dossiers) {
      try {
        arretsSurveillance.push(
          await env.surveiller(dossier, (chemins) => {
            const touches = noms.filter((n) => chemins.some((c) => nomDe(c).toLowerCase() === n.toLowerCase()));
            for (const n of touches) void get().relire(n);
          }),
        );
      } catch {
        // dossier inaccessible : la relecture reste possible à la main
      }
    }
  };

  const ecrire = async (e: EtudeComsol) => {
    const { backend, root } = useLibrary.getState();
    if (!backend || !root) throw new Error("Ouvrez d'abord la bibliothèque de figures (page Bibliothèque) : l'étude y est rangée.");
    const fs = backend.fs(root);
    await fs.createDir("_comsol").catch(() => undefined);
    await fs.createDir(DOSSIER_ETUDES).catch(() => undefined);
    await fs.writeTextAtomic(fichierEtude(e.id), JSON.stringify(e, null, 2) + "\n");
  };

  const instantane = (id: string, titre: string): EtudeComsol => {
    const s = get();
    return {
      format: ETUDE_FORMAT,
      id,
      titre,
      modifie: maintenant(),
      cadre: s.cadre,
      fichiers: s.fichiers.map((f) => ({ ...f, ...(s.noms[f.nom] ? { legende: s.noms[f.nom] } : {}) })),
      derives: s.derives,
      recettes: s.recettes,
    };
  };

  return {
    mode: null,
    cadre: CADRE_DEFAUT,
    noms: {},
    traces: {},
    fichiers: [],
    bruts: {},
    derives: [],
    exports: [],
    etude: null,
    titre: "",
    recettes: [],
    modifiee: false,
    avis: null,
    env: { espace: null, racines: {} },
    verifier: false,
    ensemble: false,
    rapport: false,

    set: (p) => set(p),
    setCadre: (p) => set({ cadre: { ...get().cadre, ...p }, modifiee: true }),
    setEnv: (env) => {
      set({ env });
      void surveiller();
    },
    majTrace: (mode, t) => set({ traces: { ...get().traces, [mode]: t } }),

    ajouter: (liste) => {
      const s = get();
      const fichiers = [...s.fichiers];
      const bruts = { ...s.bruts };
      const refuses: string[] = [];
      const relus: string[] = [];
      for (const f of liste) {
        const texte = decodeText(f.bytes);
        if (!estComsol(texte)) {
          refuses.push(f.name);
          continue;
        }
        try {
          bruts[f.name] = lireComsol(texte, f.name);
        } catch (e) {
          refuses.push(`${f.name} (${e instanceof Error ? e.message : String(e)})`);
          continue;
        }
        const source = f.path ? versSource(f.path, s.env.espace, s.env.racines) : null;
        const i = fichiers.findIndex((x) => x.nom === f.name);
        if (i >= 0) {
          fichiers[i] = { ...fichiers[i]!, ...(f.path ? { absolu: f.path, source: source ?? fichiers[i]!.source } : {}) };
          relus.push(f.name);
        } else fichiers.push({ nom: f.name, source, absolu: f.path ?? null, transformations: [] });
      }
      reconstruire({ fichiers, bruts });
      const textes = [
        refuses.length ? `Pas des exports COMSOL (en-tête « % Model: … » ou « % Temps (s) … » attendu) : ${refuses.join(", ")}.` : "",
        relus.length ? `Relu${relus.length > 1 ? "s" : ""} (déjà ouvert${relus.length > 1 ? "s" : ""}, transformations gardées) : ${relus.join(", ")}.` : "",
        liste.some((f) => f.path) && fichiers.some((f) => f.absolu && !f.source)
          ? "Certains fichiers sont hors de OneDrive et de l'espace : l'étude ne les retrouvera pas sur l'autre PC."
          : "",
      ].filter(Boolean);
      set({ avis: textes.length ? { niveau: refuses.length ? "erreur" : "info", texte: textes.join("\n") } : null });
      void surveiller();
    },

    ouvrir: async () => {
      try {
        get().ajouter(await (await getBackend()).openDataFiles());
      } catch (e) {
        set({ avis: { niveau: "erreur", texte: e instanceof Error ? e.message : String(e) } });
      }
    },

    deposer: async (chemins) => {
      const backend = await getBackend();
      const lus: { name: string; bytes: Uint8Array; path: string }[] = [];
      const erreurs: string[] = [];
      for (const c of chemins.filter((x) => /\.(txt|csv|dat)$/i.test(x))) {
        try {
          lus.push({ name: nomDe(c), bytes: await backend.readDataPath(c), path: c });
        } catch (e) {
          erreurs.push(e instanceof Error ? e.message : String(e));
        }
      }
      if (lus.length) get().ajouter(lus);
      if (erreurs.length) set({ avis: { niveau: "erreur", texte: erreurs.join("\n") } });
    },

    relire: async (nom) => {
      const s = get();
      const cibles = s.fichiers.filter((f) => !nom || f.nom === nom);
      const bruts = { ...s.bruts };
      const fichiers = [...s.fichiers];
      const erreurs: string[] = [];
      let n = 0;
      for (const f of cibles) {
        try {
          const { texte, absolu } = await lireDuDisque(f, s.env);
          bruts[f.nom] = lireComsol(texte, f.nom);
          const i = fichiers.findIndex((x) => x.nom === f.nom);
          fichiers[i] = { ...fichiers[i]!, absolu };
          n++;
        } catch (e) {
          erreurs.push(`${f.nom} : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      reconstruire({ fichiers, bruts }, false);
      set({
        avis: erreurs.length
          ? { niveau: "erreur", texte: `Relecture impossible :\n${erreurs.join("\n")}` }
          : { niveau: "info", texte: nom ? `${nom} relu${nom && !cibles.length ? "" : ""} (modifié sur le disque).` : `${n} fichier(s) relu(s).` },
      });
    },

    retirer: (nom) =>
      reconstruire({
        fichiers: get().fichiers.filter((f) => f.nom !== nom),
        derives: get().derives.filter((d) => d.nom !== nom && !sourcesDerive(d).includes(nom)),
      }),
    forcer: (nom, forcer) =>
      reconstruire({
        fichiers: get().fichiers.map((f) => {
          if (f.nom !== nom) return f;
          const g = { ...f };
          if (forcer) g.forcer = forcer;
          else delete g.forcer;
          return g;
        }),
      }),
    transformer: (nom, t) => reconstruire({ fichiers: get().fichiers.map((f) => (f.nom === nom ? { ...f, transformations: [...f.transformations, t] } : f)) }),
    repereOrigine: (nom) => reconstruire({ fichiers: get().fichiers.map((f) => (f.nom === nom ? { ...f, transformations: f.transformations.filter((t) => t.genre !== "repere") } : f)) }),
    garderCalcule: (d) => {
      if (get().exports.some((e) => e.nom === d.nom)) return set({ avis: { niveau: "info", texte: `${d.nom} est déjà dans la liste.` } });
      reconstruire({ derives: [...get().derives, d] });
    },

    listerEtudes: async () => {
      const { backend, root } = useLibrary.getState();
      if (!backend || !root) return [];
      const fs = backend.fs(root);
      const out: { id: string; titre: string; modifie: string }[] = [];
      for (const e of await fs.listDir(DOSSIER_ETUDES).catch(() => [])) {
        if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
        try {
          const x = lireEtude(JSON.parse(await fs.readText(joinPath(DOSSIER_ETUDES, e.name))));
          out.push({ id: x.id, titre: x.titre, modifie: x.modifie });
        } catch {
          // fichier abîmé : ignoré dans la liste
        }
      }
      return out.sort((a, b) => b.modifie.localeCompare(a.modifie));
    },

    nouvelleEtude: () => {
      for (const a of arretsSurveillance) a();
      arretsSurveillance = [];
      set({ etude: null, titre: "", recettes: [], fichiers: [], bruts: {}, derives: [], exports: [], noms: {}, traces: {}, modifiee: false, avis: null, cadre: CADRE_DEFAUT });
    },

    enregistrerEtude: async (titre) => {
      const s = get();
      const t = (titre ?? (s.titre || s.etude?.titre) ?? "").trim() || `Étude COMSOL du ${new Date().toLocaleDateString("fr-FR")}`;
      try {
        const pris = new Set((await get().listerEtudes()).map((x) => x.id));
        const id = s.etude?.id ?? identifiant(t, pris);
        await ecrire(instantane(id, t));
        set({ etude: { id, titre: t }, titre: t, modifiee: false, avis: { niveau: "info", texte: `Étude « ${t} » enregistrée (bibliothèque, ${fichierEtude(id)}).` } });
        return id;
      } catch (e) {
        set({ avis: { niveau: "erreur", texte: e instanceof Error ? e.message : String(e) } });
        return null;
      }
    },

    ouvrirEtude: async (id) => {
      const { backend, root } = useLibrary.getState();
      if (!backend || !root) return set({ avis: { niveau: "erreur", texte: "Ouvrez d'abord la bibliothèque de figures." } });
      try {
        const e = lireEtude(JSON.parse(await backend.fs(root).readText(fichierEtude(id))));
        get().nouvelleEtude();
        const env = get().env;
        const bruts: Record<string, ExportComsol> = {};
        const fichiers: FichierEtude[] = [];
        const manquants: string[] = [];
        for (const f of e.fichiers) {
          try {
            const { texte, absolu } = await lireDuDisque(f, env);
            bruts[f.nom] = lireComsol(texte, f.nom);
            fichiers.push({ ...f, absolu });
          } catch (x) {
            manquants.push(`${f.nom} : ${x instanceof Error ? x.message : String(x)}`);
            fichiers.push(f);
          }
        }
        const noms = Object.fromEntries(e.fichiers.filter((f) => f.legende).map((f) => [f.nom, f.legende!]));
        reconstruire({ etude: { id: e.id, titre: e.titre }, titre: e.titre, recettes: e.recettes, fichiers, bruts, derives: e.derives, noms, cadre: e.cadre }, false);
        set({
          modifiee: false,
          avis: manquants.length
            ? { niveau: "erreur", texte: `Étude « ${e.titre} » ouverte, mais ${manquants.length} fichier(s) introuvable(s) sur ce PC :\n${manquants.join("\n")}` }
            : { niveau: "info", texte: `Étude « ${e.titre} » ouverte : ${fichiers.length} fichier(s), ${e.recettes.length} recette(s).` },
        });
        void surveiller();
      } catch (x) {
        set({ avis: { niveau: "erreur", texte: `Étude illisible : ${x instanceof Error ? x.message : String(x)}` } });
      }
    },

    sauverRecette: async (nom, trace) => {
      const s = get();
      const meme = s.recettes.find((r) => JSON.stringify(r.trace) === JSON.stringify(trace) && JSON.stringify(r.cadre) === JSON.stringify(s.cadre));
      const recette: Recette = meme ?? { id: identifiant(nom, new Set(s.recettes.map((r) => r.id))), nom, trace, cadre: s.cadre };
      if (!meme) set({ recettes: [...s.recettes, recette] });
      const etude = await get().enregistrerEtude();
      return etude ? { etude, recette: recette.id } : null;
    },

    sauverRecettes: async (liste) => {
      const recettes = [...get().recettes];
      const ids: string[] = [];
      for (const { nom, trace } of liste) {
        const meme = recettes.find((r) => JSON.stringify(r.trace) === JSON.stringify(trace) && JSON.stringify(r.cadre) === JSON.stringify(get().cadre));
        if (meme) ids.push(meme.id);
        else {
          const r: Recette = { id: identifiant(nom, new Set(recettes.map((x) => x.id))), nom, trace, cadre: get().cadre };
          recettes.push(r);
          ids.push(r.id);
        }
      }
      set({ recettes });
      const etude = await get().enregistrerEtude();
      return etude ? { etude, recettes: ids } : null;
    },

    chargerRecette: (id) => {
      const r = get().recettes.find((x) => x.id === id);
      if (r) set({ mode: r.trace.mode, traces: { ...get().traces, [r.trace.mode]: r.trace }, cadre: r.cadre });
    },
    supprimerRecette: (id) => set({ recettes: get().recettes.filter((r) => r.id !== id), modifiee: true }),
  };
});

/** Recette en cours d'un mode (vide au départ). */
export const traceDe = (mode: ModeTrace) => useAtelier.getState().traces[mode] ?? traceVide(mode);
