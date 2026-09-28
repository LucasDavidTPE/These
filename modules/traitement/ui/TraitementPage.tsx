/**
 * Module Traitement 2S2P1D : dépouillement de module complexe et calage 2S2P1D, Huet-Sayegh,
 * Kelvin-Voigt. Interface React sur le cœur TypeScript (core/), mêmes calculs que la page
 * d'origine (tests de conformité à la chaîne Excel). L'essai d'une campagne s'ouvre
 * directement, et son dépouillement (tri des cycles, calages) s'enregistre avec lui.
 *
 * La page d'origine (statique/) reste accessible (« Ancienne page ») tant que la nouvelle
 * n'est pas validée sous Windows.
 */
import { useCallback, useEffect, useState } from "react";
import { Introuvable, parent } from "@noyau/stockage";
import { useContexte } from "@interface/contexte";
import { appliquerProjet, detecter, essaiDemo, essaiDepuisLecture, projetJSON, resumeEssai, traiter, type Mode } from "../core/essai";
import { fichierDepuisOctets, lireFichier } from "../core/io/lecture";
import { prendre, surDemande, type DemandeEssai } from "./demande";
import { EtapeCalage } from "./EtapeCalage";
import { EtapeCycles } from "./EtapeCycles";
import { EtapeEssai } from "./EtapeEssai";
import { EtapeSynthese } from "./EtapeSynthese";
import { EtapeComparaison, EtapeExport, EtapeFidelite } from "./EtapesFin";
import { essaiActif, souffler, useTraitement } from "./etat";
import { AnciennePage } from "./AnciennePage";

const ETAPES = ["Essai", "Cycles", "Synthèse", "Calage", "Comparaison", "Fidélité Excel", "Export"];

