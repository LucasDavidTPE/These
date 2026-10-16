/**
 * Atelier COMSOL (Figures → COMSOL) : 1. les fichiers, décrits en clair ; 2. ce qu'on veut tracer, réglé en mots ;
 * 3. l'aperçu en direct, puis « Continuer dans Graphes ». Le tout dans une **étude** enregistrée (fichiers suivis,
 * transformations, recettes), qui se rouvre sur l'autre PC et régénère ses figures quand COMSOL réexporte.
 */
import { useEffect, useState } from "react";
import { useContexte } from "@interface/contexte";
import { MODES, modesDisponibles, type ModeAtelier, type SourceLegende, type UniteLongueur } from "../../core/graph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { getBackend } from "../platform/backend";
import { AtelierFichiers } from "./AtelierFichiers";
import { ModeCarte, ModeComparer, ModeCoupeProfils, ModeProfils, ModeSynthese, ModeTemps } from "./AtelierModes";
import { regenererEtude } from "./lot";
import { ModeCriteres } from "./ModeCriteres";
import { ReglagesPartages } from "./Outils";
import { useAtelier } from "./useAtelier";

const ICONES: Record<ModeAtelier, string> = { profils: "⫼", carte: "▦", "coupe-profils": "▥", temps: "∿", comparer: "÷", synthese: "▤", criteres: "⚖" };

/** Racines du poste et surveillance des dossiers pour l'atelier ; glisser-déposer des fichiers sur la page. */
function useBranchements() {
  const ctx = useContexte();
  useEffect(() => {
    useAtelier.getState().setEnv({
      espace: ctx.espace?.racine ?? null,
      racines: ctx.racines,
      surveiller: (dossier, rappel) => ctx.plateforme.surveiller(dossier, rappel),
    });
  }, [ctx.espace?.racine, ctx.racines, ctx.plateforme]);
  useEffect(() => {
    void useReglagesComsol.getState().charger();
    let arret: (() => void) | null = null;
    let fini = false;
    void getBackend()
      .then((b) => b.onFileDrop((chemins) => void useAtelier.getState().deposer(chemins)))
      .then((a) => (fini ? a() : (arret = a)));
    return () => {
      fini = true;
      arret?.();
    };
  }, []);
}

function BarreEtude() {
  const a = useAtelier();
  const [etudes, setEtudes] = useState<{ id: string; titre: string; modifie: string }[]>([]);
  const rafraichir = () => void useAtelier.getState().listerEtudes().then(setEtudes);
  const id = a.etude?.id;
  // la liste se relit à l'ouverture de la page et quand l'étude change (pas à chaque réglage)
  useEffect(() => {
    void useAtelier.getState().listerEtudes().then(setEtudes);
  }, [id]);
  return (
    <div className="atelier-etude">
      <label className="atelier-reglage" title="Une étude garde les fichiers (retrouvés sur les deux PC), leurs transformations et les tracés : elle se rouvre telle quelle">
        Étude
        <select
          value={a.etude?.id ?? ""}
          onFocus={rafraichir}
          onChange={(e) => {
            if (a.modifiee && !window.confirm("L'étude en cours a des changements non enregistrés. Continuer ?")) return;
            if (e.target.value) void a.ouvrirEtude(e.target.value);
            else a.nouvelleEtude();
          }}
        >
          <option value="">{a.etude ? "Nouvelle étude (vide)" : "Nouvelle étude (non enregistrée)"}</option>
          {etudes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.titre}
            </option>
          ))}
        </select>
      </label>
      <input className="atelier-titre-etude" value={a.titre} onChange={(e) => a.set({ titre: e.target.value })} placeholder="Titre de l'étude (ex. Article empreintes)" aria-label="Titre de l'étude" />
      <button type="button" className={a.modifiee ? "primary" : undefined} onClick={() => void a.enregistrerEtude().then(rafraichir)} title="Range l'étude dans la bibliothèque de figures (_comsol/etudes)">
        Enregistrer{a.modifiee ? " ●" : ""}
      </button>
      {a.etude ? <RegenererTout id={a.etude.id} titre={a.etude.titre} /> : null}
    </div>
  );
}

/** Après un nouveau calcul COMSOL : toutes les figures de l'étude, puis leurs planches, refaites d'un coup. */
function RegenererTout({ id, titre }: { id: string; titre: string }) {
  const [occupe, setOccupe] = useState(false);
  return (
    <button
      type="button"
      disabled={occupe}
      title="Relit les fichiers et refait toutes les figures tracées depuis cette étude (retouches gardées), puis les planches qui les contiennent"
      onClick={async () => {
        if (!window.confirm(`Régénérer toutes les figures de l'étude « ${titre} » depuis les fichiers COMSOL actuels ?`)) return;
        setOccupe(true);
        const a = useAtelier.getState();
        try {
          const b = await regenererEtude(id, a.env, (texte) => a.set({ avis: { niveau: "info", texte } }));
          const lignes = [
            `${b.figures.length} figure(s) régénérée(s)${b.figures.length ? ` (${b.figures.join(", ")})` : ""}, ${b.planches.length} planche(s) mise(s) à jour${b.planches.length ? ` (${b.planches.join(", ")})` : ""}.`,
            b.verrouillees.length ? `Laissées telles quelles (ouvertes sur l'autre PC) : ${b.verrouillees.join(", ")}.` : "",
            b.erreurs.length ? `Problèmes :\n${b.erreurs.join("\n")}` : "",
            !b.figures.length ? "Aucune figure de cette étude dans la bibliothèque : « Continuer dans Graphes » puis « Enregistrer », ou « Décliner pour tous les plans »." : "",
          ].filter(Boolean);
          a.set({ avis: { niveau: b.erreurs.length ? "erreur" : "info", texte: lignes.join("\n") } });
        } catch (e) {
          a.set({ avis: { niveau: "erreur", texte: e instanceof Error ? e.message : String(e) } });
        } finally {
          setOccupe(false);
        }
      }}
    >
      ↻ Régénérer toute l'étude
    </button>
  );
}

