import { useState } from "react";
import { useContexte } from "@interface/contexte";
import { actionRegeneration, origineDe, type Rendu } from "../../core/action";
import { ciblesDeOrigine, rattachementsDe } from "../../core/rattachement";
import { projetsDe } from "../../core/projets";
import { origineExcel } from "../../core/excelFigures";
import {
  LICENSE_SUGGESTIONS,
  SOURCE_TYPES,
  formToMeta,
  generateCaption,
  thumbnailFile,
  lockStatus,
  metaToForm,
  type FigureEntry,
  type FigureMeta,
  type MetaForm,
  type ValidationError,
} from "../../core/library";
import { dimensionsSvg } from "../../core/action";
import { svgToPng } from "../editor/raster";
import { getBackend } from "../platform/backend";
import { useCrop } from "../crop/useCrop";
import { useEditor } from "../editor/useEditor";
import { useGraph } from "../graph/useGraph";
import { usePlanche } from "../planche/usePlanche";
import { useNavigation } from "../navigation";
import { KIND_LABELS, SOURCE_LABELS } from "./labels";
import { useLibrary } from "./useLibrary";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export function MetaPanel({ entry }: { entry: FigureEntry }) {
  const editing = useLibrary((s) => s.editing);
  const host = useLibrary((s) => s.host);
  const startEdit = useLibrary((s) => s.startEdit);
  const stopEdit = useLibrary((s) => s.stopEdit);
  const select = useLibrary((s) => s.select);
  const lock = lockStatus(entry.lock, host, new Date());
  const isEditing = editing?.folder === entry.folder && editing.status === "editing";
  const lockedMessage = editing?.folder === entry.folder && editing.status === "locked" ? editing.message : null;

  return (
    <aside className="panel">
      <div className="panel-head">
        <strong>{entry.id}</strong>
        <button type="button" className="link" onClick={() => select(null)} aria-label="Fermer">
          ✕
        </button>
      </div>
      {(lock === "other" || lockedMessage) && !isEditing && (
        <div className="banner warn">
          <p>
            Lecture seule : figure ouverte sur <b>{entry.lock?.host}</b>
            {entry.lock && <> depuis le {formatDate(entry.lock.since)}</>}.
          </p>
          <button type="button" onClick={() => startEdit(true)}>
            Forcer la modification
          </button>
        </div>
      )}
      {lock === "stale" && !isEditing && (
        <div className="banner">Verrou ancien de {entry.lock?.host} (plus de 12 h) : il sera repris à la modification.</div>
      )}
      {!entry.meta ? (
        <p className="error">meta.json absent ou invalide : voir « À régler ».</p>
      ) : isEditing ? (
        <MetaEditor meta={entry.meta} onCancel={stopEdit} />
      ) : (
        <MetaView meta={entry.meta} onEdit={lock === "other" ? undefined : () => startEdit(false)} />
      )}
      {entry.meta && !isEditing && <ProjetsFigure entry={entry} />}
      {entry.meta?.kind === "schema" && entry.files.includes("figure.json") && !isEditing && (
        <button
          type="button"
          onClick={async () => {
            await select(null);
            useNavigation.getState().goTo("schema");
            await useEditor.getState().openFromLibrary(entry.folder);
          }}
        >
          Ouvrir dans l'éditeur
        </button>
      )}
      {entry.meta?.kind === "graph" && entry.files.includes("graph.json") && !isEditing && (
        <button
          type="button"
          onClick={async () => {
            await select(null);
            useNavigation.getState().goTo("graphs");
            await useGraph.getState().openFromLibrary(entry.folder);
          }}
        >
          Ouvrir dans Graphes
        </button>
      )}
      {entry.meta?.kind === "planche" && entry.files.includes("planche.json") && !isEditing && (
        <button
          type="button"
          onClick={async () => {
            await select(null);
            useNavigation.getState().goTo("planches");
            await usePlanche.getState().openFromLibrary(entry.folder);
          }}
        >
          Ouvrir dans Planches
        </button>
      )}
      {entry.meta?.kind === "graph" && entry.files.includes("graph.json") && !isEditing && (
        <button
          type="button"
          title="Ajoute ce graphe à la planche en cours (page Planches)"
          onClick={async () => {
            await usePlanche.getState().ajouter(entry.folder);
            useNavigation.getState().goTo("planches");
          }}
        >
          Ajouter à une planche
        </button>
      )}
      {thumbnailFile(entry) && !isEditing && (
        <button
          type="button"
          onClick={async () => {
            useNavigation.getState().goTo("crop");
            await useCrop.getState().loadFromLibrary(entry);
          }}
        >
          Recadrer
        </button>
      )}
      {entry.files.includes("export.svg") && !isEditing && <ExportSvg entry={entry} />}
      {!isEditing && <Regenerer entry={entry} />}
      {entry.meta?.derived_from && <p className="muted small">D'après {entry.meta.derived_from}.</p>}
      <p className="muted small">
        Dossier : <code>{entry.folder}</code>
      </p>
    </aside>
  );
}

/** Puces des projets de la figure : retirer (✕), ajouter (liste). */
function ProjetsFigure({ entry }: { entry: FigureEntry }) {
  const projets = useLibrary((s) => s.projets.projets);
  const ajouter = useLibrary((s) => s.ajouterAuProjet);
  const retirer = useLibrary((s) => s.retirerDuProjet);
  const siens = projetsDe(entry.meta).flatMap((slug) => projets.filter((p) => p.slug === slug));
  const autres = projets.filter((p) => !siens.includes(p));
  if (projets.length === 0) return null;
  return (
    <div className="projets-figure">
      <span className="muted small">Projets :</span>
      {siens.map((p) => (
        <span key={p.slug} className="puce-projet">
          {p.titre}
          <button type="button" className="link" aria-label={`Retirer du projet ${p.titre}`} title="Retirer de ce projet (la figure reste dans la bibliothèque)" onClick={() => void retirer(entry.folder, p.slug)}>
            ✕
          </button>
        </span>
      ))}
      {autres.length > 0 && (
        <select
          value=""
          aria-label="Ajouter à un projet"
          onChange={(e) => {
            if (e.target.value) void ajouter([entry.folder], e.target.value);
          }}
        >
          <option value="">+ Ajouter à…</option>
          {autres.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.titre}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Copier la figure en SVG (collage vectoriel dans Word / PowerPoint / Inkscape) ou l'enregistrer en .svg. */
function ExportSvg({ entry }: { entry: FigureEntry }) {
  const readText = useLibrary((s) => s.readText);
  const [etat, setEtat] = useState("");
  const nom = `${entry.id}${entry.meta?.title ? ` ${entry.meta.title}` : ""}`.replace(/[\\/:*?"<>|]+/g, "_");
  const svg = () => readText(`${entry.folder}/export.svg`);
  return (
    <div className="rangee-boutons">
      <button
        type="button"
        title="Copie le SVG dans le presse-papiers (vectoriel pour Word, PowerPoint, Inkscape ; image PNG en repli)"
        onClick={async () => {
          try {
            const backend = await getBackend();
            const s = await svg();
            const d = dimensionsSvg(s) ?? { largeurMm: 100, hauteurMm: 100 };
            const k = Math.min(1, 400 / Math.max(d.largeurMm, d.hauteurMm));
            await backend.copySvg(s, await svgToPng(s, d.largeurMm * k, d.hauteurMm * k, 300));
            setEtat("SVG copié.");
          } catch (e) {
            setEtat(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Copier en SVG
      </button>
      <button
        type="button"
        onClick={async () => {
          try {
            if (await (await getBackend()).saveTextAs(await svg(), `${nom}.svg`, "svg")) setEtat("SVG enregistré.");
          } catch (e) {
            setEtat(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Enregistrer en SVG…
      </button>
      {etat && <span className="muted small">{etat}</span>}
    </div>
  );
}

/**
 * Figure produite par un autre module (courbes d'un essai, Gantt…) : elle se refait depuis
 * les données actuelles, si ce module est dans cet installeur.
 */
function Regenerer({ entry }: { entry: FigureEntry }) {
  const ctx = useContexte();
  const regenerate = useLibrary((s) => s.regenerate);
  const [etat, setEtat] = useState<string | null>(null);
  const origine = origineDe(entry.meta);
  if (!origine) return null;
  const excel = origineExcel(entry.meta);
  if (excel) return <RegenererExcel entry={entry} />;
  const action = actionRegeneration(origine);
  if (!ctx.registre.aAction(action)) return <p className="muted small">Produite par le module « {origine.module} », absent de cette version : elle ne peut pas être refaite ici.</p>;
  return (
    <>
      <button
        type="button"
        title="Refait l'image depuis les données actuelles ; la fiche (titre, tags, légende) ne change pas"
        onClick={async () => {
          setEtat("Régénération…");
          try {
            const rendu = (await ctx.registre.executer(action, { ctx, origine })) as Rendu;
            await regenerate(entry.folder, rendu);
            setEtat(`Refaite le ${new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`);
          } catch (e) {
            setEtat(`Impossible de la refaire : ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      >
        Régénérer depuis les données
      </button>
      {etat && <p className="muted small">{etat}</p>}
    </>
  );
}

/** Graphe refait d'un graphique Excel d'un projet : relire le classeur (mise en forme de Figures gardée). */
function RegenererExcel({ entry }: { entry: FigureEntry }) {
  const regenerer = useLibrary((s) => s.regenererExcel);
  const [etat, setEtat] = useState<string | null>(null);
  const o = origineExcel(entry.meta)!;
  return (
    <>
      <button
        type="button"
        title="Relit les données du classeur ; titres d'axes, style et couleurs choisis dans Figures sont gardés"
        onClick={async () => {
          setEtat("Lecture du classeur…");
          try {
            await regenerer(entry.folder, o);
            setEtat(`Mise à jour le ${new Date().toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.`);
          } catch (e) {
            setEtat(`Impossible de la mettre à jour : ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      >
        Mettre à jour depuis Excel
      </button>
      <p className="muted small">
        Source : {o.classeur} › {o.graphique.replace("/", " › ")}
      </p>
      {etat && <p className="muted small">{etat}</p>}
    </>
  );
}

function MetaView({ meta, onEdit }: { meta: FigureMeta; onEdit?: () => void }) {
  const s = meta.source;
  return (
    <div className="meta-view">
      <h2>{meta.title}</h2>
      <dl>
        <dt>Type</dt>
        <dd>{KIND_LABELS[meta.kind]}</dd>
        {ciblesDeOrigine(meta).length + rattachementsDe(meta).length ? (
          <>
            <dt>Rattachée à</dt>
            <dd>
              {[...ciblesDeOrigine(meta).map((c) => `campagne ${c.id} (origine)`), ...rattachementsDe(meta).map((c) => `${c.type === "campagne" ? "campagne" : "étude"} ${c.titre ?? c.id}`)].join(" · ")}
            </dd>
          </>
        ) : null}
        <dt>Tags</dt>
        <dd>{meta.tags.length ? meta.tags.join(", ") : "—"}</dd>
        <dt>Source</dt>
        <dd>
          {s ? (
            <>
              {SOURCE_LABELS[s.type]}
              {s.author && ` — ${s.author}`}
              {s.year && ` (${s.year})`}
              {s.bib && ` [${s.bib}]`}
              {s.url && (
                <>
                  <br />
                  <span className="url">{s.url}</span>
                </>
              )}
              {s.note && (
                <>
                  <br />
                  {s.note}
                </>
              )}
            </>
          ) : (
            <span className="error">non renseignée</span>
          )}
        </dd>
        <dt>Licence</dt>
        <dd>{meta.license ?? "—"}</dd>
        <dt>Légende</dt>
        <dd>{meta.caption ?? "—"}</dd>
        <dt>Utilisée dans</dt>
        <dd>{meta.used_in.length ? meta.used_in.join(" ; ") : "—"}</dd>
        <dt>Modifiée</dt>
        <dd>
          {formatDate(meta.modified)}
          {meta.last_host && ` sur ${meta.last_host}`}
        </dd>
      </dl>
      {onEdit && (
        <button type="button" className="primary" onClick={onEdit}>
          Modifier
        </button>
      )}
    </div>
  );
}

function MetaEditor({ meta, onCancel }: { meta: FigureMeta; onCancel: () => void }) {
  const save = useLibrary((s) => s.save);
  const [form, setForm] = useState<MetaForm>(() => metaToForm(meta));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const set = (patch: Partial<MetaForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors([]);
  };
  const errorFor = (path: string) => errors.find((e) => e.path === path)?.message;

  const preview = formToMeta(meta, form);
  const suggested = preview.ok ? generateCaption(preview.meta.source) : "";

  const submit = async () => {
    const r = formToMeta(meta, form);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    await save(r.meta);
  };

  const field = (label: string, key: keyof MetaForm, path: string, props: { placeholder?: string; list?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
      {errorFor(path) && <em className="error">{errorFor(path)}</em>}
    </label>
  );

  return (
    <form
      className="meta-edit"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {field("Titre", "title", "title")}
      {field("Tags (séparés par des virgules)", "tags", "tags")}
      <label className="field">
        <span>Source</span>
        <select value={form.sourceType} onChange={(e) => set({ sourceType: e.target.value as MetaForm["sourceType"] })}>
          <option value="">— non renseignée —</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SOURCE_LABELS[t]}
            </option>
          ))}
        </select>
        {errorFor("source.type") && <em className="error">{errorFor("source.type")}</em>}
      </label>
      {form.sourceType !== "" && form.sourceType !== "own" && (
        <>
          {field("Auteur", "author", "source.author", { placeholder: "De Beer et al." })}
          {field("Année", "year", "source.year", { placeholder: "1997" })}
          {field("URL", "url", "source.url", { placeholder: "https://…" })}
          {field("Clé biblio", "bib", "source.bib", { placeholder: "BIB-042" })}
          {field("Note", "note", "source.note", { placeholder: "Adapté de la fig. 3" })}
        </>
      )}
      {field("Licence", "license", "license", { list: "licenses" })}
      <datalist id="licenses">
        {LICENSE_SUGGESTIONS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <label className="field">
        <span>Légende</span>
        <textarea rows={2} value={form.caption} onChange={(e) => set({ caption: e.target.value })} />
        {suggested && suggested !== form.caption && (
          <button type="button" className="link" onClick={() => set({ caption: suggested })}>
            Proposer : « {suggested} »
          </button>
        )}
      </label>
      <label className="field">
        <span>Utilisée dans (une ligne par document)</span>
        <textarea rows={3} value={form.usedIn} onChange={(e) => set({ usedIn: e.target.value })} />
      </label>
      {errors.length > 0 && <p className="error">Corrigez les champs signalés.</p>}
      <div className="row">
        <button type="submit" className="primary">
          Enregistrer
        </button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </form>
  );
}
