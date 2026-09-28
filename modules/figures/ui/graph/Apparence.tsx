/**
 * Apparence d'un graphe : style (préréglages et styles enregistrés), palette (dont une palette
 * collée depuis coolors.co), réglages fins du style. Les réglages d'une série sont dans
 * SerieLook, sous chaque série.
 */
import { useState } from "react";
import { useContexte } from "@interface/contexte";
import { MARKS, PALETTES, parsePalette, STYLE_PRESETS, type GraphStyle, type Series, type SeriesDash, type SeriesMark } from "../../core/graph";
import { NumberInput } from "../editor/fields";
import { useGraph } from "./useGraph";

const PAR_DEFAUT = STYLE_PRESETS.find((p) => p.id === "couleur")!.style!;

export function Apparence() {
  const s = useGraph();
  const ctx = useContexte();
  const style = s.doc.style;
  const [colle, setColle] = useState("");
  const [erreur, setErreur] = useState("");
  const regler = (patch: Partial<GraphStyle>) => s.update({ style: { ...(style ?? PAR_DEFAUT), ...patch } });
  const valeurStyle = !style ? "these" : (STYLE_PRESETS.find((p) => p.style && JSON.stringify(p.style) === JSON.stringify(style))?.id ?? (s.userStyles.some((u) => u.name === style.name) ? `u:${style.name}` : "perso"));
  const paletteId = style ? (PALETTES.find((p) => p.colors.join() === style.palette.join())?.id ?? "perso") : "";

  function choisirStyle(v: string) {
    if (v.startsWith("u:")) return s.update({ style: s.userStyles.find((u) => u.name === v.slice(2)) });
    const p = STYLE_PRESETS.find((x) => x.id === v);
    if (p) s.update({ style: p.style ?? undefined });
  }

  function importer() {
    const c = parsePalette(colle);
    if (c.length < 2) return setErreur("Aucune palette reconnue : collez l'adresse coolors.co (…/264653-2a9d8f-…) ou des codes #rrggbb.");
    setErreur("");
    setColle("");
    regler({ palette: c });
  }

  function enregistrer() {
    const nom = window.prompt("Nom du style (enregistré dans la bibliothèque, disponible sur les deux postes) :", style && valeurStyle !== "perso" && !valeurStyle.startsWith("u:") ? `${style.name} perso` : (style?.name ?? ""));
    if (nom?.trim()) void s.saveStyle(nom);
  }

  return (
    <fieldset className="list-field apparence">
      <legend>Apparence</legend>
      <label className="field">
        <span>Style</span>
        <select value={valeurStyle} onChange={(e) => choisirStyle(e.target.value)}>
          {STYLE_PRESETS.map((p) => (
            <option key={p.id} value={p.id} title={p.note}>
              {p.style?.name ?? "Thèse (noir et gris)"}
            </option>
          ))}
          {s.userStyles.length ? (
            <optgroup label="Mes styles">
              {s.userStyles.map((u) => (
                <option key={u.name} value={`u:${u.name}`}>
                  {u.name}
                </option>
              ))}
            </optgroup>
          ) : null}
          {valeurStyle === "perso" ? <option value="perso">{style?.name ?? "Style"} (modifié)</option> : null}
        </select>
      </label>
      <p className="muted small">{STYLE_PRESETS.find((p) => p.id === valeurStyle)?.note ?? (valeurStyle.startsWith("u:") ? "style enregistré dans la bibliothèque" : style ? "style modifié : « Enregistrer ce style… » pour le garder" : "")}</p>

      <label className="field">
        <span>Palette</span>
        <select value={paletteId} onChange={(e) => (e.target.value === "" ? s.update({ style: undefined }) : e.target.value !== "perso" && regler({ palette: PALETTES.find((p) => p.id === e.target.value)!.colors }))}>
          {!style ? <option value="">Thème (noir et gris)</option> : null}
          {PALETTES.map((p) => (
            <option key={p.id} value={p.id} title={p.note}>
              {p.name}
            </option>
          ))}
          {paletteId === "perso" ? <option value="perso">Palette importée</option> : null}
        </select>
      </label>
      {style ? (
        <div className="palette-edition">
          {style.palette.map((c, i) => (
            <span key={i} className="palette-case">
              <input type="color" value={c} aria-label={`Couleur ${i + 1} de la palette`} onChange={(e) => regler({ palette: style.palette.map((x, j) => (j === i ? e.target.value : x)) })} />
              {style.palette.length > 2 ? (
                <button type="button" className="small-btn" title="Retirer cette couleur" onClick={() => regler({ palette: style.palette.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              ) : null}
            </span>
          ))}
          <button type="button" className="small-btn" aria-label="Ajouter une couleur" title="Ajouter une couleur" onClick={() => regler({ palette: [...style.palette, "#888888"] })}>
            +
          </button>
        </div>
      ) : null}
      <div className="palette-import">
        <input type="text" value={colle} placeholder="https://coolors.co/264653-2a9d8f-e9c46a…" aria-label="Palette à importer" onChange={(e) => setColle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && importer()} />
        <button type="button" disabled={!colle.trim()} onClick={importer} title="Adresse coolors.co, export « Code » de coolors, ou codes #rrggbb / rgb(…)">
          Importer
        </button>
      </div>
      {erreur ? <p className="muted small erreur-texte">{erreur}</p> : null}
      <p className="muted small">
        Palettes toutes faites : <button type="button" className="lien" onClick={() => void ctx.plateforme.ouvrirLien("https://coolors.co/palettes/trending")}>
          coolors.co
        </button> — copiez l'adresse d'une palette et collez-la ici.
      </p>

      {style ? (
        <details className="style-details">
          <summary>Réglages du style</summary>
          <div className="grid2">
            <label className="field">
              <span>Cadre</span>
              <select value={style.frame} onChange={(e) => regler({ frame: e.target.value as GraphStyle["frame"] })}>
                <option value="box">Cadre complet</option>
                <option value="axes">Axes seuls</option>
              </select>
            </label>
            <label className="field">
              <span>Texte (× thèse)</span>
              <NumberInput value={style.fontScale} onChange={(v) => regler({ fontScale: Math.min(2.5, Math.max(0.6, v)) })} />
            </label>
            <label className="field">
              <span>Trait (mm)</span>
              <NumberInput value={style.lineWidth} onChange={(v) => regler({ lineWidth: Math.min(2, Math.max(0.05, v)) })} />
            </label>
            <label className="field">
              <span>Marques (mm)</span>
              <NumberInput value={style.markSize} onChange={(v) => regler({ markSize: Math.min(5, Math.max(0.3, v)) })} />
            </label>
          </div>
          <label className="chip">
            <input type="checkbox" checked={style.marks} onChange={(e) => regler({ marks: e.target.checked })} />
            Une marque différente par série
          </label>
          <label className="chip">
            <input type="checkbox" checked={style.dashes} onChange={(e) => regler({ dashes: e.target.checked })} />
            Tirets alternés
          </label>
          <label className="chip">
            <input type="checkbox" checked={style.filledMarks} onChange={(e) => regler({ filledMarks: e.target.checked })} />
            Marques pleines
          </label>
        </details>
      ) : null}
      <div className="rangee-boutons">
        <button type="button" disabled={!style} onClick={enregistrer} title="Garder ce style (palette et réglages) pour les prochains graphes">
          Enregistrer ce style…
        </button>
        {valeurStyle.startsWith("u:") ? (
          <button type="button" onClick={() => window.confirm(`Retirer le style « ${style!.name} » ?`) && void s.deleteStyle(style!.name)}>
            Retirer
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}

const MARQUES: { value: SeriesMark; label: string }[] = [
  { value: "o", label: "○ rond" },
  { value: "square", label: "□ carré" },
  { value: "triangle", label: "△ triangle" },
  { value: "diamond", label: "◇ losange" },
  { value: "x", label: "× croix" },
  { value: "+", label: "+ plus" },
  { value: "none", label: "aucune" },
];

/** Couleur, marque et tirets d'une série (vides : ceux du style). */
export function SerieLook({ i, sr }: { i: number; sr: Series }) {
  const s = useGraph();
  const auto = s.doc.style?.palette[i % s.doc.style.palette.length] ?? "#000000";
  return (
    <div className="serie-look">
      <label className="serie-couleur" title="Couleur de la série (vide : celle de la palette)">
        <input type="color" value={sr.color ?? auto} aria-label={`Couleur de la série ${i + 1}`} onChange={(e) => s.setSeries(i, { color: e.target.value })} />
        {sr.color ? (
          <button type="button" className="small-btn" title="Revenir à la couleur de la palette" onClick={() => s.setSeries(i, { color: undefined })}>
            auto
          </button>
        ) : null}
      </label>
      {sr.type !== "bar" ? (
        <>
          <select value={sr.mark ?? ""} aria-label={`Marque de la série ${i + 1}`} onChange={(e) => s.setSeries(i, { mark: (e.target.value || undefined) as SeriesMark | undefined })}>
            <option value="">marque auto</option>
            {MARQUES.filter((m) => m.value === "none" || MARKS.includes(m.value as never)).map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select value={sr.dash ?? ""} aria-label={`Trait de la série ${i + 1}`} onChange={(e) => s.setSeries(i, { dash: (e.target.value || undefined) as SeriesDash | undefined })}>
            <option value="">trait auto</option>
            <option value="solid">continu</option>
            <option value="dashed">tirets</option>
            <option value="dotted">pointillés</option>
          </select>
        </>
      ) : null}
    </div>
  );
}