export function TraitementPage() {
  const ctx = useContexte();
  const s = useTraitement();
  const e = essaiActif(s);
  const [ancienne, setAncienne] = useState(false);

  // Premier affichage : l'essai de démonstration, calculé et calé.
  useEffect(() => {
    if (useTraitement.getState().essais.length) return;
    void useTraitement.getState().tache("Calcul de la démonstration…", async () => {
      const d = await essaiDemo();
      if (!useTraitement.getState().essais.length) useTraitement.getState().maj((x) => ((x.essais = [d]), (x.actif = 0)));
    });
  }, []);

  const ouvrirEssai = useCallback(
    async (d: DemandeEssai) => {
      const st = useTraitement.getState();
      await st.tache(`Lecture de ${d.fichier}…`, async (progres) => {
        const octets = await ctx.plateforme.fichiers(d.dossierDonnees).readBytes(d.fichier);
        let projet: string | null = null;
        if (ctx.espace) {
          try {
            projet = await ctx.espace.fichiers.readText(d.projet);
          } catch (err) {
            if (!(err instanceof Introuvable) && (err as { code?: string }).code !== "not-found") throw err;
          }
        }
        const lu = await lireFichier(fichierDepuisOctets(d.fichier, octets), (etape, part) => useTraitement.setState({ occupe: { texte: `${d.fichier} — ${etape}`, part } }));
        const essai = essaiDepuisLecture(lu, 0);
        essai.nom = d.titre.split(" — ").pop() || essai.nom;
        const info = detecter(essai);
        useTraitement.setState({ occupe: { texte: "Traitement de la campagne…", part: 0 } });
        if (projet) await appliquerProjet([essai], JSON.parse(projet) as Parameters<typeof appliquerProjet>[1]);
        else await traiter(essai, progres, souffler);
        st.maj((x) => {
          x.essais = [essai];
          x.actif = 0;
          x.palier = 0;
          x.cycle = 0;
          x.etape = projet ? 3 : 1;
          x.campagne = { essaiId: essai.id, demande: d };
          x.infoFichier = `${d.fichier} — ${lu.table.n.toLocaleString("fr-FR")} lignes, extensomètres lus en ${lu.uniteAxiale}.`;
          x.infoDetection = info ?? "";
        });
        st.signaler(projet ? "Dépouillement enregistré rouvert." : "Nouveau dépouillement : enregistrez-le avec l'essai quand il vous convient.");
      });
    },
    [ctx.plateforme, ctx.espace],
  );

  // Essai demandé par Campagnes avant l'ouverture du module, ou pendant qu'il est affiché.
  useEffect(() => {
    const d = prendre();
    if (d && useTraitement.getState().campagne?.demande !== d) void Promise.resolve().then(() => ouvrirEssai(d));
    return surDemande((x) => void ouvrirEssai(x));
  }, [ouvrirEssai]);

  async function enregistrerDansEssai() {
    const c = s.campagne;
    const essai = s.essais.find((x) => x.id === c?.essaiId);
    if (!c || !essai || !ctx.espace) return;
    try {
      await ctx.espace.fichiers.ensureDir(parent(c.demande.projet));
      await ctx.espace.fichiers.writeTextAtomic(c.demande.projet, projetJSON([essai]));
      s.signaler(`Dépouillement enregistré avec l'essai (${new Date().toLocaleTimeString("fr-FR")}).`);
    } catch (err) {
      s.signaler(`Enregistrement impossible : ${err instanceof Error ? err.message : String(err)}`, "erreur");
    }
  }

  const changerMode = (m: Mode) => {
    if (!e || e.mode === m) return;
    void s.tache("Traitement de la campagne…", async (progres) => {
      e.mode = m;
      await traiter(e, progres, souffler);
      s.maj(() => undefined);
    });
  };

  if (ancienne) return <AnciennePage fermer={() => setAncienne(false)} />;

  return (
    <div className="traitement tr">
      {s.campagne ? (
        <div className="traitement-barre">
          <strong>{s.campagne.demande.titre}</strong>
          <span className="discret">Essai ouvert depuis sa campagne : le dépouillement (tri des cycles, calages) s'enregistre avec lui, dans l'espace.</span>
          <button type="button" className="principal" onClick={() => void enregistrerDansEssai()}>
            Enregistrer avec l'essai
          </button>
          {ctx.registre.aModule("campagnes") ? (
            <button
              type="button"
              onClick={() => (s.campagne?.demande.campagne && ctx.registre.aAction("campagnes.ouvrir") ? void ctx.registre.executer("campagnes.ouvrir", { ctx, slug: s.campagne.demande.campagne }) : ctx.naviguer("campagnes"))}
            >
              ← Campagne
            </button>
          ) : null}
        </div>
      ) : null}

      <header className="tr-entete">
        <div className="rangee">
          <h1>Traitement 2S2P1D</h1>
          {s.essais.length ? (
            <select className="tr-champ" style={{ width: "auto", minWidth: 180 }} value={s.actif} onChange={(ev) => s.maj((x) => ((x.actif = Number(ev.target.value)), (x.palier = 0), (x.cycle = 0)))}>
              {s.essais.map((x, i) => (
                <option key={x.id} value={i}>
                  {x.nom}
                  {x.demo ? " (démonstration)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {e ? (
            <span className="tr-segmente" role="group" aria-label="Mode de calcul">
              <button type="button" aria-pressed={e.mode === "excel"} className={e.mode === "excel" ? "actif" : undefined} onClick={() => changerMode("excel")}>
                Excel à l'identique
              </button>
              <button type="button" aria-pressed={e.mode !== "excel"} className={e.mode !== "excel" ? "actif" : undefined} onClick={() => changerMode("corrige")}>
                Corrigé
              </button>
            </span>
          ) : null}
          <button type="button" className="tr-mini a-droite" title="La page d'origine, en secours tant que celle-ci n'est pas validée" onClick={() => setAncienne(true)}>
            Ancienne page
          </button>
        </div>
        {e ? (
          <p className="tr-etat discret">
            {resumeEssai(e, s.essais.length).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </p>
        ) : null}
        <nav className="tr-etapes" role="tablist" aria-label="Étapes du traitement">
          {ETAPES.map((nom, i) => (
            <button key={nom} type="button" role="tab" aria-selected={s.etape === i} className={s.etape === i ? "actif" : undefined} onClick={() => s.maj((x) => (x.etape = i))}>
              <span className="n">{String(i + 1).padStart(2, "0")}</span>
              {nom}
            </button>
          ))}
        </nav>
      </header>

      {s.message ? (
        <div className={`message message-${s.message.niveau}`} role={s.message.niveau === "erreur" ? "alert" : "status"}>
          {s.message.texte}{" "}
          <button type="button" className="lien" onClick={() => useTraitement.setState({ message: null })}>
            fermer
          </button>
        </div>
      ) : null}

      <main className="tr-contenu">
        {!e ? (
          <p className="discret">Préparation…</p>
        ) : s.etape === 0 ? (
          <EtapeEssai />
        ) : s.etape === 1 ? (
          <EtapeCycles />
        ) : s.etape === 2 ? (
          <EtapeSynthese />
        ) : s.etape === 3 ? (
          <EtapeCalage />
        ) : s.etape === 4 ? (
          <EtapeComparaison />
        ) : s.etape === 5 ? (
          <EtapeFidelite />
        ) : (
          <EtapeExport />
        )}
      </main>

      {s.occupe ? (
        <div className="tr-voile" role="status" aria-live="polite">
          <div>
            <p>{s.occupe.texte}</p>
            <div className="tr-jauge">
              <span style={{ width: `${Math.round(Math.max(0, Math.min(1, s.occupe.part)) * 100)}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
