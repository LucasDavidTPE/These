/**
 * Atelier COMSOL (Figures → COMSOL) : 1. les fichiers, décrits en clair ; 2. ce qu'on veut tracer, réglé en mots ;
 * 3. l'aperçu en direct, puis « Continuer dans Graphes » pour les retouches et l'enregistrement.
 */
import { useEffect, useState } from "react";
import { MODES, modesDisponibles, type ModeAtelier, type SourceLegende, type UniteLongueur } from "../../core/graph";
import { useGraph } from "../graph/useGraph";
import { useReglagesComsol } from "../graph/useReglagesComsol";
import { AtelierFichiers } from "./AtelierFichiers";
import { ModeCarte, ModeComparer, ModeCoupeProfils, ModeProfils, ModeSynthese, ModeTemps } from "./AtelierModes";
import { ReglagesPartages } from "./Outils";
import { useAtelier } from "./useAtelier";

const ICONES: Record<ModeAtelier, string> = { profils: "⫼", carte: "▦", "coupe-profils": "▥", temps: "∿", comparer: "÷", synthese: "▤" };

export function AtelierComsol() {
  const s = useGraph();
  const a = useAtelier();
  const reg = useReglagesComsol();
  const [reglages, setReglages] = useState(false);
  useEffect(() => {
    void useReglagesComsol.getState().charger();
  }, []);
  const dispo = modesDisponibles(s.comsol);
  // mode choisi, ou le premier possible
  const mode = a.mode && !dispo[a.mode] ? a.mode : (MODES.find((m) => !dispo[m.id])?.id ?? null);
  return (
    <div className="atelier">
      <header className="toolbar atelier-barre">
        <strong>Atelier COMSOL</strong>
        <label className="atelier-reglage">
          Longueurs en
          <select value={a.longueur} onChange={(e) => a.set({ longueur: e.target.value as UniteLongueur })}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
          </select>
        </label>
        <label className="atelier-reglage" title="D'où viennent les légendes des courbes (modifiables une à une dans la liste des fichiers)">
          Légendes
          <select value={a.source} onChange={(e) => a.set({ source: e.target.value as SourceLegende })}>
            <option value="auto">automatiques</option>
            <option value="nom">mots du nom de fichier</option>
            <option value="parametres">paramètres de l'étude (lc, VE…)</option>
            <option value="les-deux">nom et paramètres</option>
          </select>
        </label>
        <label className="chip" title="Lignes en tirets aux interfaces de couches, sur les profils et cartes où z apparaît">
          <input type="checkbox" checked={a.couches} onChange={(e) => a.set({ couches: e.target.checked })} />
          Couches ({reg.reglages.interfaces.map((i) => i.texte).join(", ") || "aucune"})
        </label>
        <span className="grow" />
        <button type="button" aria-expanded={reglages} onClick={() => setReglages(!reglages)} title="Correspondances de légende (lc=1 → Rectangulaire…) et cotes des couches, pour toute la bibliothèque">
          Correspondances et couches…
        </button>
      </header>
      {reglages ? (
        <div className="atelier-reglages-partages">
          <ReglagesPartages ouvertParDefaut />
        </div>
      ) : null}
      {s.message?.kind === "error" ? <p className="banner error">{s.message.text}</p> : null}
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
          </section>
          <div className="atelier-mode">
            {mode === "profils" ? <ModeProfils /> : null}
            {mode === "carte" ? <ModeCarte /> : null}
            {mode === "coupe-profils" ? <ModeCoupeProfils /> : null}
            {mode === "temps" ? <ModeTemps /> : null}
            {mode === "comparer" ? <ModeComparer /> : null}
            {mode === "synthese" ? <ModeSynthese /> : null}
            {!mode ? <p className="muted atelier-attente">Ouvrez des fichiers (à gauche) : les tracés possibles s'allument.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