function Recettes() {
  const a = useAtelier();
  if (!a.recettes.length) return null;
  return (
    <div className="atelier-recettes">
      <span className="muted small">Recettes de l'étude :</span>
      {a.recettes.map((r) => (
        <span key={r.id} className="atelier-puce atelier-recette">
          <button type="button" className="lien" onClick={() => a.chargerRecette(r.id)} title={`Rouvrir ce tracé (${r.trace.mode})`}>
            {ICONES[r.trace.mode]} {r.nom}
          </button>
          <button type="button" className="lien" aria-label={`Retirer la recette ${r.nom}`} onClick={() => window.confirm(`Retirer la recette « ${r.nom} » de l'étude ? (les figures déjà tracées restent, mais ne se régénèrent plus)`) && a.supprimerRecette(r.id)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function AtelierComsol() {
  useBranchements();
  const a = useAtelier();
  const reg = useReglagesComsol();
  const [reglages, setReglages] = useState(false);
  const dispo = modesDisponibles(a.exports);
  // mode choisi, ou le premier possible
  const mode = a.mode && !dispo[a.mode] ? a.mode : (MODES.find((m) => !dispo[m.id])?.id ?? null);
  return (
    <div className="atelier">
      <header className="toolbar atelier-barre">
        <strong>Atelier COMSOL</strong>
        <BarreEtude />
        <span className="grow" />
        <label className="atelier-reglage">
          Longueurs en
          <select value={a.cadre.longueur} onChange={(e) => a.setCadre({ longueur: e.target.value as UniteLongueur })}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </label>
        <label className="atelier-reglage" title="D'où viennent les légendes des courbes (modifiables une à une dans la liste des fichiers)">
          Légendes
          <select value={a.cadre.source} onChange={(e) => a.setCadre({ source: e.target.value as SourceLegende })}>
            <option value="auto">automatiques</option>
            <option value="nom">mots du nom de fichier</option>
            <option value="parametres">paramètres de l'étude (lc, VE…)</option>
            <option value="les-deux">nom et paramètres</option>
          </select>
        </label>
        <label className="chip" title="Lignes en tirets aux interfaces de couches, sur les profils et cartes où z apparaît">
          <input type="checkbox" checked={a.cadre.couches} onChange={(e) => a.setCadre({ couches: e.target.checked })} />
          Couches ({reg.reglages.interfaces.map((i) => i.texte).join(", ") || "aucune"})
        </label>
        <button type="button" aria-expanded={reglages} onClick={() => setReglages(!reglages)} title="Correspondances de légende (lc=1 → Rectangulaire…) et cotes des couches, pour toute la bibliothèque">
          Correspondances et couches…
        </button>
      </header>
      {reglages ? (
        <div className="atelier-reglages-partages">
          <ReglagesPartages ouvertParDefaut />
        </div>
      ) : null}
      {a.avis ? (
        <p className={`banner ${a.avis.niveau === "erreur" ? "error" : ""}`} style={{ whiteSpace: "pre-line" }}>
          {a.avis.texte}{" "}
          <button type="button" className="lien" onClick={() => a.set({ avis: null })}>
            fermer
          </button>
        </p>
      ) : null}
      <div className="atelier-corps">
        <AtelierFichiers />
        <div className="atelier-centre">
          <section className="atelier-colonne atelier-modes">
            <h3>
              <span className="atelier-etape">2</span> Que voulez-vous tracer ?
            </h3>
            <div className="atelier-tuiles">
              {MODES.map((m) => (
                <button key={m.id} type="button" className={`atelier-tuile${mode === m.id ? " actif" : ""}`} disabled={!!dispo[m.id]} title={dispo[m.id] ?? m.explication} onClick={() => a.set({ mode: m.id })}>
                  <span className="atelier-icone" aria-hidden="true">
                    {ICONES[m.id]}
                  </span>
                  <strong>{m.titre}</strong>
                  <span className="muted small">{dispo[m.id] ?? m.explication}</span>
                </button>
              ))}
            </div>
            <Recettes />
          </section>
          <div className="atelier-mode">
            {mode === "profils" ? <ModeProfils /> : null}
            {mode === "carte" ? <ModeCarte /> : null}
            {mode === "coupe-profils" ? <ModeCoupeProfils /> : null}
            {mode === "temps" ? <ModeTemps /> : null}
            {mode === "comparer" ? <ModeComparer /> : null}
            {mode === "synthese" ? <ModeSynthese /> : null}
            {mode === "criteres" ? <ModeCriteres /> : null}
            {!mode ? <p className="muted atelier-attente">Ouvrez des fichiers (à gauche) : les tracés possibles s'allument.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
