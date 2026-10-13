/** Réglages de la carte en couleurs d'un graphe : palette, paliers, bornes, titre de la barre, axes échangés. */
import { bornesCarte, LIBELLES_PALETTES, PALETTES_CARTE, transposerCarte, type CarteDoc, type PaletteCarte } from "../../core/graph";
import { NumberInput, TextInput } from "../editor/fields";
import { useGraph } from "./useGraph";

const fr = (v: number) => String(Number(v.toPrecision(6))).replace(".", ",");

export function CarteReglages() {
  const s = useGraph();
  const c = s.doc.carte;
  if (!c) return null;
  const maj = (m: Partial<CarteDoc>) => s.update({ carte: { ...c, ...m } });
  const borne = (k: "min" | "max") => (v: string) => {
    const n = Number(v.replace(",", ".").replace("−", "-"));
    const suite: CarteDoc = { ...c };
    if (v.trim() === "" || !Number.isFinite(n)) delete suite[k];
    else suite[k] = n;
    s.update({ carte: suite });
  };
  const [lo, hi] = bornesCarte(c);
  return (
    <fieldset className="list-field">
      <legend>Carte en couleurs</legend>
      <label className="field">
        <span>Palette</span>
        <select value={c.palette} onChange={(e) => maj({ palette: e.target.value as PaletteCarte })}>
          {PALETTES_CARTE.map((p) => (
            <option key={p} value={p}>
              {LIBELLES_PALETTES[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="chip">
        <input type="checkbox" checked={c.inverser} onChange={(e) => maj({ inverser: e.target.checked })} />
        Inverser les couleurs
      </label>
      <div className="grid2">
        <label className="field">
          <span>Min couleurs (vide = auto)</span>
          <TextInput value={c.min === undefined ? "" : fr(c.min)} onChange={borne("min")} placeholder={fr(lo)} />
        </label>
        <label className="field">
          <span>Max couleurs (vide = auto)</span>
          <TextInput value={c.max === undefined ? "" : fr(c.max)} onChange={borne("max")} placeholder={fr(hi)} />
        </label>
      </div>
      <label className="field">
        <span>Nombre de teintes (2 à 64)</span>
        <NumberInput value={c.niveaux} onChange={(v) => maj({ niveaux: Math.round(Math.min(64, Math.max(2, v))) })} />
      </label>
      <label className="field">
        <span>Titre de la barre ($…$ pour les maths)</span>
        <TextInput value={c.legende} onChange={(v) => maj({ legende: v })} />
      </label>
      <div className="row">
        <button
          type="button"
          title="Échange les axes horizontal et vertical (et leurs titres et bornes)"
          onClick={() => s.update({ carte: transposerCarte(c), x: { ...s.doc.y }, y: { ...s.doc.x } })}
        >
          Échanger les axes
        </button>
        <button
          type="button"
          title="La carte disparaît ; les courbes éventuelles restent"
          onClick={() => {
            if (window.confirm("Retirer la carte de ce graphe ?")) s.update({ carte: undefined });
          }}
        >
          Retirer la carte
        </button>
      </div>
      <p className="muted small">Pour exagérer la hauteur de la coupe, augmentez la hauteur du graphe ; pour recadrer, les min / max des axes.</p>
    </fieldset>
  );
}
