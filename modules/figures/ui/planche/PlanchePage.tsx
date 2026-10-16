/**
 * Page Planches : assembler plusieurs graphes de la bibliothèque en une figure (grille, étiquettes (a), (b)…,
 * taille commune). Les graphes restent modifiables dans Graphes ; « Relire les graphes » met la planche à jour.
 */
import { useEffect, useMemo, useState } from "react";
import { ETIQUETTES, plancheSvg, type GraphDoc, type StyleEtiquette } from "../../core/graph";
import { NumberInput, TextInput } from "../editor/fields";
import { useLibrary } from "../library/useLibrary";
import { useNavigation } from "../navigation";
import { useGraph } from "../graph/useGraph";
import { usePlanche } from "./usePlanche";

export function PlanchePage() {
  const s = usePlanche();
  const index = useLibrary((l) => l.index);
  const [q, setQ] = useState("");
  useEffect(() => {
    void useLibrary.getState().init();
  }, []);

  const graphes = (index?.figures ?? []).filter((f) => f.meta?.kind === "graph" && f.files.includes("graph.json"));
  const visibles = graphes.filter((f) => !q.trim() || `${f.id} ${f.meta?.title ?? ""} ${(f.meta?.tags ?? []).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));
  const docs = s.doc.panneaux.map((p) => (p.dossier ? (s.graphes[p.dossier]?.doc ?? null) : null));
  const presents = docs.filter((d): d is GraphDoc => !!d);
  const apercu = useMemo(() => {
    if (!presents.length) return null;
    try {
      return { svg: plancheSvg(s.doc, docs).replace(/<\?xml[^>]*>/, ""), erreur: "" };
    } catch (e) {
      return { svg: "", erreur: e instanceof Error ? e.message : String(e) };
    }
    // docs dépend de s.doc et s.graphes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.doc, s.graphes]);

  return (
    <div className="editor">
      <header className="toolbar editor-toolbar">
        <button type="button" onClick={() => s.nouvelle()}>
          Nouvelle
        </button>
        <button type="button" className="primary" onClick={() => void s.enregistrer()} disabled={s.busy || !presents.length}>
          Enregistrer
        </button>
        <button type="button" onClick={() => void s.relire()} disabled={s.busy || !s.doc.panneaux.length} title="Relit chaque graphe dans la bibliothèque (après l'avoir modifié dans Graphes)">
          Relire les graphes
        </button>
        <span className="grow" />
        <button type="button" onClick={() => void s.copier("tex")} disabled={s.busy || !presents.length}>
          Copier pgfplots
        </button>
        <button type="button" onClick={() => void s.copier("svg")} disabled={s.busy || !presents.length}>
          Copier SVG
        </button>
        <button type="button" onClick={() => void s.copier("png")} disabled={s.busy || !presents.length}>
          Copier PNG
        </button>
        <select
          value=""
          aria-label="Exporter"
          disabled={!presents.length}
          onChange={(e) => {
            const v = e.target.value as "tex" | "svg" | "png";
            e.target.value = "";
            if (v) void s.exporter(v);
          }}
        >
          <option value="">Exporter…</option>
          <option value="tex">pgfplots (.tex)</option>
          <option value="svg">SVG</option>
          <option value="png">PNG 600 dpi</option>
        </select>
      </header>
      {s.message && (
        <p className={`banner ${s.message.kind === "error" ? "error" : ""}`} style={{ whiteSpace: "pre-line" }}>
          {s.message.text}
        </p>
      )}
      <div className="editor-body">
        <aside className="panel graph-data">
          <h3>Graphes de la bibliothèque</h3>
          <input className="planche-recherche" type="search" placeholder="Rechercher (titre, tag, FIG-…)" value={q} onChange={(e) => setQ(e.target.value)} />
          {!index ? <p className="muted small">Bibliothèque non ouverte.</p> : !graphes.length ? <p className="muted small">Aucun graphe enregistré : créez-en dans Graphes, puis « Enregistrer ».</p> : null}
          <ul className="planche-choix">
            {visibles.map((f) => (
              <li key={f.folder}>
                <button type="button" onClick={() => void s.ajouter(f.folder)} title="Ajouter à la planche">
                  +
                </button>
                <span>
                  <strong>{f.meta?.title ?? f.folder}</strong>
                  <span className="muted small"> {f.id}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
        <div className="planche-apercu">
          {apercu?.erreur ? <p className="banner error">{apercu.erreur}</p> : null}
          {apercu?.svg ? <div className="planche-svg" dangerouslySetInnerHTML={{ __html: apercu.svg }} /> : <p className="muted">Ajoutez des graphes depuis la liste de gauche (+) : ils s'assemblent ici.</p>}
        </div>
        <aside className="panel props">
          <h3>Planche</h3>
          <label className="field">
            <span>Titre (bibliothèque)</span>
            <TextInput value={s.title} onChange={(v) => s.setTitle(v)} placeholder="Planche" />
          </label>
          <div className="grid2">
            <label className="field">
              <span>Graphes par ligne</span>
              <NumberInput value={s.doc.colonnes} onChange={(v) => s.set({ colonnes: Math.round(Math.min(6, Math.max(1, v))) })} />
            </label>
            <label className="field">
              <span>Espacement (mm)</span>
              <NumberInput value={s.doc.espacement} onChange={(v) => s.set({ espacement: Math.min(50, Math.max(0, v)) })} />
            </label>
          </div>
          <label className="field">
            <span>Étiquettes</span>
            <select value={s.doc.etiquettes} onChange={(e) => s.set({ etiquettes: e.target.value as StyleEtiquette })}>
              {ETIQUETTES.map((e) => (
                <option key={e} value={e}>
                  {e === "aucune" ? "Aucune" : `${e}, ${e.replace(/a/, "b").replace(/A/, "B")}…`}
                </option>
              ))}
            </select>
          </label>
          {presents.filter((d) => d.carte).length >= 2 ? (
            <label className="chip" title="Bornes de couleurs communes à toutes les cartes (symétriques autour de 0 en rouge-bleu) : les cartes se comparent d'un coup d'œil">
              <input type="checkbox" checked={!!s.doc.memeEchelle} onChange={(e) => s.set({ memeEchelle: e.target.checked || undefined })} />
              Même échelle de couleurs pour toutes les cartes
            </label>
          ) : null}
          <label className="chip">
            <input type="checkbox" checked={!!s.doc.taille} onChange={(e) => s.set({ taille: e.target.checked ? { largeur: presents[0]?.width ?? 80, hauteur: presents[0]?.height ?? 60 } : null })} />
            Même taille pour tous les graphes
          </label>
          {s.doc.taille ? (
            <div className="grid2">
              <label className="field">
                <span>Largeur (mm)</span>
                <NumberInput value={s.doc.taille.largeur} onChange={(v) => s.set({ taille: { ...s.doc.taille!, largeur: Math.max(20, v) } })} />
              </label>
              <label className="field">
                <span>Hauteur (mm)</span>
                <NumberInput value={s.doc.taille.hauteur} onChange={(v) => s.set({ taille: { ...s.doc.taille!, hauteur: Math.max(20, v) } })} />
              </label>
            </div>
          ) : null}
          <h3>Graphes ({s.doc.panneaux.length})</h3>
          {s.doc.panneaux.map((p, i) => (
            <div key={`${p.dossier}-${i}`} className="planche-ligne">
              <span className="planche-nom" title={p.dossier}>
                {String.fromCharCode(97 + (i % 26))}. {!p.dossier ? <em className="muted">(case vide)</em> : (s.graphes[p.dossier]?.titre ?? <em className="muted">{p.dossier} (introuvable)</em>)}
              </span>
              <button type="button" className="small-btn" disabled={i === 0} onClick={() => s.deplacer(i, -1)} aria-label="Monter">
                ↑
              </button>
              <button type="button" className="small-btn" disabled={i === s.doc.panneaux.length - 1} onClick={() => s.deplacer(i, 1)} aria-label="Descendre">
                ↓
              </button>
              <button
                type="button"
                className="small-btn"
                title="Ouvrir ce graphe dans Graphes pour le modifier (puis « Relire les graphes » ici)"
                onClick={async () => {
                  useNavigation.getState().goTo("graphs");
                  await useGraph.getState().openFromLibrary(p.dossier);
                }}
              >
                ✎
              </button>
              <button type="button" className="small-btn" onClick={() => s.retirer(i)} aria-label="Retirer">
                ×
              </button>
            </div>
          ))}
          <p className="muted small">Chaque graphe garde ses propres axes, couleurs et légende : modifiez-le dans Graphes (✎), enregistrez, puis « Relire les graphes ».</p>
        </aside>
      </div>
    </div>
  );
}
